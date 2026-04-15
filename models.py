"""
数据模型定义
使用Pydantic进行数据验证
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

# 配置：预设用户列表
USERS = [
    # "张三",
    # "李四",
    # "王五",
    # "赵六",
    # "系统"

    "江亚波",
    "刘学海",
    "安娜",
    "牛津",
    "苗彦江",
    "滕汝英",
    "王明正",
    "华泽如",
    "马博维",
    "李治谋",
    "张琪",
    "杨星",
    "王志刚",
    "刘华基",
    "王猛",
    "王忠校",
    "王玉丽",
    "徐启刚",
    "朱海志",
    "杨博",
    "梁斌斌",
    "刘文昊",
    "段君竹",
    "南彦鑫",
    "陈京飞",
    "宋姣姣",
    "高卓然",
    "张伟",
    "甘文豪",
    "于佳乐",
    "吴天宇",
    "刘通",
    "李澳波",
    "王派",
    "王艺鹏",
    "李佳琪",
    "杨普",
    "牛保淋",
    "范江楠",
    "杨瑛华",
    "赵子含",
    "马英达"

]


class CandidateBase(BaseModel):
    """应聘者基础信息"""
    name: str = Field(..., description="应聘者姓名")
    resume_file: str = Field(..., description="简历文件路径")
    direction: str = Field(default="", description="技术方向：Android/Linux/QNX")
    uploader: str = Field(default="系统", description="上传人")


class CandidateCreate(CandidateBase):
    """创建应聘者请求"""
    upload_date: Optional[str] = Field(default="", description="上传日期")


class CandidateUpdate(BaseModel):
    """更新应聘者请求"""
    name: Optional[str] = None
    direction: Optional[str] = None
    work_base: Optional[str] = None
    can_interview: Optional[str] = None
    interview_owner: Optional[str] = None
    interview_date: Optional[str] = None
    interviewer: Optional[str] = None
    first_interview_review: Optional[str] = None
    first_interview_conclusion: Optional[str] = None
    second_interview_date: Optional[str] = None
    second_interview_conclusion: Optional[str] = None
    recruitment_status: Optional[str] = None


class CandidateResponse(CandidateBase):
    """应聘者响应"""
    id: int = Field(..., description="序号")
    upload_date: str = Field(..., description="上传日期")
    work_base: str = Field(default="", description="工作base")
    can_interview: str = Field(default="", description="是否可以约面")
    interview_owner: str = Field(default="", description="约面负责人")
    interview_date: str = Field(default="", description="初面时间")
    interviewer: str = Field(default="", description="面试官")
    first_interview_review: str = Field(default="", description="初面评价")
    first_interview_conclusion: str = Field(default="", description="初面结论")
    second_interview_date: str = Field(default="", description="复面时间")
    second_interview_conclusion: str = Field(default="", description="复面结论")
    recruitment_status: str = Field(default="", description="招聘状态")

    class Config:
        from_attributes = True


class ResumeAnalysis(BaseModel):
    """简历分析结果"""
    name: str = Field(..., description="应聘者姓名")
    phone: str = Field(default="", description="电话")
    email: str = Field(default="", description="邮箱")
    education: str = Field(default="", description="教育背景")
    experience: str = Field(default="", description="工作经验")
    direction: str = Field(..., description="技术方向")
    raw_text: str = Field(default="", description="原始简历文本")


class UploadResponse(BaseModel):
    """上传响应"""
    success: bool
    message: str
    candidate_id: Optional[int] = None
    analysis: Optional[ResumeAnalysis] = None
