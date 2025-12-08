declare module '@cerebras/cerebras_cloud_sdk' {
  export interface ChatCompletion {
    choices: Array<{
      message: {
        content: string;
      };
    }>;
  }

  export interface ChatCompletionCreateParams {
    model: string;
    messages: Array<{
      role: string;
      content: string;
    }>;
    max_tokens?: number;
    temperature?: number;
  }

  export class CerebrasCloudSDK {
    chat: {
      completions: {
        create: (params: ChatCompletionCreateParams) => Promise<ChatCompletion>;
      };
    };
    constructor(options: { apiKey: string });
  }

  export default CerebrasCloudSDK;
}