import {makeAutoObservable, runInAction} from 'mobx';
import {modelStore} from '../../store';
import {localServerStore} from '../../store/LocalServerStore';
import {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';

interface QueuedRequest {
  id: string;
  source: 'chat' | 'server';
  params: ApiCompletionParams;
  callback?: (data: CompletionStreamData) => void;
  resolve: (res: CompletionResult) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onQueueAbort?: () => void;
}

export class InferenceCoordinator implements CompletionEngine {
  private activeRequest: QueuedRequest | null = null;
  private queue: QueuedRequest[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  get activeRequestCount(): number {
    return this.activeRequest ? 1 : 0;
  }

  get queuedRequestCount(): number {
    return this.queue.length;
  }

  // Implementation of CompletionEngine interface
  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    const source = (params as any).requestSource || 'chat';
    const signal = (params as any).signal;
    return this.enqueueRequest(source, params, callback, signal);
  }

  async stopCompletion(): Promise<void> {
    if (this.activeRequest) {
      const engine = modelStore.engine;
      if (engine) {
        await engine.stopCompletion();
      }
    }
  }

  // Internal queuing
  private enqueueRequest(
    source: 'chat' | 'server',
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    return new Promise<CompletionResult>((resolve, reject) => {
      const engine = modelStore.engine;
      if (!engine) {
        reject(new Error('No GGUF model is currently loaded on this device.'));
        return;
      }

      if (signal?.aborted) {
        reject(new Error('Request aborted.'));
        return;
      }

      const reqId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const request: QueuedRequest = {
        id: reqId,
        source,
        params,
        callback,
        resolve,
        reject,
        signal,
      };

      // Check queue limit for server requests
      const queueLimit = localServerStore.config.queueLimit;
      if (source === 'server' && this.queue.length >= queueLimit) {
        reject(new Error('Server busy. Queue limit reached.'));
        return;
      }

      // Add abort listener while in queue
      const onAbort = () => {
        const idx = this.queue.findIndex(r => r.id === reqId);
        if (idx === -1) {
          return;
        }
        this.queue.splice(idx, 1);
        this.updateStats();
        reject(new Error('Request aborted while queued.'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
        request.onQueueAbort = onAbort;
      }

      this.queue.push(request);
      this.updateStats();

      // Trigger processing
      this.processQueue();
    });
  }

  private updateStats() {
    runInAction(() => {
      localServerStore.activeRequests = this.activeRequest ? 1 : 0;
      localServerStore.queuedRequests = this.queue.length;
    });
  }

  private async processQueue() {
    if (this.activeRequest || this.queue.length === 0) {
      return;
    }

    const nextReq = this.queue.shift();
    if (!nextReq) {
      return;
    }

    this.activeRequest = nextReq;
    this.updateStats();

    // Clean up queue abort listener
    if (nextReq.signal) {
      if (nextReq.onQueueAbort) {
        nextReq.signal.removeEventListener('abort', nextReq.onQueueAbort);
      }
      if (nextReq.signal.aborted) {
        this.activeRequest = null;
        this.updateStats();
        nextReq.reject(new Error('Request aborted.'));
        this.processQueue();
        return;
      }
    }

    const startTime = Date.now();
    const engine = modelStore.engine;

    const onAbortActive = () => {
      if (engine) {
        engine.stopCompletion().catch(err => {
          console.warn('[Coordinator] stopCompletion failed:', err);
        });
      }
    };

    if (nextReq.signal) {
      nextReq.signal.addEventListener('abort', onAbortActive);
    }

    try {
      const result = await engine!.completion(nextReq.params, nextReq.callback);
      const duration = Date.now() - startTime;
      const tokensPredicted = result.tokens_predicted || 0;

      // Update statistics
      runInAction(() => {
        localServerStore.stats.requestsServed += 1;
        localServerStore.stats.tokensGenerated += tokensPredicted;
      });

      nextReq.resolve(result);
    } catch (err: any) {
      console.error('[InferenceCoordinator] processQueue error:', err);
      runInAction(() => {
        localServerStore.stats.requestsFailed += 1;
      });
      nextReq.reject(err);
    } finally {
      if (nextReq.signal) {
        nextReq.signal.removeEventListener('abort', onAbortActive);
      }
      this.activeRequest = null;
      this.updateStats();
      this.processQueue();
    }
  }
}

export const inferenceCoordinator = new InferenceCoordinator();
export default inferenceCoordinator;
