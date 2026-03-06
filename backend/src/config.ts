import path from 'node:path';

export const APP_CONFIG = {
  port: Number(process.env.PORT || 3001),
  imageName: process.env.OPENCLAW_IMAGE || 'openclaw-zh:local',
  containerPort: 18789,
  startingPort: 18789,
  managedLabels: {
    app: 'openclaw-manager',
    service: 'openclaw'
  },
  thresholds: {
    memoryPercent: 85,
    diskPercent: 90
  },
  dataFilePath: path.resolve(process.cwd(), 'data', 'instances.json')
} as const;

export const NAME_RULE = {
  minLength: 3,
  maxLength: 30,
  regex: /^[a-z0-9-]+$/
} as const;
