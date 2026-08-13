# 元素映射

当前发布版本为 `1.0.4`；下表补充统一渲染档位、性能状态、H5 缩略图和双栏布局。

| 俗称 | 学名 | 代码名称 |
| --- | --- | --- |
| 首页导入框 | Import dropzone | `.import-dropzone`、`showImportMenu` |
| 底部网页版单行 | External viewer footer row | `.web-link-footer`、`padding: 28rpx 20px 0`、`.web-link-footer__label`、`margin-right: 10rpx`、`.web-link-footer__url-wrap`、`.web-link-footer__url`、`.web-link-footer__url-fade`、`WEB_VIEW_URL` |
| 复制网页版地址 | User-triggered clipboard write | 可见文案 `mikeywa.site/rive-viewer/`、复制值 `WEB_VIEW_URL`、`copyWebViewerUrl`、`wx.setClipboardData`、`已复制网址`、`/assets/icons/copy-simple.svg` |
| 首页 Rive 预热 | Runtime idle prewarm | `startRivePrewarm`、`prewarmRuntime`、`runtimePromise` |
| 次级页顶部导航 | Custom preview navigation bar | `components/navigation-bar/navigation-layout.js`、`calculateNavigationLayout`、`topInset`、`edgeWidth`、`wx.getMenuButtonBoundingClientRect`、`wx.onWindowResize` |
| 电脑端返回修复 | Desktop navigation and route fallback | `.weui-navigation-bar__left` 垂直居中、返回热区 `44×44px`、`getCurrentPages`、`wx.navigateBack`、单页栈 `wx.reLaunch` 首页 |
| 导入方式菜单 | Import action sheet | `showImportMenu`、`chooseMessageFile`、`chooseSystemFile` |
| 最近文件列表 | Local library list | `.file-list`、`files`、`getAllFiles` |
| 文件卡 / 文件行 | File row | `.file-row`、`.file-open` |
| 倾斜文件图标 | File cover | `.file-cover`、`.file-cover__fallback` |
| 文件右侧箭头 | File menu toggle | `.file-menu-toggle`、`toggleFileMenu` |
| 两项操作菜单 | File action menu | `.file-menu`、`shareFile`、`deleteFile`；只保留发送与删除，示例和用户文件都可删除 |
| 首页按下回弹 | Home press spring feedback | `hover-class="is-pressed"`、`file-row--pressed`、`hover-start-time="0"`；小按钮 `scale(1.25)`，大面积入口 `scale(1.025)` |
| 已删除示例 | Hidden built-in tombstone | `HIDDEN_BUILTIN_STORAGE_KEY`、`readHiddenBuiltinIds`、`writeHiddenBuiltinIds`、`visibleBuiltins` |
| 联系作者反馈 | Author contact modal | `.author-contact`、`font-size: 24rpx`、`showAuthorWechat`；仅展示微信号，不访问剪贴板 |
| 预览画布 | Rive Canvas stage | `.canvas-card`、`#riveCanvas`、`NativeRivePlayer` |
| 画布 Loading | Loading overlay | `.canvas-state--loading`、`loadingProgress`、`loadingPhase` |
| 详情首帧封面 | First-frame cover capture | `scheduleCoverCapture`、`captureCover`、`saveCover` |
| 画布拖动手柄 | Stage resize handle | `.stage-resizer`、`stageResizeStart/Move/End/Cancel`、`catchtouchstart/move/end/cancel` |
| 手柄原位缩放快捷行 | Inline resize-handle fit row | `stageResizeMenuActive`、`stageResizeTapOpen`、`stageResizePressActive`、`selectStageResizeFit`、`stageResizeHoverFit`、`stageResizeLongPress`、`.stage-resizer.is-selecting`、`.stage-resizer.is-tap-open`、`.stage-resizer.is-press-active` |
| 预览按钮按下回弹 | Preview press spring feedback | `hover-class="is-pressed"`、`hover-start-time="0"`、`scale(1.25)`、`cubic-bezier(.34, 1.56, .64, 1)` |
| 快速菜单空白取消层 | Native menu backdrop dismiss | `.native-menu-backdrop`、`dismissNativeMenus`、`showSpeedMenu`、`showFileMenu` |
| 文件菜单按住滑选 | File menu press-drag selection | `fileNavigationTouchMove`、`fileMenuOptionRects`、`fileHoverId`、`fileNavigationGestureMovedIntoMenu`、`.file-popover__option.is-hovered` |
| 预览背景色块 | Canvas tone swatch | `.tone`、`.tone-options`、`canvasTone`、`setCanvasTone` |
| 双击切换 | Stage view mode toggle | `stageResizerTap`、`toggleStageViewMode`、`stageViewMode` |
| 重置按钮 | Reset playback action | `.transport__primary`、`resetAnimation` |
| 播放 / 暂停 | Playback toggle | `.transport__secondary`、`togglePlay` |
| 画布下方五个按钮平分 | Equal five-column transport | 小程序 `.transport` 的五个直接子项统一 `width: 0; flex: 1 1 0`；H5 `.transport` 使用五列 Grid |
| 小程序五格一级布局 | Flat Mini Program transport | `.transport__primary`、`.transport__secondary`、`.speed-menu-shell`、两个 `.transport__file-button`；不再使用 `.transport__left/.transport__files` 包裹 |
| 播放速度 | Speed selector | `.speed-menu`、`.speed-popover`、`speedValue` |
| 上一个 / 下一个 | File navigation | 两个 `.transport__file-button`、`fileNavigationTouchStart/End`、`openFileById`；长按菜单锚点为 `.transport` |
| 长按文件列表 | File navigation popover | `.file-popover`、`showFileMenu` |
| 画板标签 | Artboard choice tag | `artboardNames`、`selectArtboardTag` |
| 状态机标签 | State machine choice tag | `stateMachineNames`、`selectStateMachineTag` |
| 时间轴 | Animation timeline tags | `.timeline-actions`、`animationNames`、`playAnimation` |
| 播放进度背景 | Timeline progress fill | `.parameter-tag__progress`、`animationProgress` |
| 状态机输入 | State machine inputs | `inputs`、`handleInputTag` |
| 标签点击反馈 | Parameter tag feedback | `parameter-tag`、`is-pressed`、`is-feedback` |
| 完整 / 铺满 | Fit control | `.compact-switch`、`fit`、`selectFit`、`applyFit`、`arrows-in-simple.svg`、`arrows-out-simple.svg` |
| 渲染质量 | Render quality selector | `qualityOptions`、`qualityMode`、`selectQuality`、`setQualityMode` |
| 播放帧数 | Inline playback FPS | `.file-heading__fps`、`fps`；位于 `timelineTimecode` 右侧 |
| 播放按钮下方状态小字（已移除） | Removed playback subline | H5 `.playback-status` 与小程序 `.playback-status` 均不再渲染 |
| 背景色圆圈 | Canvas tone swatches | `.tone-options`、`.tone`、`canvasTone` |
| 右上角下载按钮 | File export menu | `.file-heading__save`、`showSaveMenu` |
| 右上角分享 / 转发 | WeChat share menu | `enableShareMenu`、`onShareAppMessage`、`onShareTimeline`、`showShareMenu.object.menus`；原生项目不使用 Taro 的 `enableShare*` 编译提示 |
| 分享缩略图 | WeChat share-card image | `FRIEND_SHARE_IMAGE`、`/share-friend.png`、`onShareAppMessage.imageUrl`；5:4 |
| 朋友圈圆形缩略图 | WeChat timeline image | `TIMELINE_SHARE_IMAGE`、`/share-timeline.png`、`onShareTimeline.imageUrl`；1:1 |
| 文件本地仓库 | Mini Program user data storage | `rive-library`、`utils/library.js` |
| 兼容版运行时 | Fallback Rive WASM | `rive_fallback.wasm.br`、`instantiateRiveWasm` |
| 复杂度画像 | Rive complexity profile | `artboardCount`、`animationCount`、`stateMachineCount`、`isComplexFile` |
| 活动画板检查 | Active artboard inspection | `inspectArtboard`；首帧只检查并复用默认画板 |
| 复杂文件性能档 | Mobile complex-file profile | `configurePerformanceProfile`、`IOS_COMPLEX_FRAME_INTERVAL`、`IOS_COMPLEX_PIXEL_RATIO_LIMIT` |
| 画板列表展开 | Lazy artboard selector | `loadArtboardCatalog`、`expandArtboardCatalog`、`parameter-disclosure` |
| 暂停按需绘制 | Draw-on-demand while paused | `scheduleRender`、`requestRedraw`、`needsRedraw` |
| 嵌入图片兼容 | Embedded image shim | `detectEmbeddedImageExtension`、`MiniProgramDOMMatrix`、`Image.onerror` |
| 声音开关 | Rive audio toggle | `audioEnabled`、`toggleAudio`、`Artboard.volume`、`riveAudioEnabled` |
| 微信声音桥接 | WebAudio compatibility bridge | `wx.createWebAudioContext`、`MiniProgramAudioContext`、`runtimeAudioWindow` |
| iPhone 钢琴直播 | Low-latency Piano cue player | `MiniProgramCueAudio`、`createPianoCueBindings`、`collectPianoCueChanges` |
| 钢琴音符防积压 | Latest-wins audio resume queue | `pendingCue`、`resumeTask`、`resumeGeneration`、`wantsRunning` |
| iOS 音频性能档 | Mobile audio render profile | `IOS_AUDIO_FRAME_INTERVAL`、`IOS_AUDIO_PIXEL_RATIO_LIMIT`、`getPlaybackPerformanceProfile` |
| 状态文案合并更新 | Active-state update throttle | `queueActiveState`、`activeStateTimer` |
| 大文件声音保护 | Audio performance guard | `MAX_AUDIO_SOURCE_BYTES`、`audioBlockedReason`、`shouldBypassEmbeddedAudio` |
| 音频生命周期 | Audio context lifecycle | `resumeRuntimeAudio`、`suspendRuntimeAudio`、`dispose` |
| 剪贴板范围检查 | Clipboard privacy guard | `scripts/check-project.mjs`；禁止 `wx.getClipboardData`，仅允许首页用户点击后调用一次 `wx.setClipboardData` |
| 剪贴板用途说明 | Clipboard privacy purpose | “用于用户主动复制网页版预览地址；仅向剪切板写入固定网址，不读取剪切板已有内容” |
| 小程序主包体积 | Main package size budget | 当前约 `1.68 MiB`；开发者工具代码质量建议 `< 1.5 M`；微信官方单包限制 `2M`；`vendor/rive/*.wasm.br` 为主要占用 |
| 发布版本号 | Release version | `1.0.4`、`package.json.version`、`package-lock.json.version`、开发者工具上传版本 |
| 独立 H5 | Standalone web viewer | `h5/`、`/rive-viewer`、`RiveViewerApp` |
| H5 本地文件库 | Browser local library | `IndexedDB`、`listLocalFiles`、`saveLocalFile` |
| H5 浏览器运行时 | Browser Rive runtime | `WebRivePlayer`、`rive-player.ts`、`/rive-viewer/rive.wasm` |
| H5 单页参数面板 | Unified preview controls | `.control-panel`、`.parameter-row`；不使用 `activeTab` / `.primary-tabs` |
| H5 画布对齐 | Rive renderer alignment | `WrappedRenderer.align`、`updateViewMatrix`、`Fit.contain` / `Fit.cover` |
| H5 点击坐标换算 | Canvas-to-artboard pointer mapping | `canvasPointToBacking`、`backingPointToArtboard`、`canvas-space.ts` |
| H5 点击优先级 | Interaction-first state restore | `ensureStateMachine`、`selectedStateMachineName`、`pointerDown` |
| H5 性能数据 | Runtime FPS metric | `fps`、`onPerformance`、`.file-fps` |
| H5 渲染质量 | Browser quality profile | `quality`、`requestedQuality`、`effectiveQuality`、`frameInterval` |
| H5 低清缩略图 | Local WebP cover | `saveLibraryCover`、`attachLibraryCovers`、`LocalCoverImage` |
| H5 右侧预览 | Desktop preview side panel | `.drawer-workspace`、`.drawer-home-pane`、`.drawer-preview-panel`、`@media (min-width: 860px)` |
| Mac 双页中缝 | Custom desktop split workspace | `.desktop-workspace`、`.desktop-home-pane`、`.desktop-preview-pane`、`desktopSplitEnabled`、`desktopPreviewFileId` |
| 小程序嵌入式预览 | Embedded native preview panel | `components/preview-panel`、`preview-definition.js`、`isEmbeddedPreview` |
| 桌面分栏阈值 | Desktop split logical-pixel breakpoint | `DESKTOP_SPLIT_MIN_WIDTH = 960`、`windowInfo.windowWidth`、`supportsDesktopSplit`、`getDesktopSplitUrl` |
| Mac 分栏重编译包 | Desktop split DevTools rebuild archive | `dist/RiveViewer-miniapp-1.0.4-mac-split-devtools-rebuild.zip` |
| REV 编辑器备份文件 | Rive editor backup file | `.rev`；不交给 Runtime，需在 Rive 编辑器中转存为 `.riv` |
| H5 分栏过渡 | Responsive split transition | `.drawer-workspace`、`.drawer-workspace.is-open`、`grid-template-columns`、`260ms cubic-bezier(.16, 1, .3, 1)` |
| H5 侧栏关闭 | Preview panel close button | `.drawer-close`、`X`、`Escape`、`setActiveFile(null)` |
| H5 快捷键帮助 | Keyboard shortcut popover | `ShortcutHelp`、`.shortcut-button`、`.shortcut-popover` |
| H5 顶层浮窗 | Page-level overlay stacking | `--z-header`、`--z-popover`、`.topbar` |
| H5 意见反馈 | Author feedback and copy | `FeedbackContact`、`.author-contact`、`navigator.clipboard.writeText`、`AUTHOR_WECHAT` |
| H5 平台标签（已移除） | Removed platform badge | 不再渲染 `.platform-label` 或右上角 `H5` 文案 |
| H5 标题品牌图标 | Header brand mark | `Brand`、`.brand-mark`、`favicon.webp?v=2` |
| H5 文件操作箭头 | Hover file action toggle | `.file-action`、`.file-row:hover`、`.file-row:focus-within`、`.is-menu-open` |
| H5 完整模式比例画布 | Proportional contain canvas | `hasStageAspect`、`stageAspect`、`stageStyle`、`.canvas-card.is-proportional` |
| H5 整行悬停背景 | Full-row file hover fill | `.file-row:hover`、`.file-row:focus-within`、`.file-row.is-menu-open` |
| H5 右上角下载 | Preview top-right download | 手机 `.topbar-download`、宽屏 `.file-heading-download`、`downloadFile`；参数区不再渲染“文件操作” |
| H5 小程序版入口 | Mini Program access entry | `MiniProgramEntry`、`.mini-program-entry`、`.mini-program-popover`、`mini-program-code.webp` |
| H5 发送文件 | Web Share with download fallback | `shareFile`、`navigator.share`、`navigator.canShare`、`downloadFile` |
| H5 删除示例 | Hidden built-in file | `getVisibleBuiltinFiles`、`hideBuiltinFile`、`rive-viewer-hidden-builtins-v1` |
| H5 页签图标 | Favicon with fallback | `favicon.webp`、`favicon-source.png`、`?v=2`、Figma 节点 `152:723` |
| H5 公网测试入口 | Temporary production URL | `rive-viewer-miniapp.muhualei.chatgpt.site/rive-viewer` |
| H5 正式入口 | Custom-domain route | `https://mikeywa.site/rive-viewer/`、`/etc/nginx/snippets/rive-viewer.conf` |
| H5 小程序包排除 | Mini Program pack ignore | `project.config.json` 的 `packOptions.ignore: h5` |
| H5 静态发布包 | Nginx static bundle | `npm run build:static`、`h5/dist-static/`、`vite.static.config.ts` |
| 正式服务器 SSH | Deployment SSH alias | `ssh mikeywa-rive`、`~/.ssh/mikeywa_rive_deploy`、用户 `ubuntu` |
| H5 版本切换 | Atomic release symlink | `/var/www/rive-viewer/releases/<时间戳>`、`/var/www/rive-viewer/current` |
| H5 发布权限 | Static file permissions | 发布目录 `755`、静态文件 `644`、属组 `www-data` |
