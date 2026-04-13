# 简历管理Agent

一个基于 FastAPI + Vue 的简历管理系统，支持简历上传、自动解析、面试流程管理。

## 功能特性

- 📤 **简历上传**: 支持 PDF、DOCX、TXT 格式
- 🔍 **自动解析**: 提取姓名、联系方式、教育背景、工作经验
- 🎯 **方向识别**: 自动识别 Android/Linux/QNX 技术方向
- 📊 **数据管理**: Excel 表格存储，支持增删改查
- 📅 **面试管理**: 跟踪约面状态、面试安排
- 🌐 **Web界面**: 简洁直观的浏览器界面

## 项目结构

```
resume_agent/
├── main.py              # FastAPI 应用入口
├── models.py            # 数据模型定义
├── resume_parser.py     # 简历解析模块
├── excel_manager.py     # Excel 表格管理
├── static/              # 前端静态文件
│   ├── index.html       # 主页面
│   ├── style.css        # 样式文件
│   └── app.js           # 前端逻辑
├── resumes/             # 简历存储目录
└── data/
    └── candidates.xlsx  # 应聘者数据表
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 运行服务

```bash
python resume_agent/main.py
```

启动后访问: http://localhost:8000

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload | 上传简历 |
| GET | /api/candidates | 获取应聘者列表 |
| GET | /api/candidates/{id} | 获取单个应聘者 |
| PUT | /api/candidates/{id} | 更新应聘者信息 |
| DELETE | /api/candidates/{id} | 删除应聘者 |
| GET | /api/download/resume/{id} | 下载简历 |
| GET | /api/stats | 获取统计信息 |

## 表格字段

| 字段 | 说明 |
|------|------|
| 序号 | 自动生成 |
| 应聘者 | 解析的姓名 |
| 简历附件 | 文件名 |
| 方向 | Android/Linux/QNX |
| 简历上传日期 | 自动记录 |
| 上传人 | 上传时填写 |
| 是否可以约面 | 是/否/待定 |
| 约面负责人 | 填写 |
| 初面时间 | 填写 |
| 面试官 | 填写 |
