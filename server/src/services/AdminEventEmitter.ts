import { queryOLAP } from '../database/connection.js';

export type AdminEventType =
  | 'plan_created' | 'plan_refined' | 'plan_staged'
  | 'plan_migrated' | 'plan_verified' | 'plan_failed'
  | 'user_role_changed' | 'settings_updated';

/**
 * Fire-and-forget admin event emitter.
 * Uses queryOLAP which swallows errors internally — never blocks the caller.
 */
export function emitAdminEvent(
  eventType: AdminEventType,
  eventData: Record<string, unknown>,
  planId?: string,
  createdBy?: string,
): void {
  queryOLAP(
    `INSERT INTO admin_events (event_type, event_data, plan_id, created_by)
     VALUES ($1, $2::jsonb, $3, $4)`,
    [eventType, JSON.stringify(eventData), planId || null, createdBy || null],
  ).catch(() => {});
}
