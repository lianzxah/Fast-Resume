import './env';

export const AI_LIMITS = {
  maxMessageChars: 4000,
  maxTextIndexItems: 80,
  maxRequestBytes: 900_000,
  maxCheckpointBytes: 8_000_000,
  maxVisibleTextChars: 36_000,
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function envAiDefaults() {
  return {
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.AI_MODEL || 'deepseek-v4-pro',
    temperature: parseNumber(process.env.AI_TEMPERATURE, 0.2),
    maxTokens: process.env.AI_MAX_TOKENS ? parseNumber(process.env.AI_MAX_TOKENS, 1200) : undefined,
    supportsJsonMode: process.env.AI_SUPPORTS_JSON_MODE
      ? process.env.AI_SUPPORTS_JSON_MODE !== 'false'
      : true,
  };
}

export function maskSecret(value: string | undefined | null): {
  configured: boolean;
  preview?: string;
} {
  if (!value) return { configured: false };
  if (value.length <= 8) return { configured: true, preview: '****' };
  return { configured: true, preview: `${value.slice(0, 3)}...${value.slice(-4)}` };
}
