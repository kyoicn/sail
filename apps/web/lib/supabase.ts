
import { createClient } from '@supabase/supabase-js';

// Robust Env Var Access
const getEnvVar = (key: string, publicFallbackKey?: string): string => {
  const val = process.env[key] || (publicFallbackKey ? process.env[publicFallbackKey] : undefined);
  if (!val) {
    console.warn(`[Supabase] Missing env var: ${key} (or ${publicFallbackKey})`);
    return '';
  }
  return val;
};

const supabaseUrl = getEnvVar('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const createServiceClient = (schema: string = 'public') => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing from environment variables.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    db: { schema },
    auth: {
      persistSession: false,
    }
  });
};
