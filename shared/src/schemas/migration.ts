import { z } from 'zod';
import { ContentTypeSchema } from './content-validation.js';

export const MigrationLogSchema = z.object({
  id: z.string().uuid(),
  file_path: z.string(),
  file_checksum: z.string(),
  content_type: ContentTypeSchema,
  content_id: z.string().uuid(),
  applied_at: z.string().datetime(),
  applied_by: z.string().uuid().optional(),
});

export type MigrationLog = z.infer<typeof MigrationLogSchema>;
