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

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface LLMProvider {
  name: string;
  defaultModel: string;
  availableModels: string[];
  defaultEndpoint?: string;

  test(apiKey?: string, endpoint?: string): Promise<void>;
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  getCurrentModel(): string;
  setModel(model: string): void;
  validateApiKey?(apiKey: string): boolean;
  validateEndpoint?(endpoint: string): boolean;
} 