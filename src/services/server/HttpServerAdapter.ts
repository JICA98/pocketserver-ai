export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  requestId: string;
  ip?: string;
}

export class HttpConnection {
  socket: any;
  buffer = '';
  headersParsed = false;
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
      console.error('Socket error in HttpConnection:', err);
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
      this.buffer = ''; // clear buffer
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
    }

    if (this.headersParsed) {
      // Check if we have the entire body
      if (this.body.length >= this.contentLength) {
        const finalBody = this.body.substring(0, this.contentLength);
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
        this.socket.write(body);
      }
      this.socket.end();
    } catch (e) {
      console.error('Failed to send HTTP response:', e);
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
      console.error('Failed to write stream headers:', e);
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
      console.error('Failed to write stream chunk:', e);
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
      console.error('Failed to end stream:', e);
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
        'Content-Length': String(errorJson.length),
        Connection: 'close',
      },
      errorJson,
    );
  }
}
