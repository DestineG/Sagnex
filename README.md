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

## 验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

主要源码位于 `apps/web`、`apps/api` 和 `packages/contracts`。
