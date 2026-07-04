import { z } from 'zod';

export const MapTileSchema = z.object({
  id: z.string().uuid(),
  district_id: z.string().uuid(),
  x: z.number().int(),
  y: z.number().int(),
  terrain_type: z.string().min(1).max(50),
  base_image_url: z.string().url().nullable().optional().or(z.literal('')),
  overlay_image_url: z.string().url().nullable().optional().or(z.literal('')),
  rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v), { message: 'rotation must be 0, 90, 180, or 270' }).default(0),
  is_flipped: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type MapTile = z.infer<typeof MapTileSchema>;

export const MapTileFileSchema = z.object({
  district: z.string().min(1).max(50),
  tiles: z.array(z.object({
    x: z.number().int(),
    y: z.number().int(),
    terrain_type: z.string().min(1).max(50),
    base_image_url: z.string().nullable().optional(),
    overlay_image_url: z.string().nullable().optional(),
    rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v), { message: 'rotation must be 0, 90, 180, or 270' }).default(0),
    is_flipped: z.boolean().default(false),
    metadata: z.record(z.string(), z.any()).optional(),
  })),
});

export type MapTileFile = z.infer<typeof MapTileFileSchema>;
