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

export interface SystemResources {
  cpu: {
    usagePercent: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    mountPoint: string;
  };
  docker: {
    totalContainers: number;
    managedContainers: number;
  };
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
