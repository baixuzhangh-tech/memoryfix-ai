# MemoryFix AI 项目交接文档

更新时间：2026-04-12  
项目目录：`/Users/mbjrair/00工作/04金恒售前/04包钢/WorkSpace/AI 编程/memoryfix-local`  
GitHub：`https://github.com/baixuzhangh-tech/memoryfix-ai`  
生产域名：`https://artgen.site`  
当前最新提交：`4c7312a Redesign post-payment upload task center`

## 1. 项目目标

MemoryFix AI 是一个面向海外用户的旧照片修复网站。

核心定位：

- 免费功能：浏览器本地修复旧照片，不上传照片，强调隐私。
- 付费功能：`Human-assisted Restore`，当前定价为 `$19/photo`。
- 付费交付流程：用户付款后上传一张照片和修复说明，系统生成 AI 修复草稿，管理员人工审核前后对比，确认后通过邮件把下载链接发送给用户。
- 数据保留规则：交付后或到期后按规则清理，当前计划为 30 天删除原图和结果图。

当前阶段目标：

- 完成 Supabase + Resend + Lemon Squeezy + OpenAI/fal.ai 的端到端付费交付闭环。
- 正式上线后拿到第一笔真实用户付费。

## 2. 当前已经完成的能力

### 2.1 免费本地修复

项目基于 `inpaint-web` 思路，已有浏览器本地修复能力。

特点：

- 用户免费本地修复时，照片不上传到服务器。
- 页面文案已经明确区分“免费本地修复”和“付费云端人工复核修复”。

### 2.2 Lemon Squeezy 付款入口

已实现：

- 前端点击 Human Restore 购买按钮，会优先请求 `/api/human-restore-checkout` 创建 server-side checkout。
- 如果 server-side checkout 创建失败，会 fallback 到固定 Lemon Squeezy checkout URL。
- fallback URL 会自动追加 `checkout[custom][flow]` 和 `checkout[custom][checkout_ref]`，用于付款后匹配订单。
- 成功付款后回跳 `/human-restore/success`。
- `/api/human-restore-checkout` 已支持在缺少显式 Store ID / Variant ID 时，通过固定 Lemon checkout URL 自动发现 Lemon variant/store，并创建带 `redirect_url` 和 `checkout_ref` 的自定义 checkout。

生产接口最近验证结果：

- `POST https://artgen.site/api/human-restore-checkout` 已返回 `200`，并返回 Lemon custom checkout URL 和 `checkoutRef`。

### 2.3 付款成功页

已按“方案 A + 方案 B”重设计：

- 方案 A：高转化任务中心，首屏直接出现上传任务卡。
- 方案 B：高端人工修复服务感，强调 human-reviewed restoration，不是盲目自动发送。

当前付款成功页结构：

- 左侧：`Human-reviewed restoration` 品牌与服务说明。
- 左侧内嵌 4 步流程：Payment confirmed -> Upload one best source photo -> AI draft plus human review -> Private email delivery。
- 右侧：首屏直接显示上传卡片或验证状态。
- 如果直接上传无法挂载订单，会显示 backup upload form，但明确提示不要重复付款。

关键文件：

- `src/App.tsx`
- `src/components/HumanRestoreUploadForm.tsx`
- `src/humanRestoreContent.ts`

### 2.4 安全上传页

安全上传链接页 `/human-restore/upload?token=...` 已同步重做：

- 左侧展示人工复核服务说明和 4 步进度。
- 右侧直接显示上传任务卡。
- 订单摘要弱化到下方，不再抢占首屏核心操作。

关键文件：

- `src/components/SecureHumanRestoreUploadPage.tsx`

### 2.5 上传表单

上传表单支持两种展示模式：

- `standalone`
- `task-card`

已实现：

- 安全上传 token 模式。
- backup upload 模式。
- 上传文件类型校验：JPG、PNG、WebP、HEIC、HEIF。
- 上传大小限制：15 MB。
- 用户备注字段。
- 上传成功后显示：
  - Photo received. Human review is next.
  - 后续 4 步处理说明。
  - submission reference。
- 上传失败后提示用户不要重复付款。

关键文件：

- `src/components/HumanRestoreUploadForm.tsx`

### 2.6 Human Restore 后端工作流

已实现的 API：

- `api/human-restore-checkout.js`
  - 创建 Lemon Squeezy checkout。
  - 自动生成 `checkoutRef`。
  - 设置回跳 URL。
  - 注入 Lemon custom data。
  - 可通过固定 checkout URL 发现 variant/store。

- `api/human-restore-secure-access.js`
  - 根据 `orderId`、`orderIdentifier`、`checkoutRef` 或最近付款窗口换取安全上传链接。
  - 生成带签名 token 的 `/human-restore/upload?token=...` 链接。
  - 校验 paid 状态和 variant。

- `api/human-restore-order.js`
  - 验证上传 token。
  - 返回脱敏订单信息。

- `api/human-restore-upload.js`
  - 接收用户照片和备注。
  - 验证 token 或 backup order info。
  - 上传原图到 Supabase Storage。
  - 创建 Supabase job。
  - 可自动触发 AI 草稿。
  - 给客户和商家发送通知邮件。

- `api/admin/human-restore-jobs.js`
  - 管理员查看任务列表和详情。
  - 生成原图/结果图 signed URL。

- `api/admin/human-restore-process.js`
  - 管理员触发 AI 修复。
  - 支持 provider override：`fal` 或 `openai`。

- `api/admin/human-restore-job.js`
  - 管理员更新任务状态和 review note。

- `api/admin/human-restore-deliver.js`
  - 管理员审核通过并发送交付邮件。

- `api/cron/human-restore-cleanup.js`
  - 定时清理过期原图和结果图。

### 2.7 管理后台

已实现页面：

- `/admin/review`

能力：

- 管理员 token gate。
- 查看任务列表。
- 查看原图和修复结果。
- 查看用户备注和订单信息。
- 触发 AI 修复。
- 用 OpenAI/fal.ai retry。
- 标记 manual review / failed。
- approve & send，发送结果邮件。

关键文件：

- `src/components/AdminReviewPage.tsx`
- `src/App.tsx`

### 2.8 Supabase SQL

已准备 SQL：

- `supabase/human-restore.sql`

用途：

- 创建 `human_restore_jobs`
- 创建 `human_restore_events`
- 创建私有 Storage buckets
- 设置必要索引和结构

注意：目前用户尚未完成 Supabase 项目配置，所以生产后台仍未真正可用。

### 2.9 自动化测试

已有测试脚本：

- `npm run test:human-restore`

覆盖：

- checkout 上下文缓存。
- fallback Lemon URL 自动追加 `checkout_ref`。
- server-created checkout 自动发现 Lemon variant/store。
- secure upload token 换取。
- 用户上传照片。
- Supabase storage/job mock。
- fal.ai AI 草稿 mock。
- OpenAI retry mock。
- admin review。
- approve/send。
- cleanup 删除过期图片。

当前测试状态：

- `npm run test:human-restore` 通过。
- `npm run deploy:check` 通过。

已知构建 warning：

- 项目原有 ESLint warning，主要在 `src/utils.ts`、`src/adapters/cache.ts`、`src/Editor.tsx`、`src/adapters/inpainting.ts`。
- Vite 大包体积 warning。
- 这些 warning 当前不阻塞部署。

## 3. 当前环境状态

本地运行：

```bash
npm run check:human-restore-env
```

当前输出显示还缺：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LEMON_SQUEEZY_API_KEY
LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID
HUMAN_RESTORE_ADMIN_TOKEN
CRON_SECRET
FAL_KEY or OPENAI_API_KEY
```

注意：

- 不要把任何 `.env` 或 `.env.local` 里的密钥贴到聊天窗口。
- `.env.local` 只可在本地或 Vercel 环境变量里安全配置。
- 当前生产 `https://artgen.site/api/admin/human-restore-jobs` 返回：

```json
{"error":"Admin review is not configured yet."}
```

这是因为 Supabase/admin env 还没配置完成。

## 4. 必需环境变量清单

### 4.1 站点与支付

```text
SITE_URL=https://artgen.site
VITE_EARLY_ACCESS_URL=<public Lemon Squeezy checkout URL>
LEMON_SQUEEZY_API_KEY=<Lemon API key>
LEMON_SQUEEZY_STORE_ID=<optional but recommended>
LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID=<Human Restore $19 product variant id>
LEMON_SQUEEZY_WEBHOOK_SECRET=<Lemon webhook secret>
```

说明：

- `LEMON_SQUEEZY_API_KEY` 用于创建 checkout 和读取订单。
- `LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID` 用于限制只有目标产品订单能上传。
- `VITE_EARLY_ACCESS_URL` 是公开 checkout fallback URL，不是密钥。

### 4.2 Supabase

```text
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
SUPABASE_HUMAN_RESTORE_ORIGINALS_BUCKET=human-restore-originals
SUPABASE_HUMAN_RESTORE_RESULTS_BUCKET=human-restore-results
```

说明：

- `SUPABASE_SERVICE_ROLE_KEY` 只能放服务端环境变量，绝对不能暴露到前端。
- Supabase Storage buckets 必须是 private。

### 4.3 管理后台与清理任务

```text
HUMAN_RESTORE_ADMIN_TOKEN=<long random secret>
CRON_SECRET=<long random secret>
```

说明：

- `HUMAN_RESTORE_ADMIN_TOKEN` 用于访问 `/admin/review`。
- `CRON_SECRET` 用于保护 `/api/cron/human-restore-cleanup`。

### 4.4 邮件

```text
RESEND_API_KEY=<Resend API key>
HUMAN_RESTORE_FROM_EMAIL=MemoryFix AI <support@artgen.site>
HUMAN_RESTORE_INBOX=<merchant/admin receiving email>
HUMAN_RESTORE_SUPPORT_EMAIL=<support email>
```

建议：

- 第一版可临时用已验证邮箱。
- 正式发布建议在 Resend 绑定 `artgen.site` 域名并设置 DNS。

### 4.5 AI 修复服务

至少配置一个：

```text
FAL_KEY=<fal.ai key>
```

或：

```text
OPENAI_API_KEY=<OpenAI API key>
```

可选：

```text
AI_RESTORE_PROVIDER=fal
FAL_RESTORE_MODEL=fal-ai/image-editing/photo-restoration
OPENAI_IMAGE_EDIT_MODEL=gpt-image-1.5
HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD=true
```

## 5. 下一步执行顺序

### Step 1：创建 Supabase 项目

需要用户在 Supabase 创建项目。

完成后取得：

- Project URL
- service_role key
- anon key 可暂时不用，当前服务端流程主要需要 service role。

### Step 2：运行 Supabase SQL

在 Supabase SQL Editor 运行：

```text
supabase/human-restore.sql
```

运行后确认：

- `human_restore_jobs` 表存在。
- `human_restore_events` 表存在。
- Storage buckets 存在：
  - `human-restore-originals`
  - `human-restore-results`

### Step 3：在 Vercel 配置 Supabase env

添加：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_HUMAN_RESTORE_ORIGINALS_BUCKET
SUPABASE_HUMAN_RESTORE_RESULTS_BUCKET
```

然后 redeploy。

验收：

```bash
curl -i https://artgen.site/api/admin/human-restore-jobs
```

如果只缺 admin token，应返回 `401` 或 token 相关错误，而不是 `503 Admin review is not configured yet.`。

### Step 4：设置管理员和 cron secret

添加：

```text
HUMAN_RESTORE_ADMIN_TOKEN
CRON_SECRET
```

建议生成长随机字符串。

验收：

- 打开 `https://artgen.site/admin/review`
- 输入 admin token
- 页面能进入后台，但没有任务也正常。

### Step 5：配置 AI provider

推荐先二选一：

- fal.ai：配置 `FAL_KEY`
- OpenAI：配置 `OPENAI_API_KEY`

如果希望上传后自动生成 AI 草稿：

```text
HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD=true
```

验收：

- 上传测试照片后，后台任务应从 uploaded/processing 进入 needs_review。
- 后台应能看到 result image。

### Step 6：配置 Resend 正式发件

添加或确认：

```text
RESEND_API_KEY
HUMAN_RESTORE_FROM_EMAIL
HUMAN_RESTORE_INBOX
HUMAN_RESTORE_SUPPORT_EMAIL
```

正式建议：

- 在 Resend 添加 `artgen.site` 域名。
- 按 Resend 指引配置 DNS。
- 使用 `MemoryFix AI <support@artgen.site>` 作为发件人。

验收：

- 用户上传后收到确认邮件。
- 管理员 approve/send 后用户收到结果下载链接。

### Step 7：配置 Lemon Squeezy 精确 Variant ID

添加：

```text
LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID
```

验收：

- `$19/photo` Human Restore 订单可以上传。
- 非该 variant 的订单不能进入 Human Restore 上传。

### Step 8：完整真实链路测试

必须走一遍：

1. 进入 `https://artgen.site`
2. 点击 Human Restore 购买按钮
3. Lemon Squeezy 测试/真实付款
4. 回跳 `/human-restore/success?checkout_ref=...`
5. 首屏右侧直接出现上传卡
6. 上传 1 张测试照片和备注
7. 收到确认邮件
8. 管理后台看到任务
9. 触发 AI 修复或确认自动处理
10. 人工审核前后图
11. approve & send
12. 用户收到结果下载链接

### Step 9：测试 cleanup

模拟过期 job 或用测试数据触发：

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://artgen.site/api/cron/human-restore-cleanup
```

验收：

- 过期原图删除。
- 过期结果图删除。
- job 状态变为 deleted 或写入 deleted_at。

### Step 10：补正式发布页面

发布前建议补齐：

- Privacy Policy
- Terms of Service
- Refund policy
- Data retention policy
- Human Restore 服务边界说明
- 不适合修复的照片说明
- 样例 before/after

### Step 11：小范围获取第一笔真实付费

建议不要立刻大规模投放。

第一批渠道：

- 家族历史 / genealogy 社群
- 老照片修复 Reddit/Facebook 群
- 海外华人家庭群
- 个人社交账号
- 小范围冷启动 landing page

第一阶段目标：

- 5-10 个真实用户访问。
- 1 个真实付款。
- 1 张真实照片完整交付。
- 收集用户反馈，决定是否继续优化 AI provider 和页面转化。

## 6. 常用命令

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

Human Restore 测试：

```bash
npm run test:human-restore
```

环境变量检查：

```bash
npm run check:human-restore-env
```

生产构建检查：

```bash
npm run deploy:check
```

推送：

```bash
git push
```

## 7. 重要文件索引

前端入口：

- `src/App.tsx`

付款成功/任务中心内容：

- `src/App.tsx`
- `src/humanRestoreContent.ts`

上传表单：

- `src/components/HumanRestoreUploadForm.tsx`

安全上传页：

- `src/components/SecureHumanRestoreUploadPage.tsx`

管理后台：

- `src/components/AdminReviewPage.tsx`

支付：

- `api/human-restore-checkout.js`
- `api/human-restore-secure-access.js`
- `api/lemonsqueezy-webhook.js`

上传与订单：

- `api/human-restore-order.js`
- `api/human-restore-upload.js`
- `api/_lib/human-restore.js`

Supabase：

- `api/_lib/supabase.js`
- `supabase/human-restore.sql`

AI 修复：

- `api/_lib/ai-restore.js`
- `api/admin/human-restore-process.js`

管理员：

- `api/_lib/admin.js`
- `api/admin/human-restore-jobs.js`
- `api/admin/human-restore-job.js`
- `api/admin/human-restore-deliver.js`

清理任务：

- `api/cron/human-restore-cleanup.js`
- `vercel.json`

自动化测试：

- `scripts/human-restore-workflow.test.mjs`
- `scripts/check-human-restore-env.mjs`

## 8. 已知问题和注意事项

1. Supabase 尚未配置完成，所以生产后台仍不可用。
2. AI provider key 尚未配置完成，所以真实自动修复还不能跑。
3. Resend 正式域名邮箱最好在发布前配置，避免邮件可信度低。
4. Lemon Squeezy 店铺激活状态可能仍需官方审核，但这不影响代码继续开发。
5. 当前构建有原项目历史 warning，不阻塞部署。
6. 旧的 `memoryfix-ai.vercel.app` 可能不可用，正式使用 `https://artgen.site`。
7. 不要把 service role key、OpenAI key、fal key、Resend key、Lemon API key 发到公开聊天或提交到 git。

## 9. 给接手 AI 的建议

优先不要重构已跑通的主链路。下一步重点是配置和验收，不是继续大改 UI。

建议按这个顺序工作：

1. 帮用户创建或指导创建 Supabase 项目。
2. 运行 `supabase/human-restore.sql`。
3. 帮用户把缺失 env 加到 Vercel。
4. redeploy。
5. 验证 `/admin/review` 可用。
6. 配置一个 AI provider。
7. 跑完整测试订单。
8. 修复真实链路里出现的小问题。
9. 再补隐私/退款/服务边界页面。
10. 小范围上线获取第一笔真实付款。

接手时先运行：

```bash
git status --short
npm run test:human-restore
npm run check:human-restore-env
npm run deploy:check
```

如果 `check:human-restore-env` 仍报缺失，优先补环境变量，而不是改业务代码。
