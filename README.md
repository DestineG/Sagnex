# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存不可修改的任务状态历史。

## 一键运行

Windows 原生模式需要 Node.js 20+，双击 `sagnex.cmd` 或执行：

```powershell
.\sagnex.cmd start
.\sagnex.cmd update
.\sagnex.cmd stop
```

Ubuntu 原生模式：

```bash
./sagnex.sh start
./sagnex.sh update
./sagnex.sh stop
```

`start` 会在首次运行或源码发生变化时自动安装锁定依赖并构建，随后在后台启动 Sagnex；没有变化时会直接启动。`update` 会停止受管实例、重新安装依赖、完整构建并启动。运行日志和 PID 保存在 `.sagnex`，停止不会删除数据。

也可以使用 pnpm 前台启动：

```powershell
pnpm install
pnpm build
pnpm start
```

开发模式使用：

```powershell
pnpm dev
```

## 配置与数据

首次使用统一启动器或 `pnpm start` 时，会自动把 `config/sagnex.env.example` 复制为实际配置 `config/sagnex.env`。模板只用于提供默认值，日常配置应修改 `config/sagnex.env`：

```dotenv
SAGNEX_DATA_DIR=./data
SAGNEX_BACKUP_DIR=./data/backups
SAGNEX_BIND_ADDRESS=127.0.0.1
SAGNEX_WEB_PORT=4173
SAGNEX_API_PORT=4784
SAGNEX_DOCKER_USER=
```

相对路径始终从项目根目录解析，环境变量的优先级高于配置文件。SQLite 默认保存在 `data/sagnex.sqlite`，导入或恢复前的安全备份保存在 `data/backups`。实际配置、数据库、日志和运行状态均已排除在 Git 之外。

旧版本如果在系统应用数据目录中已有数据库，且项目目录中尚无数据库，首次启动时会复制数据库及 WAL 文件到项目 `data` 目录；旧的本地安全备份也会补充复制到新备份目录。旧文件不会删除。

## Docker Compose

需要 Docker Desktop（Windows）或 Docker Engine 与 Compose 插件（Ubuntu）。Docker 与原生模式使用同一份 `config/sagnex.env` 和项目数据目录，不能同时运行。

Windows PowerShell：

```powershell
.\sagnex.cmd docker start
.\sagnex.cmd docker update
.\sagnex.cmd docker stop
```

Ubuntu：

```bash
./sagnex.sh docker start
./sagnex.sh docker update
./sagnex.sh docker stop
```

启动命令会按需构建镜像；更新命令会刷新基础镜像、重建当前工作区并滚动重启；停止命令不会删除数据库、备份目录或本地镜像。仓库没有配置远程地址，因此更新命令不会执行 `git pull`。

通过 `sagnex.sh` 启动时，留空的 `SAGNEX_DOCKER_USER` 会自动使用当前 Ubuntu 用户的 `id -u:id -g`，保证原生和 Docker 模式都能读写数据；直接使用 Compose 时默认采用 `1000:1000`，其他用户 ID 应在配置中明确填写。如需从局域网访问，将 `SAGNEX_BIND_ADDRESS` 改为 `0.0.0.0`，并自行配置防火墙访问规则。

直接使用 Compose 也可以：

```bash
docker compose --env-file config/sagnex.env up -d --build --wait
docker compose --env-file config/sagnex.env down
```

## 验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

主要源码位于 `apps/web`、`apps/api` 和 `packages/contracts`。
