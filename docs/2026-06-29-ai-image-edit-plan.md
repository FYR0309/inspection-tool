# AI 修图功能实施计划

## Context

在安全检查报告的"新增问题项"页面，用户上传整改前/整改后照片后，经常需要对照片做简单修改——比如去掉水印、调亮光线、标注重点区域等。目前只能拍完照直接使用，无法编辑。本计划为照片插槽增加 AI 修图能力：用户选择已有照片 → 输入修改指令 → AI 自动修图 → 返回替换原图。

## 技术方案

**后端**：新增 Vercel Serverless 函数 `api/edit-image.js`，代理调用 ModelScope 的 Qwen-Image-Edit API（已配置在本地 MCP，复用同一 API Key）

**前端**：在照片插槽上增加"✨修图"按钮 → 弹出修图面板 → 用户输入指令 → 等待 AI 生成 → 确认替换

**API 流程**：
```
浏览器 --[base64图片 + prompt]--> api/edit-image.js
                                      ↓
                              ModelScope API (异步: 提交→轮询→下载)
                                      ↓
浏览器 <--[base64结果图]--------- 返回
```

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `api/edit-image.js` | **新建** | Vercel serverless，代理 ModelScope 图生图 API |
| `js/ui.js` | 修改 | 照片插槽增加修图按钮 + 修图面板渲染 |
| `css/style.css` | 修改 | 修图面板、按钮、加载态样式 |
| `vercel.json` | 修改 | 新增函数配置，超时延长到 60s |

## 实施步骤

### 步骤 1：新建 `api/edit-image.js`

参考 `api/optimize.js` 的 Vercel serverless 模式，实现：

- 接收 POST body: `{ image: "data:image/jpeg;base64,...", prompt: "把背景变亮" }`
- 从 `process.env.MODELSCOPE_API_KEY` 读取密钥
- 调用 ModelScope `/v1/images/generations` 提交异步任务（header: `X-ModelScope-Async-Mode: true`）
- 轮询 `/v1/tasks/{task_id}` 直到完成或超时（最长 60s）
- 下载结果图，转为 base64 返回: `{ success: true, image: "data:image/png;base64,..." }`
- 错误返回: `{ success: false, error: "..." }`

关键参数：
- model: `Qwen/Qwen-Image-Edit-2511`
- size: `1024x1024`（输入图片自动等比缩放）
- negative_prompt: `模糊, 变形, 低质量`
- 图片压缩：超过 5MB 时压缩到 1024px 宽再上传（减少 serverless 带宽消耗）

### 步骤 2：修改 `js/ui.js` — 照片插槽增加修图按钮

在 `renderItemForm()` 的 `photo-slot` 内部，当已有照片时，渲染一个修图触发按钮：

```
<!-- 修图按钮（仅在有照片时显示） -->
<button class="slot-edit-btn" data-slot="slot-before">✨ 修图</button>
```

点击后调用 `showImageEditPanel(slotId, currentPhoto)` 打开修图面板。

### 步骤 3：修改 `js/ui.js` — 修图面板渲染

新增函数 `showImageEditPanel(slotId, imageDataUrl, onConfirm)` ：

- 底部弹出面板（类似 `showEditModal` 的样式）
- 上方：当前图片预览
- 中间：文本框输入修改指令（placeholder: "描述你想怎么修改，如：调亮背景、去掉水印…"）
- 预置快捷指令按钮（"调亮" / "去水印" / "增强清晰度"）
- "开始修图" 按钮 → 调用 API → 显示 loading → 展示结果
- 结果区："使用此图" / "重试" 按钮
- 确认后回调替换照片

### 步骤 4：修改 `css/style.css` — 新增样式

- `.slot-edit-btn` — 修图触发按钮（半透明圆角，绝对定位在照片右下角）
- `.edit-panel-overlay` — 底部弹出面板
- `.edit-panel-preview` — 图片预览区
- `.edit-panel-quick-prompts` — 快捷指令标签
- `.edit-panel-loading` — 生成中的加载态
- `.edit-panel-result` — 结果预览 + 操作按钮

### 步骤 5：修改 `vercel.json`

```json
{
  "functions": {
    "api/optimize.js": { "memory": 256, "maxDuration": 30 },
    "api/edit-image.js": { "memory": 512, "maxDuration": 60 }
  }
}
```

### 步骤 6：配置环境变量

在 Vercel 项目设置中添加 `MODELSCOPE_API_KEY`（值同本地 `.mcp.json` 中的 key: `ms-6cd149c2-d1bf-48b4-9d50-23cb26cc94a4`）

## 用户操作流程

1. 进入新增/编辑问题项页面
2. 点击照片插槽 → 选择相册/拍照 → 照片显示在插槽中
3. 照片右下角出现 **✨ 修图** 按钮
4. 点击修图 → 底部弹出修图面板
5. 输入修改要求（或点快捷指令）→ 点击"开始修图"
6. 等待 5-30 秒 → 查看生成结果
7. 满意 → 点击"使用此图" → 修图面板关闭，照片替换
8. 不满意 → 点击"重试"重新生成，或修改指令再试

## 验证方法

1. 打开检查工具 → 选择任意报告类型 → 新增问题项
2. 拍照或从相册选一张照片
3. 确认照片插槽上出现"✨ 修图"按钮
4. 点击修图 → 输入指令（如"去水印"）→ 开始修图
5. 等待生成完成 → 确认结果图片正确替换原图
6. 生成 Word 报告 → 确认修过的图片正常显示在表格中
7. 测试错误场景：输入空指令 → 应提示"请输入修改指令"
8. 测试网络异常：断网后修图 → 应提示友好错误信息
