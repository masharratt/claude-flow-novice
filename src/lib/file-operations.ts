// Stub: file operations utilities
// Created to satisfy test imports

import { promises as fs } from 'fs';
import { join } from 'path';

export async function ensureDir(path: string): Promise<void> {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // Ignore if doesn't exist
  }
}
