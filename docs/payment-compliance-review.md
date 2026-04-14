# Payment Platform Compliance Review

更新时间：2026-04-14

本文件用于 Creem / Paddle / 其他 Merchant of Record 审核前自查。

## 当前产品定位

- MemoryFix AI 是旧照片修复产品，不是通用 AI 图片生成器。
- 免费本地修复在浏览器内运行，不上传照片。
- Human-assisted Restore 是用户主动上传 1 张旧照片，云端 AI 生成草稿，人工审核后邮件交付。
- 产品不提供成人内容、NSFW、deepfake、face-swap、身份操纵、公众人物冒充、证件伪造或违法内容处理。

## 已补齐的审核项

- 首页展示产品说明、价格、隐私边界、Terms、Privacy、Refund、Open Source。
- 新增 `/acceptable-use`，明确可接受与禁止内容。
- 新增 `/delivery`，说明数字交付方式、48 小时 beta 交付窗口、无实体物流。
- Privacy / Terms / Refund 统一为 30 天图片与结果保留窗口。
- 首页 footer 增加 Refund、Acceptable Use、Delivery、Support 入口。
- Human Restore 上传前必须勾选权利确认与内容政策。
- 后端对明显违规的备注/文件名做基础拦截。
- 有 `OPENAI_API_KEY` 时，后端会调用 OpenAI moderation 对 JPG / PNG / WebP 上传图片做自动安全审核。
- 支付相关公开文案改为 payment provider / secure checkout，避免绑定单一支付服务。

## 审核风险与说明

- AI 图片产品天然高风险。审核材料中应强调“old photo restoration only”，不要描述成开放式 AI image generation。
- 人脸修复容易被误判为 face manipulation。审核材料中应强调“不换脸、不冒充、不改变身份，只修复用户有权提交的旧照片”。
- 如果审核员要求 NSFW image moderation proof，可以说明当前系统已有上传前承诺、文本拦截、OpenAI 图像 moderation、人工审核四层防护。
- Creem 若仍排队或拒绝，建议同时准备 Paddle、Stripe Atlas/US entity、Polar、或 PayPal 作为备用路径。

## 申请时建议填写

Product description:

```text
MemoryFix AI helps users restore old family photos. The free tool runs locally in the browser without uploading photos. The paid Human-assisted Restore service lets a customer intentionally submit one old photo for AI-assisted restoration plus human quality review before private email delivery. We do not provide NSFW generation, face-swap, deepfake, identity manipulation, public-figure impersonation, or illegal content services.
```

Support email:

```text
support@artgen.site
```

Website:

```text
https://artgen.site
```

Public policy URLs:

```text
https://artgen.site/privacy
https://artgen.site/terms
https://artgen.site/refund
https://artgen.site/acceptable-use
https://artgen.site/delivery
```
