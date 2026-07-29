# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items

### 22. Calendar: build a real month view, or keep the week-grid-only simplification (spec 13.10/14.4)?

Spec 13.10 opens with "Calendar should be central to the app" and asks for
month/week/day views, filter chips (schedule/worked time/PTO-sick/payments/
alerts), and day-detail actions (approve PTO, edit time entry, view payment
impact, add note). `Schedule.tsx` has shipped only the week grid since Q&A
item 8 (resolved 2026-07-01, batch 2) as a deliberate "keep it simpler"
choice — no month view, no filter chips, no payment-due/-made markers, no
timesheet-approval-status markers on the grid, and day-detail is currently
just "add a schedule exception," not the fuller action set spec 13.10 lists.
That resolution note explicitly left the door open: *"If month/day views
turn out to matter in practice, that's still open work, not a documentation
gap."* Re-surfaced by this session's fresh spec pass rather than decided
unilaterally, per this run's instructions.

- **Option A — leave as-is.** The week grid plus Home's reminder feed, Pay's
  payment list, and PTO's leave list already surface most of the same
  underlying data, just not on one calendar surface. Zero new work.
- **Option B — lightweight month view.** A read-only month heat-strip
  showing which days have a shift / PTO / payment due-or-made, tapping a day
  jumps to the existing week-grid day-detail (no new inline actions). Medium
  effort, biggest visibility win relative to cost.
- **Option C — full spec-literal build.** Month/week/day view toggle, the
  five filter chips, and the full day-detail action set (approve PTO / edit
  time entry / view payment impact / add note inline from the calendar).
  Matches spec 13.10 closely but is the multi-day effort item 8 originally
  declined.

**Recommendation: B.** It gets most of spec 13.10's stated value (seeing the
shape of a month at a glance) without the cost of rebuilding day-detail
actions that already exist elsewhere in the app (Schedule.tsx, Pay.tsx,
PTO.tsx). Reply with A/B/C (or your own variant) and it'll be built next
session.

### 23. Home screen: go further toward spec 14.1/14.2's literal card/button layout, or is the increment already shipped enough (spec 14.1/14.2)?

This session shipped a "Today" (clock status per caregiver) and "This Week"
(scheduled/actual/guaranteed hours + timesheet status) card on `Home.tsx` —
see `SPEC_CHANGE_LOG.md` 2026-07-28 for detail. That closes the biggest gap
spec 22's UX priorities called out ("is the nanny clocked in?" wasn't
answerable without navigating away before this). Not yet built: distinct
"Pending Actions" and "PTO" cards (the reminder feed and the PTO stat tile
functionally cover the same ground today, just not as spec's named
sections), and named primary action buttons (Review Timesheet, Mark Payment
Made, Add Schedule Exception, Approve PTO, Edit Schedule for parents; the
nanny screen already has its 4 primary actions reachable one tap away via
the bottom dock, just not as buttons on Home itself).

- **Option A — stop here.** Today/This-Week cards plus the existing reminder
  feed (which already functions as "pending actions") is enough; adding
  literal primary-action buttons to Home would mostly duplicate navigation
  that the bottom tab bar already provides.
- **Option B — add primary action buttons only.** Keep the current card
  structure, add a small row of shortcut buttons (the ones spec 14.1/14.2
  name) above or below the reminder feed for one-tap access to the most
  common next step, without restructuring the rest of Home.
- **Option C — full rebuild into spec's 5 named cards.** Split today's
  generic Time/Schedule/PTO/Pay tile grid into the spec's named
  Today/Current-Week/Pending-Actions/Payment/PTO sections exactly, folding
  the reminder feed's content into "Pending Actions" instead of a separate
  list.

**Recommendation: A for now** — re-evaluate C only if, after using the
shipped Today/This-Week cards for a while, the current tile grid + reminder
feed still feels like it's missing something specific. Building further
without that signal risks polishing a screen nobody's flagged as lacking.

### 24. Leave policy accrual automation and per-policy settings beyond front-loaded-annual (spec 13.7/15.10/16.9)

`leave_policies` has columns for `accrual_method` (`front_loaded_annual`,
`per_hour_worked`, `per_pay_period`, `monthly`, `manual_only`, `none`),
`accrual_rate_hours_per_hour_worked`, `accrual_rate_hours_per_period`,
`monthly_accrual_hours`, `balance_cap_hours`, `carryover_cap_hours`,
`reset_month`/`reset_day`, `visible_to_nanny`, `counts_toward_guarantee`,
`counts_toward_payable_hours`, and `counts_toward_overtime` (spec 15.10) —
but `CaregiverDetail.tsx`'s "PTO settings" card only ever upserts
`accrual_method: 'front_loaded_annual'` (hardcoded) and
`annual_allowance_hours`. Every other column above is either never written
(no UI sets it, so it stays at its DB default forever) or never read (no calc
consults it) — confirmed by grepping `src` for each field name outside
`types.ts`. `negative_balance_allowed`/`waiting_period_days` are a partial
exception: `Pto.tsx`'s request form already reads both (2026-07-01 batch 3),
but neither has a settings UI to change them away from the DB default either.

This wasn't a silent gap in isolation — spec 16.9 gives explicit formulas for
`per_hour_worked`/`per_pay_period`/`monthly` accrual, and spec 13.7 lists all
of the above as real "PTO Policy Options" a Parent Admin should configure.
But building it is a genuine judgment call, not a mechanical UI addition,
for two reasons:

1. **No server cron exists** (spec 9's constraint — GitHub Pages + Supabase,
   no Edge Functions). `per_pay_period` accrual ("on timesheet approved") can
   piggyback on the existing `doGenerate` flow, but `monthly` accrual ("on
   configured monthly date") has no natural trigger point in a client-only
   app — it would need to run as a catch-up computation the next time
   *anyone* opens the app, backfilling any months missed, which is a real
   design decision about how to detect "haven't accrued for month X yet"
   without double-crediting.
2. **`leave_policies.counts_toward_guarantee` looks like a second, more
   granular version of the caregiver-level
   `pto_counts_toward_guarantee`/`sick_counts_toward_guarantee`/
   `holiday_counts_toward_guarantee` flags this session just wired up in
   `calc.ts`/`CaregiverDetail.tsx` (see `SPEC_CHANGE_LOG.md`, this date) —
   spec 13.6 and spec 13.7 each independently list what reads as the same
   concept ("does this leave type count toward the guarantee") from two
   different entry points, one per-caregiver-per-category, one
   per-leave-policy. Building the `leave_policies` version too would leave
   two settings governing the same outcome with no defined precedence.
   `visible_to_nanny` has the same shape of overlap with the existing
   caregiver-level `nanny_can_view_pto_balance` flag (all-or-nothing across
   both PTO and sick) — a per-leave-type override would need to define how
   the two interact.

- **Option A — leave as-is.** `front_loaded_annual` (the spec's own
  "Recommended Default" accrual method) plus the two already-read
  enforcement fields (`negative_balance_allowed`, `waiting_period_days`,
  still missing UI) covers the large majority of real households. Zero new
  work beyond, optionally, adding UI for the two already-read-but-unset
  fields.
- **Option B — add UI for the fields calc/validation already reads, stop
  there.** Add settings-page inputs for `negative_balance_allowed` and
  `waiting_period_days` (both already enforced in `Pto.tsx`, just not
  settable) plus `balance_cap_hours`/`carryover_cap_hours` (straightforward
  caps, no new triggers needed — they'd gate the existing balance
  computation, not require a scheduled job). Leaves accrual-method
  automation and the `counts_toward_guarantee`/`visible_to_nanny`
  redundancy alone.
- **Option C — full build.** Implement all remaining accrual methods
  (with a defined "catch up missed months on next app open" rule for
  `monthly`), plus resolve the `counts_toward_guarantee`/`visible_to_nanny`
  redundancy explicitly (e.g. per-policy overrides the caregiver-level flag
  when set, caregiver-level is the fallback). Multi-day effort with several
  sub-decisions of its own.

**No recommendation given** — this is more "which slice of a large,
partially-specified feature to build next" than a two-line judgment call;
flagging the redundancy and the serverless-trigger problem is the main point
of this entry so a future session (or you) can scope it deliberately rather
than half-build it.

### 25. Timesheet reject/request-correction workflow doesn't exist (spec 11/13.5/14.3/17)

Spec's Parent Workflow (13.5) step 4 is "Approves or requests correction";
the Nanny Workflow's steps 5-6 are "Receives correction request if parent
rejects" / "Resubmits if needed"; the role matrix (11) lists
"Reject/request correction" as a first-class Parent Admin/Co-Admin action;
`needs_correction` is a real `timesheets` status with its own status-chip
color and CSV-import support (`timesheetImport.ts`). None of this has a UI
path: a nanny's "Submit timesheet" button (`Pay.tsx`) creates a `submitted`
marker row (gross pay always 0, per the 2026-07-01 batch-2 decision), and
the parent's *only* real approval mechanism is the separate "Generate
timesheet from time entries" form, which always inserts a brand-new
`approved` timesheet computed straight from time entries — it never reads,
approves, or replaces the nanny's submitted marker row. The only action ever
available on a `submitted` row is "Archive." So today, a submitted timesheet
can be archived or ignored, but never explicitly approved or sent back with
a correction note, and a nanny is never notified of a rejection because
there isn't one.

This is a judgment call, not a mechanical fix, because the two flows
(nanny's marker-row submission vs. parent's from-scratch generation) are
architecturally disconnected by a prior deliberate decision (Q&A item 9,
2026-07-01 batch 2): "parent reviews and generates the official pay
calculation from it" — but "generates" today means "computes independently
from time entries," not "acts on the submitted row." Making "Approve" and
"Request correction" real actions on a submitted row requires deciding what
"Approve" even means here: does it call the same calc path as "Generate"
(effectively replacing the marker row with a computed one, changing its own
ID/audit trail), or does it just flip `status` on the existing row without
computing pay (leaving `gross_pay_due` at 0 forever, which contradicts spec
13.5 step 5 "app calculates payable hours and gross pay due" on approval)?
And for "Request correction," does the nanny get to edit and resubmit the
*same* row, or does rejecting it just leave it archived while the nanny
starts over with a new submission?

- **Option A — leave as-is.** The parent's "generate from time entries" flow
  already produces the one true payable timesheet per period; the nanny's
  "submit" is just a heads-up notification, which the parent implicitly
  "approves" by generating and implicitly "rejects" by archiving without
  generating (with no note, and no nanny-visible signal either way). Zero
  new work, but doesn't match the spec's explicit correction-request/
  resubmit language.
- **Option B — merge the two flows.** Make the nanny's submitted row *the*
  row a parent approves: "Approve" on a submitted timesheet runs the same
  calc as today's "Generate" but updates that row in place (instead of
  inserting a new one) and creates its payment record; "Request correction"
  sets `status: 'needs_correction'` + `correction_note` (a real column
  already in the schema, currently unused) and notifies the nanny (a new
  reminder-engine card), who can then edit their entries and resubmit
  (transitioning back to `submitted`). Removes the current parallel
  "Generate timesheet" form entirely in favor of one path. Closest to the
  spec's literal workflow, but is a real rearchitecture of the core pay
  approval loop with migration/backfill implications for any
  already-submitted rows.
- **Option C — add correction as a side channel, keep both flows.** Keep
  "Generate" as the actual pay-computation path (least regression risk), but
  add a lightweight "Request correction" action *on the submitted marker
  row only* (before a parent generates from it) that sets
  `needs_correction` + `correction_note` and surfaces a reminder card to the
  nanny; the nanny edits entries and resubmits (new `submitted` row, old one
  archived). "Approve" stays implicit (parent just clicks "Generate" from
  the Pay form as today). Smaller change than B, but "approve" and "request
  correction" remain asymmetric (one's explicit, one isn't), which is a
  half-measure against the spec's literal wording.

**No recommendation given** — B is the most spec-faithful but the highest
risk (touches the core pay-approval data flow that's been stable and
tested across ~30 sessions); C is safer but doesn't fully close the gap.
Worth a deliberate choice rather than picking one unilaterally given how
central this workflow is.

### 26. Payment record attachment/photo (spec 13.8) — no file-upload capability exists in the app

Spec 13.8's Payment Record Fields list "Attachment/photo optional," and
`payment_records.attachment_url` has existed as a column since migration
0001 — but nothing in `src` ever reads or writes it, and the app has no
Supabase Storage integration of any kind (`supabase.storage` doesn't appear
anywhere in `src`). Building this is architecturally fine (Storage doesn't
need an Edge Function, so it doesn't violate the "stay serverless" hard
constraint), but it's a new capability class for this codebase with its own
design questions: what bucket/path convention and RLS policy (mirroring the
existing per-household/per-caregiver read scoping used everywhere else),
what file types/size limit, camera-capture vs. file-picker on mobile, and
whether it belongs on the payment record (as spec'd) or also on time entries
(clock-out already accepts a note but not a photo, which some real nanny
apps use for e.g. mileage receipts).

- **Option A — skip it.** It's explicitly marked "optional" in the spec
  text, and no session across ~30 has flagged a household actually needing
  it. Zero work.
- **Option B — minimal build.** One Storage bucket
  (`payment-attachments`, scoped by household via RLS same-shape as existing
  table policies), a single file input on the "Mark paid" form, and a
  thumbnail/link on the payment row. No camera-specific UX, no size
  validation beyond Supabase's defaults.
- **Option C — full build.** Bucket + RLS, camera capture on mobile, size/
  type validation and client-side compression, and attachments on both
  payment records and time entries (for receipt-style use cases beyond what
  spec 13.8 literally asks for).

**Recommendation: A unless a real household asks for it.** This is the kind
of "optional" spec line that's cheap to defer indefinitely and expensive to
build speculatively (new Storage/RLS surface, mobile upload UX) with no
signal yet that it's needed.

---

## Resolved items — 2026-07-26 (part 2)

### 21. `export_records` enforced client-side only, not via RLS — RESOLVED (option A)

**Decision (chosen in chat):** Keep as built — the client-side-only gate via
`coadminAllowed('export_records')` is the final answer, not a placeholder.
No code change. See `SPEC_CHANGE_LOG.md` 2026-07-26 for the original
reasoning (exports don't expose any data beyond what the co-admin can
already `SELECT`, so a database-level restriction would either do nothing
or break their ordinary view access).

### 20. `nanny_can_view_*` visibility flags are stored but never enforced — RESOLVED (option A)

**Decision (chosen in chat):** Enforce them. Delivered:

- `CaregiverDetail.tsx` now blocks nanny access entirely (`<Navigate to="/"
  replace />`) — it was the only screen showing pay rate or the
  guaranteed-hours settings, and had no role gate at all before this.
- `Pay.tsx`'s Payments/Timesheets cards hide `gross_pay_due` for a nanny
  whose caregiver has `nanny_can_view_gross_pay = false`.
- `Pto.tsx`'s Balances card shows "Balance hidden by household settings."
  instead of the PTO/sick numbers when `nanny_can_view_pto_balance = false`.
- `Home.tsx`'s weekly-summary card (`buildWeeklySummaryCards`) omits the
  gross-pay and PTO/sick lines under the same flags for the nanny viewing
  their own card.

Guaranteed-hours *totals* were not touched beyond the `CaregiverDetail.tsx`
block, because no screen displays that number to anyone yet, parent or
nanny — see `SPEC_CHANGE_LOG.md` 2026-07-26 (part 2) for detail and the new
"guaranteed-hours line item" known gap this surfaced.

---

## Resolved items — 2026-07-25

### 19. `weekly_summary` digest — what does it actually summarize, and when? — RESOLVED (option B)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat, so the recommended option from the 2026-07-24 write-up was
taken rather than left blocked another cycle):** Built **option B** — hours
logged this week, current timesheet status, next payment due, and PTO/sick
balance remaining, one card per caregiver on `Home.tsx`, recomputed live on
every load. Regular/overtime hours split (mentioned in the recommendation's
example copy) was deliberately left out — see `SPEC_CHANGE_LOG.md`
2026-07-25 for why. Flagging this as a decision worth a look, not a rubber
stamp — if the omitted regular/OT split or any other part of the content
matters, say so and it'll be adjusted.

---

## Resolved items — 2026-07-24

### 18. Which known-gap phase to build next? — RESOLVED (full records export)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat, so the lowest-ambiguity option was picked rather than left
undone):** Built the **full records export** (spec 13.11). Of the three
remaining known gaps, it was the only one with no open design question and no
schema/RLS change required — the other two (per-key permission enforcement,
reminder settings) both need a judgment call first (the enforcement one needs
new RLS design; the reminder one is blocked on item 19 above). See
`SPEC_CHANGE_LOG.md` 2026-07-24 for the implementation write-up. Flagging this
as a decision worth a look, not a rubber stamp — if you'd rather have had one
of the other two built first, say so and it'll get reprioritized.

---

## Resolved items — 2026-07-03

### 16. Which known-gap phase to build next? — RESOLVED (co-admin permissions UI)

**Decision (chosen in chat):** Build the **co-admin permission management UI**
next. Delivered: a parent-admin-only "Household members" card in `More.tsx`
listing members and exposing per-co-admin toggles for the seven RLS-enforced
permission keys. The "add a co-admin" path (a separate co-parent join code)
landed independently on `main` via PR #38; this branch builds its members UI on
top of it. See `SPEC_CHANGE_LOG.md` 2026-07-03 (batch 2).

### 17. `weekly_summary` digest + reminder settings scope (13.9 / 15.14) — RESOLVED (in-app only, deferred)

**Decision (chosen in chat):** When this phase is built, do the **in-app pieces
only** — a weekly in-app summary card plus per-reminder-type enable/disable
toggles. Defer "recipients" and "quiet hours" until there's an email/SMS
backend, since they have no delivery channel today (consistent with resolved
item 5). Not yet built; tracked under "Known gaps."

---

## Resolved items — 2026-07-02 (batch 2)

### 15. Do holiday / weather-emergency schedule exceptions affect pay? — RESOLVED (option A)

**Decision:** `weather_emergency` exceptions with `affects_pay = true` are now
folded into the same `family_cancellation_hours` bucket as
`family_cancellation` exceptions — both represent "caregiver didn't work, but
is paid because of the guarantee." `Pay.tsx`'s `doGenerate` now sums both
types (still gated on the caregiver's `family_cancellation_counts_toward_guarantee`
setting, the only toggle available for this bucket). `holiday` exceptions
remain calendar-only markers — paid holidays continue to flow through the
existing `leave_requests` holiday leave type (13.7), which already has
accrual/balance tracking that a bare calendar marker doesn't. `other`
exceptions are intentionally excluded from the pay bucket — too broad a
catch-all to assume it should always be guarantee-protected pay; households
that need it reflected in gross pay can use `manual_adjustments` on the
payment record. Accepted tradeoff: the `family_cancellation_hours` line item
label is no longer 100% literal once it includes weather-day hours too.

---

## Resolved items — 2026-07-02

### PTO/sick/unpaid_time_off kept out of the Schedule Exceptions UI — RESOLVED (keep leave_requests as the single source)

Spec 13.3 lists `pto`, `sick`, `unpaid_time_off` as `schedule_exceptions`
types, but spec 13.7's `leave_requests`/`leave_ledger` flow (already fully
built, with balances and accrual) covers the same three types. Building a
second entry point for the same leave with no balance impact would create
two disconnected records. The new Schedule Exceptions UI in `Schedule.tsx`
only handles the other eight exception types (`added_shift`, `removed_shift`,
`shortened_shift`, `extended_shift`, `family_cancellation`, `holiday`,
`weather_emergency`, `other`); PTO/sick/unpaid stay exclusively in
`Pto.tsx`/`leave_requests`, as they already were.

### One-off shift exceptions affecting the schedule-linked guarantee — RESOLVED (delta model, gated by the existing flag)

Spec 13.6 says one-off added/removed shifts shouldn't move the guarantee
"unless marked as guaranteed"/"unless marked as unpaid/non-guaranteed," but
doesn't specify the mechanism. Used the exception's existing
`counts_toward_guaranteed_hours` flag for both directions: an `added_shift`
or `extended_shift` marked true adds its hours to the guarantee base, a
`removed_shift` or `shortened_shift` marked true subtracts its hours. Left
unmarked (the DB default is `false`), exceptions have no effect on the
guarantee, matching the spec's default behavior.

---

## Resolved items — 2026-07-01 (batch 3)

### 10. Multiple caregivers UI — RESOLVED (add it now)

**Decision:** Added an "Add caregiver" form (`More.tsx`), so a household can
create a second (or later) caregiver profile with its own pay/PTO settings,
not just during onboarding.

### 12. Family cancellation hours — RESOLVED (quick manual entry)

The spec lists "family cancellation" as a leave type (13.7) but the data
model routes it through `schedule_exceptions` (15.7) instead, which don't
have a UI yet — so `family_cancellation_hours` was hardcoded to `0` in both
timesheet-generation paths, meaning "guaranteed hours during a family
cancellation" never actually credited even when the caregiver setting was on.

**Decision:** Add a manual "Family cancellation hours this period" field to
the parent's generate-timesheet form (`Pay.tsx`), shown only when the
caregiver's `family_cancellation_counts_toward_guarantee` is on. Gets the
guaranteed-hours math correct without building the full exceptions calendar.
The full Schedule Exceptions UI (recording cancellations, holidays,
added/removed/shortened shifts as their own calendar-linked records) is still
unbuilt — see "Known gaps" in `SPEC_CHANGE_LOG.md`.

### 13. `manual_by_pay_period` guaranteed-hours basis — RESOLVED (dropped)

Spec 16.3 said this basis is "manually entered value for that pay period,"
but no field ever existed to store a per-period override — only a
caregiver-level setting (like `fixed_weekly`). Not buildable as literally
specified without inventing a new table/column the spec never named.

**Decision:** Removed as a redundant option. `fixed_weekly` /
`fixed_pay_period` already cover "a manually chosen number, set by the
parent." Spec text, TypeScript union, and the DB check constraint
(migration 0012) were all updated to drop it.

### 14. Schedule template editing model — RESOLVED (keep simple model)

Spec 13.2 implies schedule changes should be effective-dated (end the old
schedule, start a new one) so there's history of what was scheduled when.
`Schedule.tsx` just adds/deletes shift rows directly with no versioning.

**Decision:** Keep the current simple add/remove model — most households
don't need to look back at exactly what was scheduled on a past date.
Shift deletions now write an `audit_events` row (they previously didn't;
additions already did), so there's at least a "this shift existed and was
removed on this date" trail even without full effective-dating.

---

## Resolved items — 2026-07-01 (batch 2)

Items 7–9 and 11 below were opened in the previous session's batch but were
built in the same commit before anyone reviewed the open-items list — this
file just hadn't been updated to reflect it. Recorded here for continuity;
implementation details are in `SPEC_CHANGE_LOG.md`.

### 7. Nanny invite / login flow — RESOLVED (option B)

**Decision:** Household join code. Parents generate a 6-character code in
More.tsx (`households.join_code`); nannies self-signup and enter the code,
handled by the `join_household_by_code` SQL function (migration 0011). No
Edge Function required, keeps the app fully static.

### 8. Calendar view — RESOLVED (option B, weekly grid)

**Decision:** `Schedule.tsx` now shows a Mon–Sun week grid with prev/next
navigation, per-day shift and leave detail, and a weekly hours total, instead
of the prior flat shift list. A full month/day-view calendar (spec 13.10,
14.4's month/week/day filter chips) was not built — this is the "keep it
simpler" option, not the full 2–3 day build. If month/day views turn out to
matter in practice, that's still open work, not a documentation gap.

### 9. Nanny timesheet submission workflow — RESOLVED (option A)

**Decision:** Nannies get a "Submit timesheet" button in Pay.tsx that creates
a `timesheets` row (`status: 'submitted'`) for a chosen period, summing
approved time entries. Parent reviews and generates the official pay
calculation from it.

### 11. PTO balance read source — RESOLVED (option A)

**Decision:** Migrated. `Pto.tsx` reads balance via
`computeLeaveBalanceFromLedger` (`sum(leave_ledger.hours_delta)`) when ledger
rows exist for a policy, falling back to the old `leave_requests`-based
`computeLeaveBalance` otherwise. Migration 0010 backfilled existing approved
requests into the ledger.

---

## Resolved items — 2026-06-30

All six items below were resolved in chat on 2026-06-30. Decisions are
recorded here for reference; see `SPEC_CHANGE_LOG.md` for the implementation
write-ups as each is built.

---

## 1. PTO/leave balances aren't event-sourced through `leave_ledger` yet — RESOLVED

**Decision:** Build the real ledger. Every accrual/use/manual-adjustment
event writes a `leave_ledger` row; balance becomes `sum(hours_delta)` instead
of a live recompute. All accrual methods (`front_loaded_annual`,
`per_hour_worked`, `per_pay_period`, `monthly`, `manual_only`) get computed,
not just front-loaded. Touches PTO requests, timesheet approval, and a new
manual-adjustment UI — largest item in this batch.

## 2. "Linked to schedule" guaranteed-hours basis isn't selectable — RESOLVED

**Decision:** Add `linked_to_schedule` as a real selectable option in
`More.tsx`, alongside `fixed_weekly`. The calc engine reads summed shift
hours (where `counts_toward_guaranteed_hours = true`) when that basis is
selected.

## 3. Missing-clock-out grace period is a flat 12 hours, not schedule-aware — RESOLVED

**Decision:** Wire `computeReminders` to actual scheduled shift end times,
firing at shift end + 30 min grace. Requires passing generated schedule
occurrences into the reminders computation, and `Home.tsx` loading schedule
templates (it currently only loads entries/timesheets/leave/payments).

## 4. Payment corrections have no workflow — RESOLVED

**Decision:** Build the full workflow now, per spec 13.8: a "correct this
paid payment" action creates a correction event (not a delete), shows
original vs. corrected amount and the difference, requires a note, and logs
to the audit trail. Void gets the same treatment.

## 5. Email reminders (spec Phase 4) — RESOLVED

**Decision:** Stay in-app only for now. No Supabase Edge Function scaffolding
yet; revisit once the above phases land.

## 6. Schedule exceptions, PTO requests, and time entries: nanny_note/parent_note routing — RESOLVED

**Decision:** Keep as-is. One note field, owner decided by who's submitting
the form (`nanny_note` for nanny-submitted entries, `parent_note` for
parent/co-admin-submitted entries).
