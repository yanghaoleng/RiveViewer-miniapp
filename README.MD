# RiveViewer Miniapp

一款在微信小程序和独立 H5 中本地预览、检查和交互调试 `.riv` 文件的工具。用户导入文件只保存在当前设备，不经过业务服务器。

公开仓库：<https://github.com/yanghaoleng/RiveViewer-miniapp>

微信平台当前上传版本：`1.0.4`，更新类型：`修订补丁`，备注：`优化渲染性能与体验`。本版新增小程序/H5 统一的性能、平衡、高清渲染档位，默认性能；复杂文件继续自动限制 DPR 与帧率，实时 FPS 仅显示在播放时间右侧。

## 产品目标

- 让动效、设计和研发人员在手机上快速检查 Rive 文件。
- 在同一屏内查看画布、时间轴、状态机和输入反馈。
- 大文件加载期间保持页面可返回，并提供阶段与百分比反馈。
- 默认保护素材隐私，不建设文件上传服务。
- 用独立 H5 与微信原生 Canvas 做同一真机性能对照，为后续是否重新嵌入 H5 提供数据。

## 核心功能

- 从微信聊天文件批量导入，最多一次选择 100 个 `.riv` 文件。
- 支持可用环境中的系统文件多选；不支持时自动只展示聊天文件入口。
- 内置两份示例文件，示例和已导入文件都可从本地列表删除；示例删除后以本地隐藏记录保持不再出现，清除小程序数据可恢复。
- 首页底部单行展示“复杂文件用网页版更流畅：”、`mikeywa.site/rive-viewer/` 和复制图标，整行左右各有 `20px` 内边距；空间不足时网址末端以黑色渐隐遮罩表示截断，遮罩与复制按钮无缝衔接。复制内容仍为完整的 `https://mikeywa.site/rive-viewer/`，成功后提示“已复制网址”。
- 底部“联系作者反馈意见”与网页版提示统一使用 `24rpx` 字号。
- 读取画板、状态机、时间轴和状态机输入；支持 Trigger、Boolean、Number 等交互。
- 支持完整/铺满、五种画布背景、播放暂停、重置、`0.5x / 1x / 1.5x / 2x / 8x` 倍速；按下画布手柄会在原位增高并展开一整行，上下各留 `8px`，中间手柄向两侧延长，左侧“图标 + 完整”和右侧“图标 + 铺满”分别从中间滑出，继续上下调高或横向滑到选项后松手即可切换缩放方式。
- 预览菜单所有可操作按钮按下即从中心放大到 `1.25×`，松开以弹簧曲线复位；播放速度和文件切换按住 `150ms` 即展开菜单，点菜单外空白区域可取消并收起。文件菜单支持不松手滑到任意文件，目标行即时高亮，松手直接打开。
- 参数顺序为状态机输入后紧接预览背景，缩放方式置于最底部；背景色块使用 `60rpx × 40rpx` 易点按短胶囊，Loading 进度环保持正圆。
- 默认按 `in → idle → out` 组织常见时间轴；带 Listener 的状态机优先接管用户点击。
- 画布触摸事件直达 Rive 状态机；Piano Game 一类嵌套 Listener 与 View Model 文件可交互。
- 首页首屏稳定后预热 Rive WASM，点击文件时也会立即启动；不在首页预解析 `.riv`，避免大文件常驻内存。
- 大文件分块读取、分阶段 Loading、初始化前先刷新加载界面、按文件大小限制像素比、复杂文件约 30fps 渲染、加载超时重试和离页资源释放。
- Piano、Animojis 等嵌入资源较多的文件支持图片格式识别、图片失败回退、兼容版 WASM 和 DOMMatrix 适配。
- 含音频的 Rive 文件默认开启声音；参数区提供“开启 / 静音”开关并记住用户选择。
- iPhone 上的 Piano 会拦截全部内嵌音频，12 个琴键音使用 `WebAudio BufferSource` 直接播放，不再启动 Rive `ScriptProcessor/miniaudio`；恢复期连点只保留最新音符，最多同时保留 16 个音源。
- iOS 含音频文件使用约 30fps、像素比上限 `1.5`和状态反馈节流，减少动画、音频和视图更新争抢主线程。
- 超过 8 MB 的文件自动跳过音频解码并显示“性能保护”，避免声音资源使大文件加载和返回再次卡住。
- 上一个/下一个文件快速切换；长按可打开完整文件列表。
- Mac/Windows 与开发者工具在窗口宽度达到 `960px` 时，文件列表和 Rive 预览在同一个小程序页面内左右并排，不再触发微信 Mac 原生双 WebView 白色分隔线。
- `h5/` 提供独立浏览器版：预览详情不分 Tab，画板、状态机、时间轴、输入、声音、缩放、背景和渲染质量在同一页；入口固定为 `/rive-viewer`。

## 技术架构

| 模块 | 职责 |
| --- | --- |
| `pages/index` | 导入、本地文件库、文件操作与空闲 WASM 预热；不在后台解析文件或渲染缩略图 |
| `pages/preview` | 画布、播放控制、参数面板和触摸交互 |
| `utils/library.js` | 本地文件、示例隐藏记录、元数据、封面缓存和分块读取 |
| `utils/rive-native.js` | 双 WASM 初始化与复用、资源兼容、渲染、状态机、Listener、View Model、WebAudio 桥接和 iOS Piano 短音直播 |
| `utils/file-actions.js` | 发送文件与桌面端保存 |
| `components/parameter-tag` | 画板、状态机、时间轴和输入的统一标签 |
| `components/navigation-bar` | 首页与预览页的自定义顶部导航；按 Mac/Windows 胶囊位置补偿顶部空间，窗口缩放时重算，单页栈返回首页 |
| `components/preview-panel` | 复用原生预览内核的嵌入式右侧面板；仅用于桌面宽屏同页分栏 |
| `utils/desktop-split.js` | 桌面端 `960px` 分栏阈值、平台判断和独立详情页回流首页的路由 |
| `vendor/rive` | 适配微信运行环境的完整 Rive Canvas 运行时、SIMD 与兼容版 Brotli WASM |
| `h5/` | 独立浏览器 H5；复用完整 Rive Web WASM，以 IndexedDB 保存用户文件并输出实时 FPS；渲染和点击共用同一 Fit 矩阵 |

渲染链路使用微信 `<canvas type="2d">`、`@rive-app/canvas-advanced@2.39.1` 和 `WXWebAssembly`。完整运行时用于保留 Rive Layout、嵌套画板、Listener 与 Data Binding 能力。

### 复杂文件性能边界

- `.riv` 磁盘体积不等于运行复杂度；画板、嵌套实例、动画、状态机、矢量顶点、裁剪和持续 idle 才决定解析与逐帧成本。
- Animojis 测试文件为 `2.33 MiB`，但包含 `89` 个画板、`422` 条动画和 `86` 个状态机；默认 `3000 × 3000` 总览画板聚合整页表情，是当前真机性能样本。
- 首帧只解析并复用默认画板；其余画板由用户展开时分批读取，选中后才检查完整参数，避免首次进入同步创建大量运行时对象和标签。
- iOS 复杂无音频文件使用约 `24fps`、DPR 上限 `1.25`；暂停后停止持续绘制，交互、画布尺寸或参数变化时再按需重绘。
- 预览页提供性能、平衡、高清三档；性能档默认约 `30fps + DPR 1.0`，复杂素材即使选择高清也保留自动安全上限。
- 微信未公开固定 CPU 或 iOS 内存配额，性能判断以目标真机分阶段计时、帧耗时和内存告警为准，不能用开发者工具流畅度代替。

Rive Web 运行时的通用音频链路通过兼容构造器桥接到 `wx.createWebAudioContext`。iOS Piano 使用专用资源加载器和 `BufferSource`，先显示首帧再按琴键优先顺序解码；单个解码超时会继续下一个，缺少琴键或解码失败时显式标记不可用，绝不回退到高负载混音。静音或离开预览会停止并释放音频；运行时只保留播放链路，不使用录音入口。

## 使用的微信 API

| API | 用途 |
| --- | --- |
| `wx.chooseMessageFile` | 从聊天文件批量选择 `.riv` |
| `wx.miniapp.chooseFile` | 支持环境中的系统文件多选 |
| `wx.getFileSystemManager` | 本地持久化、分块读取、封面和临时资源管理 |
| `wx.shareFileMessage` | 发送原始 Rive 文件给好友 |
| `wx.saveFileToDisk` | 微信桌面端保存文件 |
| `wx.showShareMenu` | 分享小程序卡片与朋友圈入口 |
| `wx.setClipboardData` | 仅在用户点击复制图标后写入网页版预览地址 |
| `wx.createWebAudioContext` | 播放 Rive 文件内嵌音频，不采集声音 |
| `WXWebAssembly.instantiate` | 加载 Rive WASM 运行时 |

小程序不再包含 `web-view` 页面，也不会自动打开或强制跳转外部网站。网页版地址只作为与复杂 Rive 预览直接相关的辅助信息放在首页底部，原生预览、导入和文件管理仍可独立完成。

微信小程序不调用 `wx.getClipboardData`，也不读取剪贴板已有内容；仅在用户点击网址旁复制图标后调用一次 `wx.setClipboardData`。公众平台用途统一填写：“用于用户主动复制网页版预览地址，方便在浏览器中打开复杂 Rive 文件；仅向剪切板写入固定网址，不读取剪切板已有内容。”项目检查会阻止剪贴板读取、后台写入和其他复制用途。独立 H5 只在用户主动点击底部反馈入口时调用浏览器 `navigator.clipboard.writeText` 写入作者微信号。聊天文件导入只处理用户主动选中的 `.riv` 文件，文件在设备本地解析、预览和保存，不上传业务服务器。

当前按 `project.config.json` 忽略规则估算的小程序主包约为 `1.68 MiB`，超过开发者工具代码质量建议的 `1.5 M`，但低于微信官方单个主包/分包 `2M` 的上传限制，可以上传和提审。主要体积来自 SIMD 与兼容版两份 Rive WASM，H5、测试 Rive 文件和依赖目录均已排除。

首页和预览页均声明 `onShareAppMessage`、`onShareTimeline`，并在页面显示时调用 `wx.showShareMenu`。好友卡使用 Figma 节点 `163:729` 的 5:4 封面 `share-friend.png`（500×400，约 123 KB）；朋友圈使用同一设计中的圆形小程序图标 `share-timeline.png`（272×272，约 14 KB）。两页分别通过 `imageUrl` 接入对应图片，项目检查会限制素材体积。`wx.canIUse` 的能力路径必须写成 `showShareMenu.object.menus`。若运行时返回 `showShareMenu:fail no permission, appId=...`，表示当前 AppID 的分享能力被微信平台权限层拒绝，不能靠重新编译或改页面回调绕过；应检查公众平台通知中心、接口权限与主体状态，仍无说明时携带 AppID 和完整错误向微信公众平台申诉。

本项目是微信原生小程序，不使用 Taro 的 `enableShareAppMessage` / `enableShareTimeline` 编译提示。微信原生页面与全局配置文档未列出这两个字段；本项目加入字段并重新编译实测后，分享菜单和 `no permission` 结果均无变化，因此不保留无效配置。

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

Mac 同页分栏试验包输出为 `dist/RiveViewer-miniapp-1.0.4-mac-split-devtools-rebuild.zip`，已在微信开发者工具的 `1200 × 800` 桌面宽屏中重新普通编译。压缩包根目录可直接导入开发者工具；打包时排除 H5、测试素材、依赖目录、脚本、本地配置与项目文档。

同页分栏目前只在 Mac、Windows 或开发者工具的窗口宽度达到 `960` 个逻辑像素时启用；低于阈值仍使用原生 `navigateTo` 详情页。Retina 屏幕的物理像素不能直接视为小程序逻辑宽度。

`rive测试文件/` 是本机性能与兼容性素材目录，已从公开仓库排除。小程序实际内置资源位于 `assets/samples/`。

网页版与原生小程序文件库相互独立：H5 文件保存在浏览器自己的 IndexedDB 中，不上传服务器，也不会自动读取原生小程序已导入的文件。

预览器只接收 Rive Runtime 导出的 `.riv` 二进制文件。`.rev` 是 Rive 编辑器的备份/工程文件，包含运行时导出会剥离的编辑信息，需先在 Rive 编辑器中导入并重新导出为 `.riv` 后预览。

### 独立 H5

```bash
cd h5
npm ci
npm run dev
npm run build:static
```

本地入口为 <http://localhost:3000/rive-viewer>，正式入口为 <https://mikeywa.site/rive-viewer/>，临时备份入口为 <https://rive-viewer-miniapp.muhualei.chatgpt.site/rive-viewer>。`build:static` 输出可直接由 Nginx 托管的 `h5/dist-static/`，资源路径固定为 `/rive-viewer/`。正式服务器使用 `/var/www/rive-viewer/releases/<时间戳>/rive-viewer` 保存版本，以 `current` 软链接切换；发布后目录使用 `755`、文件使用 `644`。Nginx 只接管 `/rive-viewer`，不覆盖根域名首页。后续可通过 `ssh mikeywa-rive` 直接部署。`project.config.json` 已排除 `h5/`，不会增加微信小程序上传包体积。

H5 首页在各宽度下都保持原有纵向布局。宽度跨过 `860px`、或在宽屏从首页打开文件时，首页与右侧预览面板都以约 `260ms` 连续展开或收起；面板左上角叉号和 `Esc` 都可关闭当前文件，手机端仍进入独立预览界面。页头不显示冗余的 H5 平台字样，右上角只保留键盘按钮，集中说明 `R` 重播、空格播放/暂停、方向键切换文件、`+/-` 调速和 `Esc` 关闭；快捷键浮窗位于页面级最高交互层，不被 Rive 画布遮挡。文件首次成功渲染后保存 `160×120` 低清 WebP 首帧封面，之后列表无需重新解析即可立即显示；文件操作箭头在鼠标悬停、键盘聚焦或菜单展开时出现。页面底部提供“联系作者反馈意见”，点击复制微信号并显示结果。浏览器页签与左上角标题共用 Figma 羊石图标，同时提供 PNG 回退、WebP 图标和缓存版本号。

## 许可证

本项目中由仓库作者原创的源代码依据 [PolyForm Noncommercial License 1.0.0](LICENSE) 提供。你可以为非商业目的使用、修改和分发；任何商业用途均须事先取得版权方的单独书面授权。具体权利和义务以 `LICENSE` 正文为准。

因此本仓库属于“源码公开（source-available）”，不是 OSI 定义下的开源软件。第三方依赖和示例资源不适用项目许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
