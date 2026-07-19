import {runInAction} from 'mobx';
import {localServerStore} from '../../../store/LocalServerStore';
import {localServerController} from '../LocalServerController';
import {HttpConnection, HttpRequest} from '../HttpServerAdapter';

// Mock dependencies
jest.mock('react-native-device-info', () => ({
  getIpAddress: jest.fn().mockResolvedValue('192.168.1.125'),
  getVersion: jest.fn().mockReturnValue('1.16.1'),
  isEmulator: jest.fn().mockResolvedValue(false),
  getTotalMemory: jest.fn().mockResolvedValue(8 * 1024 * 1024 * 1024),
}));

// Mock react-native-tcp-socket
const mockSocketWrite = jest.fn();
const mockSocketEnd = jest.fn();
const mockSocketDestroy = jest.fn();

const mockServerListen = jest.fn();
const mockServerClose = jest.fn().mockImplementation(cb => cb && cb());

const mockServerListeners: Record<string, Function[]> = {};

const mockServer = {
  listen: mockServerListen,
  close: mockServerClose,
  on: jest.fn().mockImplementation((event, cb) => {
    if (!mockServerListeners[event]) {
      mockServerListeners[event] = [];
    }
    mockServerListeners[event].push(cb);
  }),
};

jest.mock('react-native-tcp-socket', () => {
  const mockCreateServer = jest.fn().mockImplementation(() => mockServer);
  return {
    __esModule: true,
    default: {
      createServer: mockCreateServer,
    },
    createServer: mockCreateServer,
  };
});

describe('LocalServerController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockServerListeners).forEach(
      key => delete mockServerListeners[key],
    );

    runInAction(() => {
      localServerStore.status = 'stopped';
      localServerStore.apiKey = 'test-api-key';
      localServerStore.config.authEnabled = true;
      localServerStore.logs = [];
    });
  });

  describe('lifecycle management', () => {
    it('starts listening successfully and gets IP', async () => {
      await localServerController.start();
      expect(localServerStore.status).toBe('starting');

      // Trigger server listening event
      if (mockServerListeners.listening) {
        mockServerListeners.listening.forEach(cb => cb());
      }

      expect(localServerStore.status).toBe('running');
      expect(localServerStore.runtimeInfo.lanUrl).toBe(''); // discovered asynchronously
    });

    it('handles port-in-use or startup errors', async () => {
      await localServerController.start();

      const testError = new Error('EADDRINUSE: Address already in use');
      if (mockServerListeners.error) {
        mockServerListeners.error.forEach(cb => cb(testError));
      }

      expect(localServerStore.status).toBe('error');
      expect(localServerStore.lastError).toContain('EADDRINUSE');
    });

    it('stops listening and cleans up connections', async () => {
      await localServerController.start();
      if (mockServerListeners.listening) {
        mockServerListeners.listening.forEach(cb => cb());
      }
      expect(localServerStore.status).toBe('running');

      await localServerController.stop();
      expect(localServerStore.status).toBe('stopped');
    });
  });

  describe('request and route handling', () => {
    let mockConnection: HttpConnection;

    beforeEach(() => {
      mockConnection = {
        socket: {
          write: mockSocketWrite,
          end: mockSocketEnd,
          destroy: mockSocketDestroy,
        },
        isClosed: false,
        sendResponse: jest.fn(),
        sendError: jest.fn(),
      } as unknown as HttpConnection;
    });

    it('processes CORS OPTIONS requests (preflight)', () => {
      const req: HttpRequest = {
        method: 'OPTIONS',
        path: '/',
        headers: {},
        body: '',
        requestId: 'test-req',
      };

      // Call private request handler directly for unit testing
      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        204,
        'No Content',
        expect.objectContaining({
          'Access-Control-Allow-Origin': '*',
        }),
        '',
      );
      expect(localServerStore.logs.length).toBe(1);
      expect(localServerStore.logs[0].method).toBe('OPTIONS');
    });

    it('rejects unauthorized requests when auth is enabled', () => {
      const req: HttpRequest = {
        method: 'GET',
        path: '/health',
        headers: {}, // missing authorization
        body: '',
        requestId: 'test-req',
      };

      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        401,
        'Unauthorized',
        expect.any(Object),
        expect.stringContaining('Incorrect API key'),
      );
      expect(localServerStore.logs.length).toBe(1);
      expect(localServerStore.logs[0].status).toBe(401);
    });

    it('authorizes and routes valid GET / health requests', () => {
      const req: HttpRequest = {
        method: 'GET',
        path: '/health',
        headers: {
          authorization: 'Bearer test-api-key',
        },
        body: '',
        requestId: 'test-req',
      };

      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        200,
        'OK',
        expect.any(Object),
        expect.stringContaining('server'),
      );
      expect(localServerStore.logs.length).toBe(1);
      expect(localServerStore.logs[0].status).toBe(200);
    });

    it('returns version info on GET /version', () => {
      const req: HttpRequest = {
        method: 'GET',
        path: '/version',
        headers: {
          authorization: 'Bearer test-api-key',
        },
        body: '',
        requestId: 'test-req',
      };

      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        200,
        'OK',
        expect.any(Object),
        expect.stringContaining('1.16.1'),
      );
      expect(localServerStore.logs[0].route).toBe('/version');
    });

    it('returns placeholder response on POST /v1/chat/completions', () => {
      const req: HttpRequest = {
        method: 'POST',
        path: '/v1/chat/completions',
        headers: {
          authorization: 'Bearer test-api-key',
        },
        body: '',
        requestId: 'test-req',
      };

      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendResponse).toHaveBeenCalledWith(
        503,
        'Service Unavailable',
        expect.any(Object),
        expect.stringContaining('inference_pending'),
      );
    });

    it('handles 404 for unknown routes', () => {
      const req: HttpRequest = {
        method: 'GET',
        path: '/unknown-route',
        headers: {
          authorization: 'Bearer test-api-key',
        },
        body: '',
        requestId: 'test-req',
      };

      (localServerController as any).handleRequest(req, mockConnection);

      expect(mockConnection.sendError).toHaveBeenCalledWith(
        404,
        'Not Found',
        expect.stringContaining('not found'),
      );
    });
  });
});
