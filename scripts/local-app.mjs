import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..'),
  runtime = path.join(root, '.runtime'),
  file = path.join(runtime, 'processes.json');
const cmd = process.argv[2] || 'start';
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (cmd === 'status') {
  console.log(
    Object.fromEntries(
      Object.entries(existing).map(([k, v]) => [
        k,
        { pid: v.pid, running: alive(v.pid), url: v.url },
      ]),
    ),
  );
  process.exit(0);
}
if (cmd === 'stop') {
  for (const [name, record] of Object.entries(existing)) {
    if (alive(record.pid)) {
      // Verify the process is still the exact child recorded by this project before stopping its tree.
      const check = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(record.pid)}'; if ($p -and $p.CommandLine.Contains('${root.replaceAll("'", "''")}') -and $p.Name -eq 'node.exe') { Stop-Process -Id $p.ProcessId -Force; Write-Output 'stopped' }`,
        ],
        { windowsHide: true, encoding: 'utf8' },
      );
      console.log(name + ': ' + check.stdout.trim());
    }
  }
  process.exit(0);
}
if (cmd !== 'start') throw new Error('Use start, stop or status');
fs.mkdirSync(runtime, { recursive: true });
for (const [name, args, cwd, url] of [
  ['api', [path.join(root, 'backend/dist/main.js')], root, 'http://127.0.0.1:4000'],
  [
    'web',
    [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1'],
    root,
    'http://localhost:3000',
  ],
]) {
  if (existing[name] && alive(existing[name].pid)) {
    console.log(name + ' already running: ' + existing[name].url);
    continue;
  }
  try {
    const response = await fetch(url + (name === 'api' ? '/api/health' : '/login'), {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      console.log(name + ' already available at ' + url + ' (not started by this script)');
      continue;
    }
  } catch {}
  const log = fs.openSync(path.join(runtime, name + '.log'), 'a');
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  child.unref();
  existing[name] = { pid: child.pid, url };
  fs.closeSync(log);
  console.log(name + ' starting: ' + url);
}
fs.writeFileSync(file, JSON.stringify(existing, null, 2));
