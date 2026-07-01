import { z } from 'zod';

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  birth_year: z.number().optional(),
  description: z.string().max(1000),  // Required field
  physical_description: z.string().optional(),
  psychological_description: z.string().optional(),
  background_and_role: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

// If you have specific validation rules (e.g., age limits), add them here
