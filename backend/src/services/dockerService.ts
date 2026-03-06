import { APP_CONFIG } from '../config';
import { ManagedInstance } from '../types';
import { findNextAvailablePort } from '../utils/port';
import { runCommand } from '../utils/command';
import { AppError } from '../utils/errors';
import { getServerIp } from '../utils/network';
import { normalizeInstanceName, validateInstanceName } from '../utils/validators';
import { getInstanceMetadataMap, removeInstanceMetadata, upsertInstanceMetadata } from './instanceStore';

interface DockerInspectResult {
  Id: string;
  Name: string;
  Created: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
  };
  State?: {
    Status?: ManagedInstance['status'];
    StartedAt?: string;
  };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostPort: string }> | null>;
  };
}

interface DockerCommandOptions {
  allowNonZeroExit?: boolean;
}

let createLock: Promise<void> = Promise.resolve();

async function withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const task = createLock.then(fn, fn);
  createLock = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

async function docker(args: string[], options: DockerCommandOptions = {}) {
  return runCommand('docker', args, {
    timeoutMs: 30000,
    allowNonZeroExit: options.allowNonZeroExit
  });
}

function isManagedLabels(labels?: Record<string, string>): boolean {
  return (
    labels?.app === APP_CONFIG.managedLabels.app && labels?.service === APP_CONFIG.managedLabels.service
  );
}

function parseInspect(stdout: string): DockerInspectResult | null {
  const parsed = JSON.parse(stdout) as DockerInspectResult[];
  return parsed[0] || null;
}

function normalizeTimestamp(value?: string): string | null {
  if (!value || value.startsWith('0001-01-01')) {
    return null;
  }
  return value;
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) {
    return '-';
  }

  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) {
    return '-';
  }

  let diff = Math.floor((Date.now() - start.getTime()) / 1000);
  if (diff < 0) {
    diff = 0;
  }

  const days = Math.floor(diff / 86400);
  diff %= 86400;
  const hours = Math.floor(diff / 3600);
  diff %= 3600;
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function mapInspectToInstance(inspect: DockerInspectResult, createdAtOverride?: string): ManagedInstance {
  const name = inspect.Name?.replace(/^\//, '') || 'unknown';
  const portKey = `${APP_CONFIG.containerPort}/tcp`;
  const hostPort = inspect.NetworkSettings?.Ports?.[portKey]?.[0]?.HostPort;
  const parsedPort = hostPort ? Number(hostPort) : null;
  const startedAt = normalizeTimestamp(inspect.State?.StartedAt);
  const createdAt = createdAtOverride || inspect.Created || new Date().toISOString();

  return {
    name,
    containerId: inspect.Id?.slice(0, 12) || '',
    image: inspect.Config?.Image || APP_CONFIG.imageName,
    status: inspect.State?.Status || 'unknown',
    port: parsedPort,
    accessUrl: parsedPort ? `http://${getServerIp()}:${parsedPort}` : null,
    createdAt,
    startedAt,
    uptime: formatDuration(startedAt),
    labels: inspect.Config?.Labels || {}
  };
}

async function getManagedContainerNames(): Promise<string[]> {
  const result = await docker([
    'ps',
    '-a',
    '--filter',
    `label=app=${APP_CONFIG.managedLabels.app}`,
    '--filter',
    `label=service=${APP_CONFIG.managedLabels.service}`,
    '--format',
    '{{.Names}}'
  ]);

  if (!result.stdout) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function inspectContainer(name: string): Promise<DockerInspectResult | null> {
  const inspectResult = await docker(['inspect', name], { allowNonZeroExit: true });
  if (inspectResult.code !== 0 || !inspectResult.stdout) {
    return null;
  }

  return parseInspect(inspectResult.stdout);
}

async function getContainerByName(name: string): Promise<{ exists: boolean; managed: boolean; inspect: DockerInspectResult | null }> {
  const inspect = await inspectContainer(name);
  if (!inspect) {
    return { exists: false, managed: false, inspect: null };
  }

  return {
    exists: true,
    managed: isManagedLabels(inspect.Config?.Labels),
    inspect
  };
}

export async function checkDockerAvailable(): Promise<boolean> {
  const result = await docker(['info'], { allowNonZeroExit: true });
  return result.code === 0;
}

export async function checkImageExists(imageName = APP_CONFIG.imageName): Promise<boolean> {
  const result = await docker(['image', 'inspect', imageName], { allowNonZeroExit: true });
  return result.code === 0;
}

export async function getDockerTotalContainerCount(): Promise<number> {
  const result = await docker(['ps', '-a', '--format', '{{.ID}}']);
  if (!result.stdout) {
    return 0;
  }
  return result.stdout.split('\n').filter(Boolean).length;
}

export async function listManagedInstances(): Promise<ManagedInstance[]> {
  const [names, metadataMap] = await Promise.all([getManagedContainerNames(), getInstanceMetadataMap()]);

  const inspections = await Promise.all(names.map((name) => inspectContainer(name)));
  const instances = inspections
    .filter((inspect): inspect is DockerInspectResult => Boolean(inspect))
    .map((inspect) => {
      const name = inspect.Name?.replace(/^\//, '') || '';
      const meta = metadataMap[name];
      return mapInspectToInstance(inspect, meta?.createdAt);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return instances;
}

export async function createManagedInstance(rawName: string): Promise<ManagedInstance> {
  const normalizedName = normalizeInstanceName(rawName);
  const validationError = validateInstanceName(normalizedName);
  if (validationError) {
    throw new AppError(400, 'INVALID_INSTANCE_NAME', validationError);
  }

  const [dockerAvailable, imageAvailable] = await Promise.all([
    checkDockerAvailable(),
    checkImageExists(APP_CONFIG.imageName)
  ]);
  if (!dockerAvailable) {
    throw new AppError(503, 'DOCKER_UNAVAILABLE', 'Docker 服务不可用，无法创建实例');
  }
  if (!imageAvailable) {
    throw new AppError(400, 'IMAGE_NOT_FOUND', `镜像不存在: ${APP_CONFIG.imageName}`);
  }

  return withCreateLock(async () => {
    const existing = await getContainerByName(normalizedName);
    if (existing.exists) {
      throw new AppError(409, 'INSTANCE_NAME_CONFLICT', `容器名称已存在: ${normalizedName}`);
    }

    const instances = await listManagedInstances();
    const usedPorts = new Set(instances.map((item) => item.port).filter((port): port is number => port !== null));
    const nextPort = await findNextAvailablePort(APP_CONFIG.startingPort, usedPorts);

    const runResult = await docker(
      [
        'run',
        '-d',
        '--name',
        normalizedName,
        '--restart',
        'unless-stopped',
        '--label',
        `app=${APP_CONFIG.managedLabels.app}`,
        '--label',
        `service=${APP_CONFIG.managedLabels.service}`,
        '-p',
        `${nextPort}:${APP_CONFIG.containerPort}`,
        APP_CONFIG.imageName
      ],
      { allowNonZeroExit: true }
    );

    if (runResult.code !== 0) {
      throw new AppError(500, 'CREATE_INSTANCE_FAILED', '创建实例失败', {
        stderr: runResult.stderr,
        stdout: runResult.stdout
      });
    }

    const inspect = await inspectContainer(normalizedName);
    if (!inspect) {
      throw new AppError(500, 'INSPECT_FAILED', '容器已创建但获取信息失败，请手动检查 Docker 状态');
    }

    await upsertInstanceMetadata({
      name: normalizedName,
      createdAt: inspect.Created || new Date().toISOString()
    });

    return mapInspectToInstance(inspect);
  });
}

export async function deleteManagedInstance(rawName: string): Promise<void> {
  const normalizedName = normalizeInstanceName(rawName);
  const validationError = validateInstanceName(normalizedName);
  if (validationError) {
    throw new AppError(400, 'INVALID_INSTANCE_NAME', validationError);
  }

  const lookup = await getContainerByName(normalizedName);
  if (!lookup.exists) {
    throw new AppError(404, 'INSTANCE_NOT_FOUND', `容器不存在: ${normalizedName}`);
  }
  if (!lookup.managed) {
    throw new AppError(403, 'INSTANCE_NOT_MANAGED', `容器 ${normalizedName} 不属于 OpenClaw 管理范围`);
  }

  const stopResult = await docker(['stop', normalizedName], { allowNonZeroExit: true });
  if (stopResult.code !== 0 && !/is not running/i.test(stopResult.stderr)) {
    throw new AppError(500, 'STOP_INSTANCE_FAILED', `停止容器失败: ${normalizedName}`, {
      stderr: stopResult.stderr,
      stdout: stopResult.stdout
    });
  }

  const rmResult = await docker(['rm', normalizedName], { allowNonZeroExit: true });
  if (rmResult.code !== 0) {
    if (/No such container/i.test(rmResult.stderr)) {
      throw new AppError(404, 'INSTANCE_NOT_FOUND', `容器不存在: ${normalizedName}`);
    }

    throw new AppError(500, 'REMOVE_INSTANCE_FAILED', `删除容器失败: ${normalizedName}`, {
      stderr: rmResult.stderr,
      stdout: rmResult.stdout
    });
  }

  await removeInstanceMetadata(normalizedName);
}

export async function getManagedInstanceLogs(rawName: string, tail = 100): Promise<string> {
  const normalizedName = normalizeInstanceName(rawName);
  const lookup = await getContainerByName(normalizedName);

  if (!lookup.exists) {
    throw new AppError(404, 'INSTANCE_NOT_FOUND', `容器不存在: ${normalizedName}`);
  }
  if (!lookup.managed) {
    throw new AppError(403, 'INSTANCE_NOT_MANAGED', `容器 ${normalizedName} 不属于 OpenClaw 管理范围`);
  }

  const result = await docker(['logs', '--tail', String(tail), normalizedName], {
    allowNonZeroExit: true
  });

  if (result.code !== 0) {
    throw new AppError(500, 'READ_LOGS_FAILED', `读取日志失败: ${normalizedName}`, {
      stderr: result.stderr,
      stdout: result.stdout
    });
  }

  const content = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return content || '(暂无日志输出)';
}
