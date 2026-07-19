import TcpSockets from 'react-native-tcp-socket';
import DeviceInfo from 'react-native-device-info';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {localServerStore} from '../../store/LocalServerStore';
import {modelStore} from '../../store';
import {inferenceCoordinator} from '../inference/InferenceCoordinator';
import {HttpRequest, HttpConnection} from './HttpServerAdapter';
import {CompletionStreamData, CompletionResult} from '../../utils/completionTypes';
import NativeServerForegroundService from '../../specs/NativeServerForegroundService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const BEARER_RE = /^Bearer ([a-zA-Z0-9_-]+)$/;

function sanitizeErrorMessage(err: Error): string {
  if (__DEV__) {
    return err.message;
  }
  if (
    err.message?.includes('busy') ||
    err.message?.includes('Queue limit')
  ) {
    return 'Server busy. Please try again later.';
  }
  if (err.message?.includes('No GGUF model')) {
    return 'No model is currently loaded.';
  }
  if (
    err.message?.includes('timed out') ||
    err.message?.includes('aborted')
  ) {
    return 'Request timed out or was aborted.';
  }
  return 'Internal server error.';
}

function mapFinishReason(result: CompletionResult): string {
  if (result.stopped_eos) {
    return 'stop';
  }
  if (result.stopped_limit || result.context_full || result.truncated) {
    return 'length';
  }
  if (result.stopped_word || result.stopping_word) {
    return 'stop';
  }
  if (result.interrupted) {
    return 'stop';
  }
  return 'stop';
}

function parseBody(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(
  conn: HttpConnection,
  statusCode: number,
  statusText: string,
  corsHeaders: Record<string, string>,
  obj: any,
) {
  const body = JSON.stringify(obj);
  conn.sendResponse(
    statusCode,
    statusText,
    {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body, 'utf8')),
    },
    body,
  );
}

function sendApiError(
  conn: HttpConnection,
  statusCode: number,
  statusText: string,
  corsHeaders: Record<string, string>,
  message: string,
  type: string = 'invalid_request_error',
  code: string | null = null,
) {
  sendJson(conn, statusCode, statusText, corsHeaders, {
    error: {message, type, param: null, code},
  });
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class LocalServerController {
  private server: any = null;
  private connections: Set<HttpConnection> = new Set();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private rateLimitMap = new Map<
    string,
    {count: number; resetAt: number}
  >();

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    const idleMs = (localServerStore.config as any).idleTimeoutMs;
    if (idleMs > 0) {
      this.idleTimer = setTimeout(() => {
        localServerStore.addLogEntry('SYSTEM', '', 0, 0, 'Server stopped due to inactivity.');
        this.stop();
      }, idleMs);
    }
  }

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
        if (Platform.OS === 'android') {
          NativeServerForegroundService?.startForegroundService(
            localServerStore.config.bindMode,
            localServerStore.config.port,
          );
        }
      });

      this.server.on('error', (err: any) => {
        if (__DEV__) {
          console.error('Server error event:', err);
        }
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

    if (Platform.OS === 'android') {
      NativeServerForegroundService?.stopForegroundService();
    }

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
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
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
    if (localServerStore.config.bindMode !== 'lan') {
      return;
    }
    try {
      const ip = await this.resolveLanIp();
      if (ip) {
        runInAction(() => {
          localServerStore.runtimeInfo.lanUrl =
            `http://${ip}:${localServerStore.config.port}`;
        });
      }
    } catch (e) {
      if (__DEV__) {
        console.warn('Could not discover network IP address:', e);
      }
    }
  }

  private resolveLanIp(): Promise<string | null> {
    return new Promise(resolve => {
      // Try DeviceInfo first (works on older Android, iOS)
      DeviceInfo.getIpAddress()
        .then(ip => {
          if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1' && ip !== 'unknown' && /^\d+\./.test(ip)) {
            resolve(ip);
            return;
          }
          this.resolveLanIpViaSocket(resolve);
        })
        .catch(() => this.resolveLanIpViaSocket(resolve));
    });
  }

  private resolveLanIpViaSocket(resolve: (ip: string | null) => void) {
    // Create socket and resolve local address via a dummy connect to a public DNS IP.
    // The socket never actually connects (it's a UDP-style trick on TCP), but it
    // discovers the network interface that would route to the internet.
    try {
      const socket = TcpSockets.createConnection({port: 80, host: '1.1.1.1'}, () => {
        const addr = (socket as any).address?.();
        const ip = addr?.address;
        socket.destroy();
        resolve(ip && ip !== '127.0.0.1' && /^\d+\./.test(ip) ? ip : null);
      });
      socket.setTimeout(2000, () => {
        const addr = (socket as any).address?.();
        socket.destroy();
        resolve(addr?.address ?? null);
      });
      socket.on('error', () => {
        const addr = (socket as any).address?.();
        socket.destroy();
        resolve(addr?.address ?? null);
      });
    } catch (_e) {
      resolve(null);
    }
  }

  private validateBearerToken(auth: string): boolean {
    const match = auth.match(BEARER_RE);
    if (!match) {
      return false;
    }
    return constantTimeEqual(match[1], localServerStore.apiKey);
  }

  private handleRequest(req: HttpRequest, conn: HttpConnection) {
    const startTime = Date.now();

    // Reset idle timeout on every request
    this.resetIdleTimer();

    // Rate limiting
    const ip = req.ip ?? 'unknown';
    const rateMax = localServerStore.config.rateLimitMax;
    const rateWindow = localServerStore.config.rateLimitWindowMs;
    const now = Date.now();
    const entry = this.rateLimitMap.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= rateMax) {
        conn.sendError(429, 'Too Many Requests', 'Rate limit exceeded.');
        localServerStore.addLogEntry(
          req.method, req.path, 429,
          Date.now() - startTime, `Rate limit exceeded for ${ip}`,
        );
        return;
      }
      entry.count++;
    } else {
      this.rateLimitMap.set(ip, {count: 1, resetAt: now + rateWindow});
    }

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
      if (!auth || !this.validateBearerToken(auth)) {
        const duration = Date.now() - startTime;
        sendApiError(
          conn,
          401,
          'Unauthorized',
          corsHeaders,
          'Incorrect API key provided.',
          'invalid_request_error',
          'invalid_api_key',
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
          this.handleModels(req, conn, corsHeaders, startTime);
          break;
        case '/v1/chat/completions':
          this.handleChatCompletions(req, conn, corsHeaders, startTime);
          break;
        case '/v1/completions':
          this.handleCompletions(req, conn, corsHeaders, startTime);
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

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------
  private handleHome(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    sendJson(conn, 200, 'OK', corsHeaders, {
      message: 'Welcome to PocketServer AI on-device LLM server!',
      status: 'running',
      endpoints: ['/health', '/version', '/v1/models', '/v1/chat/completions', '/v1/completions'],
    });
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  // -------------------------------------------------------------------------
  // GET /health
  // -------------------------------------------------------------------------
  private handleHealth(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    const modelLoaded = localServerStore.isModelReady;
    sendJson(conn, 200, 'OK', corsHeaders, {
      status: 'ok',
      server: 'running',
      model_loaded: modelLoaded,
      inference_ready: modelLoaded,
      busy: localServerStore.activeRequests > 0,
    });
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  // -------------------------------------------------------------------------
  // GET /version
  // -------------------------------------------------------------------------
  private handleVersion(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    sendJson(conn, 200, 'OK', corsHeaders, {
      version: DeviceInfo.getVersion(),
      server_version: '1.0.0',
      api_version: 'v1',
    });
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  // -------------------------------------------------------------------------
  // GET /v1/models
  // -------------------------------------------------------------------------
  private handleModels(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    if (req.method !== 'GET') {
      sendApiError(conn, 405, 'Method Not Allowed', corsHeaders, 'Method not allowed.');
      localServerStore.addLogEntry(req.method, req.path, 405, Date.now() - startTime);
      return;
    }

    const activeModel = modelStore.activeModel;
    const data = activeModel
      ? [
          {
            id: activeModel.id,
            object: 'model',
            created: nowSecs(),
            owned_by: 'local',
            name: activeModel.name,
          },
        ]
      : [];

    sendJson(conn, 200, 'OK', corsHeaders, {object: 'list', data});
    localServerStore.addLogEntry('GET', req.path, 200, Date.now() - startTime);
  }

  // -------------------------------------------------------------------------
  // POST /v1/chat/completions
  // -------------------------------------------------------------------------
  private handleChatCompletions(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    if (req.method !== 'POST') {
      sendApiError(conn, 405, 'Method Not Allowed', corsHeaders, 'Method not allowed.');
      localServerStore.addLogEntry(req.method, req.path, 405, Date.now() - startTime);
      return;
    }

    // Model must be loaded
    if (!localServerStore.isModelReady) {
      sendApiError(
        conn, 503, 'Service Unavailable', corsHeaders,
        'No model is loaded. Load a model in PocketServer AI first.',
        'server_error', 'model_not_loaded',
      );
      localServerStore.addLogEntry(req.method, req.path, 503, Date.now() - startTime, 'No model loaded.');
      return;
    }

    // Parse body
    const parsed = parseBody(req.body);
    if (!parsed) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, 'Invalid JSON body.', 'invalid_request_error', 'invalid_json');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Invalid JSON.');
      return;
    }

    // Validate messages
    const {messages, stream = false, temperature, top_p, max_tokens, stop, model} = parsed;
    const validationError = this.validateChatMessages(messages);
    if (validationError) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, validationError, 'invalid_request_error', 'invalid_messages');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, validationError);
      return;
    }

    // Prompt context limit
    const MAX_PROMPT_CHARS = 65536;
    const promptChars = messages.reduce(
      (sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0,
    );
    if (promptChars > MAX_PROMPT_CHARS) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders,
        'Prompt exceeds maximum context length.', 'invalid_request_error', 'context_length_exceeded');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Prompt too large.');
      return;
    }

    // Validate numeric params
    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, 'temperature must be a number between 0 and 2.', 'invalid_request_error', 'invalid_temperature');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Invalid temperature.');
      return;
    }
    if (top_p !== undefined && (typeof top_p !== 'number' || top_p <= 0 || top_p > 1)) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, 'top_p must be a number between 0 and 1.', 'invalid_request_error', 'invalid_top_p');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Invalid top_p.');
      return;
    }

    // Unsupported: tools/response_format
    if (parsed.tools || parsed.functions) {
      sendApiError(
        conn, 400, 'Bad Request', corsHeaders,
        'Tool calls are not supported by the on-device inference server.',
        'invalid_request_error', 'tools_not_supported',
      );
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Tools not supported.');
      return;
    }

    // Build completion params
    const completionParams: any = {
      messages,
      requestSource: 'server',
    };
    if (temperature !== undefined) {
      completionParams.temperature = temperature;
    }
    if (top_p !== undefined) {
      completionParams.top_p = top_p;
    }
    const MAX_OUTPUT_TOKENS = 16384;
    if (max_tokens !== undefined && typeof max_tokens === 'number') {
      completionParams.n_predict = Math.min(max_tokens, MAX_OUTPUT_TOKENS);
    } else {
      completionParams.n_predict = MAX_OUTPUT_TOKENS;
    }
    if (stop !== undefined) {
      completionParams.stop = Array.isArray(stop) ? stop : [stop];
    }

    const completionId = makeId();
    const activeModelId = modelStore.activeModel?.id ?? model ?? 'local-model';

    if (stream) {
      this.handleChatCompletionStream(
        req, conn, corsHeaders, startTime,
        completionParams, completionId, activeModelId,
      );
    } else {
      this.handleChatCompletionNonStream(
        req, conn, corsHeaders, startTime,
        completionParams, completionId, activeModelId,
      );
    }
  }

  // -------------------------------------------------------------------------
  // POST /v1/chat/completions — non-streaming
  // -------------------------------------------------------------------------
  private handleChatCompletionNonStream(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
    completionParams: any,
    completionId: string,
    activeModelId: string,
  ) {
    const abortController = new AbortController();
    completionParams.signal = abortController.signal;

    // Abort on socket close
    conn.socket.once('close', () => abortController.abort());

    const timeoutMs = localServerStore.config.requestTimeoutMs;
    const completionPromise = inferenceCoordinator.completion(completionParams);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out.')), timeoutMs),
    );

    Promise.race([completionPromise, timeoutPromise])
      .then((result: CompletionResult) => {
        const duration = Date.now() - startTime;
        const finishReason = mapFinishReason(result);
        const response = {
          id: completionId,
          object: 'chat.completion',
          created: nowSecs(),
          model: activeModelId,
          choices: [
            {
              index: 0,
              message: {role: 'assistant', content: result.text ?? result.content ?? ''},
              finish_reason: finishReason,
            },
          ],
          usage: {
            prompt_tokens: result.tokens_evaluated ?? null,
            completion_tokens: result.tokens_predicted ?? null,
            total_tokens:
              result.tokens_evaluated != null && result.tokens_predicted != null
                ? result.tokens_evaluated + result.tokens_predicted
                : null,
          },
        };
        sendJson(conn, 200, 'OK', corsHeaders, response);
        localServerStore.addLogEntry('POST', req.path, 200, duration);
      })
      .catch((err: Error) => {
        const duration = Date.now() - startTime;
        if (conn.isClosed) {
          return;
        }
        const sanitized = sanitizeErrorMessage(err);
        if (err.message?.includes('busy') || err.message?.includes('Queue limit')) {
          sendApiError(conn, 429, 'Too Many Requests', corsHeaders, sanitized, 'server_error', 'rate_limit_exceeded');
          localServerStore.addLogEntry('POST', req.path, 429, duration, err.message);
        } else if (err.message?.includes('No GGUF model')) {
          sendApiError(conn, 503, 'Service Unavailable', corsHeaders, sanitized, 'server_error', 'model_not_loaded');
          localServerStore.addLogEntry('POST', req.path, 503, duration, err.message);
        } else {
          sendApiError(conn, 500, 'Internal Server Error', corsHeaders, sanitized, 'server_error', 'inference_error');
          localServerStore.addLogEntry('POST', req.path, 500, duration, err.message);
        }
      });
  }

  // -------------------------------------------------------------------------
  // POST /v1/chat/completions — SSE streaming
  // -------------------------------------------------------------------------
  private handleChatCompletionStream(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
    completionParams: any,
    completionId: string,
    activeModelId: string,
  ) {
    const abortController = new AbortController();
    completionParams.signal = abortController.signal;

    // Send SSE headers immediately
    conn.sendStreamHeaders(200, 'OK', {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });

    // Emit role delta at the start
    const roleDelta = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: nowSecs(),
      model: activeModelId,
      choices: [{index: 0, delta: {role: 'assistant'}, finish_reason: null}],
    };
    conn.sendStreamChunk(`data: ${JSON.stringify(roleDelta)}\n\n`);

    // Abort on client disconnect
    conn.socket.once('close', () => abortController.abort());

    let timedOut = false;
    const timeoutMs = localServerStore.config.requestTimeoutMs;
    const timer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeoutMs);

    const streamCallback = (data: CompletionStreamData) => {
      if (timedOut || conn.isClosed) {
        return;
      }
      const token = data.token ?? data.content ?? '';
      if (!token) {
        return;
      }
      const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: nowSecs(),
        model: activeModelId,
        choices: [{index: 0, delta: {content: token}, finish_reason: null}],
      };
      conn.sendStreamChunk(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    inferenceCoordinator
      .completion(completionParams, streamCallback)
      .then((result: CompletionResult) => {
        clearTimeout(timer);
        if (timedOut || conn.isClosed) {
          return;
        }
        const finishReason = mapFinishReason(result);
        // Final chunk with finish_reason
        const finalChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: nowSecs(),
          model: activeModelId,
          choices: [{index: 0, delta: {}, finish_reason: finishReason}],
        };
        conn.sendStreamChunk(`data: ${JSON.stringify(finalChunk)}\n\n`);
        conn.sendStreamChunk('data: [DONE]\n\n');
        conn.endStream();
        localServerStore.addLogEntry('POST', req.path, 200, Date.now() - startTime);
      })
      .catch((err: Error) => {
        clearTimeout(timer);
        if (timedOut || conn.isClosed) {
          return;
        }
        const sanitized = sanitizeErrorMessage(err);
        const errChunk = {
          error: {message: sanitized, type: 'server_error'},
        };
        conn.sendStreamChunk(`data: ${JSON.stringify(errChunk)}\n\n`);
        conn.sendStreamChunk('data: [DONE]\n\n');
        conn.endStream();
        localServerStore.addLogEntry('POST', req.path, 500, Date.now() - startTime, err.message);
      });
  }

  // -------------------------------------------------------------------------
  // POST /v1/completions  (text completions — prompt string)
  // -------------------------------------------------------------------------
  private handleCompletions(
    req: HttpRequest,
    conn: HttpConnection,
    corsHeaders: Record<string, string>,
    startTime: number,
  ) {
    if (req.method !== 'POST') {
      sendApiError(conn, 405, 'Method Not Allowed', corsHeaders, 'Method not allowed.');
      localServerStore.addLogEntry(req.method, req.path, 405, Date.now() - startTime);
      return;
    }

    if (!localServerStore.isModelReady) {
      sendApiError(
        conn, 503, 'Service Unavailable', corsHeaders,
        'No model is loaded. Load a model in PocketServer AI first.',
        'server_error', 'model_not_loaded',
      );
      localServerStore.addLogEntry(req.method, req.path, 503, Date.now() - startTime, 'No model loaded.');
      return;
    }

    const parsed = parseBody(req.body);
    if (!parsed) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, 'Invalid JSON body.', 'invalid_request_error', 'invalid_json');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Invalid JSON.');
      return;
    }

    const {prompt, stream = false, temperature, top_p, max_tokens, stop, model} = parsed;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, "'prompt' must be a non-empty string.", 'invalid_request_error', 'invalid_prompt');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Invalid prompt.');
      return;
    }

    if (Array.isArray(prompt)) {
      sendApiError(conn, 400, 'Bad Request', corsHeaders, 'Array prompts are not supported. Please provide a single string.', 'invalid_request_error', 'unsupported_prompt_type');
      localServerStore.addLogEntry(req.method, req.path, 400, Date.now() - startTime, 'Array prompt not supported.');
      return;
    }

    const completionParams: any = {
      prompt,
      requestSource: 'server',
    };
    if (temperature !== undefined) {
      completionParams.temperature = temperature;
    }
    if (top_p !== undefined) {
      completionParams.top_p = top_p;
    }
    if (max_tokens !== undefined && typeof max_tokens === 'number') {
      completionParams.n_predict = max_tokens;
    }
    if (stop !== undefined) {
      completionParams.stop = Array.isArray(stop) ? stop : [stop];
    }

    const completionId = `cmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const activeModelId = modelStore.activeModel?.id ?? model ?? 'local-model';
    const abortController = new AbortController();
    completionParams.signal = abortController.signal;
    conn.socket.once('close', () => abortController.abort());

    if (stream) {
      conn.sendStreamHeaders(200, 'OK', {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });

      const streamCallback = (data: CompletionStreamData) => {
        if (conn.isClosed) {
          return;
        }
        const token = data.token ?? data.content ?? '';
        if (!token) {
          return;
        }
        const chunk = {
          id: completionId,
          object: 'text_completion',
          created: nowSecs(),
          model: activeModelId,
          choices: [{text: token, index: 0, finish_reason: null}],
        };
        conn.sendStreamChunk(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      inferenceCoordinator
        .completion(completionParams, streamCallback)
        .then((result: CompletionResult) => {
          if (conn.isClosed) {
            return;
          }
          const finishReason = mapFinishReason(result);
          const finalChunk = {
            id: completionId,
            object: 'text_completion',
            created: nowSecs(),
            model: activeModelId,
            choices: [{text: '', index: 0, finish_reason: finishReason}],
          };
          conn.sendStreamChunk(`data: ${JSON.stringify(finalChunk)}\n\n`);
          conn.sendStreamChunk('data: [DONE]\n\n');
          conn.endStream();
          localServerStore.addLogEntry('POST', req.path, 200, Date.now() - startTime);
        })
        .catch((err: Error) => {
          if (conn.isClosed) {
            return;
          }
          const sanitized = sanitizeErrorMessage(err);
          conn.sendStreamChunk(`data: ${JSON.stringify({error: {message: sanitized}})}\n\n`);
          conn.sendStreamChunk('data: [DONE]\n\n');
          conn.endStream();
          localServerStore.addLogEntry('POST', req.path, 500, Date.now() - startTime, err.message);
        });
    } else {
      inferenceCoordinator
        .completion(completionParams)
        .then((result: CompletionResult) => {
          const duration = Date.now() - startTime;
          sendJson(conn, 200, 'OK', corsHeaders, {
            id: completionId,
            object: 'text_completion',
            created: nowSecs(),
            model: activeModelId,
            choices: [
              {
                text: result.text ?? result.content ?? '',
                index: 0,
                finish_reason: mapFinishReason(result),
              },
            ],
            usage: {
              prompt_tokens: result.tokens_evaluated ?? null,
              completion_tokens: result.tokens_predicted ?? null,
              total_tokens:
                result.tokens_evaluated != null && result.tokens_predicted != null
                  ? result.tokens_evaluated + result.tokens_predicted
                  : null,
            },
          });
          localServerStore.addLogEntry('POST', req.path, 200, duration);
        })
        .catch((err: Error) => {
          const duration = Date.now() - startTime;
          if (conn.isClosed) {
            return;
          }
          sendApiError(conn, 500, 'Internal Server Error', corsHeaders, err.message ?? 'Inference failed.', 'server_error', 'inference_error');
          localServerStore.addLogEntry('POST', req.path, 500, duration, err.message);
        });
    }
  }

  // -------------------------------------------------------------------------
  // 404 fallback
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Validation helpers
  // -------------------------------------------------------------------------
  private validateChatMessages(messages: any): string | null {
    if (!Array.isArray(messages) || messages.length === 0) {
      return "'messages' must be a non-empty array.";
    }
    const allowedRoles = new Set(['system', 'user', 'assistant']);
    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') {
        return 'Each message must be an object.';
      }
      if (!allowedRoles.has(msg.role)) {
        return `Unsupported role '${msg.role}'. Allowed: system, user, assistant.`;
      }
      if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
        return "Each message must have a 'content' string field.";
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part?.type && part.type !== 'text') {
            return `Multimodal content type '${part.type}' is not supported.`;
          }
        }
      }
    }
    return null;
  }
}

export const localServerController = new LocalServerController();
export default localServerController;
