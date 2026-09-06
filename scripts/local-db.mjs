import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
const data = path.join(runtime, 'pgdata');
const bin = path.join(runtime, 'pgsql', 'bin');
const command = process.argv[2] || 'start';
const exists = async (p) =>
  fs.access(p).then(
    () => true,
    () => false,
  );
async function run(exe, args, env = {}, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (output += b));
    child.on('error', reject);
    child.on('exit', (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      code === 0
        ? resolve(output)
        : reject(new Error(`${path.basename(exe)} failed (${code}): ${output}`));
    });
    child.stdin.end(input);
  });
}
await fs.mkdir(runtime, { recursive: true });
if (command === 'setup' && !(await exists(path.join(bin, 'pg_ctl.exe')))) {
  const zip = path.join(runtime, 'postgresql-18.6.zip');
  if (!(await exists(zip))) {
    console.log('Downloading PostgreSQL 18.6 Windows binaries from EDB…');
    const response = await fetch('https://sbp.enterprisedb.com/getfile.jsp?fileid=1260488');
    if (!response.ok || !response.body) throw new Error(`EDB download failed: ${response.status}`);
    await pipeline(response.body, createWriteStream(zip));
  }
  console.log('Extracting PostgreSQL…');
  await run('tar.exe', ['-xf', zip, '-C', runtime]);
}
if (!(await exists(path.join(bin, 'pg_ctl.exe')))) throw new Error('Run npm run db:setup first.');
if (command === 'stop') {
  try {
    console.log(await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'stop', '-m', 'fast', '-w']));
  } catch (error) {
    console.log(error.message);
  }
  process.exit(0);
}
if (command === 'status') {
  console.log(await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'status']));
  process.exit(0);
}
const credentialsFile = path.join(runtime, 'local-credentials.json');
let credentials;
if (await exists(credentialsFile))
  credentials = JSON.parse(await fs.readFile(credentialsFile, 'utf8'));
else {
  credentials = {
    databasePassword: randomBytes(24).toString('hex'),
    appPassword: randomBytes(24).toString('hex'),
    adminEmail: 'owner@taraz.local',
    adminPassword: randomBytes(18).toString('base64url'),
    encryptionKey: randomBytes(32).toString('hex'),
  };
  await fs.writeFile(credentialsFile, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}
if (!(await exists(path.join(data, 'PG_VERSION')))) {
  const pwfile = path.join(runtime, 'init-password');
  await fs.writeFile(pwfile, credentials.databasePassword, { mode: 0o600 });
  try {
    console.log(
      await run(path.join(bin, 'initdb.exe'), [
        '-D',
        data,
        '-U',
        'postgres',
        '--encoding=UTF8',
        '--locale=C',
        '--auth=scram-sha-256',
        `--pwfile=${pwfile}`,
      ]),
    );
  } finally {
    await fs.unlink(pwfile);
  }
  await fs.appendFile(
    path.join(data, 'postgresql.conf'),
    "\nlisten_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 80\nshared_buffers = '128MB'\n",
  );
}
let running = false;
try {
  await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'status']);
  running = true;
} catch {}
if (!running)
  console.log(
    await run(path.join(bin, 'pg_ctl.exe'), [
      '-D',
      data,
      '-l',
      path.join(runtime, 'postgres.log'),
      'start',
      '-w',
    ]),
  );
if (command === 'setup') {
  const pgArgs = [
    '-h',
    '127.0.0.1',
    '-p',
    '55432',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
  ];
  const pgEnv = { PGPASSWORD: credentials.databasePassword };
  const pg = (sql) => run(path.join(bin, 'psql.exe'), pgArgs, pgEnv, sql);
  if (!(await pg("SELECT 1 FROM pg_roles WHERE rolname='taraz_app';")).trim())
    await pg(
      `CREATE ROLE taraz_app LOGIN PASSWORD '${credentials.appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;`,
    );
  if (!(await pg("SELECT 1 FROM pg_database WHERE datname='taraz';")).trim())
    await pg('CREATE DATABASE taraz OWNER taraz_app;');
  const envFile = path.join(root, 'backend', '.env');
  if (!(await exists(envFile)))
    await fs.writeFile(
      envFile,
      `DATABASE_URL=postgresql://taraz_app:${credentials.appPassword}@127.0.0.1:55432/taraz\nAPI_PORT=4000\nWEB_ORIGIN=http://localhost:3000\nENCRYPTION_KEY=${credentials.encryptionKey}\nSUPER_ADMIN_EMAIL=${credentials.adminEmail}\nSUPER_ADMIN_PASSWORD=${credentials.adminPassword}\nINTEGRATION_MODE=sandbox\n`,
    );
  console.log(
    'Database ready. Local owner credentials: .runtime/local-credentials.json (excluded from Git).',
  );
} else console.log('PostgreSQL is running at 127.0.0.1:55432.');
