import { chatCompletionJSON, type OpenAICompatClient } from "./openaiCompat";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function groqClient(): OpenAICompatClient {
  return {
    baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey: mustEnv("GROQ_API_KEY"),
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  };
}

export function deepseekClient(): OpenAICompatClient {
  return {
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: mustEnv("DEEPSEEK_API_KEY"),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

export function kimiClient(): OpenAICompatClient {
  return {
    baseUrl: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
    apiKey: mustEnv("KIMI_API_KEY"),
    model: process.env.KIMI_MODEL || "moonshot-v1-8k",
  };
}

export async function callGroqJSON<T>(messages: any) {
  return chatCompletionJSON<T>(groqClient(), messages);
}

export async function callDeepseekJSON<T>(messages: any) {
  return chatCompletionJSON<T>(deepseekClient(), messages);
}

export async function callKimiJSON<T>(messages: any) {
  return chatCompletionJSON<T>(kimiClient(), messages);
}
