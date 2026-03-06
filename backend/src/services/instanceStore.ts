import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG } from '../config';
import { InstanceMetadata } from '../types';

interface StoreShape {
  instances: Record<string, InstanceMetadata>;
}

const defaultStore: StoreShape = { instances: {} };
let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreFile(): Promise<void> {
  const directory = path.dirname(APP_CONFIG.dataFilePath);
  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.access(APP_CONFIG.dataFilePath);
  } catch {
    await fs.writeFile(APP_CONFIG.dataFilePath, JSON.stringify(defaultStore, null, 2), 'utf-8');
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStoreFile();
  const content = await fs.readFile(APP_CONFIG.dataFilePath, 'utf-8');
  try {
    const parsed = JSON.parse(content) as StoreShape;
    return {
      instances: parsed.instances || {}
    };
  } catch {
    return { ...defaultStore };
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await fs.writeFile(APP_CONFIG.dataFilePath, JSON.stringify(store, null, 2), 'utf-8');
}

export async function initInstanceStore(): Promise<void> {
  await ensureStoreFile();
}

export async function getInstanceMetadataMap(): Promise<Record<string, InstanceMetadata>> {
  const store = await readStore();
  return store.instances;
}

export async function upsertInstanceMetadata(metadata: InstanceMetadata): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    store.instances[metadata.name] = metadata;
    await writeStore(store);
  });

  await writeQueue;
}

export async function removeInstanceMetadata(name: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    delete store.instances[name];
    await writeStore(store);
  });

  await writeQueue;
}
