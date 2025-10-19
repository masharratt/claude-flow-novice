import { LLMProviderInterface, ProviderError } from './provider-interface';
import { AnthropicProvider } from './anthropic-provider';

export type ProviderType = 'anthropic' | 'openai' | 'azure' | 'google';

export class ProviderFactory {
  private static providers: Map<ProviderType, new (apiKey?: string) => LLMProviderInterface> = new Map([
    ['anthropic', AnthropicProvider]
    // Placeholder for future providers
    // ['openai', OpenAIProvider],
    // ['azure', AzureProvider],
    // ['google', GoogleProvider]
  ]);

  /**
   * Create a provider instance
   * @param type Provider type
   * @param apiKey Optional API key (defaults to env variable)
   * @returns LLM Provider instance
   */
  static createProvider(type: ProviderType, apiKey?: string): LLMProviderInterface {
    const ProviderClass = this.providers.get(type);

    if (!ProviderClass) {
      throw new ProviderError(
        `Provider ${type} is not supported`,
        'PROVIDER_NOT_FOUND',
        { availableProviders: Array.from(this.providers.keys()) }
      );
    }

    return new ProviderClass(apiKey);
  }

  /**
   * Register a new provider
   * @param type Provider type
   * @param providerClass Provider implementation class
   */
  static registerProvider(
    type: ProviderType,
    providerClass: new (apiKey?: string) => LLMProviderInterface
  ): void {
    this.providers.set(type, providerClass);
  }

  /**
   * Get available provider types
   * @returns List of registered provider types
   */
  static getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }
}