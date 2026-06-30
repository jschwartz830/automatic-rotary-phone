# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess. Answer inline or tell me which option you want
and I'll implement it in the next pass.

---

## 1. PTO/leave balances aren't event-sourced through `leave_ledger` yet

**What the spec says (13.7):** "Every PTO change must create a ledger event
... Do not silently overwrite PTO balances," with `leave_ledger` as an
append-only table of `opening_balance` / `accrual` / `used` / `manual_adjustment`
/ `carryover` / `expiration` / `correction` / `reversal` events.

**What's actually implemented:** `src/lib/leave.ts` `computeLeaveBalance()`
derives a balance live by summing approved/used `leave_requests` within the
current policy year against `annual_allowance_hours`. It only really models
`front_loaded_annual` accrual. The `leave_ledger` table exists in the schema
but nothing writes to it, and `per_hour_worked`, `per_pay_period`, `monthly`,
and `manual_only` accrual methods aren't computed at all.

This is a bigger lift than the other gaps (it touches PTO requests, timesheet
approval, and a manual-adjustment UI), so I didn't start it without checking
scope with you first.

**Options:**
- (a) Build the real ledger: every accrual/use/adjustment writes a
  `leave_ledger` row, balance is `sum(hours_delta)` instead of a live
  recompute. This is what the spec describes and is the only version that
  satisfies "do not silently overwrite balances."
- (b) Keep the current live-computed balance (simpler, fewer moving parts) and
  drop/relax the ledger requirement in the spec, accepting that balance
  history won't be reconstructable after the fact.
- (c) Something narrower — e.g. ledger only for `manual_adjustment` events
  (so corrections are at least auditable), leave accrual/use as a live
  computation.

## 2. "Linked to schedule" guaranteed-hours basis isn't selectable

**What the spec says (13.6, recommended default):** guaranteed hours should
default to being derived from the active recurring schedule
(`guaranteed_hours_basis = linked_to_schedule`), summing shift hours where
`counts_toward_guaranteed_hours = true`.

**What's actually implemented:** `src/routes/More.tsx` only ever sets
`guaranteed_hours_basis` to `'fixed_weekly'` (when enabled) or
`'linked_to_schedule'` (when disabled, which doesn't matter since the
calculation is skipped entirely when disabled). So in practice, enabling
guaranteed hours always means "type a flat weekly number" — the
schedule-derived calculation the spec recommends as the *default* is dead
code.

**Question:** Do you want guaranteed hours linked to the schedule (sum of
shifts marked `counts_toward_guaranteed_hours`) as an actual selectable/default
option, or is a flat weekly number good enough for your household's actual
schedule (i.e. is the schedule stable enough that typing "24 hrs/week" once is
equivalent)? If you want schedule-linking, I'll wire `More.tsx` to offer both
bases and have the calc engine read shift hours when `linked_to_schedule` is
selected.

## 3. Missing-clock-out grace period is a flat 12 hours, not schedule-aware

Per change log entry above — spec 21 wants the alert to fire after
*scheduled shift end* plus a grace period, but reminders are computed without
schedule context. Current behavior: warn once 12 hours have passed since
clock-in, regardless of when the shift was supposed to end.

**Question:** Is the 12-hour heuristic acceptable, or do you want this wired
to actual scheduled end times (e.g. shift end + 30 min grace)? The latter
requires passing generated schedule occurrences into `computeReminders`,
which is a moderate refactor since `Home.tsx` currently only loads
entries/timesheets/leave/payments, not schedule templates.

## 4. Payment corrections have no workflow

**What the spec says (13.8):** corrections to a paid period must not delete
the original record — create a correction event, show original vs. corrected
amount and the difference, require a parent note, log to audit trail. The
`corrected` and `voided` payment statuses exist in the type system.

**What's actually implemented:** `Pay.tsx` can mark a payment due → paid, but
there's no "correct this paid payment" or "void this payment" action anywhere
in the UI.

**Question:** Is this needed now, or can it wait for a later phase? It's a
real spec requirement (not a nice-to-have), but it's also the kind of feature
that's only useful once you've actually made a mistake on a paid period — so
low urgency unless you anticipate needing it soon.

## 5. Email reminders (spec Phase 4) — confirm still out of scope for now

The spec explicitly forbids calling email providers from the static frontend
and requires a Supabase Edge Function with provider keys stored as backend
secrets. I haven't touched this — no Edge Function exists yet, reminders are
in-app only (Phase 3, which is now in reasonably good shape).

**Question:** Do you want me to scaffold a Supabase Edge Function for email
reminders in a future phase, or are in-app reminders sufficient for your
use case? If yes, I'll need you to choose/confirm Resend vs. Postmark and
you'll need to supply the API key as a Supabase secret (never something I'd
put in frontend code or commit to the repo).

## 6. Schedule exceptions, PTO requests, and time entries created by nanny: is "manual" the right default `created_by`/note routing?

Not a functional bug, just confirming intent: in `Time.tsx`, when a nanny
adds a manual entry, the note goes to `nanny_note`; when a parent/co-admin
adds one, it goes to `parent_note`. There's no way for a parent to leave a
note on an entry the nanny is also commenting on (one note field, owner
decided by who's filling out the form). The spec doesn't define this
precisely. Fine as-is, or do you want both note fields always available
regardless of who's submitting?
