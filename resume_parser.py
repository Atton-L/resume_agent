"""
简历解析模块
从PDF、DOCX、TXT文件中提取应聘者信息
"""
import os
import re
from typing import Dict, Optional, List
from datetime import datetime


_SURNAME_SET = {
    '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
    '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章',
    '云', '苏', '潘', '葛', '奚', '范', '彭', '郎', '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳',
    '酆', '鲍', '史', '唐', '费', '廉', '岑', '薛', '雷', '贺', '倪', '汤', '滕', '殷', '罗', '毕', '郝', '邬', '安', '常',
    '乐', '于', '时', '傅', '皮', '卞', '齐', '康', '伍', '余', '元', '卜', '顾', '孟', '平', '黄', '和', '穆', '萧', '尹'
}


def _clean_candidate_name(name: str) -> str:
    name = (name or '').strip()
    name = re.sub(r'^(姓名|候选人|应聘者)[:：\s]*', '', name)
    name = re.sub(r'(先生|女士|小姐|同学)$', '', name)
    return name.strip()


def _is_probable_chinese_name(name: str) -> bool:
    name = _clean_candidate_name(name)
    if not re.match(r'^[\u4e00-\u9fa5]{2,4}$', name):
        return False
    if _is_common_word(name):
        return False
    if any(token in name for token in ('简历', '架构', '工程', '开发', '通用', '更新', '最新')):
        return False
    return name[0] in _SURNAME_SET


def _score_name_candidate(name: str) -> int:
    name = _clean_candidate_name(name)
    if not _is_probable_chinese_name(name):
        return -1
    score = 10
    if len(name) in (2, 3):
        score += 5
    if len(name) == 4:
        score += 1
    return score


def extract_text_from_file(file_path: str) -> str:
    """从文件中提取文本内容"""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.pdf':
        return _extract_from_pdf(file_path)
    elif ext in ['.docx', '.doc']:
        return _extract_from_docx(file_path)
    elif ext == '.txt':
        return _extract_from_txt(file_path)
    else:
        raise ValueError(f"不支持的文件格式: {ext}")


def _extract_from_pdf(file_path: str) -> str:
    """从PDF文件提取文本"""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
        return text
    except ImportError:
        raise ImportError("请安装 pdfplumber: pip install pdfplumber")


def _extract_from_docx(file_path: str) -> str:
    """从DOCX文件提取文本"""
    try:
        from docx import Document
        doc = Document(file_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text
    except ImportError:
        raise ImportError("请安装 python-docx: pip install python-docx")


def _extract_from_txt(file_path: str) -> str:
    """从TXT文件提取文本"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()


def parse_resume(file_path: str) -> Dict[str, any]:
    """
    解析简历文件，提取关键信息

    Returns:
        Dict包含:
        - name: 姓名
        - phone: 电话
        - email: 邮箱
        - education: 教育背景
        - experience: 工作经验摘要
        - direction: 方向（Android/Linux/QNX）
        - raw_text: 原始文本
    """
    # 提取文本
    text = extract_text_from_file(file_path)

    # 解析各字段
    result = {
        'name': _extract_name(text),
        'phone': _extract_phone(text),
        'email': _extract_email(text),
        'education': _extract_education(text),
        'experience': _extract_experience(text),
        'direction': _detect_direction(text),
        'raw_text': text
    }

    return result


def _extract_name(text: str) -> str:
    """提取姓名"""
    candidates: List[str] = []

    patterns = [
        r'姓\s*名[：:]\s*([\u4e00-\u9fa5]{2,4})(?:\s|$|,|，|\d|\n)',
        r'姓名[：:]\s*([\u4e00-\u9fa5]{2,4})(?:\s|$|,|，|\d|\n)',
        r'应聘者[：:]\s*([\u4e00-\u9fa5]{2,4})(?:\s|$|,|，|\n)',
        r'候选人[：:]\s*([\u4e00-\u9fa5]{2,4})(?:\s|$|,|，|\n)',
        r'(?:Name|NAME)[：:]?\s*([A-Za-z\u4e00-\u9fa5\s]{2,20})',
    ]

    for pattern in patterns:
        for m in re.finditer(pattern, text):
            candidates.append(_clean_candidate_name(m.group(1)))

    lines = text.split('\n')
    for line in lines[:15]:
        line = line.strip()
        if not line:
            continue
        if any(keyword in line for keyword in ['简历', 'RESUME', 'CV', '个人', '应聘', '求职', '联系', '电话', '邮箱']):
            continue
        if re.match(r'^[\u4e00-\u9fa5]{2,4}$', line):
            candidates.append(_clean_candidate_name(line))

    email_pattern = r'([\u4e00-\u9fa5]{2,4})\s+[a-zA-Z0-9._%+-]+@'
    for m in re.finditer(email_pattern, text):
        candidates.append(_clean_candidate_name(m.group(1)))

    best_name = '未知'
    best_score = -1
    for candidate in candidates:
        score = _score_name_candidate(candidate)
        if score > best_score:
            best_score = score
            best_name = candidate

    return best_name if best_score >= 0 else '未知'


def _is_common_word(text: str) -> bool:
    """检查是否是常见的非姓名中文词汇"""
    common_words = {
        '简历', '个人', '求职', '应聘', '联系', '电话', '邮箱', '地址',
        '教育', '经历', '经验', '技能', '项目', '工作', '公司', '学历',
        '本科', '硕士', '博士', '大专', '姓名', '年龄', '性别',
        '男', '女', '已婚', '未婚', '汉族',
        '目前', '期望', '薪资', '职位', '岗位', '方向',
        '自我', '评价', '介绍', '证书', '资质', '荣誉',
        '附件', '更新', '最新', '通用', '架构师'
    }
    return text in common_words


def extract_name_from_filename(filename: str) -> Optional[str]:
    """
    从文件名中提取姓名
    """
    name_part = os.path.splitext(filename)[0]
    name_part = re.sub(r'^\d{8}_\d{6}_', '', name_part)
    name_part = re.sub(r'(先生|女士|小姐|同学)$', '', name_part)
    name_part = re.sub(r'[-_]?(简历|个人简历|resume|cv|通用|最新版|最新|更新|投递|应聘|求职).*$', '', name_part, flags=re.IGNORECASE)
    name_part = re.sub(r'[-_]?\d{4,}.*$', '', name_part)
    name_part = re.sub(r'[-_].+$', '', name_part)

    for m in re.finditer(r'([\u4e00-\u9fa5]{2,4})', name_part):
        candidate = _clean_candidate_name(m.group(1))
        if _is_probable_chinese_name(candidate):
            return candidate
    return None


def _extract_phone(text: str) -> str:
    """提取手机号"""
    patterns = [
        r'1[3-9]\d{9}',  # 中国手机号
        r'\d{3,4}[-\s]?\d{7,8}',  # 座机
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)

    return ""


def _extract_email(text: str) -> str:
    """提取邮箱"""
    pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    match = re.search(pattern, text)
    return match.group(0) if match else ""


def _extract_education(text: str) -> str:
    """提取教育背景"""
    # 查找学历关键词
    education_keywords = ['博士', '硕士', '本科', '大专', '专科', 'MBA', 'EMBA']

    for keyword in education_keywords:
        if keyword in text:
            # 尝试提取完整的教育信息行
            lines = text.split('\n')
            for line in lines:
                if keyword in line and any(word in line for word in ['大学', '学院', '学校']):
                    return line.strip()[:50]  # 限制长度

    return ""


def _extract_experience(text: str) -> str:
    """提取工作经验摘要"""
    # 查找工作经验部分
    patterns = [
        r'工作经历[：:].*?(?=教育经历|$)',
        r'工作經驗[：:].*?(?=教育经历|$)',
        r'项目经验[：:].*?(?=教育经历|$)',
        r'工作经历.*?(?=\n\s{0,}[A-Z]{2,}|$)',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            exp = match.group(0).strip()
            return exp[:200]  # 返回前200字符

    # 尝试提取公司信息
    company_pattern = r'(?:工作|就职|任职).*?([A-Za-z\u4e00-\u9fa5]{2,20})(?:公司|有限公司|科技)'
    matches = re.findall(company_pattern, text)
    if matches:
        return '、'.join(set(matches[:3]))  # 返回最多3个不同公司

    return ""


def _detect_direction(text: str) -> str:
    """
    检测技术方向：Android/Linux/QNX

    按关键词匹配度返回最可能的方向
    """
    # 各方向的关键词
    android_keywords = [
        'Android', '安卓', 'android', 'Kotlin', 'Java',
        'Activity', 'Service', 'Broadcast', 'ContentProvider',
        'AndroidManifest', 'Gradle', 'SDK', 'NDK', 'JNI',
        'AudioManager', 'AudioPolicy', 'AudioFlinger', 'Audio HAL'
    ]

    linux_keywords = [
        'Linux', 'linux', 'Kernel', '内核', 'driver', 'Driver',
        '驱动', 'shell', 'bash', 'systemd', 'ALSA',
        'pthread', 'socket', 'IPC', 'GStreamer'
    ]

    qnx_keywords = [
        'QNX', 'qnx', 'QNX Neutrino', 'microkernel',
        'QNX Momentics', 'QNX RTOS', 'QCAR'
    ]

    # 统计各方向匹配数
    text_upper = text.upper()

    android_score = sum(1 for kw in android_keywords if kw.upper() in text_upper)
    linux_score = sum(1 for kw in linux_keywords if kw.upper() in text_upper)
    qnx_score = sum(1 for kw in qnx_keywords if kw.upper() in text_upper)

    # 判断方向
    if android_score >= 2 or android_score > linux_score and android_score > qnx_score:
        return "Android"
    elif linux_score >= 2 or linux_score > android_score and linux_score > qnx_score:
        return "Linux"
    elif qnx_score >= 1:
        return "QNX"
    elif android_score == 0 and linux_score == 0 and qnx_score == 0:
        return "未确定"
    else:
        # 返回得分最高的，如果平分则优先Android
        scores = {'Android': android_score, 'Linux': linux_score, 'QNX': qnx_score}
        max_score = max(scores.values())
        for direction, score in scores.items():
            if score == max_score and score > 0:
                return direction
        return "未确定"


def analyze_resume_with_skill(resume_text: str, jd_path: str = None) -> str:
    """
    调用resume-analyzer技能分析简历

    Args:
        resume_text: 简历文本内容
        jd_path: JD文件路径（默认使用项目根目录的jd.md）

    Returns:
        分析结果文本
    """
    try:
        # 这里需要通过Claude API来调用skill
        # 由于这是在模块内，我们返回分析建议
        # 实际的AI分析会在API层通过Skill工具完成

        return "待AI分析"
    except Exception as e:
        return f"分析失败: {str(e)}"


def extract_match_score(analysis_text: str) -> dict:
    """
    从分析结果中提取匹配度信息

    Args:
        analysis_text: resume-analyzer返回的分析文本

    Returns:
        dict包含: score (匹配度分数), recommendation (推荐意见)
    """
    if not analysis_text or analysis_text == "待AI分析":
        return {"score": "-", "recommendation": ""}

    # 尝试从分析文本中提取匹配度
    score_patterns = [
        r'匹配度[：:]?\s*(\d+)[%％]',
        r'匹配[：:]?\s*(\d+)[%％]',
        r'Match[：:]?\s*(\d+)[%％]',
    ]

    for pattern in score_patterns:
        match = re.search(pattern, analysis_text)
        if match:
            score = match.group(1)
            return {"score": f"{score}%", "recommendation": _extract_recommendation(analysis_text)}

    # 如果没有找到分数，尝试从推荐意见推断
    recommendation = _extract_recommendation(analysis_text)
    if recommendation:
        if "非常适合" in recommendation or "强烈推荐" in recommendation:
            return {"score": "90%", "recommendation": recommendation}
        elif "比较适合" in recommendation or "可以面试" in recommendation:
            return {"score": "70%", "recommendation": recommendation}
        elif "不太适合" in recommendation or "不推荐" in recommendation:
            return {"score": "30%", "recommendation": recommendation}

    return {"score": "-", "recommendation": recommendation}


def _extract_recommendation(analysis_text: str) -> str:
    """从分析文本中提取推荐意见"""
    patterns = [
        r'建议[：:](.*?)(?:\n|$)',
        r'推荐[：:](.*?)(?:\n|$)',
        r'Recommendation[：:](.*?)(?:\n|$)',
    ]

    for pattern in patterns:
        match = re.search(pattern, analysis_text)
        if match:
            return match.group(1).strip()

    # 尝试找到包含"建议面试"、"可以考虑"等关键词的句子
    suggestion_patterns = [
        r'(建议面试|可以考虑|不推荐|非常适合|比较适合|不太适合).*?(?:\n|$)',
    ]

    for pattern in suggestion_patterns:
        match = re.search(pattern, analysis_text)
        if match:
            return match.group(1).strip()

    return ""


# 检测并安装依赖
def check_dependencies():
    """检查必要的依赖是否安装"""
    missing = []

    try:
        import pdfplumber
    except ImportError:
        missing.append("pdfplumber")

    try:
        from docx import Document
    except ImportError:
        missing.append("python-docx")

    if missing:
        print(f"缺少依赖: {', '.join(missing)}")
        print(f"请运行: pip install {' '.join(missing)}")
        return False

    return True
