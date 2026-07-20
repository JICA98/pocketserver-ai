import {ensureStringArray, toApiCompletionParams} from '../completionTypes';
import {defaultCompletionParams} from '../completionSettingsVersions';

describe('ensureStringArray', () => {
  it('returns undefined for null/undefined', () => {
    expect(ensureStringArray(null)).toBeUndefined();
    expect(ensureStringArray(undefined)).toBeUndefined();
  });

  it('wraps a single string', () => {
    expect(ensureStringArray('</s>')).toEqual(['</s>']);
  });

  it('passes through a string array', () => {
    expect(ensureStringArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('coerces array-like plain objects (rehydrate glitch)', () => {
    const arrayLike = {0: '</s>', 1: '<|im_end|>', length: 2};
    expect(ensureStringArray(arrayLike)).toEqual(['</s>', '<|im_end|>']);
  });

  it('returns undefined for non-array-like objects', () => {
    expect(ensureStringArray({foo: 1})).toBeUndefined();
    expect(ensureStringArray({a: '</s>', b: '<eos>'})).toBeUndefined();
  });
});

describe('toApiCompletionParams', () => {
  it('strips app-only keys', () => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      version: 4,
      include_thinking_in_context: false,
    });
    expect((result as any).version).toBeUndefined();
    expect((result as any).include_thinking_in_context).toBeUndefined();
  });

  it('normalizes object-shaped stop into string[]', () => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      // @ts-expect-error intentional bad shape from rehydrate
      stop: {0: '</s>', 1: '<|im_end|>', length: 2},
    });
    expect(Array.isArray(result.stop)).toBe(true);
    expect(result.stop).toEqual(['</s>', '<|im_end|>']);
  });

  it('drops invalid stop instead of passing object to JSI', () => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      // @ts-expect-error intentional
      stop: {not: 'an-array'},
    });
    expect(result.stop).toBeUndefined();
  });

  it('drops object-shaped logit_bias', () => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      // @ts-expect-error intentional OpenAI-style map
      logit_bias: {'123': -100},
    });
    expect((result as any).logit_bias).toBeUndefined();
  });

  it('drops non-array tools', () => {
    const result = toApiCompletionParams({
      ...defaultCompletionParams,
      // @ts-expect-error intentional
      tools: {bash: {type: 'function'}},
    });
    expect((result as any).tools).toBeUndefined();
  });
});
