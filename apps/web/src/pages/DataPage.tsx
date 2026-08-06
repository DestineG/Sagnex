import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, CloudUpload, Database, Download, FileClock, FileUp, RefreshCw, Save, Server, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, downloadJson, exportStamp, formatDate, type WebDavBackupEntry } from '../api';
import { Dialog } from '../components/Dialog';

type NoticeScope = 'local' | 'config' | 'latest' | 'versions';
type Notice = { scope: NoticeScope; text: string; kind: 'success' | 'error' };

function formatBytes(value: number | null) {
  if (value === null) return '大小未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function displayNameFromFile(name: string) {
  if (name === 'latest.sagnex.json') return '最新备份';
  return name.replace(/^\d{8}T\d{6}Z-/, '').replace(/\.sagnex\.json$/, '');
}

function BackupTile({ backup, onRestore, onDownload, onDelete }: {
  backup: WebDavBackupEntry;
  onRestore: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}) {
  const displayName = displayNameFromFile(backup.name);
  return <article className={backup.isLatest ? 'backup-tile latest' : 'backup-tile'}>
    <span className={backup.isLatest ? 'backup-kind latest' : 'backup-kind'}><FileClock /></span>
    <div className="backup-meta"><strong title={displayName}>{displayName}</strong><span>{backup.modifiedAt ? formatDate(backup.modifiedAt) : '时间未知'} · {formatBytes(backup.size)}</span></div>
    <div className="backup-item-actions"><button className="button small" onClick={onRestore}>恢复</button><button className="icon-button" data-tooltip="下载 JSON" aria-label={`下载${displayName}`} onClick={onDownload}><Download /></button>{onDelete && <button className="icon-button danger" data-tooltip="删除版本" aria-label={`删除${displayName}`} onClick={onDelete}><Trash2 /></button>}</div>
  </article>;
}

function ModuleNotice({ notice, scope }: { notice: Notice | null; scope: NoticeScope }) {
  if (!notice || notice.scope !== scope) return null;
  return <p className={`module-notice ${notice.kind}`}>{notice.text}</p>;
}

export function DataPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<unknown>(null);
  const [importName, setImportName] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [endpointInput, setEndpoint] = useState<string>();
  const [usernameInput, setUsername] = useState<string>();
  const [password, setPassword] = useState('');
  const [remotePathInput, setRemotePath] = useState<string>();
  const [backupName, setBackupName] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<WebDavBackupEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebDavBackupEntry | null>(null);

  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const { data: info, isLoading } = useQuery({ queryKey: ['data-info'], queryFn: api.dataInfo });
  const { data: webdavConfig } = useQuery({ queryKey: ['webdav-config'], queryFn: api.getWebDavConfig });
  const endpoint = endpointInput ?? webdavConfig?.endpoint ?? 'https://dav.jianguoyun.com/dav/';
  const username = usernameInput ?? webdavConfig?.username ?? '';
  const remotePath = remotePathInput ?? webdavConfig?.remotePath ?? 'Sagnex';
  const connected = Boolean(webdavConfig?.passwordSet);
  const backups = useQuery({
    queryKey: ['webdav-backups'],
    queryFn: api.listWebDavBackups,
    enabled: connected,
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
      setNotice({ scope: 'local', kind: 'success', text: result.backupPath ? `恢复完成，原数据库已备份至 ${result.backupPath}` : '恢复完成' });
      await queryClient.invalidateQueries();
    }
  });
  const saveConfig = useMutation({
    mutationFn: () => api.saveWebDavConfig({ endpoint, username, password: password || undefined, remotePath }),
    onSuccess: async () => { setPassword(''); setNotice({ scope: 'config', kind: 'success', text: 'WebDAV 配置已保存' }); await refreshBackups(); }
  });
  const testConnection = useMutation({
    mutationFn: async () => {
      await api.saveWebDavConfig({ endpoint, username, password: password || undefined, remotePath });
      return api.testWebDav();
    },
    onSuccess: async () => { setPassword(''); setNotice({ scope: 'config', kind: 'success', text: 'WebDAV 连接成功' }); await refreshBackups(); }
  });
  const latest = useMutation({
    mutationFn: api.pushLatestWebDav,
    onSuccess: async () => { setNotice({ scope: 'latest', kind: 'success', text: '最新备份已更新' }); await refreshBackups(); }
  });
  const named = useMutation({
    mutationFn: (name: string) => api.createNamedWebDav(name),
    onSuccess: async (_result, name) => { setNotice({ scope: 'versions', kind: 'success', text: `版本“${name}”已创建` }); setBackupName(''); await refreshBackups(); }
  });
  const downloadRemote = useMutation({ mutationFn: api.downloadWebDavBackup, onSuccess: (value, name) => downloadJson(name, value) });
  const restoreRemote = useMutation({
    mutationFn: api.restoreWebDavBackup,
    onSuccess: async (result, name) => {
      setRestoreTarget(null);
      const scope = name === 'latest.sagnex.json' ? 'latest' : 'versions';
      const suffix = result.backupPath ? `，原数据库已备份至 ${result.backupPath}` : '';
      setNotice({ scope, kind: 'success', text: `已从“${displayNameFromFile(name)}”恢复${suffix}` });
      await queryClient.invalidateQueries();
    }
  });
  const deleteRemote = useMutation({
    mutationFn: api.deleteWebDavBackup,
    onSuccess: async (_result, name) => { setDeleteTarget(null); setNotice({ scope: 'versions', kind: 'success', text: `版本“${displayNameFromFile(name)}”已删除` }); await refreshBackups(); }
  });

  const sharedBackupError = backups.error || downloadRemote.error;
  const latestBackup = backups.data?.find((backup) => backup.isLatest);
  const versionBackups = backups.data?.filter((backup) => !backup.isLatest) ?? [];

  async function selectFile(file?: File) {
    if (!file) return;
    try {
      setImportData(JSON.parse(await file.text()));
      setImportName(file.name);
      setNotice(null);
    } catch {
      setNotice({ scope: 'local', kind: 'error', text: '无法读取该 JSON 文件' });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return <section className="page data-page">
    <header className="page-head data-page-head"><div><h1>数据与备份</h1><p>管理本地数据文件与云端备份</p></div></header>
    <div className="data-layout">
      <section className="local-backup-bar">
        <div className="local-backup-title"><span className="data-panel-icon"><Database /></span><div><h2>本地数据与文件</h2><p>查看存储位置，导入或导出完整数据</p></div></div>
        <div className="local-backup-summary"><Server /><div><strong>{isLoading ? '读取中...' : `${info?.eventCount ?? 0} 个事件 · ${info?.taskCount ?? 0} 个任务 · ${info?.labelCount ?? 0} 个标签`}</strong><div className="path-list"><p title={info?.databasePath}>数据库：{info?.databasePath}</p><p title={info?.backupDirectory ?? undefined}>恢复前备份：{info?.backupDirectory ?? '内存数据库不创建副本'}</p></div></div></div>
        <div className="local-backup-actions"><button className="button primary" onClick={() => exportBackup.mutate()} disabled={exportBackup.isPending}><Download />导出 JSON</button><button className="button" onClick={() => fileRef.current?.click()}><FileUp />导入备份</button><input ref={fileRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} /></div>
        <ModuleNotice notice={notice} scope="local" />
      </section>

      <section className="webdav-workspace">
        <header className="webdav-heading"><div className="webdav-heading-title"><span className="data-panel-icon cloud"><Cloud /></span><div><h2>WebDAV 云备份</h2><p>连接云端空间，创建和恢复备份版本</p></div></div><button className="icon-button" data-tooltip="刷新备份" aria-label="刷新备份" onClick={() => backups.refetch()} disabled={!connected || backups.isFetching}><RefreshCw /></button></header>
        <div className="webdav-config-block">
          <div className="section-label"><h3>连接配置</h3><span>{connected ? '本次运行已设置密码' : '需要应用专用密码'}</span></div>
          <div className="webdav-form">
            <label className="field full"><span>WebDAV 地址</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://dav.example.com/dav/" /></label>
            <label className="field"><span>用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
            <label className="field"><span>应用密码</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={connected ? '已在本次运行中设置' : 'API 重启后需重新输入'} /></label>
            <label className="field"><span>远端目录</span><input value={remotePath} onChange={(event) => setRemotePath(event.target.value)} placeholder="Sagnex" /></label>
            <div className="webdav-config-actions"><button className="button" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}><Save />保存</button><button className="button" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}><RefreshCw />测试连接</button></div>
          </div>
          <ModuleNotice notice={notice} scope="config" />
          {(saveConfig.error || testConnection.error) && <p className="module-notice error">{(saveConfig.error || testConnection.error)?.message}</p>}
          <p className="security-note">应用密码仅保存在本地 API 进程内存中，不写入数据库或备份。请使用云服务提供的应用专用密码。</p>
        </div>

        {sharedBackupError && <p className="module-notice error backup-shared-error">{sharedBackupError.message}</p>}

        <section className="backup-module latest-backup-module">
          <header className="backup-module-head"><div><h3>最新备份</h3><p>{latestBackup ? '更新后覆盖当前版本' : '尚未创建'}</p></div><button className="button primary" onClick={() => latest.mutate()} disabled={!connected || latest.isPending}><CloudUpload />{latestBackup ? '立即更新' : '立即创建'}</button></header>
          <ModuleNotice notice={notice} scope="latest" />
          {latest.error && <p className="module-notice error">{latest.error.message}</p>}
          <div className="backup-module-body latest-backup-body">
            {!connected ? <div className="inline-empty">连接 WebDAV 后可创建最新备份</div> : backups.isLoading ? <div className="inline-empty">正在读取最新备份...</div> : latestBackup ? <BackupTile backup={latestBackup} onRestore={() => setRestoreTarget(latestBackup)} onDownload={() => downloadRemote.mutate(latestBackup.name)} /> : <div className="inline-empty">还没有最新备份</div>}
          </div>
        </section>

        <section className="backup-module version-backup-module">
          <header className="backup-module-head version-module-head"><div><h3>版本备份</h3><p>{versionBackups.length > 0 ? `${versionBackups.length} 个历史版本` : '尚未创建'}</p></div><div className="version-create"><input value={backupName} onChange={(event) => setBackupName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && backupName.trim() && connected && !named.isPending) { event.preventDefault(); named.mutate(backupName.trim()); } }} maxLength={80} placeholder="输入版本名称" aria-label="版本名称" disabled={!connected} /><button className="button" onClick={() => named.mutate(backupName.trim())} disabled={!backupName.trim() || !connected || named.isPending}><FileClock />创建版本</button></div></header>
          <ModuleNotice notice={notice} scope="versions" />
          {named.error && <p className="module-notice error">{named.error.message}</p>}
          <div className="backup-module-body">
            {!connected ? <div className="inline-empty">连接 WebDAV 后可创建版本备份</div> : backups.isLoading ? <div className="inline-empty">正在读取版本备份...</div> : versionBackups.length > 0 ? <div className="backup-grid">{versionBackups.map((backup) => <BackupTile key={backup.name} backup={backup} onRestore={() => setRestoreTarget(backup)} onDownload={() => downloadRemote.mutate(backup.name)} onDelete={() => setDeleteTarget(backup)} />)}</div> : <div className="inline-empty">还没有版本备份</div>}
          </div>
        </section>
      </section>
    </div>
    {importData !== null && <Dialog title="恢复本地备份" onClose={() => setImportData(null)} onSubmit={(event) => { event.preventDefault(); importBackup.mutate(importData); }} submitLabel="备份当前数据并恢复" destructive busy={importBackup.isPending}><p>将使用“{importName}”整体替换当前数据。格式无效或恢复失败时，现有数据不会改变。</p>{importBackup.error && <p className="error-banner">{importBackup.error.message}</p>}</Dialog>}
    {restoreTarget && <Dialog title="恢复云端备份" onClose={() => setRestoreTarget(null)} onSubmit={(event) => { event.preventDefault(); restoreRemote.mutate(restoreTarget.name); }} submitLabel="备份当前数据并恢复" destructive busy={restoreRemote.isPending}><p>将使用“{displayNameFromFile(restoreTarget.name)}”整体替换当前数据，恢复前会自动备份本地数据库。</p>{restoreRemote.error && <p className="error-banner">{restoreRemote.error.message}</p>}</Dialog>}
    {deleteTarget && <Dialog title="删除版本备份" onClose={() => setDeleteTarget(null)} onSubmit={(event) => { event.preventDefault(); deleteRemote.mutate(deleteTarget.name); }} submitLabel="删除备份" destructive busy={deleteRemote.isPending}><p>“{displayNameFromFile(deleteTarget.name)}”将从 WebDAV 永久删除，不影响当前本地数据。</p>{deleteRemote.error && <p className="error-banner">{deleteRemote.error.message}</p>}</Dialog>}
  </section>;
}
