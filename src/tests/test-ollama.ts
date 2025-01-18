import { LLMProvider, LLMResponse, LLMOptions } from '../llm/LLMProvider';
import { OllamaProvider } from '../llm/OllamaProvider';
import fetch from 'node-fetch';

// Mock Logger for testing
class MockLogger {
    private static instance: MockLogger;
    private logs: any[] = [];
    
    private constructor() {}
    
    static getInstance(): MockLogger {
        if (!MockLogger.instance) {
            MockLogger.instance = new MockLogger();
        }
        return MockLogger.instance;
    }
    
    async info(message: string, details?: Record<string, unknown>): Promise<void> {
        console.log(`[INFO] ${message}`, details || '');
        this.logs.push({ level: 'info', message, details });
    }
    
    async debug(message: string, details?: Record<string, unknown>): Promise<void> {
        console.log(`[DEBUG] ${message}`, details || '');
        this.logs.push({ level: 'debug', message, details });
    }
    
    async error(message: string, details?: Record<string, unknown>): Promise<void> {
        console.error(`[ERROR] ${message}`, details || '');
        this.logs.push({ level: 'error', message, details });
    }
    
    async llm(message: string, details?: Record<string, unknown>): Promise<void> {
        console.log(`[LLM] ${message}`, details || '');
        this.logs.push({ level: 'llm', message, details });
    }

    async exportLogs(): Promise<string> {
        return JSON.stringify(this.logs, null, 2);
    }
}

// Mock the chrome namespace
(global as any).chrome = {
    storage: {
        local: {
            get: async () => ({}),
            set: async () => {}
        }
    }
};

// Test-specific OllamaProvider implementation that overrides the fetch method
class TestOllamaProvider extends OllamaProvider {
    constructor() {
        super();
        // Override the logger instance
        (this as any).logger = MockLogger.getInstance();
    }

    // Override the fetchWithExtension method to use node-fetch
    protected async fetchWithExtension(url: string, options: RequestInit): Promise<Response> {
        return fetch(url, options as any) as any;
    }
}

async function testOllama() {
    const [endpoint, model] = process.argv.slice(2);
    
    if (!endpoint || !model) {
        console.error('Usage: ts-node test-ollama.ts [endpoint] [model]');
        process.exit(1);
    }

    console.log(`Testing Ollama with endpoint: ${endpoint} and model: ${model}`);
    
    const provider = new TestOllamaProvider();
    
    try {
        // Test provider configuration
        console.log('\nTesting provider configuration...');
        await provider.test(undefined, endpoint);
        
        // Save provider configuration to storage
        console.log('\nSaving provider configuration...');
        await (global as any).chrome.storage.local.set({
            'ollama_provider_config': {
                endpoint,
                model
            }
        });
        
        // Set the model
        console.log(`\nSetting model to ${model}...`);
        provider.setModel(model);
        
        // Test a simple completion
        const prompt = 'Hello! Please respond with a short greeting.';
        console.log(`\nSending test prompt: "${prompt}"`);
        
        const response = await provider.complete(prompt);
        
        console.log('\nResponse received:');
        console.log('----------------------------------------');
        console.log('Content:', response.content);
        console.log('Model:', response.model);
        console.log('Usage:', JSON.stringify(response.usage, null, 2));
        console.log('----------------------------------------');
        
        console.log('\nTest completed successfully!');
        
    } catch (error) {
        console.error('\nTest failed with error:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the test
testOllama().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
}); 