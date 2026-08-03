# RiveViewer Miniapp

一款在微信小程序内本地预览、检查和交互调试 `.riv` 文件的工具。文件只保存在小程序本地目录，不经过业务服务器。

## 产品目标

- 让动效、设计和研发人员在手机上快速检查 Rive 文件。
- 在同一屏内查看画布、时间轴、状态机和输入反馈。
- 大文件加载期间保持页面可返回，并提供阶段与百分比反馈。
- 默认保护素材隐私，不建设文件上传服务。

## 核心功能

- 从微信聊天文件批量导入，最多一次选择 100 个 `.riv` 文件。
- 支持可用环境中的系统文件多选；不支持时自动只展示聊天文件入口。
- 内置两份示例文件，已导入文件保存在本地列表，可再次预览、发送、保存或删除。
- 读取画板、状态机、时间轴和状态机输入；支持 Trigger、Boolean、Number 等交互。
- 支持完整/铺满、五种画布背景、播放暂停、重置、`0.5x / 1x / 1.5x / 2x / 8x` 倍速。
- 默认按 `in → idle → out` 组织常见时间轴；带 Listener 的状态机优先接管用户点击。
- 画布触摸事件直达 Rive 状态机；Piano Game 一类嵌套 Listener 与 View Model 文件可交互。
- 大文件分块读取、分阶段 Loading、首帧完成反馈、动态像素比和离页资源释放。
- 上一个/下一个文件快速切换；长按可打开完整文件列表。

## 技术架构

| 模块 | 职责 |
| --- | --- |
| `pages/index` | 导入、文件库、缩略图和文件操作 |
| `pages/preview` | 画布、播放控制、参数面板和触摸交互 |
| `utils/library.js` | 本地文件、元数据、封面缓存和分块读取 |
| `utils/rive-native.js` | Rive WASM 初始化、渲染、状态机、Listener 和 View Model |
| `utils/file-actions.js` | 发送文件与桌面端保存 |
| `components/parameter-tag` | 画板、状态机、时间轴和输入的统一标签 |
| `vendor/rive` | 适配微信运行环境的完整 Rive Canvas 运行时与 Brotli WASM |

渲染链路使用微信 `<canvas type="2d">`、`@rive-app/canvas-advanced@2.39.1` 和 `WXWebAssembly`。完整运行时用于保留 Rive Layout、嵌套画板、Listener 与 Data Binding 能力。

## 使用的微信 API

| API | 用途 |
| --- | --- |
| `wx.chooseMessageFile` | 从聊天文件批量选择 `.riv` |
| `wx.miniapp.chooseFile` | 支持环境中的系统文件多选 |
| `wx.getFileSystemManager` | 本地持久化、分块读取、封面和临时资源管理 |
| `wx.shareFileMessage` | 发送原始 Rive 文件给好友 |
| `wx.saveFileToDisk` | 微信桌面端保存文件 |
| `wx.showShareMenu` | 分享小程序卡片与朋友圈入口 |
| `WXWebAssembly.instantiate` | 加载 Rive WASM 运行时 |

## 本地开发

```bash
npm ci
npm run vendor:rive
npm run check
```

随后在微信开发者工具中导入项目根目录。`project.config.json` 当前绑定项目 AppID；复用代码时请替换为自己的 AppID。真机系统文件选择能力取决于微信版本与平台，聊天文件导入始终作为基础入口。

常用检查：

```bash
npm run check
npm run verify:interactions
npm run benchmark:rive
```

`rive测试文件/` 是本机性能与兼容性素材目录，已从公开仓库排除。小程序实际内置资源位于 `assets/samples/`。

## 许可证

本项目中由仓库作者原创的源代码依据 [PolyForm Noncommercial License 1.0.0](LICENSE) 提供。你可以为非商业目的使用、修改和分发；任何商业用途均须事先取得版权方的单独书面授权。具体权利和义务以 `LICENSE` 正文为准。

因此本仓库属于“源码公开（source-available）”，不是 OSI 定义下的开源软件。第三方依赖和示例资源不适用项目许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
