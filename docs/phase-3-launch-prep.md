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
- `VITE_EARLY_ACCESS_URL`：可替换首页 `Book Human Restore` 按钮
- `Book Human Restore` 默认链接已接入 Lemon Squeezy checkout
- 首屏不再预下载 inpaint 模型，用户选择照片后再下载，避免首页被 0% 下载弹窗遮挡
- 接入 Vercel Web Analytics，并增加首批产品漏斗事件

当前线上状态：

- 正式站点：`https://artgen.site`
- 部署平台：Vercel
- 代码主分支：`main`
- 已推送关键提交：`700458a Connect human restore checkout`

推荐首发部署参数：

```text
Build command: npm run build
Output directory: dist
Install command: npm install --ignore-scripts
```

## 当前商业验证优先级

当前已经完成公开访问、基础分析和付款入口接入。接下来不要再分散到多平台部署优化，优先做真实收款闭环验证：

1. 激活 Lemon Squeezy 店铺
2. 做一次端到端付款测试
3. 配置付款成功后的 thank-you 页面或邮件说明
4. 明确用户付款后如何上传照片
5. 小规模获客验证文案与价格

## 首个付费用户路径

当前最短路径：

1. 用户进入首页，先理解 `Free Local` 是浏览器本地修复，不上传照片
2. 用户在 `Human-assisted Restore - $19/photo` 区域看到独立付费 CTA
3. 用户点击 `Book Human Restore`
4. 打开 Lemon Squeezy checkout 并完成付款
5. 付款成功页或订单邮件告知上传方式与交付说明
6. 用户只在此时主动上传照片或回复邮件
7. 人工完成 review / touch-up，并在 beta 期间 `48 小时内` 邮件交付

当前 checkout：

```text
https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268
```

当前代码逻辑：

- 优先读取 `import.meta.env.VITE_EARLY_ACCESS_URL`
- 如果未配置环境变量，则使用上述 Lemon Squeezy checkout 作为默认链接
- 因此只有在你显式设置了新的 `VITE_EARLY_ACCESS_URL` 时，首页按钮才会覆盖默认 checkout
- 已实现付款成功说明页路径：`/human-restore/success`
- 该页面用于说明上传方式、隐私边界和 beta 交付承诺

可以使用的付款工具：

- Stripe Payment Link
- Lemon Squeezy Checkout
- Gumroad Product
- Paddle Checkout

Human-assisted Restore 产品建议文案：

```text
MemoryFix AI Human-assisted Restore - $19/photo

For one important old photo that deserves extra care. We combine AI base restoration with human review and manual touch-up, then deliver a cleaner result by email.

Important: The free local repair tool does not upload photos. This paid service requires upload only after you explicitly choose Human-assisted Restore.

Delivered by email within 48 hours during beta.
Limited beta capacity.
```

注意：当前本地免费工具仍可直接使用。Human-assisted Restore 必须强调“用户主动选择并同意上传”，不能混淆为本地免费修复也会上传。

## 付款成功后的引导建议

优先选择以下任一方式，减少用户付款后的迷茫感：

1. Lemon Squeezy success URL 跳转到 thank-you 页面
2. Lemon Squeezy 订单确认邮件中写明上传和交付流程
3. 两者同时存在

当前建议直接把 Lemon Squeezy 成功跳转配置到：

```text
https://artgen.site/human-restore/success
```

建议 success / 邮件文案至少包含：

```text
Thank you for booking MemoryFix AI Human-assisted Restore.

Next step: reply to your order email and attach the photo you want restored.

What happens next:
1. We review the photo and confirm whether it fits the beta workflow.
2. We complete AI restoration plus manual touch-up.
3. We deliver the final result by email within 48 hours during beta.

Important: the free local tool does not upload your photos. Upload is required only for this paid service after you explicitly choose it.
```

## Pricing 页面结构

首页 Pricing 保留三档更容易理解的 credits 策略：

```text
Free Local
$0
Private browser repair for small damage.

Family Pack
$9
10 restore credits for HD / Pro workflows.
Best for trying a few important memories.

Album Pack
$19
30 restore credits for family albums.
Best for scanning and restoring a small collection.
```

`Human-assisted Restore $19/photo` 不放入三档 credits 套餐中，而是作为独立高意向 CTA，用来验证用户是否愿意为一张重要照片购买人工辅助交付。

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
10. `Book Human Restore` 在未配置环境变量时打开默认 Lemon Squeezy checkout，在配置环境变量后打开你指定的新链接
11. 直接访问 `/human-restore/success` 可以看到 thank-you 与上传说明页面
12. 浏览器控制台没有阻断模型加载的 CORS、COEP、WASM MIME 错误

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

1. 激活 Lemon Squeezy 店铺，确认可以真实收款
2. 用真实流程完成一次测试付款，检查 checkout、订单、邮件、后台记录
3. 配置付款成功页面或订单邮件，告诉用户如何上传照片
4. 小范围找 `20-50` 个目标用户做首轮获客测试
5. 根据访问量、`click_human_restore` 点击率、checkout 转化率继续调整文案与价格

## 当前埋点

不采集用户照片内容、私有文件名或用户身份。当前只记录产品漏斗行为：

- `visit_home`
- `click_sample_photo`
- `upload_photo`
- `model_cache_hit`
- `model_download_started`
- `model_download_completed`
- `model_download_failed`
- `repair_started`
- `repair_completed`
- `repair_failed`
- `upscale_started`
- `upscale_completed`
- `upscale_failed`
- `download_result`
- `toggle_original_compare`
- `click_human_restore`
- `view_human_restore_success`

## Lemon Squeezy 产品建议

产品名称：

```text
MemoryFix AI Human-assisted Restore
```

价格：

```text
$19 / photo
```

产品描述：

```text
For one important old photo that deserves extra care.

We combine AI base restoration with human review and manual touch-up, then deliver a cleaner result by email.

Important: The free local repair tool does not upload photos. This paid service requires upload only after you explicitly choose Human-assisted Restore.
```

交付承诺：

```text
Delivered by email within 48 hours during beta.
Limited beta capacity.
```
