export type LocalServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export type LocalServerBindMode = 'localhost' | 'lan';

export type TunnelMode = 'disabled' | 'manual' | 'cloudflare';

export interface LocalServerConfig {
  port: number;
  bindMode: LocalServerBindMode;
  authEnabled: boolean;
  queueLimit: number;
  requestTimeoutMs: number;
  manualPublicUrl: string;
  tunnelMode: TunnelMode;
  corsAllowedOrigins: string[];
}

export interface LocalServerRuntimeInfo {
  localUrl: string;
  lanUrl: string;
  publicUrl: string;
}

export interface LocalServerStats {
  requestsServed: number;
  requestsFailed: number;
  tokensGenerated: number;
  activeRequests: number;
  queuedRequests: number;
}

export interface LocalServerLogEntry {
  id: string;
  timestamp: string;
  method: string;
  route: string;
  status: number;
  duration: number; // ms
  ip?: string;
  error?: string;
}

export interface LocalServerCapabilities {
  backgroundServing: boolean;
  embeddingSupported: boolean;
}

export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

// Request/response DTOs for Chat Completion
export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    name?: string;
  }>;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}

export interface TextCompletionRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
}

export interface TextCompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    logprobs: any;
    finish_reason: 'stop' | 'length' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
