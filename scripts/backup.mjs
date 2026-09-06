import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..'),
  runtime = path.join(root, '.runtime'),
  bin = path.join(runtime, 'pgsql/bin');
const text = await fs.readFile(path.join(root, 'backend/.env'), 'utf8');
const url = new URL(
  text
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .replaceAll('"', '')
    .trim(),
);
const mode = process.argv[2] || 'create';
const run = (exe, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(path.join(bin, exe), args, {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (output += b));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(output))));
  });
const appEnv = {
  PGHOST: url.hostname,
  PGPORT: url.port,
  PGUSER: url.username,
  PGPASSWORD: decodeURIComponent(url.password),
};
if (mode === 'create') {
  const destination = path.join(
    runtime,
    'backups',
    new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
  );
  await fs.mkdir(destination, { recursive: true });
  await run(
    'pg_dump.exe',
    ['-Fc', '--no-owner', '--file', path.join(destination, 'database.dump'), url.pathname.slice(1)],
    appEnv,
  );
  try {
    await fs.cp(path.join(root, 'backend/uploads'), path.join(destination, 'uploads'), {
      recursive: true,
      errorOnExist: true,
    });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await fs.writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(
      {
        createdAt: new Date(),
        database: url.pathname.slice(1),
        format: 'postgres-custom',
        postgres: '18.6',
        encryptionKeyIncluded: false,
      },
      null,
      2,
    ),
  );
  console.log('Backup created: ' + destination);
} else if (mode === 'restore') {
  if (!process.argv[3])
    throw new Error('Pass an existing backup folder. Restore always creates a new database.');
  const source = path.resolve(process.argv[3]);
  const backupRoot = path.join(runtime, 'backups');
  if (!source.startsWith(backupRoot + path.sep))
    throw new Error('Restore source must be inside this project .runtime/backups.');
  await fs.access(path.join(source, 'database.dump'));
  const database = 'taraz_restore_' + Date.now();
  const credentials = JSON.parse(
    await fs.readFile(path.join(runtime, 'local-credentials.json'), 'utf8'),
  );
  const adminEnv = { ...appEnv, PGUSER: 'postgres', PGPASSWORD: credentials.databasePassword };
  await run('createdb.exe', ['--owner', 'taraz_app', database], adminEnv);
  await run(
    'pg_restore.exe',
    ['--no-owner', '--exit-on-error', '--dbname', database, path.join(source, 'database.dump')],
    appEnv,
  );
  console.log('Restored into NEW database: ' + database);
  console.log(
    'Original database and attachments were preserved. To switch, update DATABASE_URL and use the matching uploads copy and encryption key.',
  );
} else throw new Error('Use create or restore <backup-folder>.');
