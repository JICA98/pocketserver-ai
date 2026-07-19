import TcpSockets from 'react-native-tcp-socket';
import DeviceInfo from 'react-native-device-info';
import {runInAction} from 'mobx';

import {localServerStore} from '../../store/LocalServerStore';
import {HttpRequest, HttpConnection} from './HttpServerAdapter';

export class LocalServerController {
  private server: any = null;
  private connections: Set<HttpConnection> = new Set();

  async start(): Promise<void> {
    if (
      localServerStore.status === 'starting' ||
      localServerStore.status === 'running'
    ) {
      return;
    }

    runInAction(() => {
      localServerStore.status = 'starting';
      localServerStore.lastError = null;
    });

    try {
      this.server = TcpSockets.createServer((socket: any) => {
        const conn = new HttpConnection(
          socket,
          (req, connection) => this.handleRequest(req, connection),
          connection => this.connections.delete(connection),
        );
        this.connections.add(conn);
      });

      const host =
        localServerStore.config.bindMode === 'localhost'
          ? '127.0.0.1'
          : '0.0.0.0';
      const port = localServerStore.config.port;

      this.server.listen({port, host});

      this.server.on('listening', () => {
        runInAction(() => {
          localServerStore.status = 'running';
        });
        localServerStore.addLogEntry(
          'SYSTEM',
          `Server started listening on ${host}:${port}`,
          200,
          0,
        );
        this.discoverNetworkIp();
      });

      this.server.on('error', (err: any) => {
        console.error('Server error event:', err);
        const errMsg = err.message || 'Port already in use or bind failed.';
        runInAction(() => {
          localServerStore.status = 'error';
          localServerStore.lastError = errMsg;
        });
        localServerStore.addLogEntry(
          'SYSTEM',
          `Server error: ${errMsg}`,
          500,
          0,
          errMsg,
        );
        this.cleanup();
      });
    } catch (e: any) {
      const errMsg = e.message || 'Failed to initialize server.';
      runInAction(() => {
        localServerStore.status = 'error';
        localServerStore.lastError = errMsg;
      });
      localServerStore.addLogEntry(
        'SYSTEM',
        `Server initialization failed: ${errMsg}`,
        500,
        0,
        errMsg,
      );
      this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (
      localServerStore.status === 'stopping' ||
      localServerStore.status === 'stopped'
    ) {
      return;
    }

    runInAction(() => {
      localServerStore.status = 'stopping';
    });

    return new Promise<void>(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.cleanup();
          runInAction(() => {
            localServerStore.status = 'stopped';
          });
          localServerStore.addLogEntry(
            'SYSTEM',
            'Server stopped cleanly.',
            200,
            0,
          );
          resolve();
        });
      } else {
        this.cleanup();
        runInAction(() => {
          localServerStore.status = 'stopped';
        });
        resolve();
      }
    });
  }

  private cleanup() {
    this.server = null;
    for (const conn of this.connections) {
      try {
        conn.socket.destroy();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    runInAction(() => {
      localServerStore.activeRequests = 0;
      localServerStore.queuedRequests = 0;
    });
  }

  private async discoverNetworkIp() {
    try {
      const ip = await DeviceInfo.getIpAddress();
      if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1') {
        runInAction(() => {
          localServerStore.runtimeInfo.lanUrl = `http://${ip}:${localServerStore.config.port}`;
        });
      }
    } catch (e) {
      console.warn('Could not discover network IP address:', e);
    }
  }

  private handleRequest(req: HttpRequest, conn: HttpConnection) {
    const startTime = Date.now();

    // 1. CORS Headers Middleware
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
      conn.sendResponse(204, 'No Content', corsHeaders, '');
      localServerStore.addLogEntry(
        'OPTIONS',
        req.path,
        204,
        Date.now() - startTime,
      );
      return;
    }

    // 2. Authentication Middleware
    if (localServerStore.config.authEnabled) {
      const auth = req.headers.authorization;
      if (
        !auth ||
        !auth.startsWith('Bearer ') ||
        auth.substring(7) !== localServerStore.apiKey
      ) {
        const duration = Date.now() - startTime;
        const errJson = JSON.stringify({
          error: {
            message: 'Incorrect API key provided.',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_api_key',
          },
        });
        conn.sendResponse(
          401,
          'Unauthorized',
          {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Content-Length': String(errJson.length),
          },
          errJson,
        );
        localServerStore.addLogEntry(
          req.method,
          req.path,
          401,
          duration,
          'Authentication failed: Invalid API Key.',
        );
        return;
      }
    }

    // 3. Routing Layer
    const routePath = req.path.split('?')[0];

    try {
      switch (routePath) {
        case '/':
          this.handleHome(req, conn, corsHeaders, startTime);
          break;
        case '/health':
          this.handleHealth(req, conn, corsHeaders, startTime);
          break;
        case '/version':
          this.handleVersion(req, conn, corsHeaders, startTime);
          break;
        case '/v1/models':
        case '/v1/chat/completions':
        case '/v1/completions':
          // Placeholder response until Phase 4 and Phase 5 are fully implemented.
          this.handlePlaceholderEndpoint(req, conn, corsHeaders, startTime);
          break;
        default:
          this.handleNotFound(req, conn, corsHeaders, startTime);
          break;
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errMsg = err.message || 'Internal Server Error';
      conn.sendError(500, 'Internal Server Error', errMsg);
      localServerStore.addLogEntry(req.method, req.path, 500, duration, errMsg);
    }
  }

  private handleHome(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    const resObj = {
      message: 'Welcome to PocketServer AI on-device LLM server!',
      status: 'running',
      endpoints: ['/health', '/version', '/v1/models', '/v1/chat/completions'],
    };
    const body = JSON.stringify(resObj);
    conn.sendResponse(
      200,
      'OK',
      {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
      },
      body,
    );
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  private handleHealth(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    const modelLoaded = localServerStore.isModelReady;
    const resObj = {
      status: 'ok',
      server: 'running',
      model_loaded: modelLoaded,
      inference_ready: modelLoaded,
      busy: false,
    };
    const body = JSON.stringify(resObj);
    conn.sendResponse(
      200,
      'OK',
      {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
      },
      body,
    );
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  private handleVersion(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    const resObj = {
      version: DeviceInfo.getVersion(),
      server_version: '1.0.0',
      api_version: 'v1',
    };
    const body = JSON.stringify(resObj);
    conn.sendResponse(
      200,
      'OK',
      {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
      },
      body,
    );
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  private handlePlaceholderEndpoint(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    const errObj = {
      error: {
        message:
          'Endpoint is registered but inference services are still starting or not fully configured.',
        type: 'server_error',
        param: null,
        code: 'inference_pending',
      },
    };
    const body = JSON.stringify(errObj);
    conn.sendResponse(
      503,
      'Service Unavailable',
      {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Length': String(body.length),
      },
      body,
    );
    localServerStore.addLogEntry(
      req.method,
      req.path,
      503,
      Date.now() - startTime,
      'Inference Coordinator not initialized yet.',
    );
  }

  private handleNotFound(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    conn.sendError(
      404,
      'Not Found',
      `Route ${req.method} ${req.path} not found.`,
    );
    localServerStore.addLogEntry(
      req.method,
      req.path,
      404,
      Date.now() - startTime,
    );
  }
}

export const localServerController = new LocalServerController();
export default localServerController;
