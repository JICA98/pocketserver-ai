export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  requestId: string;
  ip?: string;
}

// React Native has no Node `Buffer` global; Content-Length is UTF-8 bytes.
function utf8ByteLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      len += 1;
    } else if (c < 0x800) {
      len += 2;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      len += 4;
      i++;
    } else {
      len += 3;
    }
  }
  return len;
}

/** Slice a JS string so the result is at most `maxBytes` UTF-8 bytes. */
function sliceUtf8ByBytes(str: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }
  let bytes = 0;
  let end = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    let charBytes: number;
    if (c < 0x80) {
      charBytes = 1;
    } else if (c < 0x800) {
      charBytes = 2;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      charBytes = 4;
    } else {
      charBytes = 3;
    }
    if (bytes + charBytes > maxBytes) {
      break;
    }
    bytes += charBytes;
    if (c >= 0xd800 && c <= 0xdbff) {
      end = i + 2;
      i++;
    } else {
      end = i + 1;
    }
  }
  return str.substring(0, end);
}

export class HttpConnection {
  socket: any;
  buffer = '';
  headersParsed = false;
  requestHandled = false;
  method = '';
  path = '';
  headers: Record<string, string> = {};
  contentLength = 0;
  body = '';
  isClosed = false;

  constructor(
    socket: any,
    onReceiveRequest: (req: HttpRequest, conn: HttpConnection) => void,
    onClose: (conn: HttpConnection) => void,
  ) {
    this.socket = socket;

    socket.on('data', (chunk: any) => {
      if (this.isClosed) {
        return;
      }
      const dataStr =
        typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      this.buffer += dataStr;
      this.processBuffer(onReceiveRequest);
    });

    socket.on('close', () => {
      this.isClosed = true;
      onClose(this);
    });

    socket.on('error', (err: any) => {
      if (__DEV__) {
        console.error('Socket error in HttpConnection:', err);
      }
      this.isClosed = true;
      socket.destroy();
      onClose(this);
    });
  }

  private processBuffer(
    onReceiveRequest: (req: HttpRequest, conn: HttpConnection) => void,
  ) {
    if (!this.headersParsed) {
      const headerEndIndex = this.buffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) {
        // Safety limit to prevent memory bloat on huge headers
        if (this.buffer.length > 16384) {
          this.sendError(
            413,
            'Payload Too Large',
            'Request headers exceed maximum size.',
          );
        }
        return;
      }

      const headerPart = this.buffer.substring(0, headerEndIndex);
      this.body = this.buffer.substring(headerEndIndex + 4);
      this.buffer = '';
      this.headersParsed = true;

      const lines = headerPart.split('\r\n');
      const reqLine = lines[0];
      const parts = reqLine.split(' ');
      if (parts.length < 2) {
        this.sendError(400, 'Bad Request', 'Malformed request line.');
        return;
      }

      this.method = parts[0].toUpperCase();
      this.path = parts[1];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const val = line.substring(colonIndex + 1).trim();
          this.headers[key] = val;
        }
      }

      const lenHeader = this.headers['content-length'];
      this.contentLength = lenHeader ? parseInt(lenHeader, 10) : 0;
      if (Number.isNaN(this.contentLength) || this.contentLength < 0) {
        this.contentLength = 0;
      }

      const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
      if (this.contentLength > MAX_BODY_SIZE) {
        this.sendError(413, 'Payload Too Large',
          'Request body exceeds maximum size of 10 MB.');
        return;
      }
    }

    if (this.headersParsed && !this.requestHandled) {
      // Append any subsequent TCP packets onto the body.
      if (this.buffer.length > 0) {
        this.body += this.buffer;
        this.buffer = '';
      }

      // Content-Length is UTF-8 bytes, not JS string length.
      if (utf8ByteLength(this.body) >= this.contentLength) {
        this.requestHandled = true;
        const finalBody = sliceUtf8ByBytes(this.body, this.contentLength);
        const req: HttpRequest = {
          method: this.method,
          path: this.path,
          headers: this.headers,
          body: finalBody,
          requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ip: this.socket.remoteAddress,
        };
        onReceiveRequest(req, this);
      }
    }
  }

  sendResponse(
    statusCode: number,
    statusText: string,
    headers: Record<string, string>,
    body: string,
  ) {
    if (this.isClosed) {
      return;
    }
    try {
      this.socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n`);
      for (const [k, v] of Object.entries(headers)) {
        this.socket.write(`${k}: ${v}\r\n`);
      }
      this.socket.write('\r\n');
      if (body) {
        this.socket.write(body, () => this.socket.end());
      } else {
        this.socket.end();
      }
    } catch (e) {
      if (__DEV__) {
        console.error('Failed to send HTTP response:', e);
      }
      this.socket.destroy();
    } finally {
      this.isClosed = true;
    }
  }

  // SSE/Streaming interface
  sendStreamHeaders(
    statusCode: number,
    statusText: string,
    headers: Record<string, string>,
  ) {
    if (this.isClosed) {
      return;
    }
    try {
      this.socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n`);
      for (const [k, v] of Object.entries(headers)) {
        this.socket.write(`${k}: ${v}\r\n`);
      }
      this.socket.write('\r\n');
    } catch (e) {
      if (__DEV__) {
        console.error('Failed to write stream headers:', e);
      }
      this.isClosed = true;
      this.socket.destroy();
    }
  }

  sendStreamChunk(chunk: string) {
    if (this.isClosed) {
      return;
    }
    try {
      this.socket.write(chunk);
    } catch (e) {
      if (__DEV__) {
        console.error('Failed to write stream chunk:', e);
      }
      this.isClosed = true;
      this.socket.destroy();
    }
  }

  endStream() {
    if (this.isClosed) {
      return;
    }
    try {
      this.socket.end();
    } catch (e) {
      if (__DEV__) {
        console.error('Failed to end stream:', e);
      }
      this.socket.destroy();
    } finally {
      this.isClosed = true;
    }
  }

  sendError(statusCode: number, statusText: string, message?: string) {
    const errorJson = JSON.stringify({
      error: {
        message: message || statusText,
        type: 'invalid_request_error',
        param: null,
        code: null,
      },
    });
    this.sendResponse(
      statusCode,
      statusText,
      {
        'Content-Type': 'application/json',
        'Content-Length': String(utf8ByteLength(errorJson)),
        Connection: 'close',
      },
      errorJson,
    );
  }
}
