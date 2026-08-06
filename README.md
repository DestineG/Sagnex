# Sagnex

Sagnex 是一款本地优先的事件规划工具。它使用任务依赖图组织工作，通过任务状态自动计算事件进度，并保存不可修改的任务状态历史。

## 运行

需要 Node.js 20+ 和 pnpm 11+。

```powershell
pnpm install
pnpm build
pnpm start
```

`pnpm start` 会启动本地 API 与网页并打开 `http://127.0.0.1:4173`。开发模式使用：

```powershell
pnpm dev
```

## 本地数据

SQLite 数据库默认保存在系统应用数据目录。数据页会显示实际路径，也可以通过环境变量覆盖：

```powershell
$env:SAGNEX_DATA_DIR='D:\SagnexData'
pnpm start
```

导入 JSON 或恢复 WebDAV 备份前，服务会自动保存当前 SQLite 数据库。默认目录是数据库同级的 `backups`，可以在启动时覆盖：

```powershell
pnpm start -- --backup-dir 'D:\SagnexBackups'
```

也可以使用环境变量：

```powershell
$env:SAGNEX_BACKUP_DIR='D:\SagnexBackups'
pnpm start
```

数据页会显示当前生效的恢复前安全备份目录。启动参数变化需要重启 Sagnex。

## Docker Compose

需要 Docker Desktop（Windows）或 Docker Engine 与 Compose 插件（Ubuntu）。默认只监听 `127.0.0.1:4173`，数据库和恢复备份分别保存在仓库下的 `docker-data/database` 与 `docker-data/backups`。

Windows PowerShell：

```powershell
.\docker-start.ps1
.\docker-update.ps1
.\docker-stop.ps1
```

Ubuntu：

```bash
./docker-start.sh
./docker-update.sh
./docker-stop.sh
```

启动脚本会构建并启动服务；更新脚本会刷新基础镜像、重建当前工作区并滚动重启；停止脚本不会删除数据库、备份目录或本地镜像。仓库没有配置远程地址，因此更新脚本不会执行 `git pull`。

默认配置无需创建额外文件。需要更换端口、监听地址或数据目录时，将 `.env.docker.example` 复制为 `.env` 后修改。例如 Windows 绝对路径可以写成 `D:/Sagnex/data`，Ubuntu 可以写成 `/srv/sagnex/data`。如需从局域网访问，将 `SAGNEX_BIND_ADDRESS` 改为 `0.0.0.0`，并自行配置防火墙访问规则。

直接使用 Compose 也可以：

```bash
docker compose up -d --build --wait
docker compose down
```

## 验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

主要源码位于 `apps/web`、`apps/api` 和 `packages/contracts`。
