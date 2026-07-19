import {modelStore} from '../../../store';
import {localServerStore} from '../../../store/LocalServerStore';
import {InferenceCoordinator} from '../InferenceCoordinator';

describe('InferenceCoordinator', () => {
  let coordinator: InferenceCoordinator;
  let mockEngine: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEngine = {
      completion: jest.fn().mockImplementation(async (params, callback) => {
        if (callback) {
          callback({content: 'Hello'});
        }
        return {
          text: 'Hello',
          content: 'Hello',
          tokens_predicted: 5,
          tokens_evaluated: 10,
        };
      }),
      stopCompletion: jest.fn().mockResolvedValue(undefined),
    };

    modelStore.engine = mockEngine;
    localServerStore.config.queueLimit = 2;
    localServerStore.activeRequests = 0;
    localServerStore.queuedRequests = 0;
    localServerStore.stats = {
      requestsServed: 0,
      requestsFailed: 0,
      tokensGenerated: 0,
    } as any;

    coordinator = new InferenceCoordinator();
  });

  it('runs a completion successfully and updates stats', async () => {
    const result = await coordinator.completion({
      messages: [{role: 'user', content: 'test'}],
    } as any);

    expect(result.text).toBe('Hello');
    expect(mockEngine.completion).toHaveBeenCalledTimes(1);
    expect(localServerStore.stats.requestsServed).toBe(1);
    expect(localServerStore.stats.tokensGenerated).toBe(5);
    expect(localServerStore.activeRequests).toBe(0);
    expect(localServerStore.queuedRequests).toBe(0);
  });

  it('queues requests and runs them in FIFO order', async () => {
    let resolveFirstCompletion: any;
    const firstCompletionPromise = new Promise(resolve => {
      resolveFirstCompletion = resolve;
    });

    mockEngine.completion.mockImplementationOnce(async () => {
      await firstCompletionPromise;
      return {text: 'First', tokens_predicted: 3};
    });

    const p1 = coordinator.completion({requestSource: 'server'} as any);
    const p2 = coordinator.completion({requestSource: 'server'} as any);
    const p3 = coordinator.completion({requestSource: 'server'} as any);

    // Give microtasks time to run
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(localServerStore.activeRequests).toBe(1);
    expect(localServerStore.queuedRequests).toBe(2);

    // Resolve first request
    resolveFirstCompletion();
    const res1 = await p1;
    expect(res1.text).toBe('First');

    const res2 = await p2;
    const res3 = await p3;

    expect(res2.text).toBe('Hello');
    expect(res3.text).toBe('Hello');
    expect(localServerStore.activeRequests).toBe(0);
    expect(localServerStore.queuedRequests).toBe(0);
    expect(localServerStore.stats.requestsServed).toBe(3);
  });

  it('rejects with Server busy when queue limit is reached for server requests', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    mockEngine.completion.mockImplementationOnce(async () => {
      await firstPromise;
      return {text: 'First'};
    });

    // Run first (active)
    const p1 = coordinator.completion({requestSource: 'server'} as any);
    // Queue 1
    const p2 = coordinator.completion({requestSource: 'server'} as any);
    // Queue 2 (matches limit of 2)
    const p3 = coordinator.completion({requestSource: 'server'} as any);

    // Exceeds limit -> should reject immediately
    await expect(
      coordinator.completion({requestSource: 'server'} as any),
    ).rejects.toThrow('Server busy. Queue limit reached.');

    resolveFirst();
    await p1;
    await p2;
    await p3;
  });

  it('supports cancellation while queued', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    mockEngine.completion.mockImplementationOnce(async () => {
      await firstPromise;
      return {text: 'First'};
    });

    const p1 = coordinator.completion({requestSource: 'server'} as any);

    const abortController = new AbortController();
    const p2 = coordinator.completion({
      requestSource: 'server',
      signal: abortController.signal,
    } as any);

    // Abort the second request while it is queued
    abortController.abort();

    await expect(p2).rejects.toThrow('Request aborted while queued.');

    resolveFirst();
    await p1;

    expect(localServerStore.queuedRequests).toBe(0);
  });

  it('supports cancellation while active', async () => {
    let resolveFirst: any;
    let rejectFirst: any;
    const firstPromise = new Promise((resolve, reject) => {
      resolveFirst = resolve;
      rejectFirst = reject;
    });
    mockEngine.completion.mockImplementationOnce(async () => {
      await firstPromise;
      return {text: 'First'};
    });
    mockEngine.stopCompletion.mockImplementationOnce(async () => {
      rejectFirst(new Error('Interrupted'));
    });

    const abortController = new AbortController();
    const p1 = coordinator.completion({
      requestSource: 'server',
      signal: abortController.signal,
    } as any);

    // Give it a moment to run and become active
    await new Promise(resolve => setTimeout(resolve, 0));

    // Abort the active request
    abortController.abort();

    expect(mockEngine.stopCompletion).toHaveBeenCalledTimes(1);

    await expect(p1).rejects.toThrow('Interrupted');
    expect(localServerStore.stats.requestsFailed).toBe(1);
  });
});
