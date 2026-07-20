/**
 * HttpConnection — request framing tests
 *
 * Covers multi-packet body assembly and UTF-8 Content-Length handling
 * required by OpenAI-compatible clients (OpenCode / @ai-sdk/openai-compatible).
 */

import {HttpConnection, HttpRequest} from '../HttpServerAdapter';

function makeSocket() {
  const listeners: Record<string, Function[]> = {};
  return {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    remoteAddress: '127.0.0.1',
    once: jest.fn(),
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

function utf8Bytes(str: string): number {
  // Mirror production helper: Content-Length is bytes, not JS string length.
  return new TextEncoder().encode(str).length;
}

describe('HttpConnection body assembly', () => {
  it('assembles body split across multiple data events', () => {
    const socket = makeSocket();
    let received: HttpRequest | null = null;
    // eslint-disable-next-line no-new
    new HttpConnection(
      socket,
      req => {
        received = req;
      },
      () => {},
    );

    const jsonBody = JSON.stringify({
      model: 'local',
      messages: [{role: 'user', content: 'hello from opencode'}],
      tools: Array.from({length: 20}, (_, i) => ({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description: 'x'.repeat(40),
          parameters: {type: 'object', properties: {}},
        },
      })),
      stream: true,
    });
    const headers =
      `POST /v1/chat/completions HTTP/1.1\r\n` +
      `Host: 127.0.0.1:8080\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${utf8Bytes(jsonBody)}\r\n` +
      `\r\n`;

    // Split mid-body so a single-packet parser would hang.
    const full = headers + jsonBody;
    const splitAt = Math.floor(full.length * 0.4);
    socket.emit('data', full.slice(0, splitAt));
    expect(received).toBeNull();

    socket.emit('data', full.slice(splitAt));
    expect(received).not.toBeNull();
    expect(received!.method).toBe('POST');
    expect(received!.path).toBe('/v1/chat/completions');
    expect(received!.body).toBe(jsonBody);
  });

  it('uses UTF-8 byte length for Content-Length with multi-byte chars', () => {
    const socket = makeSocket();
    let received: HttpRequest | null = null;
    // eslint-disable-next-line no-new
    new HttpConnection(
      socket,
      req => {
        received = req;
      },
      () => {},
    );

    const jsonBody = JSON.stringify({
      messages: [{role: 'user', content: 'こんにちは 🚀 café'}],
    });
    const byteLen = utf8Bytes(jsonBody);
    // Guard: multi-byte content must make byte length > string length.
    expect(byteLen).toBeGreaterThan(jsonBody.length);

    const request =
      `POST /v1/chat/completions HTTP/1.1\r\n` +
      `Content-Length: ${byteLen}\r\n` +
      `\r\n` +
      jsonBody;

    socket.emit('data', request);
    expect(received).not.toBeNull();
    expect(received!.body).toBe(jsonBody);
  });

  it('assembles body when second packet arrives after headers fully parsed', () => {
    const socket = makeSocket();
    let received: HttpRequest | null = null;
    // eslint-disable-next-line no-new
    new HttpConnection(
      socket,
      req => {
        received = req;
      },
      () => {},
    );

    const jsonBody = '{"messages":[{"role":"user","content":"hi there friend"}]}';
    const headers =
      `POST /v1/chat/completions HTTP/1.1\r\n` +
      `Content-Length: ${utf8Bytes(jsonBody)}\r\n` +
      `\r\n`;

    // Headers + partial body in first packet.
    socket.emit('data', headers + jsonBody.slice(0, 10));
    expect(received).toBeNull();

    // Rest of body in second packet (classic multi-packet hang bug).
    socket.emit('data', jsonBody.slice(10));
    expect(received).not.toBeNull();
    expect(received!.body).toBe(jsonBody);
  });
});
