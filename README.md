# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存不可修改的任务状态历史。

## 非 Docker 启动

需要 Node.js 20+。Windows 双击 `sagnex.cmd`，或在终端执行：

```powershell
.\sagnex.cmd start
```

Ubuntu 执行：

```bash
./sagnex.sh start
```

首次启动会自动创建本机配置、安装依赖并构建。启动完成后访问 `http://127.0.0.1:4173`。

## Docker 启动

需要 Docker Desktop（Windows）或 Docker Engine 与 Compose 插件（Ubuntu），不需要在宿主机安装 Node.js。

Windows 执行：

```powershell
.\sagnex.cmd docker start
```

Ubuntu 执行：

```bash
./sagnex.sh docker start
```

首次启动会自动创建本机配置、构建镜像并启动容器。启动完成后访问 `http://127.0.0.1:4173`。
