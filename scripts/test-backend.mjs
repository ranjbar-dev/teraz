import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'),
  require = createRequire(path.join(root, 'backend/package.json')),
  { Client } = require('pg');
const creds = JSON.parse(
  fs.readFileSync(path.join(root, '.runtime/local-credentials.json'), 'utf8'),
);
const database = 'taraz_test_' + Date.now();
const envText = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const databaseUrl = new URL(
  envText
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .replaceAll('"', '')
    .trim(),
);
// Use the local PostgreSQL administrator only to provision the isolated test database.
const admin = new Client({
  host: '127.0.0.1',
  port: 55432,
  user: 'postgres',
  password: creds.databasePassword,
  database: 'postgres',
});
await admin.connect();
await admin.query(`CREATE DATABASE "${database}" OWNER taraz_app`);
await admin.end();
databaseUrl.pathname = '/' + database;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl.href,
  API_PORT: '4001',
  WEB_ORIGIN: 'http://localhost:3100',
  SUPER_ADMIN_EMAIL: 'owner@test.taraz.local',
  SUPER_ADMIN_PASSWORD: randomBytes(24).toString('base64url'),
  ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const c = spawn(process.execPath, args, {
      cwd: path.join(root, 'backend'),
      env,
      windowsHide: true,
      stdio: 'inherit',
    });
    c.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Command failed: ' + args.join(' '))),
    );
  });
let server;
try {
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run(['node_modules/tsx/dist/cli.mjs', 'src/seed.ts']);
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.join(root, 'backend'),
    env,
    windowsHide: true,
    stdio: [
      'ignore',
      fs.openSync(path.join(root, '.runtime/test-api.log'), 'a'),
      fs.openSync(path.join(root, '.runtime/test-api.log'), 'a'),
    ],
  });
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4001/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  await run(['node_modules/tsx/dist/cli.mjs', '--test', 'tests/accounting.test.ts']);
  if (process.argv.includes('--browser')) await run(['../tests/backend-browser.mjs']);
} finally {
  server?.kill();
  fs.writeFileSync(
    path.join(root, '.runtime/last-test-db.json'),
    JSON.stringify({ database, createdAt: new Date().toISOString() }),
  );
  console.log('Isolated test database retained for inspection: ' + database);
}
