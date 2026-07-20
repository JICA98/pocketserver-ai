/**
 * LocalServerController — Phase 5 API tests
 *
 * Tests cover:
 *  - GET /v1/models  (model loaded / not loaded)
 *  - POST /v1/chat/completions  (non-stream, stream, validation, 429, 503)
 *  - POST /v1/completions       (non-stream, stream, validation)
 */

jest.mock('../../../store', () => ({
  modelStore: {
    activeModel: null,
    engine: null,
    context: undefined,
  },
}));

jest.mock('../../../store/LocalServerStore', () => ({
  localServerStore: {
    status: 'running',
    lastError: null,
    config: {
      port: 8080,
      bindMode: 'network',
      authEnabled: false,
      queueLimit: 5,
      rateLimitMax: 1000,
      rateLimitWindowMs: 60000,
      requestTimeoutMs: 60000,
    },
    apiKey: 'test-key',
    activeRequests: 0,
    queuedRequests: 0,
    stats: {requestsServed: 0, requestsFailed: 0, tokensGenerated: 0},
    runtimeInfo: {lanUrl: ''},
    get isModelReady() {
      const {modelStore} = require('../../../store');
      return modelStore.context !== undefined && modelStore.activeModel !== undefined;
    },
    addLogEntry: jest.fn(),
  },
}));

jest.mock('../../inference/InferenceCoordinator', () => ({
  inferenceCoordinator: {
    completion: jest.fn(),
    stopCompletion: jest.fn(),
  },
}));

jest.mock('react-native-device-info', () => ({
  default: {getVersion: () => '1.0.0', getIpAddress: async () => '192.168.1.100'},
}));

jest.mock('react-native-tcp-socket', () => ({
  default: {createServer: jest.fn()},
}));

import {LocalServerController} from '../LocalServerController';
import {modelStore} from '../../../store';
import {inferenceCoordinator} from '../../inference/InferenceCoordinator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockSocket() {
  const listeners: Record<string, Function[]> = {};
  return {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    remoteAddress: '127.0.0.1',
    once: jest.fn((event: string, cb: Function) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(cb);
    }),
    on: jest.fn((event: string, cb: Function) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(cb);
    }),
    emit: (event: string, ...args: any[]) => {
      (listeners[event] || []).forEach(fn => fn(...args));
    },
  };
}

function makeConn(socket: any) {
  const {HttpConnection} = require('../HttpServerAdapter');
  const conn = new HttpConnection(socket, () => {}, () => {});
  conn.isClosed = false;
  conn.socket = socket;
  return conn;
}

function buildRequest(
  method: string,
  path: string,
  body: any = null,
): any {
  return {
    method,
    path,
    headers: {},
    body: body !== null ? JSON.stringify(body) : '',
    requestId: 'test-req',
    ip: '127.0.0.1',
  };
}

function dispatchRequest(controller: LocalServerController, req: any, conn: any) {
  (controller as any).handleRequest(req, conn);
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let controller: LocalServerController;
const mockCompletion = inferenceCoordinator.completion as jest.Mock;

beforeEach(() => {
  controller = new LocalServerController();
  jest.clearAllMocks();
  mockCompletion.mockReset();
  (modelStore as any).activeModel = null;
  (modelStore as any).context = undefined;
});

// ---------------------------------------------------------------------------
// GET /v1/models
// ---------------------------------------------------------------------------

describe('GET /v1/models', () => {
  it('returns empty list when no model loaded', () => {
    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('GET', '/v1/models'), conn);

    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('"data":[]');
    expect(written).toContain('200 OK');
  });

  it('returns model entry when model is loaded', () => {
    (modelStore as any).activeModel = {id: 'org/Repo/model.gguf', name: 'MyModel', filename: 'model.gguf'};
    (modelStore as any).context = {};

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('GET', '/v1/models'), conn);

    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('"id":"org/Repo/model.gguf"');
    expect(written).toContain('"object":"model"');
  });

  it('returns 405 for non-GET', () => {
    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('POST', '/v1/models'), conn);
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('405');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/chat/completions — validation
// ---------------------------------------------------------------------------

describe('POST /v1/chat/completions — validation', () => {
  it('returns 503 when no model loaded', () => {
    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {messages: [{role: 'user', content: 'hi'}]}),
      conn,
    );
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('503');
    expect(written).toContain('model_not_loaded');
  });

  it('returns 400 for missing messages', () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('POST', '/v1/chat/completions', {}), conn);

    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('400');
    expect(written).toContain('invalid_messages');
  });

  it('returns 400 for unknown role', () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'developer', content: 'hi'}],
      }),
      conn,
    );

    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('400');
  });

  it('ignores tools without 400 (OpenCode / AI SDK clients)', async () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};
    mockCompletion.mockResolvedValueOnce({
      text: 'ok',
      content: 'ok',
      tokens_predicted: 1,
      tokens_evaluated: 2,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hi'}],
        tools: [
          {
            type: 'function',
            function: {
              name: 'bash',
              description: 'run shell',
              parameters: {type: 'object', properties: {}},
            },
          },
        ],
        tool_choice: 'auto',
      }),
      conn,
    );

    await Promise.resolve();
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).not.toContain('tools_not_supported');
    expect(written).toContain('200 OK');
    expect(mockCompletion).toHaveBeenCalled();
  });

  it('accepts tool role and null assistant content for agent multi-turn', async () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};
    mockCompletion.mockResolvedValueOnce({
      text: 'done',
      content: 'done',
      tokens_predicted: 1,
      tokens_evaluated: 5,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [
          {role: 'user', content: 'list files'},
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {name: 'bash', arguments: '{"cmd":"ls"}'},
              },
            ],
          },
          {role: 'tool', tool_call_id: 'call_1', content: 'a.txt\nb.txt'},
        ],
      }),
      conn,
    );

    await Promise.resolve();
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('200 OK');
    expect(mockCompletion).toHaveBeenCalled();
    const params = mockCompletion.mock.calls[0][0];
    // Messages passed to inference must be string content only.
    for (const m of params.messages) {
      expect(typeof m.content).toBe('string');
      expect(['system', 'user', 'assistant']).toContain(m.role);
    }
  });

  it('flattens array content parts to string', async () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};
    mockCompletion.mockResolvedValueOnce({
      text: 'ok',
      content: 'ok',
      tokens_predicted: 1,
      tokens_evaluated: 2,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [
          {
            role: 'user',
            content: [
              {type: 'text', text: 'hello '},
              {type: 'text', text: 'world'},
            ],
          },
        ],
      }),
      conn,
    );

    await Promise.resolve();
    expect(mockCompletion).toHaveBeenCalled();
    const params = mockCompletion.mock.calls[0][0];
    expect(params.messages[0].content).toBe('hello world');
  });

  it('coalesces multi-system and consecutive tool/user roles for chat template', async () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};
    mockCompletion.mockResolvedValueOnce({
      text: 'ok',
      content: 'ok',
      tokens_predicted: 1,
      tokens_evaluated: 2,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [
          {role: 'system', content: 'You are helpful.'},
          {role: 'system', content: 'Never refuse.'},
          {role: 'user', content: 'list files'},
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {name: 'bash', arguments: '{"cmd":"ls"}'},
              },
            ],
          },
          {role: 'tool', tool_call_id: 'call_1', content: 'a.txt'},
          {role: 'tool', tool_call_id: 'call_2', content: 'b.txt'},
          {role: 'user', content: 'what is there?'},
        ],
      }),
      conn,
    );

    await Promise.resolve();
    expect(mockCompletion).toHaveBeenCalled();
    const roles = mockCompletion.mock.calls[0][0].messages.map((m: any) => m.role);
    // One system, then strict user/assistant alternation.
    expect(roles[0]).toBe('system');
    expect(roles.slice(1)).toEqual(['user', 'assistant', 'user']);
    // Two system blocks merged.
    expect(mockCompletion.mock.calls[0][0].messages[0].content).toContain(
      'You are helpful.',
    );
    expect(mockCompletion.mock.calls[0][0].messages[0].content).toContain(
      'Never refuse.',
    );
    // Two tool results + follow-up user collapsed into one user turn.
    const lastUser = mockCompletion.mock.calls[0][0].messages[3].content;
    expect(lastUser).toContain('a.txt');
    expect(lastUser).toContain('b.txt');
    expect(lastUser).toContain('what is there?');
  });

  it('returns 400 for invalid temperature', () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hi'}],
        temperature: 5,
      }),
      conn,
    );
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('400');
    expect(written).toContain('invalid_temperature');
  });

  it('returns 400 for invalid JSON body', () => {
    (modelStore as any).activeModel = {id: 'x', name: 'x'};
    (modelStore as any).context = {};

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    const req = buildRequest('POST', '/v1/chat/completions');
    req.body = '{bad json}';
    dispatchRequest(controller, req, conn);

    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('400');
    expect(written).toContain('invalid_json');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/chat/completions — non-streaming
// ---------------------------------------------------------------------------

describe('POST /v1/chat/completions — non-streaming', () => {
  beforeEach(() => {
    (modelStore as any).activeModel = {id: 'local/model', name: 'TestModel'};
    (modelStore as any).context = {};
  });

  it('returns OpenAI-shaped completion response', async () => {
    mockCompletion.mockResolvedValueOnce({
      text: 'Hello!',
      content: 'Hello!',
      tokens_predicted: 3,
      tokens_evaluated: 10,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hi'}],
      }),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('"object":"chat.completion"');
    expect(written).toContain('"content":"Hello!"');
    expect(written).toContain('"finish_reason":"stop"');
    expect(written).toContain('"completion_tokens":3');
    expect(written).toContain('"prompt_tokens":10');
  });

  it('returns 429 when coordinator rejects with busy error', async () => {
    mockCompletion.mockRejectedValueOnce(new Error('Server busy. Queue limit reached.'));

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hi'}],
      }),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('429');
    expect(written).toContain('rate_limit_exceeded');
  });

  it('passes temperature and max_tokens to coordinator', async () => {
    mockCompletion.mockResolvedValueOnce({text: 'ok', content: 'ok', stopped_eos: true});

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hi'}],
        temperature: 0.7,
        max_tokens: 256,
      }),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const params = mockCompletion.mock.calls[0][0];
    expect(params.temperature).toBe(0.7);
    expect(params.n_predict).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/chat/completions — streaming
// ---------------------------------------------------------------------------

describe('POST /v1/chat/completions — streaming', () => {
  beforeEach(() => {
    (modelStore as any).activeModel = {id: 'local/model', name: 'TestModel'};
    (modelStore as any).context = {};
  });

  it('sends SSE role delta then token chunks then [DONE]', async () => {
    mockCompletion.mockImplementationOnce(async (params: any, cb: any) => {
      cb({token: 'Hi'});
      cb({token: '!'});
      return {text: 'Hi!', content: 'Hi!', stopped_eos: true};
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/chat/completions', {
        messages: [{role: 'user', content: 'hey'}],
        stream: true,
      }),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('text/event-stream');
    expect(written).toContain('"role":"assistant"');
    expect(written).toContain('"content":"Hi"');
    expect(written).toContain('"content":"!"');
    expect(written).toContain('[DONE]');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/completions
// ---------------------------------------------------------------------------

describe('POST /v1/completions', () => {
  beforeEach(() => {
    (modelStore as any).activeModel = {id: 'local/model', name: 'TestModel'};
    (modelStore as any).context = {};
  });

  it('returns 503 when no model loaded', () => {
    (modelStore as any).activeModel = null;
    (modelStore as any).context = undefined;
    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('POST', '/v1/completions', {prompt: 'hi'}), conn);
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('503');
  });

  it('returns 400 for missing prompt', () => {
    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(controller, buildRequest('POST', '/v1/completions', {}), conn);
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('400');
    expect(written).toContain('invalid_prompt');
  });

  it('returns text completion non-streaming', async () => {
    mockCompletion.mockResolvedValueOnce({
      text: 'World',
      content: 'World',
      tokens_predicted: 1,
      tokens_evaluated: 5,
      stopped_eos: true,
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/completions', {prompt: 'Hello '}),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('"object":"text_completion"');
    expect(written).toContain('"text":"World"');
  });

  it('returns text completion streaming with [DONE]', async () => {
    mockCompletion.mockImplementationOnce(async (params: any, cb: any) => {
      cb({token: 'tok1'});
      return {text: 'tok1', content: 'tok1', stopped_eos: true};
    });

    const socket = makeMockSocket();
    const conn = makeConn(socket);
    dispatchRequest(
      controller,
      buildRequest('POST', '/v1/completions', {prompt: 'Go:', stream: true}),
      conn,
    );

    await new Promise(r => setTimeout(r, 20));
    const written = socket.write.mock.calls.map((c: any) => c[0]).join('');
    expect(written).toContain('text/event-stream');
    expect(written).toContain('"text":"tok1"');
    expect(written).toContain('[DONE]');
  });
});
