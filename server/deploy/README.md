# Rive 托管服务部署

本目录只保存服务部署约定，不执行发布。正式数据必须位于发布目录之外。

## 线上布局

```text
/opt/rive-host/releases/<时间戳>/server/   后端版本
/opt/rive-host/current                     后端原子软链接
/var/www/rive-host/releases/<时间戳>/      H5 根路径静态产物
/var/www/rive-host/current                 H5 原子软链接
/var/www/rive-host-beta/releases/<时间戳>/beta/ Beta H5 静态产物
/var/www/rive-host-beta/current             Beta H5 原子软链接
/var/lib/rive-host                         文件与状态数据
```

后端入口为 `/opt/rive-host/current/server/src/server.mjs`。服务固定监听
`127.0.0.1:8097`，由 Nginx 代理 `/api/`；不要开放额外公网端口。

`rive-host.service` 使用 systemd `DynamicUser` 与 `StateDirectory` 创建低权限
运行身份和 `/var/lib/rive-host`。发布目录应由 `root:root` 持有，目录可读但
不可由服务写入。状态文件和 `.riv` 文件不得放在 `release` 或 `current` 中。

## 运行环境

线上 `/usr/bin/node` 当前为 `v18.19.1`，后端兼容该版本且没有生产依赖或
构建步骤。Node 22 与 npm 仅存在于 `ubuntu` 用户的 NVM 目录；低权限动态
用户无法穿过 `/home/ubuntu`，systemd 不应引用该 NVM 路径。

部署文件的目标位置：

```text
server/deploy/rive-host.service          -> /etc/systemd/system/rive-host.service
h5/deploy/nginx-rive-host.conf           -> /etc/nginx/sites-available/rive.mikeywa.site
```

正式虚拟主机已由 `sites-enabled` 加载。切换时应先备份并更新实际加载的站点文件，
不能并行启用第二个包含相同 `server_name` 或 `upstream rive_host_api` 的配置。
注意：线上实际加载的 `/etc/nginx/sites-enabled/rive.mikeywa.site` 是独立文件，
不是指向 `sites-available` 的软链接；发布时应以已加载文件为基线更新，并同步
维护 `sites-available` 副本。当前主站还包含 `jocam-origin`、分析、Beta 和数据服务
配置，更新时须保留所有这些线上专用配置。
Beta 配置片段 `/etc/nginx/snippets/rive-host-beta.conf` 与正式站点分开管理。

三位分享码页面（`/<code>` 与 `/beta/<code>`）通过服务端 `/api/v1/share-page/<code>`
返回对应的 H5 模板，并根据当前分享版本文件名渲染 `<title>`、Open Graph 和
Twitter 标题。正式与 Beta HTML 根目录分别由 `RIVE_HOST_PUBLIC_ROOT` 和
`RIVE_HOST_BETA_PUBLIC_ROOT` 指定，默认值对应各自 `current` 软链接。更新这类
分享页路由时，先部署并重启后端，再切换 Nginx；验证原始 HTML 的标题以及 H5
资源路径后再完成发布。钉钉可能缓存已生成的旧卡片，修改后重新分享链接以刷新卡片。

## 发布前检查

```bash
cd server
npm test

cd ../h5
RIVE_VIEWER_BASE=/ npm run check
RIVE_VIEWER_BASE=/ npm run build
```

根路径构建输出仍为 `h5/dist-static/`。复制发布产物后，先创建
`current.next`，确认目标目录、权限和 SHA-256，再以原子重命名替换
`current`。后端发布不需要在线执行 `npm install`。

首次安装 unit 后需要执行 systemd 配置检查、重新加载并启动服务。服务验收：

```bash
systemd-analyze verify /etc/systemd/system/rive-host.service
curl --fail --silent --show-error http://127.0.0.1:8097/healthz
```

正式平台不预置示例，也不要执行 `seed-examples.mjs`；该脚本只保留给隔离测试或
停服迁移，运行中的服务旁执行会造成两个进程各自持有状态快照。归档和恢复请求
必须携带 `X-Rive-Action` 操作头；Nginx 还会按来源地址限制上传和其他写操作频率。

当前初始总存储上限为 `5 GiB`。服务还会在数据盘可用空间低于 `6 GiB` 时
拒绝新上传；不要用发布或回滚脚本清理 `/var/lib/rive-host`。

## Nginx 与回滚

正式虚拟主机模板位于 `h5/deploy/nginx-rive-host.conf`。启用前必须确认：

- `rive.mikeywa.site` 证书存在；
- 前端根路径构建和后端健康检查都已通过；
- `sudo nginx -t` 成功；
- 原 `mikeywa.site/rive-viewer/` 保持不变。

将 `certbot-reload-nginx.sh` 安装到
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` 并设为可执行，确保续签证书后
Nginx 自动加载新证书。

首次发布还没有上一版 `current`，所以替换 Nginx 前必须单独备份现有站点文件；
失败时恢复旧站点配置并停止首次安装的服务。后续回滚时分别把前端、后端
`current` 指回上一版本，重启 API，再检查正式域名。
数据目录不回滚；若状态格式发生变化，必须使用上线前备份或向后兼容迁移。
