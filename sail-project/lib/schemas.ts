import { z } from 'zod';

// --- Sub-Schemas ---

export const ChronosTimeSchema = z.object({
  year: z.number(),
  month: z.number().optional(),
  day: z.number().optional(),
  hour: z.number().optional(),
  minute: z.number().optional(),
  second: z.number().optional(),
  millisecond: z.number().optional(),
  astro_year: z.number(), // Required for sorting
  precision: z.enum(['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond']).default('year'),
});

export const ChronosLocationSchema = z.object({
  lat: z.number().min(-90).max(90), // Strict geo-bounds
  lng: z.number().min(-180).max(180),
  placeName: z.string().optional(),
  granularity: z.enum(['spot', 'city', 'territory', 'continent']).default('spot'),
  certainty: z.enum(['definite', 'approximate']).default('definite'),
  customRadius: z.number().optional(),
  regionId: z.string().optional(),
});

export const EventSourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

// --- Main Event Schema ---

export const EventDataSchema = z.object({
  id: z.string(), // UUID
  title: z.string(),
  summary: z.string().optional().default(''), // Fallback to empty string
  imageUrl: z.string().url().optional().or(z.literal('')), // Allow valid URL or empty string

  start: ChronosTimeSchema,
  end: ChronosTimeSchema.optional(),

  location: ChronosLocationSchema,

  // [FIX] Simplify importance validation
  importance: z.coerce.number().min(0.1).max(10),

  sources: z.array(EventSourceSchema).optional().default([]),
});

// Export the array schema for API responses
export const EventListSchema = z.array(EventDataSchema);