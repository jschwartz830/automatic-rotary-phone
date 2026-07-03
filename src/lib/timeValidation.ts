// Time-entry validation warnings (spec 13.4 "Validation").
//
// Pure, side-effect-free: given the values a user is entering plus a little
// context (their other entries, the scheduled shift for the day, the overtime
// threshold), it returns human-readable warnings. Per the spec these are
// *warnings*, not hard blocks — the caller decides whether to surface them and
// still allow the save. "Clock-out is missing" is handled separately by the
// reminders engine, not here, since it's a background condition rather than a
// property of a form being filled in.

import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import type { TimeEntry, TimeEntryStatus } from './types'

export type ActingRole = 'nanny' | 'parent'

export interface TimeEntryDraft {
  date: string // yyyy-MM-dd
  startTime: string // HH:mm
  endTime: string // HH:mm
  breakMinutes: number
  status: TimeEntryStatus
  /** id of the entry being edited, so it's excluded from overlap checks */
  entryId?: string | null
}

export interface TimeEntryValidationContext {
  role: ActingRole
  /** All active (non-deleted) entries for this caregiver. */
  existingEntries: TimeEntry[]
  /** Sum of scheduled shift hours for the entry's date, if any. */
  scheduledHoursForDate: number | null
  /** Caregiver's weekly overtime threshold in hours. */
  overtimeThresholdHours: number
  /** Household week start; controls how the weekly OT total is bucketed. */
  weekStartsOn: 0 | 1
}

/** Minutes past midnight for an HH:mm string, or null if unparseable. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** Local HH:mm for an ISO timestamp. */
function isoToLocalHhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Start/end minutes for an existing entry, preferring stored manual times and
 * falling back to clock timestamps. Returns null when the entry has neither a
 * complete manual range nor a completed clock pair (e.g. still clocked in).
 */
function entryMinutes(entry: TimeEntry): { start: number; end: number } | null {
  const ms = toMinutes(entry.manual_start_time)
  const me = toMinutes(entry.manual_end_time)
  if (ms != null && me != null) return { start: ms, end: me < ms ? me + 1440 : me }
  if (entry.clock_in_at && entry.clock_out_at) {
    const s = toMinutes(isoToLocalHhmm(entry.clock_in_at))!
    const e = toMinutes(isoToLocalHhmm(entry.clock_out_at))!
    return { start: s, end: e < s ? e + 1440 : e }
  }
  return null
}

/** Raw shift span in minutes (before break), wrapping past midnight. */
function spanMinutes(startMin: number, endMin: number): number {
  return endMin < startMin ? endMin + 1440 - startMin : endMin - startMin
}

export function validateTimeEntry(
  draft: TimeEntryDraft,
  ctx: TimeEntryValidationContext
): string[] {
  const warnings: string[] = []
  const startMin = toMinutes(draft.startTime)
  const endMin = toMinutes(draft.endTime)

  if (startMin == null || endMin == null) return warnings

  // End before start / crosses midnight. The data model has no explicit
  // overnight flag, so an end earlier than the start is interpreted as a
  // midnight crossing (matching hoursBetween). We surface that assumption
  // rather than silently accepting it, which covers both spec cases
  // ("end before start" and "shift crosses midnight") honestly.
  if (endMin === startMin) {
    warnings.push('Start and end times are the same — this entry is 0 hours.')
  } else if (endMin < startMin) {
    warnings.push(
      'End time is before start time — treated as an overnight shift crossing midnight. Double-check the times.'
    )
  }

  // Break longer than shift.
  const span = spanMinutes(startMin, endMin)
  if (draft.breakMinutes > 0 && draft.breakMinutes >= span && span > 0) {
    warnings.push(
      `Unpaid break (${draft.breakMinutes} min) is as long as or longer than the shift (${span} min).`
    )
  }

  // Overlap with another entry on the same date.
  const draftRange = { start: startMin, end: endMin < startMin ? endMin + 1440 : endMin }
  const sameDay = ctx.existingEntries.filter(
    (e) => e.date === draft.date && e.id !== draft.entryId && !e.deleted_at
  )
  for (const other of sameDay) {
    const range = entryMinutes(other)
    if (!range) continue
    if (draftRange.start < range.end && range.start < draftRange.end) {
      warnings.push('This time overlaps another entry on the same day.')
      break
    }
  }

  // Actual hours materially differ from scheduled hours. "Materially" is not
  // defined by the spec; we use the larger of 1 hour or 25% of the scheduled
  // total so both very short and very long shifts get a sensible band.
  const paidHours = Math.max(span - draft.breakMinutes, 0) / 60
  if (ctx.scheduledHoursForDate != null && ctx.scheduledHoursForDate > 0) {
    const scheduled = ctx.scheduledHoursForDate
    const tolerance = Math.max(1, scheduled * 0.25)
    if (Math.abs(paidHours - scheduled) > tolerance) {
      warnings.push(
        `Logged ${paidHours.toFixed(2)} hrs differs from the ${scheduled.toFixed(2)} scheduled hrs for this day.`
      )
    }
  }

  // Weekly worked hours exceed overtime threshold, counting this draft plus
  // the caregiver's other entries in the same week bucket.
  if (ctx.overtimeThresholdHours > 0) {
    const weekStart = startOfWeek(parseISO(draft.date), { weekStartsOn: ctx.weekStartsOn })
    const weekEnd = addDays(weekStart, 6)
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
    let weekTotal = paidHours
    for (const e of ctx.existingEntries) {
      if (e.id === draft.entryId || e.deleted_at) continue
      if (e.date >= weekStartStr && e.date <= weekEndStr) {
        weekTotal += e.paid_hours ?? 0
      }
    }
    if (weekTotal > ctx.overtimeThresholdHours) {
      warnings.push(
        `Week total ${weekTotal.toFixed(2)} hrs exceeds the overtime threshold of ${ctx.overtimeThresholdHours} hrs — overtime rate may apply.`
      )
    }
  }

  // Editing an entry that's already progressed past the freely-editable state.
  if (draft.entryId) {
    if (ctx.role === 'nanny' && draft.status === 'submitted') {
      warnings.push("You're editing an already-submitted entry; it will stay submitted for the parent to re-check.")
    }
    if (ctx.role === 'parent' && draft.status === 'approved') {
      warnings.push("You're editing an already-approved entry.")
    }
  }

  return warnings
}
