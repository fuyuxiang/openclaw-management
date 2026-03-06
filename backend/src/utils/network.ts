import os from 'node:os';

export function getServerIp(): string {
  if (process.env.SERVER_IP) {
    return process.env.SERVER_IP;
  }

  const interfaces = os.networkInterfaces();
  for (const networkName of Object.keys(interfaces)) {
    const addresses = interfaces[networkName] || [];
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  return '127.0.0.1';
}
