import { supabase } from './supabase'

export async function logAuditEvent(params: {
  householdId: string
  actorUserId: string
  entityType: string
  entityId: string
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}) {
  const { error } = await supabase.from('audit_events').insert({
    household_id: params.householdId,
    actor_user_id: params.actorUserId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    before_json: params.before ?? null,
    after_json: params.after ?? null,
  })
  if (error) {
    // Auditing must never block the underlying action from having already
    // succeeded; surface to console for operator visibility instead.
    // eslint-disable-next-line no-console
    console.error('Failed to write audit event', error)
  }
}
