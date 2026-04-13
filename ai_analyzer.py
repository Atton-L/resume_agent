"""
AI分析模块
使用Claude API + resume-analyzer skill 进行简历分析和信息提取
"""
import os
import re
from typing import Dict, Optional


# Skill文件路径
SKILL_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.claude', 'skills', 'resume-analyzer.md')


def _get_anthropic_client():
    """
    创建 Anthropic 客户端，兼容多种环境变量配置

    支持:
    - ANTHROPIC_API_KEY（官方标准）
    - ANTHROPIC_AUTH_TOKEN（代理/中转场景）
    """
    import anthropic

    api_key = os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN')
    if not api_key:
        return None

    base_url = os.environ.get('ANTHROPIC_BASE_URL')

    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url

    return anthropic.Anthropic(**kwargs)


def _get_model(role: str = "default") -> str:
    """
    获取模型名称，优先使用环境变量配置

    Args:
        role: "default" 用于分析, "fast" 用于姓名提取等轻量任务
    """
    if role == "fast":
        return os.environ.get('ANTHROPIC_SMALL_FAST_MODEL') or os.environ.get('ANTHROPIC_MODEL') or "claude-3-5-sonnet-20241022"
    return os.environ.get('ANTHROPIC_MODEL') or "claude-3-5-sonnet-20241022"


def _get_response_text(message) -> str:
    """
    从 Claude API 响应中提取文本内容

    兼容普通响应和 extended thinking 响应：
    - 普通: [TextBlock(text="...")]
    - Thinking: [ThinkingBlock(...), TextBlock(text="...")]
    """
    for block in message.content:
        if hasattr(block, 'text'):
            return block.text
    return ""


def _load_skill_prompt() -> Optional[str]:
    """加载 resume-analyzer skill 定义作为系统提示"""
    try:
        with open(SKILL_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
        # 去掉 frontmatter（--- ... ---）
        content = re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, flags=re.DOTALL)
        return content.strip()
    except FileNotFoundError:
        print(f"Skill文件未找到: {SKILL_FILE}")
        return None


def get_claude_analysis(resume_text: str, jd_text: str) -> Dict[str, any]:
    """
    使用Claude API + resume-analyzer skill 分析简历

    Args:
        resume_text: 简历文本
        jd_text: JD职位描述文本

    Returns:
        分析结果字典，包含:
        - name: 姓名信息
        - match_score: 匹配度分数
        - strengths: 优势列表
        - weaknesses: 劣势/待改进点列表
        - recommendation: 推荐意见
        - interview_questions: 面试问题
        - full_analysis: 完整分析文本
    """
    try:
        import anthropic

        client = _get_anthropic_client()
        if not client:
            print("WARNING: 未找到 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN 环境变量")
            return _get_default_analysis()

        # 加载 skill 作为 system prompt
        skill_prompt = _load_skill_prompt()

        if skill_prompt:
            # 使用 skill 定义作为系统提示
            system_message = skill_prompt
            user_message = f"""请分析以下简历与职位描述的匹配情况。

## 职位描述(JD)
{jd_text}

## 简历内容
{resume_text}

请严格按照 skill 中定义的格式输出分析结果。
特别注意：匹配度分数请使用格式 **匹配度分数**: XX%"""

            message = client.messages.create(
                model=_get_model(),
                max_tokens=4000,
                system=system_message,
                messages=[{"role": "user", "content": user_message}]
            )
        else:
            # Skill文件不存在时降级为内置prompt
            prompt = f"""你是一位专业的HR招聘助手。请分析以下简历与职位描述的匹配情况。

## 职位描述(JD)
{jd_text}

## 简历内容
{resume_text}

请按照以下格式进行分析，确保每个部分都明确标注：

---

### 候选人优势 (Candidate Strengths)
- 列出3-5条主要优势
- 包括技术技能、工作经验、教育背景等

### 候选人劣势/待改进点 (Weaknesses/Gaps)
- 列出2-3条需要改进的地方
- 相对JD要求的不足之处

### 岗位匹配度分析 (Job Match Analysis)
- **匹配度分数**: [0-100之间的数字]%
- **匹配项**: 列出2-3个主要匹配点
- **缺失项**: 列出1-2个主要缺失点
- **综合评估**: 非常适合/比较适合/一般/不太适合
- **推荐意见**: 建议面试/可以考虑/不推荐

### 面试建议问题 (Interview Questions)
提出6-8个针对性的面试问题，分为：
- **技术能力**: 2-3个问题
- **项目经验**: 2个问题
- **问题解决**: 1-2个问题

---

请严格按照以上格式输出，确保"匹配度分数"使用格式：**匹配度分数**: XX%
"""
            message = client.messages.create(
                model=_get_model(),
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}]
            )

        analysis_text = _get_response_text(message)

        # 解析分析结果
        return _parse_analysis_result(analysis_text, resume_text)

    except ImportError:
        # 未安装anthropic包
        return _get_default_analysis()
    except Exception as e:
        print(f"AI分析出错: {str(e)}")
        return _get_default_analysis()


def extract_name_with_ai(resume_text: str) -> Optional[str]:
    """
    使用AI提取简历中的姓名

    Args:
        resume_text: 简历文本

    Returns:
        提取到的姓名，失败返回None
    """
    try:
        import anthropic

        client = _get_anthropic_client()
        if not client:
            return None

        prompt = f"""请从以下简历文本中提取应聘者的真实姓名。

注意：
- 只返回姓名本身（2-4个中文字符），不要包含"先生"、"女士"、"小姐"等称谓
- 如果简历中只出现"X先生"、"X女士"这样的匿名称呼，请只返回姓氏（如"高"），如果无法确定真实全名，返回"未知"
- 不要返回任何其他内容

简历文本：
{resume_text[:2000]}

姓名："""

        message = client.messages.create(
            model=_get_model("fast"),
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}]
        )

        name = _get_response_text(message).strip()

        # 验证姓名格式
        if re.match(r'^[\u4e00-\u9fa5]{2,4}$', name):
            return name

        return None

    except Exception as e:
        print(f"AI提取姓名失败: {str(e)}")
        return None


def _parse_analysis_result(analysis_text: str, resume_text: str) -> Dict[str, any]:
    """解析AI分析结果文本"""

    result = {
        'name': None,
        'match_score': '-',
        'strengths': [],
        'weaknesses': [],
        'recommendation': '',
        'interview_questions': [],
        'full_analysis': analysis_text
    }

    # 提取匹配度分数
    score_patterns = [
        r'\*\*匹配度分数\*\*[：:]?\s*约?(\d+)\s*[%％]',
        r'匹配度分数[：:]?\s*约?(\d+)\s*[%％]',
        r'\*\*匹配度\*\*[：:]?\s*约?(\d+)\s*[%％]',
        r'匹配度[：:]?\s*约?(\d+)\s*[%％]',
        r'匹配分数[：:]?\s*约?(\d+)\s*[%％]',
        r'[Oo]verall\s*[Mm]atch\s*[Ss]core[：:]?\s*约?(\d+)\s*[%％]',
        r'[Mm]atch.*?[Ss]core.*?(\d+)\s*[%％]',
        r'(\d+)\s*[%％]\s*(?:匹配|的匹配度)',
    ]
    for pattern in score_patterns:
        match = re.search(pattern, analysis_text)
        if match:
            result['match_score'] = f"{match.group(1)}%"
            break

    # 提取推荐意见
    rec_patterns = [
        r'\*\*推荐意见\*\*[：:]?\s*([^\n]+)',
        r'推荐意见[：:]?\s*([^\n]+)',
    ]
    for pattern in rec_patterns:
        match = re.search(pattern, analysis_text)
        if match:
            result['recommendation'] = match.group(1).strip()
            break

    # 提取优势（匹配 "## ...Strengths..." 或 "## ...优势..." 到下一个 ## 之间的内容）
    strengths_section = re.search(
        r'#{2}\s+[^\n]*(?:Strengths|优势)[^\n]*\n(.*?)(?=\n#{2}\s|\Z)',
        analysis_text, re.DOTALL | re.IGNORECASE
    )
    if strengths_section:
        lines = strengths_section.group(1).split('\n')
        result['strengths'] = [line.strip().lstrip('-*•').strip() for line in lines
                               if line.strip().startswith(('-', '*', '•')) and len(line.strip()) > 3]

    # 提取劣势
    weaknesses_section = re.search(
        r'#{2}\s+[^\n]*(?:Weaknesses|Gaps|劣势|待改进)[^\n]*\n(.*?)(?=\n#{2}\s|\Z)',
        analysis_text, re.DOTALL | re.IGNORECASE
    )
    if weaknesses_section:
        lines = weaknesses_section.group(1).split('\n')
        result['weaknesses'] = [line.strip().lstrip('-*•').strip() for line in lines
                                if line.strip().startswith(('-', '*', '•')) and len(line.strip()) > 3]

    # 提取面试问题
    questions_section = re.search(
        r'#{2}\s+[^\n]*(?:Interview|面试)[^\n]*\n(.*?)(?=\n#{2}\s|\Z)',
        analysis_text, re.DOTALL | re.IGNORECASE
    )
    if questions_section:
        lines = questions_section.group(1).split('\n')
        result['interview_questions'] = [line.strip().lstrip('-*•').strip() for line in lines
                                         if line.strip().startswith(('-', '*', '•', '**Q')) and len(line.strip()) > 3]

    # 如果没有提取到匹配度分数，尝试从综合评估推断
    if result['match_score'] == '-':
        assessment = re.search(r'综合评估[：:]\s*([^\n]+)', analysis_text)
        rec = result.get('recommendation', '')
        text_to_check = (assessment.group(1) if assessment else '') + ' ' + rec
        if any(w in text_to_check for w in ['非常适合', '强烈推荐', '高度匹配']):
            result['match_score'] = '90%'
        elif any(w in text_to_check for w in ['比较适合', '建议面试', '推荐面试', '可以面试']):
            result['match_score'] = '75%'
        elif any(w in text_to_check for w in ['一般', '可以考虑']):
            result['match_score'] = '50%'
        elif any(w in text_to_check for w in ['不太适合', '不推荐', '不建议']):
            result['match_score'] = '30%'

    return result


def _get_default_analysis() -> Dict[str, any]:
    """返回默认分析结果（当API不可用时）"""
    return {
        'name': None,
        'match_score': '-',
        'strengths': [],
        'weaknesses': [],
        'recommendation': '待分析',
        'interview_questions': [],
        'full_analysis': 'AI分析服务暂不可用，请检查ANTHROPIC_API_KEY环境变量。'
    }


def load_jd_text(jd_path: str = None) -> str:
    """
    加载JD职位描述文本

    Args:
        jd_path: JD文件路径，默认使用项目根目录的jd.md

    Returns:
        JD文本内容
    """
    if jd_path is None:
        # 默认使用项目根目录的jd.md
        jd_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'jd.md')

    try:
        with open(jd_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        # 返回默认JD
        return """## 车载音频开发工程师

### 必备要求
1. 计算机或相关专业本科及以上学历，3年以上音频开发经验
2. 精通C/C++编程语言
3. 熟悉Android系统的音频架构（AudioManager、AudioPolicy、AudioFlinger、Audio HAL）
4. 熟悉车载音频芯片（Qualcomm、MTK等）
5. 熟悉音频问题调试方法及工具
6. 熟悉常见的音频接口协议（I2S、TDM、A2B、USB/BT/Aux Audio等）

### 加分项
- 有车载Android项目开发经验
- 熟悉QCOM/MTK平台音频架构
- 有音频算法开发经验（ANC、AEC、降噪等）
"""
