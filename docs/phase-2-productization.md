# Phase 2 产品化改造记录

## 本轮目标

将 `inpaint-web` 的通用图片修复工具外壳，改造成 `MemoryFix AI` 的隐私优先老照片修复产品雏形。

本轮只改产品外壳和工程稳定性，不重写核心 inpainting / upscaling 模型逻辑。

## 已完成

- 品牌从 `Inpaint-web` 改为 `MemoryFix AI`
- 首页定位从泛化的 `Restore old photos` 校准为 `Repair scratches and upscale old photos privately`
- 增加隐私承诺：照片本地处理、不上传、不需要账号
- 增加模型下载说明：首次使用需要下载模型，之后缓存到浏览器
- 增加功能说明：小损伤修复、老照片高清化、隐私优先
- 增加 5 张公有领域/CC0 老照片示例图
- 增加 `Advanced Cloud Restore` 等待名单/早鸟入口，后续已调整为 `Human-assisted Restore` 付费验证入口
- 增加 Pricing 验证区，用于后续早鸟付费验证
- Pricing 已调整为 `Free Local`、`Family Pack`、`Album Pack` 三档 credits 结构
- 增加开源/GPL-3.0 归属说明
- 增加 Privacy / Terms / Open Source 发布前信任说明区
- 增加编辑器 3 步新手引导与空历史提示
- 增加 Vercel / Cloudflare Pages 静态部署配置
- 增加早鸟付费链接环境变量 `VITE_EARLY_ACCESS_URL`
- 更新 `index.html` 的 title 和 description
- 更新 README，明确二开来源和隐私承诺边界
- `npm run build` 通过

## 当前产品边界

可以承诺：

```text
Your photos are processed locally in your browser.
Your photos are not uploaded.
```

不能承诺：

```text
Works fully offline on first load.
Automatically restores every old photo perfectly.
```

当前策略：

```text
Local mode = free, private, best for scratches/small damage/upscaling.
Human-assisted Restore = future opt-in workflow for stronger results.
```

## 待做

进入下一轮前，建议优先做：

1. 将项目推送到 GitHub，并连接 Vercel 或 Cloudflare Pages
2. 接入 Plausible / Umami / Google Analytics 事件追踪
3. 创建 $19/photo Human-assisted Restore 付款链接并配置 `VITE_EARLY_ACCESS_URL`
4. 调研 Human-assisted Restore 的人工交付和云端模型方案
5. 将当前 trust notes 升级为律师审核后的正式 Privacy / Terms 页面
