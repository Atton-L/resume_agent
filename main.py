"""
简历管理Agent - FastAPI主应用
提供简历上传、解析、管理的Web API
"""
import os
import sys
import shutil
import re
import hashlib
from typing import List, Optional
from datetime import datetime, date
from urllib.parse import quote
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# 添加父目录到路径以导入resume_parser
sys.path.append(os.path.dirname(__file__))

from models import (
    CandidateResponse, CandidateUpdate, UploadResponse, ResumeAnalysis, USERS
)
import excel_manager
import resume_parser
import ai_analyzer

# 应用配置
app = FastAPI(title="简历管理Agent", version="1.0.0")

# 路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESUME_DIR = os.path.join(BASE_DIR, "resumes")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 确保目录存在
os.makedirs(RESUME_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/resumes", StaticFiles(directory=RESUME_DIR), name="resumes")


def _normalize_name(name: Optional[str]) -> str:
    if not name:
        return ""
    text = str(name).strip()
    text = re.sub(r'^(姓名|候选人|应聘者)[:：\s]*', '', text)
    text = re.sub(r'(先生|女士|小姐|同学)$', '', text)
    return text.strip()


def _is_valid_person_name(name: Optional[str]) -> bool:
    text = _normalize_name(name)
    if not re.match(r'^[\u4e00-\u9fa5]{2,4}$', text):
        return False
    bad_tokens = {'简历', '架构', '工程', '开发', '通用', '更新', '最新', '应聘', '岗位'}
    return not any(token in text for token in bad_tokens)


def _resolve_final_name(parsed_name: Optional[str], ai_name: Optional[str], filename: str) -> str:
    rule_name = _normalize_name(parsed_name)
    model_name = _normalize_name(ai_name)

    # 1) 优先规则解析出的正文姓名
    if _is_valid_person_name(rule_name):
        return rule_name

    # 2) 规则失败时优先文件名提取
    name_from_file = _normalize_name(resume_parser.extract_name_from_filename(filename) or '')
    if _is_valid_person_name(name_from_file):
        return name_from_file

    # 3) 最后使用AI结果（仅在格式合法时）
    if _is_valid_person_name(model_name):
        return model_name

    # 4) 兜底：称谓名
    honorific_match = re.search(r'([\u4e00-\u9fa5]{1,3}(?:先生|女士|小姐))', filename)
    if honorific_match:
        return honorific_match.group(1)

    return '未知'


@app.get("/")
async def root():
    """首页 - 返回前端页面"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "简历管理Agent API运行中"}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    uploader: str = Form(default="系统")
):
    """
    上传简历并自动解析和分析

    Args:
        file: 简历文件（支持PDF、DOCX、TXT）
        uploader: 上传人姓名

    Returns:
        上传结果和解析的应聘者信息
    """
    try:
        # 检查文件类型
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.pdf', '.docx', '.doc', '.txt']:
            return UploadResponse(
                success=False,
                message=f"不支持的文件格式: {ext}，请上传PDF、DOCX或TXT文件"
            )

        # 保存文件
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"{timestamp}_{file.filename}"
        file_path = os.path.join(RESUME_DIR, safe_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 计算简历内容哈希
        def calc_file_hash(path):
            h = hashlib.sha256()
            with open(path, 'rb') as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    h.update(chunk)
            return h.hexdigest()
        resume_hash = calc_file_hash(file_path)

        # 解析简历
        parsed_info = resume_parser.parse_resume(file_path)

        # 如果没有检测到方向，尝试再次检测
        if not parsed_info.get('direction') or parsed_info['direction'] == '未确定':
            parsed_info['direction'] = resume_parser._detect_direction(parsed_info['raw_text'])

        # 姓名决策：规则优先，AI兜底，避免AI误识别岗位词
        ai_name = ai_analyzer.extract_name_with_ai(parsed_info['raw_text'])
        final_name = _resolve_final_name(parsed_info.get('name'), ai_name, file.filename)

        # 查重：同名且简历内容相同禁止上传
        if excel_manager.check_duplicate_candidate(final_name, resume_hash):
            return UploadResponse(
                success=False,
                message=f"该应聘者的相同简历已上传，禁止重复上传。"
            )

        # 自动AI分析
        jd_text = ai_analyzer.load_jd_text()
        ai_analysis = ai_analyzer.get_claude_analysis(parsed_info['raw_text'], jd_text)

        # 构建分析结果摘要
        analysis_summary = f"""匹配度: {ai_analysis['match_score']}
推荐: {ai_analysis['recommendation']}

优势:
{chr(10).join(f"• {s}" for s in ai_analysis['strengths'][:3]) if ai_analysis['strengths'] else '暂无'}

劣势:
{chr(10).join(f"• {w}" for w in ai_analysis['weaknesses'][:2]) if ai_analysis['weaknesses'] else '暂无'}"""

        # 保存到Excel
        candidate_data = {
            'name': final_name,
            'resume_file': safe_filename,
            'resume_hash': resume_hash,
            'direction': parsed_info['direction'],
            'upload_date': datetime.now().strftime('%Y-%m-%d'),
            'uploader': uploader
        }

        new_candidate = excel_manager.add_candidate(candidate_data)

        return UploadResponse(
            success=True,
            message=f"简历上传成功！AI分析完成",
            candidate_id=new_candidate['序号'],
            analysis=ResumeAnalysis(
                name=final_name,
                phone=parsed_info.get('phone', ''),
                email=parsed_info.get('email', ''),
                education=parsed_info.get('education', ''),
                experience=parsed_info.get('experience', ''),
                direction=parsed_info['direction'],
                raw_text=parsed_info.get('raw_text', '')[:500]  # 限制长度
            )
        )

    except Exception as e:
        return UploadResponse(
            success=False,
            message=f"上传失败: {str(e)}"
        )


@app.get("/api/candidates", response_model=List[CandidateResponse])
async def get_candidates():
    """获取所有应聘者列表"""
    try:
        candidates = excel_manager.get_all_candidates()

        result = []
        for c in candidates:
            result.append(CandidateResponse(
                id=c['序号'],
                name=c.get('姓名', ''),
                resume_file=c['简历附件'],
                direction=c['方向'],
                upload_date=c['简历上传日期'],
                uploader=c['上传人'],
                work_base=str(c.get('工作base', '') or ''),
                can_interview=c.get('是否可以约面', ''),
                interview_owner=c.get('约面负责人', ''),
                interview_date=c.get('初面时间', ''),
                interviewer=c.get('面试官', ''),
                first_interview_review=str(c.get('初面评价', '') or ''),
                first_interview_conclusion=str(c.get('初面结论', '') or ''),
                second_interview_date=str(c.get('复面时间', '') or ''),
                second_interview_conclusion=str(c.get('复面结论', '') or ''),
                recruitment_status=str(c.get('招聘状态', '') or '')
            ))

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/candidates/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(candidate_id: int):
    """获取单个应聘者详情"""
    try:
        candidate = excel_manager.get_candidate(candidate_id)

        if not candidate:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        return CandidateResponse(
            id=candidate['序号'],
            name=candidate.get('姓名', ''),
            resume_file=candidate['简历附件'],
            direction=candidate['方向'],
            upload_date=candidate['简历上传日期'],
            uploader=candidate['上传人'],
            work_base=str(candidate.get('工作base', '') or ''),
            can_interview=candidate.get('是否可以约面', ''),
            interview_owner=candidate.get('约面负责人', ''),
            interview_date=candidate.get('初面时间', ''),
            interviewer=candidate.get('面试官', ''),
            first_interview_review=str(candidate.get('初面评价', '') or ''),
            first_interview_conclusion=str(candidate.get('初面结论', '') or ''),
            second_interview_date=str(candidate.get('复面时间', '') or ''),
            second_interview_conclusion=str(candidate.get('复面结论', '') or ''),
            recruitment_status=str(candidate.get('招聘状态', '') or '')
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/candidates/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(candidate_id: int, update_data: CandidateUpdate):
    """更新应聘者信息"""
    try:
        # 构建更新字典
        update_dict = {}
        if update_data.name is not None:
            update_dict['姓名'] = update_data.name
        if update_data.direction is not None:
            update_dict['方向'] = update_data.direction
        if update_data.work_base is not None:
            update_dict['工作base'] = update_data.work_base
        if update_data.can_interview is not None:
            update_dict['是否可以约面'] = update_data.can_interview
        if update_data.interview_owner is not None:
            update_dict['约面负责人'] = update_data.interview_owner
        if update_data.interview_date is not None:
            update_dict['初面时间'] = update_data.interview_date
        if update_data.interviewer is not None:
            update_dict['面试官'] = update_data.interviewer
        if update_data.first_interview_review is not None:
            update_dict['初面评价'] = update_data.first_interview_review
        if update_data.first_interview_conclusion is not None:
            update_dict['初面结论'] = update_data.first_interview_conclusion
        if update_data.second_interview_date is not None:
            update_dict['复面时间'] = update_data.second_interview_date
        if update_data.second_interview_conclusion is not None:
            update_dict['复面结论'] = update_data.second_interview_conclusion
        if update_data.recruitment_status is not None:
            update_dict['招聘状态'] = update_data.recruitment_status

        if not update_dict:
            raise HTTPException(status_code=400, detail="没有提供更新数据")

        result = excel_manager.update_candidate(candidate_id, update_dict)

        if not result:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        return CandidateResponse(
            id=result['序号'],
            name=result.get('姓名', ''),
            resume_file=result['简历附件'],
            direction=result['方向'],
            upload_date=result['简历上传日期'],
            uploader=result['上传人'],
            work_base=result.get('工作base', ''),
            can_interview=result.get('是否可以约面', ''),
            interview_owner=result.get('约面负责人', ''),
            interview_date=result.get('初面时间', ''),
            interviewer=result.get('面试官', ''),
            first_interview_review=result.get('初面评价', ''),
            first_interview_conclusion=result.get('初面结论', ''),
            second_interview_date=result.get('复面时间', ''),
            second_interview_conclusion=result.get('复面结论', ''),
            recruitment_status=result.get('招聘状态', '')
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/candidates/{candidate_id}")
async def delete_candidate(candidate_id: int):
    """删除应聘者"""
    try:
        success = excel_manager.delete_candidate(candidate_id)

        if not success:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        return {"success": True, "message": "删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/download/resume/{candidate_id}")
async def download_resume(candidate_id: int):
    """下载应聘者的简历文件"""
    try:
        candidate = excel_manager.get_candidate(candidate_id)

        if not candidate:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        file_name = candidate['简历附件']
        file_path = os.path.join(RESUME_DIR, file_name)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="简历文件不存在")

        return FileResponse(
            file_path,
            media_type='application/octet-stream',
            filename=file_name
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analyze/{candidate_id}")
async def analyze_resume(candidate_id: int):
    """
    使用resume-analyzer技能分析简历

    返回简历与JD的匹配分析
    """
    try:
        candidate = excel_manager.get_candidate(candidate_id)

        if not candidate:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        file_name = candidate['简历附件']
        file_path = os.path.join(RESUME_DIR, file_name)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="简历文件不存在")

        # 解析简历获取文本
        parsed = resume_parser.parse_resume(file_path)

        # 返回原始文本，前端可以通过调用Claude API进行分析
        return {
            "success": True,
            "candidate_id": candidate_id,
            "name": candidate.get('姓名', ''),
            "resume_text": parsed['raw_text']
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _normalize_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_date_value(value) -> Optional[date]:
    text = _normalize_text(value)
    if not text:
        return None

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text.replace("Z", "")).date()
    except ValueError:
        return None


def _parse_query_date(date_text: Optional[str], field_name: str) -> Optional[date]:
    if not date_text:
        return None
    parsed = _parse_date_value(date_text)
    if not parsed:
        raise HTTPException(status_code=422, detail=f"{field_name} 日期格式错误，应为 YYYY-MM-DD")
    return parsed


def _is_in_range(target: Optional[date], start: Optional[date], end: Optional[date]) -> bool:
    if not target:
        return False
    if start and target < start:
        return False
    if end and target > end:
        return False
    return True


def _is_pass_conclusion(value) -> bool:
    text = _normalize_text(value).lower()
    if not text:
        return False
    pass_keywords = {"通过", "pass", "passed", "ok", "yes", "y", "复面通过", "复试通过", "通过（建议录用）"}
    return text in pass_keywords or ("通过" in text and "不通过" not in text)


@app.get("/api/stats")
async def get_statistics(start_date: Optional[str] = None, end_date: Optional[str] = None, uploader: Optional[str] = None):
    """获取统计信息（支持按时间区间与上传人筛选）"""
    try:
        candidates = excel_manager.get_all_candidates()

        start = _parse_query_date(start_date, "start_date")
        end = _parse_query_date(end_date, "end_date")
        if start and end and start > end:
            raise HTTPException(status_code=400, detail="start_date 不能晚于 end_date")

        uploader_text = _normalize_text(uploader)

        all_in_range = []
        for c in candidates:
            upload_day = _parse_date_value(c.get('简历上传日期', ''))
            if start and (not upload_day or upload_day < start):
                continue
            if end and (not upload_day or upload_day > end):
                continue
            all_in_range.append(c)

        filtered = all_in_range
        if uploader_text:
            filtered = [c for c in all_in_range if _normalize_text(c.get('上传人')) == uploader_text]

        total_all_in_range = len(all_in_range)
        by_direction = {"Android": 0, "Linux": 0, "QNX": 0, "未确定": 0}
        can_interview = 0
        first_interview_pass_count = 0
        second_interview_count = 0
        onboarding_count = 0
        uploader_upload_count = len(filtered) if uploader_text else 0

        for c in filtered:
            direction = _normalize_text(c.get('方向', '未确定')) or '未确定'
            if direction in by_direction:
                by_direction[direction] += 1
            else:
                by_direction['未确定'] += 1

            if _normalize_text(c.get('是否可以约面')) == '是':
                can_interview += 1

            if _normalize_text(c.get('初面结论')) == '通过':
                first_interview_pass_count += 1

            second_interview_day = _parse_date_value(c.get('复面时间', ''))
            if _is_pass_conclusion(c.get('复面结论', '')):
                second_interview_count += 1

            onboarding_day = _parse_date_value(c.get('入职日期', ''))
            if onboarding_day:
                if _is_in_range(onboarding_day, start, end):
                    onboarding_count += 1
            elif _normalize_text(c.get('招聘状态')) == '入职':
                # 兼容历史数据：没有入职日期列时，沿用状态口径
                onboarding_count += 1


        return {
            "total": total_all_in_range,
            "by_direction": by_direction,
            "can_interview": can_interview,
            "pending_interview": total_all_in_range - can_interview,
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "uploader": uploader_text
            },
            "uploader_upload_count": uploader_upload_count,
            "total_in_range": total_all_in_range,
            "first_interview_pass_count": first_interview_pass_count,
            "second_interview_count": second_interview_count,
            "onboarding_count": onboarding_count
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/users")
async def get_users():
    """获取预设用户列表"""
    return {"users": USERS}


@app.get("/api/preview/resume/{candidate_id}")
async def preview_resume(candidate_id: int):
    """
    预览简历文件

    返回简历文件路径，前端可以根据文件类型进行预览
    """
    try:
        candidate = excel_manager.get_candidate(candidate_id)

        if not candidate:
            raise HTTPException(status_code=404, detail="应聘者不存在")

        file_name = candidate['简历附件']
        file_path = os.path.join(RESUME_DIR, file_name)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="简历文件不存在")

        # 获取文件扩展名
        ext = os.path.splitext(file_name)[1].lower()

        # 对于PDF文件，直接返回文件用于浏览器预览
        if ext == '.pdf':
            encoded_filename = quote(file_name)
            return FileResponse(
                file_path,
                media_type='application/pdf',
                headers={'Content-Disposition': f"inline; filename*=UTF-8''{encoded_filename}"}
            )

        # 对于其他文件，返回文件信息
        return {
            "success": True,
            "file_name": file_name,
            "file_type": ext,
            "file_path": f"/resumes/{file_name}",
            "message": "此文件类型不支持在线预览，请下载后查看"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    # 检查依赖
    print("正在检查依赖...")
    if resume_parser.check_dependencies():
        print("依赖检查通过")
    else:
        print("警告: 部分依赖缺失，某些功能可能无法使用")

    print(f"简历存储目录: {RESUME_DIR}")
    print(f"数据文件: {excel_manager.EXCEL_FILE}")
    print("\n启动服务...")
    print("访问地址: http://localhost:8000")

    uvicorn.run(app, host="0.0.0.0", port=8000)
