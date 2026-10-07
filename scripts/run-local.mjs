import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backendDir = resolve(root, 'assis-backend');
const frontendDir = resolve(root, 'assis-workspace');
const publicDir = resolve(root, 'assis-mvp');
const envFile = resolve(backendDir, '.env.local');
const pdfDir = resolve(frontendDir, 'public/demo/pearl-delta');
const ports = { frontend: 8788, backend: 8789 };
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.ico', 'image/x-icon'],
  ['.pdf', 'application/pdf'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'], ['.txt', 'text/plain; charset=utf-8'], ['.xml', 'application/xml; charset=utf-8'],
]);

function say(message) { process.stdout.write(`${message}\n`); }
function fail(message) { process.stderr.write(`\nDukkan: ${message}\n`); process.exitCode = 1; }

function nodeVersionOk() {
  const [major] = process.versions.node.split('.').map(Number);
  return major >= 24;
}

function configCheck() {
  if (!existsSync(envFile)) return 'Backend settings are missing. Copy assis-backend/.env.example to assis-backend/.env.local, add your provider key, then run npm run check.';
  const script = [
    "const p=process.env.DIKAN_PROVIDER||process.env.ASSIS_MODEL||'none';",
    "if(!['none','openai','openrouter','siliconflow'].includes(p))process.exit(2);",
    "if(p==='openai'&&!process.env.OPENAI_API_KEY?.trim())process.exit(6);",
    "if(p==='openrouter'&&(!process.env.OPENROUTER_API_KEY?.trim()||!process.env.OPENROUTER_MODEL?.trim()))process.exit(3);",
    "if(p==='siliconflow'&&(!process.env.SILICONFLOW_API_KEY?.trim()||!process.env.SILICONFLOW_MODEL?.trim()||!['https://api.siliconflow.cn/v1','https://api.siliconflow.com/v1'].includes((process.env.SILICONFLOW_BASE_URL||'').replace(/\\/$/,''))))process.exit(4);",
    "if((process.env.ASSIS_PORT||'8789')!=='8789')process.exit(5);",
  ].join('');
  const checked = spawnSync(process.execPath, ['--env-file=.env.local', '-e', script], {
    cwd: backendDir, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (checked.error || checked.status === 1) return 'Backend settings could not be read. Check the .env.local syntax without sharing the file.';
  if (checked.status === 2) return 'Unsupported provider in assis-backend/.env.local. Choose openai, openrouter, siliconflow or none.';
  if (checked.status === 3) return 'OpenRouter needs OPENROUTER_API_KEY and OPENROUTER_MODEL in assis-backend/.env.local.';
  if (checked.status === 4) return 'SiliconFlow needs its API key, exact model and .cn or .com API URL in assis-backend/.env.local.';
  if (checked.status === 5) return 'ASSIS_PORT must be 8789 because the local app connects to that port.';
  if (checked.status === 6) return 'OpenAI needs OPENAI_API_KEY in assis-backend/.env.local. The key is checked for presence only and is never printed.';
  if (checked.status !== 0) return 'Backend settings are invalid. Check assis-backend/.env.local; values are not shown here.';
  return null;
}

function missingSetup({ requireBuild = true } = {}) {
  const missing = [];
  if (!existsSync(resolve(backendDir, 'node_modules'))) missing.push('backend npm dependencies');
  if (!existsSync(resolve(frontendDir, 'node_modules'))) missing.push('frontend npm dependencies');
  if (requireBuild && !existsSync(resolve(publicDir, 'workspace/index.html'))) missing.push('built frontend (assis-mvp/workspace)');
  if (!existsSync(resolve(pdfDir, 'Application-B-original.pdf'))) missing.push('verified official PDF template');
  return missing;
}

function check() {
  if (!nodeVersionOk()) return 'Node.js 24 or later is required. Install it, then run npm run check again.';
  const configError = configCheck();
  if (configError) return configError;
  const missing = missingSetup({ requireBuild: false });
  if (missing.length) return `Setup is incomplete: ${missing.join(', ')}. Run npm run setup, then npm run check again.`;
  return null;
}

function runSetup() {
  if (!nodeVersionOk()) return fail('Node.js 24 or later is required.');
  for (const directory of [backendDir, frontendDir]) {
    say(`Installing dependencies in ${directory === backendDir ? 'assis-backend' : 'assis-workspace'}…`);
    const result = spawnSync('npm', ['ci'], { cwd: directory, stdio: 'inherit' });
    if (result.error || result.status !== 0) return fail(`Dependency installation failed in ${directory === backendDir ? 'assis-backend' : 'assis-workspace'}.`);
  }
  say('Downloading and verifying the official PDF template…');
  const result = spawnSync(process.execPath, ['scripts/setup-assets.mjs'], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) return fail('Asset setup failed. Review the message above, then run npm run setup again.');
  say('Setup complete. Copy assis-backend/.env.example to assis-backend/.env.local, add your provider key, then run npm start.');
}

export function staticServer(directory = publicDir) {
  const safeRoot = realpathSync(directory);
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }).end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (pathname === '/') pathname = '/workspace/';
    if (pathname.includes('\0') || pathname.split('/').includes('..')) { response.writeHead(400).end('Bad request'); return; }
    let candidate = resolve(safeRoot, `.${pathname}`);
    if (candidate !== safeRoot && !candidate.startsWith(safeRoot + sep)) { response.writeHead(403).end('Forbidden'); return; }
    try {
      candidate = realpathSync(candidate);
      if (candidate !== safeRoot && !candidate.startsWith(safeRoot + sep)) { response.writeHead(403).end('Forbidden'); return; }
      if (statSync(candidate).isDirectory()) candidate = realpathSync(resolve(candidate, 'index.html'));
      if (candidate !== safeRoot && !candidate.startsWith(safeRoot + sep)) { response.writeHead(403).end('Forbidden'); return; }
      if (!statSync(candidate).isFile()) { response.writeHead(404).end('Not found'); return; }
    } catch { response.writeHead(404).end('Not found'); return; }
    const type = mime.get(extname(candidate).toLowerCase());
    if (!type) { response.writeHead(415).end('Unsupported file type'); return; }
    response.writeHead(200, {
      'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Cache-Control': extname(candidate) === '.html' ? 'no-store' : 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(candidate).on('error', () => { if (!response.headersSent) response.writeHead(500); response.end(); }).pipe(response);
  });
}

function portAvailable(port, label) {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? `${label} port ${port} is already in use. Stop the other local app, then retry.` : `${label} port ${port} could not be opened.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolvePromise()));
  });
}

async function start() {
  if (!nodeVersionOk()) return fail('Node.js 24 or later is required.');
  const configError = configCheck();
  if (configError) return fail(configError);
  const missing = missingSetup({ requireBuild: false });
  if (missing.length) return fail(`Setup is incomplete: ${missing.join(', ')}. Run npm run setup first.`);
  say('Building the Dukkan frontend…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: frontendDir, stdio: 'inherit' });
  if (build.error || build.status !== 0) return fail('Frontend build failed. Fix the reported issue, then run npm start again.');

  try {
    await portAvailable(ports.frontend, 'Frontend');
    await portAvailable(ports.backend, 'Backend');
  } catch (error) { return fail(error.message); }

  const web = staticServer();
  await new Promise((resolvePromise, reject) => {
    web.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? `Frontend port ${ports.frontend} is already in use. Stop the other local app, then retry.` : `Frontend port ${ports.frontend} could not be opened.`)));
    web.listen(ports.frontend, '127.0.0.1', resolvePromise);
  }).catch(error => { fail(error.message); });
  if (!web.listening) return;

  const child = spawn(process.execPath, ['--env-file=.env.local', '--experimental-strip-types', 'src/server.ts'], { cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let starting = '';
  let settled = false;
  let startupTimer;
  const stop = () => {
    if (!settled) { settled = true; clearTimeout(startupTimer); }
    web.close();
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  };
  const onSignal = () => { stop(); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  child.stdout.setEncoding('utf8').on('data', chunk => {
    process.stdout.write(chunk);
    starting += chunk;
    if (!settled && starting.includes('backend http://127.0.0.1:8789')) { settled = true; clearTimeout(startupTimer); }
  });
  child.stderr.setEncoding('utf8').on('data', chunk => process.stderr.write(chunk));
  child.once('error', () => { if (!settled) { settled = true; clearTimeout(startupTimer); fail('Backend could not start. Check Node.js and the backend dependencies.'); web.close(); } });
  child.once('exit', code => {
    clearTimeout(startupTimer);
    web.close();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (!settled && code !== 0) fail('Backend stopped before it was ready. Check its configuration and port.');
    else if (code && code !== 0 && !process.exitCode) fail(`Backend stopped with exit code ${code}.`);
  });
  startupTimer = setTimeout(() => {
    if (!settled) { settled = true; fail('Backend did not become ready within 15 seconds. Check its configuration and port.'); stop(); }
  }, 15000);
  say(`Dukkan is available at http://127.0.0.1:${ports.frontend}/workspace/`);
  say('Both servers are bound to this computer only. Press Ctrl+C to stop them.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const mode = process.argv[2];
if (mode === '--check') {
  const problem = check();
  if (problem) fail(problem);
  else say('Preflight passed. No ports, services or model endpoints were contacted.');
} else if (mode === '--setup') runSetup();
else if (mode) fail('Usage: npm run setup | npm run check | npm start');
else await start();

}
