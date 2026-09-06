import { modules, reports } from '../src/lib/modules.ts';
import fs from 'node:fs/promises';
await fs.mkdir(new URL('../backend/src/', import.meta.url), { recursive: true });
await fs.writeFile(
  new URL('../backend/src/catalog.json', import.meta.url),
  JSON.stringify({ modules, reports }, null, 2),
);
