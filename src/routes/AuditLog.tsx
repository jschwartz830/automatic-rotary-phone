import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useHousehold } from '../context/HouseholdContext'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import type { AuditEvent } from '../lib/types'

const ENTITY_LABELS: Record<string, string> = {
  time_entry: 'Time entry',
  schedule_shift: 'Schedule shift',
  caregiver_profile: 'Pay / policy settings',
  leave_request: 'PTO request',
  leave_policy: 'PTO policy',
  payment_record: 'Payment',
  timesheet: 'Timesheet',
  household_user: 'Permissions',
}

function describeEvent(event: AuditEvent): string {
  const entity = ENTITY_LABELS[event.entity_type] ?? event.entity_type.replace(/_/g, ' ')
  return `${entity} ${event.action.replace(/_/g, ' ')}`
}

export function AuditLog() {
  const { household, isParentOrCoAdmin } = useHousehold()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!household) return
    if (!isParentOrCoAdmin) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .eq('household_id', household!.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!cancelled) {
        setEvents((data ?? []) as AuditEvent[])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [household, isParentOrCoAdmin])

  if (!isParentOrCoAdmin) return <Navigate to="/" replace />

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
      <p className="text-sm text-gray-500">
        A record of sensitive changes made in this household: who, what, and when. Approved or paid
        records are never edited silently -- this is the trail of every correction.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : events.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No audit events yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const expanded = expandedId === event.id
            const hasDetail = Boolean(event.before_json || event.after_json)
            return (
              <Card key={event.id}>
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => hasDetail && setExpandedId(expanded ? null : event.id)}
                >
                  <div>
                    <p className="text-sm font-semibold capitalize text-gray-900">{describeEvent(event)}</p>
                    <p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
                  </div>
                  {hasDetail && <span className="text-xs text-gray-400">{expanded ? 'Hide' : 'Details'}</span>}
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs">
                    {event.before_json && (
                      <div>
                        <p className="font-medium text-gray-500">Before</p>
                        <pre className="overflow-x-auto rounded-lg bg-gray-50 p-2 text-gray-700">
                          {JSON.stringify(event.before_json, null, 2)}
                        </pre>
                      </div>
                    )}
                    {event.after_json && (
                      <div>
                        <p className="font-medium text-gray-500">After</p>
                        <pre className="overflow-x-auto rounded-lg bg-gray-50 p-2 text-gray-700">
                          {JSON.stringify(event.after_json, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
