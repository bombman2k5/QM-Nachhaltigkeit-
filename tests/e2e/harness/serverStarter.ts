import { Server } from 'http';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import { TestHttpClient } from './httpClient';

export interface InProcessServerInstance {
  client: TestHttpClient;
  server: Server;
  target: string;
  isPipe: boolean;
  stop: () => Promise<void>;
}

export interface ChildProcessServerInstance {
  client: TestHttpClient;
  process: ChildProcess;
  target: string;
  isPipe: boolean;
  port?: number;
  stop: () => Promise<void>;
  sendSignal: (signal: 'SIGTERM' | 'SIGINT') => Promise<number | null>;
}

/**
 * Start an in-process Express instance (Tiers 1–3)
 * Uses Windows Named Pipe on win32 to avoid loopback permission restrictions (EACCES -4092)
 */
export async function startInProcessServer(options?: {
  envOverrides?: Record<string, string>;
  useTcp?: boolean;
}): Promise<InProcessServerInstance> {
  // Suppress automatic listener in server.ts
  process.env.VERCEL = '1';
  process.env.NODE_ENV = options?.envOverrides?.NODE_ENV || 'test';
  
  if (options?.envOverrides) {
    for (const [key, value] of Object.entries(options.envOverrides)) {
      process.env[key] = value;
    }
  }

  // Dynamically import server.ts
  const serverPath = pathToFileURL(path.resolve(process.cwd(), 'server.ts')).href;
  const serverModule = await import(serverPath);
  const app = serverModule.default || serverModule.app;

  const isWin = process.platform === 'win32';
  const forceTcp = options?.useTcp || process.env.E2E_USE_TCP === '1';
  let target: string | number;
  let isPipe = false;
  let socketPath: string | undefined;
  let baseUrl: string | undefined;

  if (isWin && !forceTcp) {
    isPipe = true;
    socketPath = `\\\\.\\pipe\\qm-e2e-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    target = socketPath;
  } else {
    isPipe = false;
    target = 0; // ephemeral port
  }

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(target, () => {
      resolve(s);
    });
    s.on('error', (err: any) => reject(err));
  });

  if (!isPipe) {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  const client = new TestHttpClient({ socketPath, baseUrl });

  // Readiness probe: poll /api/auth/status
  const maxAttempts = 30;
  let ready = false;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await client.get('/api/auth/status');
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // Waiting for socket listener readiness
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!ready) {
    server.close();
    throw new Error(`In-process server failed to start readiness check at ${socketPath || baseUrl}`);
  }

  return {
    client,
    server,
    target: String(target),
    isPipe,
    stop: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Spawns an external server child process (for Tier 4 and lifecycle signal testing)
 */
export async function spawnChildServer(options?: {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  port?: number;
}): Promise<ChildProcessServerInstance> {
  const port = options?.port || (3100 + Math.floor(Math.random() * 800));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    VERCEL: '0',
    NODE_ENV: options?.env?.NODE_ENV || 'production',
    ALLOW_UNAUTHENTICATED_API: options?.env?.ALLOW_UNAUTHENTICATED_API || 'false',
    ...(options?.env || {}),
  };

  const isWin = process.platform === 'win32';
  const forceTcp = process.env.E2E_USE_TCP === '1';
  let socketPath: string | undefined;
  let baseUrl: string | undefined;
  let isPipe = false;

  if (isWin && !forceTcp) {
    isPipe = true;
    socketPath = `\\\\.\\pipe\\qm-child-${process.pid}-${Date.now()}`;
    env.PORT = socketPath;
  } else {
    isPipe = false;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  const cmd = options?.command || (isWin ? 'npx.cmd' : 'npx');
  const args = options?.args || ['tsx', 'server.ts'];

  const child = spawn(cmd, args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });

  const client = new TestHttpClient({ socketPath, baseUrl });

  // Probe child process readiness
  const maxAttempts = 60;
  let ready = false;
  for (let i = 0; i < maxAttempts; i++) {
    if (child.exitCode !== null) {
      throw new Error(`Child server process exited prematurely with code ${child.exitCode}`);
    }
    try {
      const res = await client.get('/api/auth/status');
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // Waiting for child process
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!ready) {
    if (child.pid) {
      if (isWin) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } else {
        child.kill('SIGKILL');
      }
    }
    throw new Error(`Child server process failed readiness check at ${socketPath || baseUrl}`);
  }

  const stop = async () => {
    if (child.exitCode !== null) return;
    if (isWin && child.pid) {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } catch {
        // Process may already have terminated
      }
    } else {
      child.kill('SIGKILL');
    }
  };

  const sendSignal = async (signal: 'SIGTERM' | 'SIGINT'): Promise<number | null> => {
    return new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(child.exitCode);
      }, 5000);

      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });

      child.kill(signal);
    });
  };

  return {
    client,
    process: child,
    target: socketPath || baseUrl || '',
    isPipe,
    port,
    stop,
    sendSignal,
  };
}
