# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存不可修改的任务状态历史。

## 非 Docker 启动

需要 Node.js 20+。首次使用可先生成本机配置：

```powershell
.\sagnex.cmd config
```

按需修改 `config/sagnex.env` 后启动：

```powershell
.\sagnex.cmd start
```

Ubuntu 执行：

```bash
./sagnex.sh config
# 按需修改 config/sagnex.env
./sagnex.sh start
```

如果直接执行 `start` 且配置不存在，脚本会询问是否从模板创建配置并继续。首次启动会自动安装依赖并构建，完成后访问 `http://127.0.0.1:4173`。

## Docker 启动

需要 Docker Desktop（Windows）或 Docker Engine 与 Compose 插件（Ubuntu），不需要在宿主机安装 Node.js。

Windows 执行：

```powershell
.\sagnex.cmd config
# 按需修改 config/sagnex.env
.\sagnex.cmd docker start
```

Ubuntu 执行：

```bash
./sagnex.sh config
# 按需修改 config/sagnex.env
./sagnex.sh docker start
```

如果配置不存在，`docker start` 同样会先询问。首次启动会构建镜像并启动容器，完成后访问 `http://127.0.0.1:4173`。
