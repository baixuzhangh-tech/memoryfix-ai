# Phase 3 上线预演与首个付费用户路径

## 本轮目标

把 `MemoryFix AI` 从本地可运行原型推进到可以公开访问、可以收集早鸟付费意向的 MVP。

本阶段不改核心模型，不承诺完美修复，重点是发布、信任、转化和验证。

## 当前上线配置

已完成：

- `npm run deploy:check`：生产构建检查
- `public/_headers`：Cloudflare Pages 静态安全 header
- `public/_redirects`：Cloudflare Pages SPA 回退
- `vercel.json`：Vercel 构建、输出目录、header、SPA rewrite
- `.env.example`：早鸟付费链接环境变量模板
- `VITE_EARLY_ACCESS_URL`：可替换首页 `Join Early Access` 按钮
- 首屏不再预下载 inpaint 模型，用户选择照片后再下载，避免首页被 0% 下载弹窗遮挡

推荐首发部署参数：

```text
Build command: npm run build
Output directory: dist
Install command: npm install --ignore-scripts
```

## 首发平台建议

优先选择 Cloudflare Pages 或 Vercel 的其中一个，不要两个平台同时正式推广，避免数据分散。

建议先用 Cloudflare Pages：

- 海外访问速度通常更友好
- 静态站部署路径简单
- `public/_headers` 和 `public/_redirects` 已经准备好

Vercel 也可以：

- `vercel.json` 已经准备好
- 后续如果增加 Next.js、API route 或服务端能力，迁移成本低

## 首个付费用户路径

当前最短路径：

1. 创建一个 `$9 Early Access` 托管付款链接
2. 把付款链接配置成环境变量 `VITE_EARLY_ACCESS_URL`
3. 重新部署站点
4. 用户点击 `Join Early Access`
5. 用户完成付款
6. 付款成功后人工发送邮件，邀请用户加入产品访谈或优先体验名单

可以使用的付款工具：

- Stripe Payment Link
- Lemon Squeezy Checkout
- Gumroad Product
- Paddle Checkout

早鸟产品建议文案：

```text
MemoryFix AI Early Access - $9

Support a privacy-first old photo repair tool and get priority access to stronger restoration workflows, HD export experiments, and batch album features as they become available.
```

注意：当前本地免费工具仍可直接使用。早鸟付费卖的是“优先权、支持项目、未来 Pro 工作流资格”，不是承诺当前模型一定能修好所有照片。

## 发布前冒烟测试

上线后逐项检查：

1. 首页可打开，标题为 `MemoryFix AI - Private Old Photo Repair`
2. 点击示例老照片能进入编辑器
3. 首页首屏不应被模型下载弹窗遮挡
4. 点击示例老照片或上传照片后，才下载 local repair model
5. 刷一点小划痕区域，松开鼠标后能生成一次修复结果
6. `Original` 对比按钮可用
7. `4x-upscaling` 能触发模型下载和处理
8. `Download` 能导出结果
9. `Privacy / Terms / Open Source` 锚点可跳转
10. `Join Early Access` 在未配置环境变量时打开邮件，在配置后打开付款链接
11. 浏览器控制台没有阻断模型加载的 CORS、COEP、WASM MIME 错误

## 重要边界

可以对用户说：

```text
Your photos are processed locally in your browser.
Your photos are not uploaded by the local repair workflow.
```

不要对用户说：

```text
Works fully offline on first load.
Restores every old photo perfectly.
No third-party network requests at all.
```

原因：

- 首次运行需要下载 ONNX Runtime 和模型文件
- 当前模型更适合划痕、污渍、折痕、小面积缺损
- 高强度人脸修复、严重缺损重建，需要未来的 opt-in Pro workflow

## 下一步

1. 选择并创建 GitHub 仓库
2. 连接 Cloudflare Pages 或 Vercel
3. 完成线上冒烟测试
4. 创建早鸟付款链接
5. 配置 `VITE_EARLY_ACCESS_URL`
6. 加入基础访问分析和转化事件
