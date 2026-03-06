import { ApiResponse, ManagedInstance, SystemHealth, SystemResources } from './types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    const message = payload.success ? '请求失败' : payload.error.message;
    const details = !payload.success && payload.error.details ? JSON.stringify(payload.error.details) : '';
    throw new Error(details ? `${message} | ${details}` : message);
  }

  return payload.data;
}

export function getInstances(): Promise<ManagedInstance[]> {
  return request<ManagedInstance[]>('/instances');
}

export function createInstance(name: string): Promise<ManagedInstance> {
  return request<ManagedInstance>('/instances', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

export function deleteInstance(name: string): Promise<{ name: string }> {
  return request<{ name: string }>(`/instances/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
}

export function getInstanceLogs(name: string): Promise<{ name: string; logs: string }> {
  return request<{ name: string; logs: string }>(`/instances/${encodeURIComponent(name)}/logs`);
}

export function getSystemResources(): Promise<SystemResources> {
  return request<SystemResources>('/system/resources');
}

export function getSystemHealth(): Promise<SystemHealth> {
  return request<SystemHealth>('/system/health');
}
