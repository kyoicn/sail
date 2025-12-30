import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDataset } from '../env';

describe('getDataset', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DATASET', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('prioritizes override value', () => {
    expect(getDataset('staging')).toBe('staging');
    expect(getDataset('dev')).toBe('dev');
    expect(getDataset('prod')).toBe('prod');
    expect(getDataset('local')).toBe('local');
  });

  it('ignores invalid override values', () => {
    // @ts-ignore
    expect(getDataset('invalid')).not.toBe('invalid');
  });

  it('prioritizes NEXT_PUBLIC_DATASET env var', () => {
    vi.stubEnv('NEXT_PUBLIC_DATASET', 'prod');
    expect(getDataset()).toBe('prod');
  });

  it('detects Vercel production environment', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getDataset()).toBe('prod');
  });

  it('detects Vercel preview environment as staging', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(getDataset()).toBe('staging');
  });

  it('detects Vercel development environment as dev', () => {
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(getDataset()).toBe('dev');
  });

  it('falls back to dev when NODE_ENV is development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getDataset()).toBe('dev');
  });

  it('falls back to prod when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getDataset()).toBe('prod');
  });
});
