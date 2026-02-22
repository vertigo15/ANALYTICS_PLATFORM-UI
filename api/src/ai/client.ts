import OpenAI from 'openai';

// Remove trailing slash from endpoint if present
const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '') || '';
const baseURL = `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`;

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_completion_tokens?: number;
  response_format?: { type: 'json_object' };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: '', // For Azure OpenAI, model is specified in the URL via deployment
      messages,
      temperature: options.temperature ?? 0.7,
      max_completion_tokens: options.max_completion_tokens ?? 1500,
      ...(options.response_format && { response_format: options.response_format }),
    });

    return response.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error('Azure OpenAI Error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      baseURL,
    });
    throw error;
  }
}

export { client };
