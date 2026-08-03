# 当前交接

更新日期：2026-08-03

## 当前状态

- ✅ 原生微信小程序预览链路可用，完整 Rive Canvas 运行时固定为 `2.39.1`。
- ✅ 支持聊天文件批量导入、可用环境中的系统文件多选和本地文件库。
- ✅ 支持画板、状态机、时间轴、输入、倍速、画布背景和文件切换。
- ✅ 大文件分块读取、Loading 百分比、动态像素比和离页释放已完成。
- ✅ Piano Game 点击、View Model 绑定、Listener 优先级和 `in → idle` 调度已修复。
- ✅ Animojis 的 Rive Layout 与嵌套画板布局已恢复。
- ✅ 已移除旧 H5 预览页面、桥接、本地服务、资源和配置。
- ✅ 许可证采用 `PolyForm-Noncommercial-1.0.0`，第三方 MIT 声明已补齐。
- ✅ GitHub 公开仓库已创建并推送：<https://github.com/yanghaoleng/RiveViewer-miniapp>。

## 验证命令

```bash
npm ci
npm run vendor:rive
npm run check
npm run verify:interactions
```

性能素材保存在本机 `rive测试文件/`，不进入公开仓库。`project.private.config.json`、`node_modules/` 和系统文件同样已忽略。

## 后续发布

- 微信已上传的 `1.0.1` 早于最近的原生兼容性修复；下次体验版建议使用新版本号重新上传。
- 正式发布前继续用真机验证大文件返回、Piano Game 点击、引导页点击优先级和 Animojis 布局。
- 商业授权需由版权方单独书面许可，不能直接沿用公开仓库的非商用授权。
