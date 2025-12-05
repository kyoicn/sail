import { z } from 'zod';

// --- Sub-Schemas ---

export const ChronosTimeSchema = z.object({
  year: z.number(),
  month: z.number().optional(),
  day: z.number().optional(),
  precision: z.enum(['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond']).default('year'),
});

export const ChronosLocationSchema = z.object({
  lat: z.number().min(-90).max(90), // Strict geo-bounds
  lng: z.number().min(-180).max(180),
  placeName: z.string().optional(),
  granularity: z.enum(['spot', 'city', 'territory', 'continent']).optional(),
  certainty: z.enum(['definite', 'approximate']).optional(),
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

  // Coerce string to number if API returns string "10.0", 
  // or default to 1.0 if missing. Supports floats.
  importance: z.preprocess((val) => Number(val) || 1.0, z.number().min(1).max(10)),

  sources: z.array(EventSourceSchema).optional().default([]),
});

// Export the array schema for API responses
export const EventListSchema = z.array(EventDataSchema);