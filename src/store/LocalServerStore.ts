import 'react-native-get-random-values';
import {makeAutoObservable, reaction, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';
import {NativeEventEmitter, Platform} from 'react-native';
import {
  LocalServerStatus,
  LocalServerConfig,
  LocalServerRuntimeInfo,
  LocalServerStats,
  LocalServerLogEntry,
  LocalServerCapabilities,
} from '../utils/localServerTypes';
import {modelStore} from './ModelStore';
import NativeServerForegroundService from '../specs/NativeServerForegroundService';

// We will import localServerController from services/server/LocalServerController
// Using a lazy require or direct import. Let's use direct import. We will create the file in Phase 3.
let localServerController: any = null;
try {
  localServerController =
    require('../services/server/LocalServerController').localServerController;
} catch {
  // Handled if controller is not loaded yet
}

export class LocalServerStore {
  status: LocalServerStatus = 'stopped';
  config: LocalServerConfig = {
    port: 8080,
    bindMode: 'localhost',
    authEnabled: true,
    queueLimit: 10,
    requestTimeoutMs: 60000,
    manualPublicUrl: '',
    tunnelMode: 'disabled',
    corsAllowedOrigins: ['*'],
  };
  runtimeInfo: LocalServerRuntimeInfo = {
    localUrl: 'http://127.0.0.1:8080',
    lanUrl: '',
    publicUrl: '',
  };
  activeRequests = 0;
  queuedRequests = 0;
  stats: LocalServerStats = {
    requestsServed: 0,
    requestsFailed: 0,
    tokensGenerated: 0,
    activeRequests: 0,
    queuedRequests: 0,
  };
  logs: LocalServerLogEntry[] = [];
  lastError: string | null = null;
  capabilities: LocalServerCapabilities = {
    backgroundServing: true,
    embeddingSupported: false,
  };
  apiKey = '';
  validationErrors: Record<string, string> = {};

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'LocalServerStore',
      properties: ['config', 'stats'],
      storage: AsyncStorage,
    }).then(() => {
      this.loadApiKey();
      this.refreshNetworkAddresses();
      this.setupServiceIntegration();
    });
  }

  private setupServiceIntegration() {
    if (Platform.OS !== 'android' || !NativeServerForegroundService) {
      return;
    }

    const emitter = new NativeEventEmitter(NativeServerForegroundService);
    emitter.addListener('ServerForegroundService', (event: any) => {
      if (event.eventType === 'stopRequested') {
        this.stop();
      }
    });

    let lastUpdate = 0;
    const throttledUpdate = () => {
      const now = Date.now();
      if (now - lastUpdate < 1000 || this.status !== 'running') {
        return;
      }
      lastUpdate = now;
      NativeServerForegroundService?.updateNotification(
        this.config.bindMode,
        this.config.port,
        this.activeRequests,
      );
    };

    reaction(
      () => [this.activeRequests, this.config.bindMode, this.config.port] as const,
      () => throttledUpdate(),
      {fireImmediately: false},
    );
  }

  // Computed properties
  get isModelReady(): boolean {
    return (
      modelStore.context !== undefined && modelStore.activeModel !== undefined
    );
  }

  get loadedModelName(): string | null {
    return modelStore.activeModel ? modelStore.activeModel.name : null;
  }

  // API Key operations (Keychain)
  async loadApiKey(): Promise<void> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: 'pocketpal-local-server-apikey',
      });
      if (credentials) {
        runInAction(() => {
          this.apiKey = credentials.password;
        });
      } else {
        await this.generateAndStoreApiKey();
      }
    } catch (error) {
      console.error('Failed to load local server API key:', error);
      // Memory fallback if keychain fails
      runInAction(() => {
        this.apiKey = this.generateRandomKey();
      });
    }
  }

  async generateAndStoreApiKey(): Promise<void> {
    const key = this.generateRandomKey();
    try {
      await Keychain.setGenericPassword('apiKey', key, {
        service: 'pocketpal-local-server-apikey',
      });
      runInAction(() => {
        this.apiKey = key;
      });
    } catch (error) {
      console.error('Failed to save local server API key:', error);
    }
  }

  private generateRandomKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    return `sk-pocketpal-${hex}`;
  }

  // Actions
  updateConfig(updates: Partial<LocalServerConfig>) {
    runInAction(() => {
      this.config = {
        ...this.config,
        ...updates,
      };
      this.validateConfig();
    });
  }

  async regenerateApiKey() {
    await this.generateAndStoreApiKey();
    this.addLogEntry('SYSTEM', 'API Key regenerated.', 200, 0);
  }

  clearLogs() {
    runInAction(() => {
      this.logs = [];
    });
  }

  addLogEntry(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    error?: string,
  ) {
    runInAction(() => {
      // Cap log entries at 200 items in memory to prevent memory bloat
      if (this.logs.length >= 200) {
        this.logs.shift();
      }
      this.logs.push({
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        method,
        route,
        status: statusCode,
        duration,
        error,
      });
    });
  }

  setManualPublicUrl(url: string) {
    runInAction(() => {
      this.config.manualPublicUrl = url;
      this.runtimeInfo.publicUrl = url;
    });
  }

  refreshNetworkAddresses() {
    runInAction(() => {
      this.runtimeInfo.localUrl = `http://127.0.0.1:${this.config.port}`;
      if (this.config.bindMode === 'lan') {
        // We will resolve actual network IP in LocalServerController and set it.
        // For now, let's keep a template LAN URL
        this.runtimeInfo.lanUrl = `http://192.168.1.100:${this.config.port}`;
      } else {
        this.runtimeInfo.lanUrl = '';
      }
      if (this.config.tunnelMode === 'manual') {
        this.runtimeInfo.publicUrl = this.config.manualPublicUrl;
      } else {
        this.runtimeInfo.publicUrl = '';
      }
    });
  }

  validateConfig(): boolean {
    const errors: Record<string, string> = {};

    const portNum = Number(this.config.port);
    if (!this.config.port || isNaN(portNum)) {
      errors.port = 'Port must be a valid number.';
    } else if (portNum < 1024 || portNum > 65535) {
      errors.port = 'Port must be between 1024 and 65535.';
    }

    if (this.config.authEnabled && !this.apiKey) {
      errors.apiKey = 'API Key cannot be empty when authentication is enabled.';
    }

    if (this.config.tunnelMode === 'manual' && this.config.manualPublicUrl) {
      try {
        const url = new URL(this.config.manualPublicUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.manualPublicUrl = 'Public URL must use HTTP or HTTPS.';
        }
      } catch {
        errors.manualPublicUrl = 'Invalid Public URL format.';
      }
    }

    runInAction(() => {
      this.validationErrors = errors;
    });

    return Object.keys(errors).length === 0;
  }

  // Server lifecycles (delegated to LocalServerController)
  async start() {
    if (this.status === 'starting' || this.status === 'running') {
      return;
    }
    if (!this.validateConfig()) {
      return;
    }
    if (!localServerController) {
      try {
        localServerController =
          require('../services/server/LocalServerController').localServerController;
      } catch {
        // Handled if controller is not loaded yet
      }
    }
    if (localServerController) {
      await localServerController.start();
    } else {
      runInAction(() => {
        this.status = 'running';
      });
      this.addLogEntry('SYSTEM', 'Server started (placeholder state).', 200, 0);
    }
  }

  async stop() {
    if (this.status === 'stopping' || this.status === 'stopped') {
      return;
    }
    if (localServerController) {
      await localServerController.stop();
    } else {
      runInAction(() => {
        this.status = 'stopped';
      });
      this.addLogEntry('SYSTEM', 'Server stopped (placeholder state).', 200, 0);
    }
  }

  async restart() {
    await this.stop();
    await this.start();
  }
}

export const localServerStore = new LocalServerStore();
export default localServerStore;
