# Rive Host API

单进程、低并发的 Rive 文件托管与匿名评论服务。只使用 Node 内置模块，兼容 Node 18.19 及以上版本。

## 运行

数据目录必须使用绝对路径，并放在发布目录之外：

```bash
cd server
RIVE_HOST_DATA_DIR=/var/lib/rive-host npm start
```

默认监听 `127.0.0.1:8097`。可使用 `RIVE_HOST_HOST`、`RIVE_HOST_PORT` 修改监听地址，使用 `RIVE_HOST_MAX_TOTAL_BYTES` 修改默认 `5 GiB` 托管总量上限。磁盘可用空间低于 `6 GiB` 时停止接收上传。

持久数据位于：

- `$RIVE_HOST_DATA_DIR/state.json`：原子更新的分享与评论状态。
- `$RIVE_HOST_DATA_DIR/files/`：不可变 `.riv` 文件。
- `$RIVE_HOST_DATA_DIR/tmp/`：上传临时文件，启动时自动清理残留。

## 示例记录

正式平台不再预置或公开示例。公开上传 API 始终写入 `isExample: false`，不会因
客户端请求头生成隐藏记录；历史 `isExample: true` 记录不出现在公开中或已归档
列表。`seed:examples` 只保留给隔离测试或停服迁移，生产服务运行期间禁止执行，
避免两个进程各自持有状态快照。

## 验证

```bash
npm test
```
