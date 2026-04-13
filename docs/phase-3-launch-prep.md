# Phase 3 上线预演与首个付费用户路径

更新时间：2026-04-13

## 本轮目标

把 `MemoryFix AI` 从可访问 MVP 推进到可以验证真实收款和人工交付的产品。

当前策略：

- 免费入口：3 次浏览器本地修复，不上传照片。
- 本地付费包：`$9.90`，10 次额外本地修复 credits，短期存于当前浏览器。
- 人工修复：`$19.90/photo`，用户主动上传 1 张照片，云端 AI 出草稿，人工审核后邮件交付。

## 当前线上状态

- 正式站点：`https://artgen.site`
- 部署平台：Vercel
- 代码主分支：`main`
- 支付方向：Paddle Billing
- Paddle 环境：先用 `sandbox`，审核通过后切 `production`
- Webhook：`POST https://artgen.site/api/paddle-webhook`

## 当前付费工作流

```text
用户选择 Human Restore
-> 先上传 1 张源照片和修复备注
-> 创建 Supabase pending_payment order
-> 打开 Paddle checkout
-> Paddle transaction.completed webhook
-> 更新订单为 paid
-> 创建 / 更新 restore job
-> 云端 AI 生成修复草稿
-> 管理员在 /admin/review 人工审核
-> Approve & send 通过 Resend 发私有下载链接
-> 30 天保留窗口后自动清理
```

## 必需环境变量

前端构建期变量：

```text
VITE_PADDLE_CLIENT_TOKEN=
VITE_PADDLE_ENVIRONMENT=sandbox
VITE_PADDLE_HUMAN_RESTORE_PRICE_ID=
VITE_PADDLE_LOCAL_PACK_PRICE_ID=
VITE_HUMAN_RESTORE_CONTACT_EMAIL=
```

后端运行时变量：

```text
SITE_URL=https://artgen.site
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_HUMAN_RESTORE_PRICE_ID=
PADDLE_LOCAL_PACK_PRICE_ID=
PADDLE_ENVIRONMENT=sandbox
RESEND_API_KEY=
HUMAN_RESTORE_INBOX=
HUMAN_RESTORE_FROM_EMAIL=
HUMAN_RESTORE_SUPPORT_EMAIL=
HUMAN_RESTORE_UPLOAD_TOKEN_SECRET=
HUMAN_RESTORE_ADMIN_TOKEN=
CRON_SECRET=
FAL_KEY= 或 OPENAI_API_KEY=
```

注意：`VITE_*` 会被打包进前端，只能放 Paddle client-side token 和公开 price id，不能放 Paddle API key。

## 发布前冒烟测试

1. 首页可打开，标题为 `MemoryFix AI - Private Old Photo Repair`。
2. 点击示例老照片能进入编辑器。
3. 免费本地修复首屏不上传照片。
4. 选择照片后才下载本地模型。
5. 修复、Original 对比、4x upscaling、Download 均可用。
6. 免费 3 次计数可见，Local Pack CTA 在 Paddle 配置好后能打开 checkout。
7. Human Restore 可以先上传测试图片，再打开 Paddle checkout。
8. Paddle sandbox 支付完成后能回到 `/human-restore/success`。
9. Paddle webhook 能把订单推进到 paid / needs_review。
10. `/admin/review` 能看到任务、原图、AI result、用户备注。
11. `Approve & send` 能发出结果邮件。
12. 下载链接可打开，过期清理 cron 不误删未交付任务。

## 首个付费用户验证

第一阶段目标不是放大流量，而是证明闭环：

1. 有用户理解“本地免费”和“云端人工修复”的区别。
2. 有用户愿意点击 Human Restore。
3. 有用户愿意为 1 张重要照片支付 `$19.90`。
4. 交付结果让用户认为“人工审核”有价值。
5. 如果 AI 草稿不够好，管理员能介入并交付更好的最终图。

## 仍需补强

- 后台增加“上传人工最终修复图并替换 AI result”的能力。
- 统一 Privacy / Terms / Refund 中的 30 天保留口径。
- 准备 3-5 张 before/after 示例图用于获客。
- 准备英文首批推广文案和客服退款 SOP。
