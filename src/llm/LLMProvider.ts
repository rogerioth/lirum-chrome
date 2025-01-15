import { Logger } from '../utils/Logger';

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface LLMProvider {
  name: string;
  defaultModel: string;
  availableModels: string[];
  
  /**
   * Initialize the provider with an API key
   */
  initialize(apiKey: string): Promise<void>;

  /**
   * Send a prompt to the LLM and get a response
   */
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Check if the provider is properly initialized
   */
  isInitialized(): boolean;

  /**
   * Get the currently selected model
   */
  getCurrentModel(): string;

  /**
   * Set the model to use for completions
   */
  setModel(model: string): void;

  /**
   * Validate the API key format
   */
  validateApiKey(apiKey: string): boolean;
} 