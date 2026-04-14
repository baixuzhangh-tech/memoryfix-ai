# MemoryFix AI 当前交接文档

更新时间：2026-04-13
生产域名：`https://artgen.site`
GitHub：`https://github.com/baixuzhangh-tech/memoryfix-ai`
当前支付方向：Paddle Billing

## 产品目标

MemoryFix AI 是面向海外用户的旧照片修复网站。

核心定位：

- 免费本地修复：浏览器内处理，不上传照片，默认 3 次免费。
- 本地付费包：`$9.90`，10 次额外浏览器本地修复 credits。
- Human Restore：`$19.90/photo`，用户主动上传 1 张照片，云端 AI 出草稿，人工审核后邮件交付。

当前阶段目标：

1. 跑通 Paddle sandbox 端到端付款和交付。
2. 等 Paddle live 审核通过后切 production。
3. 小范围获客，拿到第一笔真实付款。

## 已完成能力

- 基于 `inpaint-web` 的浏览器本地修复和 4x upscaling。
- 首页重构：隐私优先、本地免费、本地付费包、Human Restore 三条路径。
- Paddle.js 前端初始化：优先 `Paddle.Initialize({ token, eventCallback })`，旧 SDK fallback 到 `Paddle.Setup`。
- Human Restore 预上传：先上传照片和备注，再打开 Paddle checkout。
- Human Restore 上传前必须确认 Acceptable Use Policy；前后端都拒绝明显 NSFW、deepfake、face-swap、身份操纵、伪造证件等违规请求；配置 `OPENAI_API_KEY` 时会对 JPG / PNG / WebP 上传图做 OpenAI moderation。
- Paddle webhook：`POST /api/paddle-webhook`，验证 `paddle-signature`。
- Supabase：订单、任务、事件、私有原图 bucket、私有结果 bucket。
- 云端 AI：支持 fal.ai / OpenAI / Replicate provider。
- 后台：`/admin/review`，管理员 token 解锁，查看原图、AI result、备注，重试 AI，审核交付。
- Resend：客户确认、商家通知、最终结果交付邮件。
- 30 天保留清理 cron：`/api/cron/human-restore-cleanup`。

## 关键环境变量

前端公开变量：

```text
VITE_PADDLE_CLIENT_TOKEN=
VITE_PADDLE_ENVIRONMENT=sandbox
VITE_PADDLE_HUMAN_RESTORE_PRICE_ID=
VITE_PADDLE_LOCAL_PACK_PRICE_ID=
VITE_HUMAN_RESTORE_CONTACT_EMAIL=
```

服务端私密变量：

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

注意：不要把任何私密变量发到公开聊天或提交到 Git。

## 端到端工作流

```text
首页 Human Restore CTA
-> 用户上传 1 张源照片和修复备注
-> /api/human-restore-checkout 创建 pending_payment order
-> Paddle checkout overlay
-> /api/paddle-webhook 收到 transaction.completed
-> 更新订单为 paid
-> 生成 restore job
-> 自动尝试云端 AI 修复
-> /admin/review 人工审核
-> Approve & send
-> Resend 发送私有下载链接
-> 30 天后清理原图和结果图
```

## 运行检查

```bash
npm run check:human-restore-env
npm run test:human-restore
npm run build
```

当前测试重点：

- Paddle webhook 签名验证。
- 预上传订单付款后进入 paid / needs_review。
- AI 草稿生成。
- 后台审核、交付邮件、清理任务。

## 仍需完成

1. Paddle sandbox 真实付款测试。
2. Paddle live 审核通过后切 production token / price IDs / webhook。
3. 后台增加“上传人工最终修复图并替换 AI result”的入口。
4. 准备 before/after 示例图、首批推广文案和客服退款 SOP。

## 协作规则

- 当前建议以 `memoryfix-ai-codex` 作为 Codex 的独立工作目录。
- 另一个 AI 如果继续开发，尽量不要同时改 `src/App.tsx`、`api/`、`.env.example` 和支付相关文档。
- 每轮开发前先 `git fetch` / `git pull`，每轮完成后测试、提交、推送。
