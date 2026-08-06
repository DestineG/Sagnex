import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, CloudUpload, Database, Download, FileClock, FileUp, RefreshCw, Save, Server, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, downloadJson, exportStamp, formatDate, type WebDavBackupEntry } from '../api';
import { Dialog } from '../components/Dialog';

function formatBytes(value: number | null) {
  if (value === null) return '大小未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function backupDisplayName(backup: WebDavBackupEntry) {
  return backup.isLatest ? '最新状态' : backup.name.replace(/^\d{8}T\d{6}Z-/, '').replace(/\.sagnex\.json$/, '');
}

function BackupTile({ backup, onRestore, onDownload, onDelete }: {
  backup: WebDavBackupEntry;
  onRestore: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}) {
  const displayName = backupDisplayName(backup);
  return <article className={backup.isLatest ? 'backup-tile latest' : 'backup-tile'}>
    <span className={backup.isLatest ? 'backup-kind latest' : 'backup-kind'}><FileClock /></span>
    <div className="backup-meta"><strong title={displayName}>{displayName}</strong><span>{backup.modifiedAt ? formatDate(backup.modifiedAt) : '时间未知'} · {formatBytes(backup.size)}</span></div>
    <div className="backup-item-actions"><button className="button small" onClick={onRestore}>恢复</button><button className="icon-button" data-tooltip="下载 JSON" aria-label={`下载${backup.name}`} onClick={onDownload}><Download /></button>{onDelete && <button className="icon-button danger" data-tooltip="删除远端备份" aria-label={`删除${backup.name}`} onClick={onDelete}><Trash2 /></button>}</div>
  </article>;
}

export function DataPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<unknown>(null);
  const [importName, setImportName] = useState('');
  const [message, setMessage] = useState('');
  const [endpointInput, setEndpoint] = useState<string>();
  const [usernameInput, setUsername] = useState<string>();
  const [password, setPassword] = useState('');
  const [remotePathInput, setRemotePath] = useState<string>();
  const [backupName, setBackupName] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<WebDavBackupEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebDavBackupEntry | null>(null);

  const { data: info, isLoading } = useQuery({ queryKey: ['data-info'], queryFn: api.dataInfo });
  const { data: webdavConfig } = useQuery({ queryKey: ['webdav-config'], queryFn: api.getWebDavConfig });
  const endpoint = endpointInput ?? webdavConfig?.endpoint ?? 'https://dav.jianguoyun.com/dav/';
  const username = usernameInput ?? webdavConfig?.username ?? '';
  const remotePath = remotePathInput ?? webdavConfig?.remotePath ?? 'Sagnex';
  const backups = useQuery({
    queryKey: ['webdav-backups'],
    queryFn: api.listWebDavBackups,
    enabled: Boolean(webdavConfig?.passwordSet),
    retry: false
  });

  const refreshBackups = async () => {
    await queryClient.invalidateQueries({ queryKey: ['webdav-config'] });
    await queryClient.invalidateQueries({ queryKey: ['webdav-backups'] });
  };
  const exportBackup = useMutation({ mutationFn: api.exportBackup, onSuccess: (value) => downloadJson(`sagnex-backup-${exportStamp()}.json`, value) });
  const importBackup = useMutation({
    mutationFn: api.importBackup,
    onSuccess: async (result) => {
      setImportData(null);
      setMessage(result.backupPath ? `恢复完成，原数据库已备份至 ${result.backupPath}` : '恢复完成');
      await queryClient.invalidateQueries();
    }
  });
  const saveConfig = useMutation({
    mutationFn: () => api.saveWebDavConfig({ endpoint, username, password: password || undefined, remotePath }),
    onSuccess: async () => { setPassword(''); setMessage('WebDAV 配置已保存在本机，应用密码仅在本次 API 运行期间保留'); await refreshBackups(); }
  });
  const testConnection = useMutation({
    mutationFn: async () => {
      await api.saveWebDavConfig({ endpoint, username, password: password || undefined, remotePath });
      return api.testWebDav();
    },
    onSuccess: async () => { setPassword(''); setMessage('WebDAV 连接成功'); await refreshBackups(); }
  });
  const latest = useMutation({ mutationFn: api.pushLatestWebDav, onSuccess: async () => { setMessage('已更新远端 latest.sagnex.json'); await refreshBackups(); } });
  const named = useMutation({ mutationFn: () => api.createNamedWebDav(backupName), onSuccess: async () => { setMessage(`已创建命名备份“${backupName}”`); setBackupName(''); await refreshBackups(); } });
  const downloadRemote = useMutation({ mutationFn: api.downloadWebDavBackup, onSuccess: (value, name) => downloadJson(name, value) });
  const restoreRemote = useMutation({
    mutationFn: api.restoreWebDavBackup,
    onSuccess: async (result) => { setRestoreTarget(null); setMessage(result.backupPath ? `云端恢复完成，原数据库已备份至 ${result.backupPath}` : '云端恢复完成'); await queryClient.invalidateQueries(); }
  });
  const deleteRemote = useMutation({ mutationFn: api.deleteWebDavBackup, onSuccess: async () => { setDeleteTarget(null); setMessage('远端备份已删除'); await refreshBackups(); } });

  const actionError = saveConfig.error || testConnection.error || latest.error || named.error || backups.error || downloadRemote.error;
  const latestBackup = backups.data?.find((backup) => backup.isLatest);
  const namedBackups = backups.data?.filter((backup) => !backup.isLatest) ?? [];

  async function selectFile(file?: File) {
    if (!file) return;
    try {
      setImportData(JSON.parse(await file.text()));
      setImportName(file.name);
      setMessage('');
    } catch {
      setMessage('无法读取该 JSON 文件');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return <section className="page data-page">
    <header className="page-head data-page-head"><div><h1>数据与备份</h1><p>本地导入导出与 WebDAV 云备份</p></div></header>
    {message && <p className="success-banner">{message}</p>}
    {actionError && <p className="page-error">{actionError.message}</p>}
    <div className="data-layout">
      <section className="local-backup-bar">
        <div className="local-backup-title"><span className="data-panel-icon"><Database /></span><div><h2>本地数据</h2><p>完整 JSON 可离线保存和迁移</p></div></div>
        <div className="local-backup-summary"><Server /><div><strong>{isLoading ? '读取中...' : `${info?.eventCount ?? 0} 个事件 · ${info?.taskCount ?? 0} 个任务 · ${info?.labelCount ?? 0} 个标签`}</strong><p className="path-text">{info?.databasePath}</p></div></div>
        <div className="local-backup-actions"><button className="button primary" onClick={() => exportBackup.mutate()} disabled={exportBackup.isPending}><Download />导出 JSON</button><button className="button" onClick={() => fileRef.current?.click()}><FileUp />导入备份</button><input ref={fileRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} /></div>
      </section>

      <section className="webdav-workspace">
        <header className="webdav-heading"><span className="data-panel-icon cloud"><Cloud /></span><div><h2>WebDAV 云备份</h2><p>手动推送和按版本恢复，不进行双向同步</p></div></header>
        <div className="webdav-config-block">
          <div className="section-label"><h3>连接配置</h3><span>{webdavConfig?.passwordSet ? '本次运行已连接密码' : '需要应用专用密码'}</span></div>
          <div className="webdav-form">
          <label className="field full"><span>WebDAV 地址</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://dav.example.com/dav/" /></label>
          <label className="field"><span>用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label className="field"><span>应用密码</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={webdavConfig?.passwordSet ? '已在本次运行中设置' : 'API 重启后需重新输入'} /></label>
          <label className="field"><span>远端目录</span><input value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="Sagnex" /></label>
          <div className="webdav-config-actions"><button className="button" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}><Save />保存</button><button className="button" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}><RefreshCw />测试连接</button></div>
          </div>
          <p className="security-note">应用密码仅保存在本地 API 进程内存中，不写入数据库或备份。请使用云服务提供的应用专用密码。</p>
        </div>

        <div className="backup-compose">
          <div className="backup-compose-latest"><div><strong>快速备份</strong><p>覆盖远端的 latest 文件</p></div><button className="button primary" onClick={() => latest.mutate()} disabled={!webdavConfig?.passwordSet || latest.isPending}><CloudUpload />更新 latest</button></div>
          <div className="backup-compose-named"><div><strong>命名备份</strong><p>保留一个可识别的历史版本</p></div><div className="named-backup"><input value={backupName} onChange={(event) => setBackupName(event.target.value)} maxLength={80} placeholder="输入备份名称" /><button className="button" onClick={() => named.mutate()} disabled={!backupName.trim() || !webdavConfig?.passwordSet || named.isPending}><FileClock />创建</button></div></div>
        </div>

        <div className="backup-list-head"><h3>远端备份</h3><button className="icon-button" data-tooltip="刷新备份列表" aria-label="刷新备份列表" onClick={() => backups.refetch()} disabled={!webdavConfig?.passwordSet || backups.isFetching}><RefreshCw /></button></div>
        {!webdavConfig?.passwordSet ? <div className="inline-empty">保存应用密码并测试连接后显示备份</div> : backups.isLoading ? <div className="inline-empty">正在读取远端目录...</div> : backups.data?.length ? <div className="backup-records">
          {latestBackup && <div className="latest-backup-row"><BackupTile backup={latestBackup} onRestore={() => setRestoreTarget(latestBackup)} onDownload={() => downloadRemote.mutate(latestBackup.name)} /></div>}
          {namedBackups.length > 0 && <><h4 className="named-backup-heading">命名备份</h4><div className="backup-grid">{namedBackups.map((backup) => <BackupTile key={backup.name} backup={backup} onRestore={() => setRestoreTarget(backup)} onDownload={() => downloadRemote.mutate(backup.name)} onDelete={() => setDeleteTarget(backup)} />)}</div></>}
        </div> : <div className="inline-empty">远端目录中还没有 Sagnex 备份</div>}
      </section>
    </div>
    {importData !== null && <Dialog title="恢复本地备份" onClose={() => setImportData(null)} onSubmit={(event) => { event.preventDefault(); importBackup.mutate(importData); }} submitLabel="备份当前数据并恢复" destructive busy={importBackup.isPending}><p>将使用“{importName}”整体替换当前数据。格式无效或恢复失败时，现有数据不会改变。</p>{importBackup.error && <p className="error-banner">{importBackup.error.message}</p>}</Dialog>}
    {restoreTarget && <Dialog title="恢复云端备份" onClose={() => setRestoreTarget(null)} onSubmit={(event) => { event.preventDefault(); restoreRemote.mutate(restoreTarget.name); }} submitLabel="备份当前数据并恢复" destructive busy={restoreRemote.isPending}><p>将使用“{restoreTarget.name}”整体替换当前数据，恢复前会自动备份本地数据库。</p>{restoreRemote.error && <p className="error-banner">{restoreRemote.error.message}</p>}</Dialog>}
    {deleteTarget && <Dialog title="删除远端备份" onClose={() => setDeleteTarget(null)} onSubmit={(event) => { event.preventDefault(); deleteRemote.mutate(deleteTarget.name); }} submitLabel="删除备份" destructive busy={deleteRemote.isPending}><p>“{deleteTarget.name}”将从 WebDAV 永久删除，不影响当前本地数据。</p>{deleteRemote.error && <p className="error-banner">{deleteRemote.error.message}</p>}</Dialog>}
  </section>;
}
