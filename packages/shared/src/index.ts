export * from './types';
import geminiModelsJson from './gemini-models.json';

export const geminiModels = geminiModelsJson as Record<string, { rpm: number; tpm: number }>;
