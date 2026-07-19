import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';

// Mock dependencies before importing the store
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
  isHydrated: jest.fn().mockReturnValue(true),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('react-native-keychain', () => {
  let mockPassword = '';
  return {
    setGenericPassword: jest.fn().mockImplementation((user, password) => {
      mockPassword = password;
      return Promise.resolve(true);
    }),
    getGenericPassword: jest.fn().mockImplementation(() => {
      if (mockPassword) {
        return Promise.resolve({username: 'apiKey', password: mockPassword});
      }
      return Promise.resolve(false);
    }),
    resetGenericPassword: jest.fn().mockImplementation(() => {
      mockPassword = '';
      return Promise.resolve(true);
    }),
  };
});

// Mock modelStore context
jest.mock('../ModelStore', () => ({
  modelStore: {
    context: undefined,
    activeModel: undefined,
    isContextLoading: false,
  },
}));

import {localServerStore} from '../LocalServerStore';

describe('LocalServerStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store state between tests
    runInAction(() => {
      localServerStore.status = 'stopped';
      localServerStore.config = {
        port: 8080,
        bindMode: 'localhost',
        authEnabled: true,
        queueLimit: 10,
        requestTimeoutMs: 60000,
        manualPublicUrl: '',
        tunnelMode: 'disabled',
        corsAllowedOrigins: ['*'],
      };
      localServerStore.runtimeInfo = {
        localUrl: 'http://127.0.0.1:8080',
        lanUrl: '',
        publicUrl: '',
      };
      localServerStore.activeRequests = 0;
      localServerStore.queuedRequests = 0;
      localServerStore.stats = {
        requestsServed: 0,
        requestsFailed: 0,
        tokensGenerated: 0,
        activeRequests: 0,
        queuedRequests: 0,
      };
      localServerStore.logs = [];
      localServerStore.lastError = null;
      localServerStore.apiKey = '';
      localServerStore.validationErrors = {};
    });
  });

  describe('initial state', () => {
    it('starts with stopped status', () => {
      expect(localServerStore.status).toBe('stopped');
    });

    it('has default configuration values', () => {
      expect(localServerStore.config.port).toBe(8080);
      expect(localServerStore.config.bindMode).toBe('localhost');
      expect(localServerStore.config.authEnabled).toBe(true);
    });

    it('reports model readiness correctly', () => {
      expect(localServerStore.isModelReady).toBe(false);
      expect(localServerStore.loadedModelName).toBeNull();
    });
  });

  describe('configuration operations', () => {
    it('updates configurations and runs validation', () => {
      localServerStore.updateConfig({port: 9000, bindMode: 'lan'});
      expect(localServerStore.config.port).toBe(9000);
      expect(localServerStore.config.bindMode).toBe('lan');
      expect(localServerStore.validationErrors.port).toBeUndefined();
    });

    it('flags invalid port numbers', () => {
      localServerStore.updateConfig({port: 99999});
      expect(localServerStore.validateConfig()).toBe(false);
      expect(localServerStore.validationErrors.port).toBeDefined();

      localServerStore.updateConfig({port: 0});
      expect(localServerStore.validateConfig()).toBe(false);
      expect(localServerStore.validationErrors.port).toBeDefined();
    });

    it('requires API key when auth is enabled', async () => {
      runInAction(() => {
        localServerStore.apiKey = '';
      });
      localServerStore.updateConfig({authEnabled: true});
      expect(localServerStore.validateConfig()).toBe(false);
      expect(localServerStore.validationErrors.apiKey).toBeDefined();
    });
  });

  describe('address management', () => {
    it('refreshes network URLs correctly', () => {
      localServerStore.updateConfig({port: 8081, bindMode: 'localhost'});
      localServerStore.refreshNetworkAddresses();
      expect(localServerStore.runtimeInfo.localUrl).toBe(
        'http://127.0.0.1:8081',
      );
      expect(localServerStore.runtimeInfo.lanUrl).toBe('');

      localServerStore.updateConfig({bindMode: 'lan'});
      localServerStore.refreshNetworkAddresses();
      expect(localServerStore.runtimeInfo.lanUrl).toBe(
        'http://192.168.1.100:8081',
      );
    });

    it('sets manual public tunnel URL', () => {
      localServerStore.setManualPublicUrl('https://my-proxy.loca.lt');
      expect(localServerStore.config.manualPublicUrl).toBe(
        'https://my-proxy.loca.lt',
      );
      expect(localServerStore.runtimeInfo.publicUrl).toBe(
        'https://my-proxy.loca.lt',
      );
    });
  });

  describe('API key and Keychain operations', () => {
    it('loads and generates secure keys', async () => {
      await Keychain.resetGenericPassword();
      jest.clearAllMocks();
      await localServerStore.loadApiKey();
      expect(localServerStore.apiKey).toMatch(/^sk-pocketpal-[a-f0-9]+$/);
      expect(Keychain.setGenericPassword).toHaveBeenCalled();
    });

    it('regenerates API keys and logs key change', async () => {
      const firstKey = localServerStore.apiKey;
      await localServerStore.regenerateApiKey();
      expect(localServerStore.apiKey).not.toBe(firstKey);
      expect(localServerStore.logs.length).toBe(1);
      expect(localServerStore.logs[0].route).toBe('API Key regenerated.');
    });
  });

  describe('logs management', () => {
    it('adds and limits logs size', () => {
      localServerStore.addLogEntry('GET', '/health', 200, 15);
      expect(localServerStore.logs.length).toBe(1);
      expect(localServerStore.logs[0].method).toBe('GET');
      expect(localServerStore.logs[0].route).toBe('/health');
      expect(localServerStore.logs[0].status).toBe(200);
      expect(localServerStore.logs[0].duration).toBe(15);

      // Simulate a high request volume
      for (let i = 0; i < 250; i++) {
        localServerStore.addLogEntry('GET', `/api/${i}`, 200, 5);
      }
      expect(localServerStore.logs.length).toBe(200); // capped at 200
    });

    it('clears logs', () => {
      localServerStore.addLogEntry('GET', '/health', 200, 15);
      localServerStore.clearLogs();
      expect(localServerStore.logs.length).toBe(0);
    });
  });
});
