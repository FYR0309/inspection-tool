# 安全检查报告工具

移动端安全检查报告生成工具。用户填写检查项 → 生成 Word 报告 → 下载。

## 技术栈
- 纯前端 SPA（HTML + CSS + JS），无框架
- docx 库（本地化 lib/docx.umd.js，避免国外 CDN 慢）
- Vercel Serverless 中转 API（api/ 目录）
- GitHub Pages 部署
- 支持 PWA 离线使用

## 文件结构
- `index.html` —— 主页面（SPA 容器）
- `css/style.css` —— 所有样式
- `js/app.js` —— 主入口：状态管理、页面路由、事件协调
- `js/ui.js` —— 页面视图渲染
- `js/db.js` —— IndexedDB 草稿 + localStorage 预设
- `js/docx-gen.js` —— Word 报告生成
- `js/ai.js` —— 豆包 AI 直接调用
- `js/camera-voice.js` —— 拍照、语音识别、图片压缩
- `lib/docx.umd.js` —— 第三方库（不改）
- `api/edit-image.js` —— 图片编辑 Vercel 函数
- `api/optimize.js` —— 内容优化 Vercel 函数
- `tools/` —— 本地代理脚本（不改）

## 注意事项
- 全中文界面，面向国内用户
- 移动端优先，触摸操作
- 不要改 node_modules、lib/、tools/ 里的文件
- 部署用 GitHub Pages + Vercel API，不要改动部署文件
- AI API Key 在前端代码中（js/ai.js），当前为豆包密钥
