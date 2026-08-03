# 元素映射

| 俗称 | 学名 | 代码名称 |
| --- | --- | --- |
| 首页导入框 | Import dropzone | `.import-dropzone`、`showImportMenu` |
| 导入方式菜单 | Import action sheet | `showImportMenu`、`chooseMessageFile`、`chooseSystemFile` |
| 最近文件列表 | Local library list | `.file-list`、`files`、`getAllFiles` |
| 文件卡 / 文件行 | File row | `.file-row`、`.file-open` |
| 倾斜文件图标 | File cover | `.file-cover`、`.file-cover__fallback` |
| 文件右侧箭头 | File menu toggle | `.file-menu-toggle`、`toggleFileMenu` |
| 三项操作菜单 | File action menu | `.file-menu`、`saveToDevice`、`shareFile`、`deleteFile` |
| 预览画布 | Rive Canvas stage | `.canvas-card`、`#riveCanvas`、`NativeRivePlayer` |
| 画布 Loading | Loading overlay | `.canvas-state--loading`、`loadingProgress`、`loadingPhase` |
| 画布拖动手柄 | Stage resize handle | `.stage-resizer`、`stageResizeStart/Move/End` |
| 双击切换 | Stage view mode toggle | `stageResizerTap`、`toggleStageViewMode`、`stageViewMode` |
| 重置按钮 | Reset playback action | `.transport__primary`、`resetAnimation` |
| 播放 / 暂停 | Playback toggle | `.transport__secondary`、`togglePlay` |
| 播放速度 | Speed selector | `.speed-menu`、`.speed-popover`、`speedValue` |
| 上一个 / 下一个 | File navigation | `.transport__files`、`fileNavigationTouchStart/End`、`openFileById` |
| 长按文件列表 | File navigation popover | `.file-popover`、`showFileMenu` |
| 画板标签 | Artboard choice tag | `artboardNames`、`selectArtboardTag` |
| 状态机标签 | State machine choice tag | `stateMachineNames`、`selectStateMachineTag` |
| 时间轴 | Animation timeline tags | `.timeline-actions`、`animationNames`、`playAnimation` |
| 播放进度背景 | Timeline progress fill | `.parameter-tag__progress`、`animationProgress` |
| 状态机输入 | State machine inputs | `inputs`、`handleInputTag` |
| 标签点击反馈 | Parameter tag feedback | `parameter-tag`、`is-pressed`、`is-feedback` |
| 完整 / 铺满 | Fit control | `.compact-switch`、`fit`、`selectFit` |
| 背景色圆圈 | Canvas tone swatches | `.tone-options`、`.tone`、`canvasTone` |
| 右上角下载按钮 | File export menu | `.file-heading__save`、`showSaveMenu` |
| 文件本地仓库 | Mini Program user data storage | `rive-library`、`utils/library.js` |
