import net from 'node:net';
import { AppError } from './errors';

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '0.0.0.0');
  });
}

export async function findNextAvailablePort(startPort: number, usedPorts: Set<number>): Promise<number> {
  const maxPort = 65535;
  for (let port = startPort; port <= maxPort; port += 1) {
    if (usedPorts.has(port)) {
      continue;
    }

    // Double check system-level port occupancy to avoid conflict with non-managed services.
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }

  throw new AppError(507, 'NO_PORT_AVAILABLE', '没有可用端口可用于创建新实例');
}
