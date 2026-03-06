import os from 'node:os';
import { APP_CONFIG } from '../config';
import { SystemHealth, SystemResources } from '../types';
import { runCommand } from '../utils/command';
import {
  checkDockerAvailable,
  checkImageExists,
  getDockerTotalContainerCount,
  listManagedInstances
} from './dockerService';

function readCpuTimes() {
  return os.cpus().map((cpu) => cpu.times);
}

async function getCpuUsagePercent(sampleMs = 200): Promise<number> {
  const start = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = readCpuTimes();

  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < start.length; i += 1) {
    const s = start[i];
    const e = end[i];

    const startIdle = s.idle;
    const endIdle = e.idle;

    const startTotal = s.user + s.nice + s.sys + s.idle + s.irq;
    const endTotal = e.user + e.nice + e.sys + e.idle + e.irq;

    idleDiff += endIdle - startIdle;
    totalDiff += endTotal - startTotal;
  }

  if (totalDiff <= 0) {
    return 0;
  }

  const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
  return Number(usage.toFixed(2));
}

async function getDiskResources(): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number; mountPoint: string }> {
  const result = await runCommand('df', ['-kP', '/']);
  const lines = result.stdout.split('\n').filter(Boolean);
  if (lines.length < 2) {
    throw new Error('无法解析磁盘信息');
  }

  const fields = lines[1].trim().split(/\s+/);
  const totalKb = Number(fields[1]);
  const usedKb = Number(fields[2]);
  const freeKb = Number(fields[3]);
  const usagePercent = Number((fields[4] || '0%').replace('%', ''));
  const mountPoint = fields[5] || '/';

  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    freeBytes: freeKb * 1024,
    usagePercent,
    mountPoint
  };
}

function getMemoryResources() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const usagePercent = Number(((usedBytes / totalBytes) * 100).toFixed(2));

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usagePercent
  };
}

export async function getSystemResources(): Promise<SystemResources> {
  const [cpuUsage, memory, disk] = await Promise.all([
    getCpuUsagePercent(),
    Promise.resolve(getMemoryResources()),
    getDiskResources()
  ]);

  const warnings: string[] = [];
  let totalContainers = 0;
  let managedContainerCount = 0;

  try {
    const [dockerCount, managedInstances] = await Promise.all([
      getDockerTotalContainerCount(),
      listManagedInstances()
    ]);
    totalContainers = dockerCount;
    managedContainerCount = managedInstances.length;
  } catch {
    warnings.push('Docker 不可用，容器统计信息暂时无法获取');
  }

  if (memory.usagePercent >= APP_CONFIG.thresholds.memoryPercent) {
    warnings.push(`内存使用率过高 (${memory.usagePercent}%)`);
  }
  if (disk.usagePercent >= APP_CONFIG.thresholds.diskPercent) {
    warnings.push(`磁盘使用率过高 (${disk.usagePercent}%)`);
  }

  return {
    cpu: {
      usagePercent: cpuUsage
    },
    memory,
    disk,
    docker: {
      totalContainers,
      managedContainers: managedContainerCount
    },
    warnings
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const [dockerAvailable, resources] = await Promise.all([checkDockerAvailable(), getSystemResources()]);
  const imageAvailable = dockerAvailable ? await checkImageExists(APP_CONFIG.imageName) : false;

  const reasons: string[] = [];

  if (!dockerAvailable) {
    reasons.push('Docker 服务不可用，请检查 Docker daemon');
  }
  if (!imageAvailable) {
    reasons.push(`镜像不存在: ${APP_CONFIG.imageName}`);
  }
  if (resources.memory.usagePercent >= APP_CONFIG.thresholds.memoryPercent) {
    reasons.push(`内存使用率超过阈值 ${APP_CONFIG.thresholds.memoryPercent}%`);
  }
  if (resources.disk.usagePercent >= APP_CONFIG.thresholds.diskPercent) {
    reasons.push(`磁盘使用率超过阈值 ${APP_CONFIG.thresholds.diskPercent}%`);
  }

  return {
    canCreate: reasons.length === 0,
    reasons,
    dockerAvailable,
    imageAvailable,
    resources
  };
}
