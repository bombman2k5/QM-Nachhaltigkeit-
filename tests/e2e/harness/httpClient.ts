import http, { RequestOptions, IncomingMessage } from 'http';

export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: T;
  rawText: string;
  rawBody: Buffer;
}

export interface HttpClientConfig {
  socketPath?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class TestHttpClient {
  private socketPath?: string;
  private baseUrl?: string;
  private defaultHeaders: Record<string, string>;
  private timeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.socketPath = config.socketPath;
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.defaultHeaders || {};
    this.timeoutMs = config.timeoutMs || 15000;
  }

  async request<T = any>(options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeoutMs?: number;
  }): Promise<HttpResponse<T>> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options.headers || {}),
    };

    let payload: Buffer | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (Buffer.isBuffer(options.body)) {
        payload = options.body;
        if (!headers['content-type']) {
          headers['content-type'] = 'application/octet-stream';
        }
      } else if (typeof options.body === 'string') {
        payload = Buffer.from(options.body, 'utf-8');
        if (!headers['content-type']) {
          headers['content-type'] = 'text/plain';
        }
      } else {
        payload = Buffer.from(JSON.stringify(options.body), 'utf-8');
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }
      headers['content-length'] = String(payload.byteLength);
    }

    const reqOptions: RequestOptions = {
      method,
      headers,
      timeout: options.timeoutMs || this.timeoutMs,
    };

    if (this.socketPath) {
      reqOptions.socketPath = this.socketPath;
      reqOptions.path = options.path;
    } else if (this.baseUrl) {
      const url = new URL(options.path, this.baseUrl);
      reqOptions.host = url.hostname;
      reqOptions.port = url.port ? parseInt(url.port, 10) : 80;
      reqOptions.path = url.pathname + url.search;
    } else {
      throw new Error('TestHttpClient requires either socketPath or baseUrl');
    }

    return new Promise<HttpResponse<T>>((resolve, reject) => {
      const req = http.request(reqOptions, (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks);
          const rawText = rawBody.toString('utf-8');
          let parsedBody: any = rawText;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              parsedBody = JSON.parse(rawText);
            } catch {
              parsedBody = rawText;
            }
          }

          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: parsedBody as T,
            rawText,
            rawBody,
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy(new Error(`HTTP request timed out after ${reqOptions.timeout}ms`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async get<T = any>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ path, method: 'GET', headers });
  }

  async post<T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ path, method: 'POST', body, headers });
  }

  async put<T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ path, method: 'PUT', body, headers });
  }

  async delete<T = any>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ path, method: 'DELETE', headers });
  }
}
