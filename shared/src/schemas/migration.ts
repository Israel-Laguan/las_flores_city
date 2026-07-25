import { z } from 'zod';
import { zodUuid, zodUuidOptional } from './uuid.js';
import { ContentTypeSchema } from './content-validation.js';

export const MigrationLogSchema = z.object({
  id: zodUuid(),
  file_path: z.string(),
  file_checksum: z.string(),
  content_type: ContentTypeSchema,
  content_id: zodUuid(),
  applied_at: z.string().datetime(),
  applied_by: zodUuidOptional(),
});

export type MigrationLog = z.infer<typeof MigrationLogSchema>;
