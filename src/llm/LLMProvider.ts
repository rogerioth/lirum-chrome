import { Logger } from '../utils/Logger';

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw: any;
}

export interface LLMStreamResponse {
  content: string;
  done: boolean;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  onToken?: (token: string) => void;
}

export interface LLMProvider {
  name: string;
  defaultModel: string;
  availableModels: string[];
  defaultEndpoint?: string;
  readonly key: string;  // Unique identifier for the provider instance

  test(apiKey?: string, endpoint?: string): Promise<void>;
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  completeStream(prompt: string, options?: LLMOptions): AsyncGenerator<LLMStreamResponse>;
  configure(config: { apiKey?: string; model?: string; endpoint?: string }): Promise<void>;
}