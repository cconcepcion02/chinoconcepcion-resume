import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function startProcess(label, script) {
  const args = ['run', script];

  if (script === 'start:web') {
    const webArgs = [];

    if (process.env.WEB_HOST) {
      webArgs.push('--host', process.env.WEB_HOST);
    }

    if (process.env.WEB_PORT) {
      webArgs.push('--port', process.env.WEB_PORT);
    }

    if (process.env.WEB_PROXY_CONFIG) {
      webArgs.push('--proxy-config', process.env.WEB_PROXY_CONFIG);
    }

    if (webArgs.length > 0) {
      args.push('--', ...webArgs);
    }
  }

  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const current of children) {
      if (current.pid && current.pid !== child.pid) {
        current.kill('SIGTERM');
      }
    }

    if (signal) {
      console.error(`[${label}] stopped by signal ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(`[${label}] failed to start: ${error.message}`);
    for (const current of children) {
      if (current.pid && current.pid !== child.pid) {
        current.kill('SIGTERM');
      }
    }
    process.exit(1);
  });

  children.push(child);
}

function shutdownAll() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (child.pid) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', shutdownAll);
process.on('SIGTERM', shutdownAll);

startProcess('api', 'start:api');
startProcess('web', 'start:web');
