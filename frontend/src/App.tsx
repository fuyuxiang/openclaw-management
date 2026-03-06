import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createInstance,
  deleteInstance,
  getInstanceLogs,
  getInstances,
  getSystemHealth,
  getSystemResources
} from './api';
import { InstanceStatus, ManagedInstance, SystemHealth, SystemResources } from './types';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertState {
  type: AlertType;
  message: string;
}

interface LogModalState {
  open: boolean;
  name: string;
  logs: string;
  loading: boolean;
  error: string | null;
}

const STATUS_OPTIONS: Array<{ label: string; value: 'all' | InstanceStatus }> = [
  { label: '全部状态', value: 'all' },
  { label: 'running', value: 'running' },
  { label: 'exited', value: 'exited' },
  { label: 'restarting', value: 'restarting' },
  { label: 'paused', value: 'paused' }
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function validateName(value: string): string | null {
  if (!value) return null;
  if (!/^[a-z0-9-]*$/.test(value)) {
    return '只能包含英文、数字和连字符 -';
  }
  if (value.startsWith('-') || value.endsWith('-')) {
    return '不能以连字符开头或结尾';
  }
  if (value.length > 30) {
    return '长度不能超过 30 位';
  }
  if (value.length > 0 && value.length < 3) {
    return '长度至少 3 位';
  }
  return null;
}

function getStatusClass(status: InstanceStatus): string {
  switch (status) {
    case 'running':
      return 'status-running';
    case 'exited':
      return 'status-exited';
    case 'restarting':
      return 'status-restarting';
    default:
      return 'status-default';
  }
}

export default function App() {
  const [instances, setInstances] = useState<ManagedInstance[]>([]);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InstanceStatus>('all');

  const [alert, setAlert] = useState<AlertState | null>(null);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);

  const [logModal, setLogModal] = useState<LogModalState>({
    open: false,
    name: '',
    logs: '',
    loading: false,
    error: null
  });

  const loadDashboard = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setRefreshing(true);
        }

        const [instanceData, resourceData, healthData] = await Promise.all([
          getInstances(),
          getSystemResources(),
          getSystemHealth()
        ]);

        setInstances(instanceData);
        setResources(resourceData);
        setHealth(healthData);
      } catch (error) {
        const message = error instanceof Error ? error.message : '拉取数据失败';
        setAlert({ type: 'error', message });
      } finally {
        setDashboardLoading(false);
        setRefreshing(false);
      }
    },
    [setInstances, setResources, setHealth]
  );

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(() => {
      loadDashboard(true);
    }, 10000);

    return () => clearInterval(timer);
  }, [loadDashboard]);

  const filteredInstances = useMemo(() => {
    return instances.filter((instance) => {
      const matchesStatus = statusFilter === 'all' || instance.status === statusFilter;
      const matchesSearch = instance.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [instances, statusFilter, search]);

  const canSubmit =
    !creating &&
    nameInput.length >= 3 &&
    nameInput.length <= 30 &&
    !nameError &&
    Boolean(health?.canCreate);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = nameInput.trim().toLowerCase();
    const validation = validateName(normalized);
    setNameError(validation);

    if (validation || normalized.length < 3 || normalized.length > 30) {
      return;
    }

    setCreating(true);
    try {
      const created = await createInstance(normalized);
      setAlert({ type: 'success', message: `实例创建成功：${created.name}` });
      setLastCreatedUrl(created.accessUrl || null);
      setNameInput('');
      setNameError(null);
      await loadDashboard(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建实例失败';
      setAlert({ type: 'error', message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name: string) {
    const confirmed = window.confirm(`确认删除实例 \"${name}\" 吗？\n删除后会停止并移除对应 Docker 容器。`);
    if (!confirmed) {
      return;
    }

    setDeletingName(name);
    try {
      await deleteInstance(name);
      setAlert({ type: 'success', message: `实例已删除：${name}` });
      await loadDashboard(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : `删除实例失败：${name}`;
      setAlert({ type: 'error', message });
    } finally {
      setDeletingName(null);
    }
  }

  async function handleOpenLogs(name: string) {
    setLogModal({
      open: true,
      name,
      logs: '',
      loading: true,
      error: null
    });

    try {
      const result = await getInstanceLogs(name);
      setLogModal({
        open: true,
        name,
        logs: result.logs,
        loading: false,
        error: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '日志读取失败';
      setLogModal({
        open: true,
        name,
        logs: '',
        loading: false,
        error: message
      });
    }
  }

  function closeLogs() {
    setLogModal({ open: false, name: '', logs: '', loading: false, error: null });
  }

  async function handleCopy(url: string | null) {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setAlert({ type: 'success', message: `已复制访问地址：${url}` });
    } catch {
      setAlert({ type: 'error', message: `复制失败，请手动复制：${url}` });
    }
  }

  function onNameInputChange(value: string) {
    const normalized = value.toLowerCase();
    setNameInput(normalized);
    setNameError(validateName(normalized));
  }

  return (
    <div className="page">
      <div className="page-bg" />
      <main className="container">
        <header className="header">
          <div>
            <h1>OpenClaw 多实例管理后台</h1>
            <p>管理 Linux 服务器上的 OpenClaw Docker 实例</p>
          </div>
          <button className="btn secondary" onClick={() => loadDashboard()} disabled={refreshing || dashboardLoading}>
            {refreshing ? '刷新中...' : '立即刷新'}
          </button>
        </header>

        {alert && <div className={`alert ${alert.type}`}>{alert.message}</div>}

        {dashboardLoading ? (
          <section className="panel loading">正在加载管理数据...</section>
        ) : (
          <>
            <section className="resource-grid">
              <article className="panel resource-card">
                <h3>CPU 使用率</h3>
                <p className="resource-value">{resources?.cpu.usagePercent.toFixed(2)}%</p>
              </article>
              <article className="panel resource-card">
                <h3>内存</h3>
                <p className="resource-value">{resources?.memory.usagePercent.toFixed(2)}%</p>
                <p className="resource-sub">
                  {formatBytes(resources?.memory.usedBytes || 0)} / {formatBytes(resources?.memory.totalBytes || 0)}
                </p>
              </article>
              <article className="panel resource-card">
                <h3>磁盘 ({resources?.disk.mountPoint || '/'})</h3>
                <p className="resource-value">{resources?.disk.usagePercent.toFixed(2)}%</p>
                <p className="resource-sub">
                  {formatBytes(resources?.disk.usedBytes || 0)} / {formatBytes(resources?.disk.totalBytes || 0)}
                </p>
              </article>
              <article className="panel resource-card">
                <h3>Docker 容器</h3>
                <p className="resource-value">{resources?.docker.totalContainers || 0}</p>
                <p className="resource-sub">OpenClaw: {resources?.docker.managedContainers || 0}</p>
              </article>
            </section>

            {resources?.warnings?.length ? (
              <section className="panel warning-list">
                <h3>资源告警</h3>
                {resources.warnings.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </section>
            ) : null}

            <section className="panel create-panel">
              <h2>创建实例</h2>
              <form onSubmit={handleCreate} className="create-form">
                <label htmlFor="instance-name">专属小龙虾名字</label>
                <input
                  id="instance-name"
                  value={nameInput}
                  onChange={(e) => onNameInputChange(e.target.value)}
                  placeholder="例如：claw001"
                  maxLength={30}
                />
                <small>仅支持英文字母、数字、连字符 - ，长度 3~30，自动转小写</small>
                {nameError ? <div className="field-error">{nameError}</div> : null}

                <button className="btn primary" type="submit" disabled={!canSubmit}>
                  {creating ? '创建中...' : '创建实例'}
                </button>
              </form>

              {health && !health.canCreate ? (
                <div className="blocked-box">
                  <strong>当前不建议继续创建实例：</strong>
                  <ul>
                    {health.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {lastCreatedUrl ? (
                <div className="success-url">
                  <span>最新访问地址：{lastCreatedUrl}</span>
                  <button className="btn secondary" onClick={() => handleCopy(lastCreatedUrl)}>
                    一键复制
                  </button>
                </div>
              ) : null}
            </section>

            <section className="panel table-panel">
              <div className="table-toolbar">
                <h2>实例列表</h2>
                <div className="table-tools">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="按名称搜索"
                  />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | InstanceStatus)}>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>状态</th>
                      <th>容器ID</th>
                      <th>镜像</th>
                      <th>端口</th>
                      <th>访问地址</th>
                      <th>创建时间</th>
                      <th>运行时长</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInstances.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-cell">
                          暂无匹配实例
                        </td>
                      </tr>
                    ) : (
                      filteredInstances.map((instance) => (
                        <tr key={instance.name}>
                          <td>{instance.name}</td>
                          <td>
                            <span className={`status ${getStatusClass(instance.status)}`}>{instance.status}</span>
                          </td>
                          <td>{instance.containerId || '-'}</td>
                          <td>{instance.image}</td>
                          <td>{instance.port ?? '-'}</td>
                          <td>
                            {instance.accessUrl ? (
                              <div className="url-cell">
                                <a href={instance.accessUrl} target="_blank" rel="noreferrer">
                                  {instance.accessUrl}
                                </a>
                                <button className="mini-btn" onClick={() => handleCopy(instance.accessUrl)}>
                                  复制
                                </button>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>{formatTime(instance.createdAt)}</td>
                          <td>{instance.uptime}</td>
                          <td>
                            <div className="action-group">
                              <button className="mini-btn" onClick={() => handleOpenLogs(instance.name)}>
                                日志
                              </button>
                              <button className="mini-btn" onClick={() => loadDashboard()}>
                                刷新
                              </button>
                              <button
                                className="mini-btn danger"
                                onClick={() => handleDelete(instance.name)}
                                disabled={deletingName === instance.name}
                              >
                                {deletingName === instance.name ? '删除中' : '删除'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {logModal.open ? (
        <div className="modal-backdrop" onClick={closeLogs}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>实例日志: {logModal.name}</h3>
              <button className="mini-btn" onClick={closeLogs}>
                关闭
              </button>
            </div>

            {logModal.loading ? <p>日志加载中...</p> : null}
            {logModal.error ? <p className="field-error">日志读取失败：{logModal.error}</p> : null}
            {!logModal.loading && !logModal.error ? <pre>{logModal.logs}</pre> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
