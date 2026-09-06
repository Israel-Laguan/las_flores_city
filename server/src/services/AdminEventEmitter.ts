// Admin telemetry is intentionally OLTP (not OLAP) for low-latency event capture.
import { queryOLTP } from '@las-flores/infra';

export type AdminEventType =
  | 'plan_created' | 'plan_refined' | 'plan_staged'
  | 'plan_migrated' | 'plan_verified' | 'plan_failed'   | 'plan_solidified'
  | 'plan_analyzed' | 'plan_annotation_status'
  | 'plan_chat_reply' | 'plan_delta_applied' | 'plan_delta_discarded'
  | 'plan_rejected' | 'plan_deleted' | 'plan_intake'
  | 'user_role_changed' | 'settings_updated'
  | 'placeholders_filled'
  | 'patch_created' | 'patch_applied' | 'patch_rejected' | 'patch_rolled_back'
  | 'claim_created' | 'claim_updated';

/**
 * Admin event emitter. Returns a promise so callers that need durable
 * provenance (e.g. graph-intake creation) can `await` it; callers that
 * don't need durability can still fire-and-forget without awaiting.
 */
export function emitAdminEvent(
  eventType: AdminEventType,
  eventData: Record<string, unknown>,
  planId?: string,
  createdBy?: string,
): Promise<void> {
  return queryOLTP(
    `INSERT INTO admin_events (event_type, event_data, plan_id, created_by)
     VALUES ($1, $2::jsonb, $3, $4)`,
    [eventType, JSON.stringify(eventData), planId || null, createdBy || null],
  )
    .then(() => {})
    .catch(() => {});
}
