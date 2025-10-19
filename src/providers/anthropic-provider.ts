import Anthropic from '@anthropic-ai/sdk';
import { LLMProviderInterface, LLMMessageOptions, LLMModel, ProviderError } from './provider-interface';

export class AnthropicProvider implements LLMProviderInterface {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel: string = 'claude-3-5-haiku-20240620') {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.defaultModel = defaultModel;
  }

  async sendMessage(prompt: string, options: LLMMessageOptions = {}): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: options.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        system: options.system,
        messages: [{ role: 'user', content: prompt }]
      });

      return response.content[0].text;
    } catch (error) {
      throw new ProviderError(
        'Failed to send message to Anthropic',
        'ANTHROPIC_SEND_ERROR',
        { originalError: error }
      );
    }
  }

  async *streamMessage(prompt: string, options: LLMMessageOptions = {}): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.client.messages.create({
        model: options.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        system: options.system,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      });

      for await (const messageStreamEvent of stream) {
        if (messageStreamEvent.type === 'content_block_delta') {
          yield messageStreamEvent.delta.text;
        }
      }
    } catch (error) {
      throw new ProviderError(
        'Failed to stream message from Anthropic',
        'ANTHROPIC_STREAM_ERROR',
        { originalError: error }
      );
    }
  }

  async getModels(): Promise<LLMModel[]> {
    return [
      {
        id: 'claude-3-5-haiku-20240620',
        name: 'Claude 3.5 Haiku',
        context_window: 200000,
        pricing: { input: 0.00003, output: 0.00015 }
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        context_window: 200000,
        pricing: { input: 0.00015, output: 0.00075 }
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        context_window: 200000,
        pricing: { input: 0.00003, output: 0.00015 }
      }
    ];
  }

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency?: number;
    models_available?: number;
  }> {
    try {
      const startTime = Date.now();
      await this.sendMessage('Health check', { maxTokens: 10 });
      const latency = Date.now() - startTime;

      const models = await this.getModels();

      return {
        status: latency < 500 ? 'healthy' : 'degraded',
        latency,
        models_available: models.length
      };
    } catch (error) {
      return {
        status: 'unavailable',
        latency: undefined,
        models_available: 0
      };
    }
  }
}