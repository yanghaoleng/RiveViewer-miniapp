# AI 维护约定

- 使用简洁中文沟通与维护文档；任务结束更新 `README.MD`、`DESIGN.MD`、`MAPPING.MD`、`HANDOF.MD`。
- 改代码前先确认当前工作树，不覆盖用户未提交改动；提交前必须先 `git pull`。
- 小程序预览视图唯一真源是 `components/preview-panel`；`pages/preview` 只负责路由、分享和页面壳，禁止复制整份 WXML/WXSS。
- `preview-panel` 内所有节点测量都经 `createPreviewSelectorQuery()` 绑定 `query.in(this)`；组件 WXSS 只使用 `:host` 与类选择器，禁止标签和属性选择器。
- 双端倍速、手势、遥测和复杂度阈值只修改 `shared/rive-policy.json`，再运行 `npm run sync:policy` 生成微信可加载的 `.js`；平台差异写在 `mini` / `web` 子项。
- 小程序保持 `@rive-app/canvas-advanced@2.39.1` 完整运行时，不替换为 Lite；导入文件只在本机处理，不新增上传链路。
- H5 正式链路只有 Vite：`h5/vite.config.ts → h5/dist-static`。播放进度/FPS 使用 `PlaybackTelemetry`，不要重新放回 `RiveViewerApp` state。
- H5 Rive 播放器保持动态导入，WASM 文件名必须带运行时版本；更新 Rive 版本时同步文件名、预加载、测试和 Nginx 配置。
- 功能图标由 `npm run vendor:icons` 生成，本地引用；不要重新引入整套 React 图标包或手绘重复图标。
- 完成小程序改动至少运行 `npm run check`；运行时改动再运行 `npm run verify:interactions`。完成 H5 改动运行 `cd h5 && npm run check && npm audit`。
- 改动预览组件后还要在微信开发者工具普通编译并打开至少一份真实 `.riv`，确认 Canvas、FPS、画板和状态机可见后再生成预览包。
- 小程序上传源包预算为 `1,700,000 B`，由 `npm run check:package` 守护；新增大资源前先说明体积影响。
- 不代替用户执行微信上传、提审、生产部署或外部发布，除非用户在当前任务明确要求。
