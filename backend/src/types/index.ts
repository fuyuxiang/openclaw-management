export type InstanceStatus =
  | 'created'
  | 'running'
  | 'restarting'
  | 'removing'
  | 'paused'
  | 'exited'
  | 'dead'
  | 'unknown';

export interface ManagedInstance {
  name: string;
  containerId: string;
  image: string;
  status: InstanceStatus;
  port: number | null;
  accessUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  uptime: string;
  labels: Record<string, string>;
}

export interface InstanceMetadata {
  name: string;
  createdAt: string;
  note?: string;
}

export interface CpuResources {
  usagePercent: number;
}

export interface MemoryResources {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface DiskResources {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
  mountPoint: string;
}

export interface DockerResources {
  totalContainers: number;
  managedContainers: number;
}

export interface SystemResources {
  cpu: CpuResources;
  memory: MemoryResources;
  disk: DiskResources;
  docker: DockerResources;
  warnings: string[];
}

export interface SystemHealth {
  canCreate: boolean;
  reasons: string[];
  dockerAvailable: boolean;
  imageAvailable: boolean;
  resources: SystemResources;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
