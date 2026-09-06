import { promises as fs } from 'node:fs';
import path from 'node:path';
import { seed } from './seed';
import type { Database } from './types';

const directory = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.TARAZ_DATA_DIR || '.data',
);
const file = path.join(directory, 'taraz.json');
const state = globalThis as unknown as { tarazQueue?: Promise<unknown> };
async function read(): Promise<Database> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const db = seed();
    await save(db);
    return db;
  }
}
async function save(db: Database) {
  await fs.mkdir(directory, { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(temp, file);
}
export function withStore<T>(fn: (db: Database) => T | Promise<T>, write = false): Promise<T> {
  const task = (state.tarazQueue || Promise.resolve()).then(async () => {
    const db = await read();
    const result = await fn(db);
    if (write) await save(db);
    return result;
  });
  state.tarazQueue = task.catch(() => undefined);
  return task;
}
