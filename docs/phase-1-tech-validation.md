# Phase 1 技术验收记录

## 当前结论

`inpaint-web` 可以作为 MemoryFix AI 的本地隐私优先路线技术底座继续推进。

当前项目已经在本地完成：

- 拉取源码到 `memoryfix-local`
- 安装依赖
- 修复 `paraglide` 远程插件导致的安装失败
- 补齐 `ort`、WebGPU 等 TypeScript 类型声明
- 修复构建期类型错误
- `npm run build` 通过
- 本地 Vite 服务可启动并返回 `HTTP 200`

## 技术事实

`inpaint-web` 的核心处理路径符合“照片不上传”的产品方向：

- 用户图片由浏览器读取
- inpainting 和 upscaling 在浏览器端执行
- 模型通过 `fetch` 首次下载到浏览器
- 模型使用 `localforage` 缓存到浏览器本地
- 处理后的图片在浏览器本地下载

需要注意：网站首次使用时仍需要联网下载模型和 ONNX Runtime 运行时文件。

因此产品文案应使用：

```text
Your photos are processed locally in your browser.
Your photos are not uploaded.
```

不应使用：

```text
The app works fully offline on first load.
```

## 当前模型依赖

- Inpainting: `migan_pipeline_v2.onnx`
- Super-resolution: `realesrgan-x4.onnx`
- ONNX Runtime: `onnxruntime-web@1.16.3`

模型下载来源包括 Hugging Face、jsDelivr 和作者配置的 Cloudflare Worker 备用地址。

## 工程成熟度观察

优点：

- 已有可运行的 Web 产品形态
- 已有 inpainting 和 upscaling 两类核心能力
- 使用 WebGPU/WASM，方向贴合隐私优先产品
- 构建通过后可以部署为静态站点

风险：

- 原项目安装依赖远程 CDN 插件，稳定性一般
- 构建前需要补齐类型声明
- 存在较多 ESLint warning
- 构建产物较大，首屏和模型下载体验需要优化
- 需要实测 Chrome、Edge、Safari、移动端兼容性
- GPL-3.0 要求二开前端继续开源

## 下一步建议

进入 Phase 2 产品化改造：

1. 将品牌从 `Inpaint-web` 改为 `MemoryFix AI`
2. 将首页文案改为海外隐私优先老照片修复定位
3. 简化 UI，突出 old photo restoration 场景
4. 增加隐私说明：照片不上传
5. 增加开源声明：基于 `inpaint-web`，遵守 GPL-3.0
6. 增加 Pricing / Privacy / Terms 页面
7. 准备 5-10 张老照片样本做真实效果验收
