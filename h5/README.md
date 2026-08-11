# Rive 预览台 H5

独立浏览器版 Rive 文件预览与手机性能测试工具。所有用户导入的 `.riv` 文件只写入当前浏览器的 IndexedDB，不上传业务服务器。

## 功能

- 批量导入、浏览器本地文件库、下载与删除。
- 画板、时间轴、状态机、输入和画面参数位于同一详情页，不分 Tab。
- 播放、暂停、重置、倍速、缩放方式、画布背景和声音开关。
- 渲染和指针共用同一 Fit 矩阵，支持高 DPI Canvas 点击、完整/铺满和 Listener 交互。
- 加载阶段、百分比、首帧耗时、FPS 与移动端渲染质量档位。
- 复杂文件的画板目录懒加载、DPR 限制和资源释放。

## 本地运行

```bash
npm ci
npm run dev
```

入口：<http://localhost:3000/rive-viewer>

## 验证

```bash
npm run lint
npm test
```

## 部署

- 临时公网：<https://rive-viewer-miniapp.muhualei.chatgpt.site/rive-viewer>
- 正式入口：<https://mikeywa.site/rive-viewer/>

正式域名由腾讯云轻量服务器上的 Nginx 托管，只接管 `/rive-viewer`，不影响根域名首页。静态构建发布到 `/var/www/rive-viewer/releases/<时间戳>/rive-viewer`，目录权限为 `755`、文件权限为 `644`，再通过 `current` 软链接切换；服务器连接别名为 `ssh mikeywa-rive`，Nginx 规则保存在 `deploy/nginx-rive-viewer.conf`。
