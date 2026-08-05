# Questions & Clarifications

Open items where the spec is ambiguous, internally in tension, or where the
current implementation diverges in a way that's worth a deliberate decision
rather than a silent guess.

---

## Open items

Items 22-26 below have been carried forward, unresolved, across several
sessions (2026-07-30, 2026-07-31, 2026-08-01, 2026-08-04, 2026-08-05) —
presented again in-chat each time rather than decided unilaterally, per the
standing instruction to surface judgment calls rather than guess. Item 27 was
resolved 2026-07-31 since it had unambiguous recommendations for both of its
sub-decisions, unlike 22-26. Items 28-29 were added 2026-08-01, found via a
targeted spec-vs-code audit of sections not closely covered by prior sessions
(onboarding, PTO deduction timing). Item 30 was added 2026-08-04, found via a
targeted audit of spec sections 6/8/18/24 and a fresh data-model column sweep
of `households`/`household_users`. Items 31-32 are new this session
(2026-08-05), found via a targeted audit of spec section 16 (Calculation
Rules) against `src/lib/calc.ts`/`Pay.tsx`, and spec 14.3/14.4/14.7 against
`Time.tsx`/`Schedule.tsx`/`More.tsx` — see `SPEC_CHANGE_LOG.md` 2026-08-05 for
the audit's full scope and what it fixed mechanically along the way.

### 30. Removing a household member hard-deletes the `household_users` row instead of using the schema's `'removed'` status (spec 10/15.3) — and fixing that collides with the join-code rejoin flow

`household_users.status` has three defined values —
`'invited' | 'active' | 'removed'` — and every RLS helper
(`is_household_member` and friends, migration 0002) already checks
`status = 'active'`, so a soft-delete would revoke access exactly as well as
a hard delete does today. But `More.tsx`'s `removeMember()` does a plain
`supabase.from('household_users').delete()`, not a status update. This is
the only real "remove" path in the app that doesn't leave a queryable row
behind — it doesn't fully violate spec (an `audit_events` row with
`before: {role, email}` is still written, so there's *a* record, just not
one queryable from `household_users` itself), but it's inconsistent with the
schema's own `'removed'` enum value and with the app's general
never-hard-delete posture elsewhere (time entries/timesheets/leave requests
all soft-delete or status-transition instead).

This isn't a one-line fix, which is why it's here instead of just being
built: `join_household_by_code()` (migrations 0011/0013, `SECURITY DEFINER`)
both (a) raises "You are already a member of this household" if *any* row
exists for that `household_id`/`user_id` pair regardless of status, and (b)
does a plain `INSERT`, which would violate the `unique (household_id,
user_id)` constraint if a `'removed'` row were left in place. Switching
`removeMember` to soft-delete without also teaching the join function to
treat a `'removed'` row as rejoinable (reactivate in place, or delete-then-
insert) would permanently lock that person out of ever rejoining via a join
code again, even after being deliberately re-invited — a worse regression
than the thing being fixed. And *should* a removed member be able to silently
rejoin with an old code they still know, without the parent re-approving
them? That's a real access-control judgment call, not a mechanical one.

- **Option A — leave as-is.** Hard delete plus the existing `audit_events`
  row is an acceptable record for a household-membership change (lower
  stakes than a financial record); rejoin-after-removal already works today
  precisely because the row is gone. Zero work.
- **Option B — soft-delete, and make rejoin explicitly re-activate.** Change
  `removeMember` to `update({status: 'removed'})`; change
  `join_household_by_code()` to treat an existing `'removed'` row as
  rejoinable (reactivate: `status = 'active', accepted_at = now()`) while
  still blocking if the existing row is `'active'`. Preserves full
  membership history in `household_users` itself and matches the schema's
  own enum, at the cost of a new migration touching a `SECURITY DEFINER`
  function.
- **Option C — soft-delete, but require an explicit re-invite.** Same as B
  for `removeMember`, but leave `join_household_by_code()` raising on any
  existing row (as today) — a removed member's old code simply stops
  working for them, and the parent must regenerate/share the join code
  again (already a one-tap action in `More.tsx`) to let them back in.
  Closer to a real "revoke access" semantic than B's silent reactivation.

**Recommendation: C**, if this gets built at all — it keeps the audit-trail
benefit of B without B's silent-rejoin side effect, at the same
implementation cost (the join function only needs to *reject* a `'removed'`
row with a clearer error, not reactivate one). But given the low real-world
stakes (a household-membership record, not a financial one) and that today's
hard-delete plus audit-log entry is a defensible reading of the spec on its
own, **A is a legitimate choice too** — flagging this mainly because the
schema's unused `'removed'` enum value looked, on first read, like a
one-line mechanical fix, and it's worth documenting why it isn't.
Items 22-26 below have been carried forward, unresolved, across the last four
sessions (2026-07-30, 2026-07-31, 2026-08-01, 2026-08-03) — presented again
in-chat each time rather than decided unilaterally, per the standing
instruction to surface judgment calls rather than guess. Item 27 was resolved
2026-07-31 since it had unambiguous recommendations for both of its
sub-decisions, unlike 22-26. Items 28-29 were added 2026-08-01 via a targeted
spec-vs-code audit of sections not closely covered by prior sessions
(onboarding, PTO deduction timing). Item 30 is new this session (2026-08-03),
found via a targeted audit of the PTO/Pay/Settings screens and reminder copy
— see `SPEC_CHANGE_LOG.md` 2026-08-03 for what that audit found and fixed
mechanically (PTO note/comment fields, `leave_policy_id`, an in-app Ledger
view, and reminder-copy date formatting) versus what it left as a judgment
call below.

### 28. Onboarding implements 2 of spec 13.1's 11 setup steps — build it out, or is "everything's reachable, just not funneled" good enough (spec 13.1)?

Spec 13.1 specifies an 11-step guided parent setup: create household → set
timezone → add nanny profile → start date → pay rate → pay frequency →
guaranteed hours → PTO/sick policy → recurring schedule → invite nanny
(optional) → configure reminders. `Onboarding.tsx` only collects household
name and, optionally, nanny name + a single hourly rate — steps 2 and 4-11
are skipped entirely during onboarding. Every one of those settings *does*
exist as a real, working UI control elsewhere (timezone and pay frequency in
`More.tsx`, guaranteed hours/PTO policy/pay rate in `CaregiverDetail.tsx`,
schedule in `Schedule.tsx`, reminders in `More.tsx`'s reminder settings card,
nanny invite via the join code) — nothing is missing from the app, it's just
not funneled into one guided flow, so a new household has to discover each
screen on its own after landing on Home with mostly-default settings
(`America/New_York` timezone, no schedule, no PTO policy, no reminders
configured).

- **Option A — leave as-is.** Every setting is one or two taps away from
  Home/More; a new parent who explores the app for five minutes finds all of
  it. Zero new work.
- **Option B — add a "Finish setup" checklist card.** A dismissible card on
  `Home.tsx`, shown only while unconfigured, listing the still-default
  settings (no schedule yet, no PTO policy yet, etc.) each linking straight
  to the relevant existing screen. Doesn't touch the onboarding flow itself
  or require building anything new per-step — just surfaces what already
  exists at the moment it's most useful. Disappears once every item's been
  touched (or is manually dismissed).
- **Option C — full multi-step wizard.** Rebuild `Onboarding.tsx` into an
  11-step literal match for spec 13.1, collecting every field inline before
  the household ever reaches Home. Closest to the spec's literal wording, but
  a much longer first-run flow, and duplicates form UI that already exists
  on the settings screens (two places that create/edit the same PTO
  policy/schedule, for instance).

**Recommendation: B.** It closes the actual gap (a new household not knowing
what's left to configure) without a first-run flow long enough to abandon,
and without building a second copy of forms that already work fine on their
own screens.

### 29. PTO/sick/unpaid deduction timing is hardcoded to "on approval," not spec 13.7's recommended default of "on timesheet approval" (spec 13.7)

Spec 13.7 "PTO Deduction Timing" lists three configurable options (deduct on
approval / on PTO date / on timesheet approval) and gives an explicit
recommended default: *"Show pending impact on approval. Finalize deduction
when timesheet is approved."* `PTO.tsx`'s `applyUsedLedger(...)` instead
writes the real `'used'` ledger row — an immediate, final balance
deduction — at the moment a request is approved (`reviewRequest`, and the
parent/co-admin self-create-as-approved path), with no "pending" state and
no later finalization step tied to timesheet approval. There's no
`leave_policies` column or settings UI for choosing between the three
options at all — this isn't a case of the setting existing but defaulting
wrong, the configurability itself was never built, and the one timing model
that *is* built doesn't match the one spec calls out as recommended.

- **Option A — leave as-is.** Deduct-on-approval is simpler (one state
  transition, no "pending" ledger entries to reconcile later) and arguably
  better UX for a small household — a nanny's balance updates the moment
  they're told yes, instead of sitting in limbo until a future timesheet is
  approved, which could be weeks later for a household that runs behind on
  approvals. Zero work, but a real household relying on the literal spec
  language (e.g. expecting a balance to stay uncommitted until payroll
  actually processes it) would see different behavior than documented.
- **Option B — match the recommended default.** Change `applyUsedLedger` to
  write a `'pending'`-flavored ledger entry (or track pending impact
  client-side without a ledger row) at approval time, then write the real
  `'used'` deduction when the covering timesheet is approved. Requires
  deciding how "pending" balance impact is shown in the UI (a separate
  "pending" number alongside "available," per spec's PTO Balance Views?) and
  how a PTO request maps to "its" timesheet when leave can span a period
  boundary or a household doesn't submit timesheets promptly — genuine
  design work, not a one-line timing change.
- **Option C — make it configurable, default to B's behavior.** Add the
  `leave_policies` column(s) needed to select per-policy among all three
  spec-listed timing options, implement all three, default new policies to
  "on timesheet approval" per spec. Superset of B; more work, matches spec's
  explicit "Configurable" framing in addition to its recommended default.

**No recommendation given** — unlike item 27, this isn't a low-blast-radius
fill-in: it would change when an existing, already-relied-upon number (PTO
balance) moves for every household using the app today, and the "right"
option depends on a product judgment (does a family want the balance to
update the moment they say yes, or only once payroll actually processes it)
that isn't mine to make unilaterally.

### 30. `leave_requests.start_time`/`end_time` are dead columns — build partial-day/hourly PTO, or is a whole-day-plus-total-hours request enough (spec 13.7/15.11)?

Spec 13.7's PTO Request Workflow lists "Start time, optional" / "End time,
optional" as real request fields alongside start/end date and hours
requested, and `leave_requests.start_time`/`end_time` (spec 15.11) exist in
the schema for exactly that — but neither is ever set or read anywhere in
`src` (confirmed by grep, same method used for item 24's `leave_policies`
audit). `PTO.tsx`'s request form only offers date pickers plus a single
free-typed total-hours number; a nanny requesting a half day off has no way
to say *which* hours of the day, only how many hours total.

- **Option A — leave as-is.** A typed hours number already covers the
  numeric side of a partial-day request (e.g. "4 hrs" for a half day); the
  household just loses the ability to say *when* those hours fall, which
  nothing downstream (calendar, timesheet, payment calc) currently uses
  anyway. Zero new work.
- **Option B — add the time pickers.** Two optional `time` inputs on the
  request form, shown only for single-day requests (a multi-day range with
  per-day partial hours would need a different UI entirely, which spec
  doesn't ask for). Requires deciding whether/how the calendar and
  timesheet displays should surface the time-of-day once it exists, since
  neither reads it today.

**Recommendation: A unless a real household asks for hour-of-day
granularity.** Same shape as item 26 (Payment attachment) — an
explicitly-optional spec field with a working numeric fallback already in
place, and no signal yet that the missing granularity has actually blocked
anyone.

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

### 31. Overtime and `fixed_weekly` guaranteed hours are computed once per pay period, not per calendar week — wrong math for every caregiver not on weekly pay (spec 16.3/16.6)

Spec 16.6 defines the overtime threshold as "40 actual worked hours per
**week**" and gives `regular_worked_hours = min(actual_worked_hours,
overtime_threshold)` / `overtime_worked_hours = max(actual_worked_hours -
overtime_threshold, 0)`. Spec 16.3 gives `fixed_weekly` as a guaranteed-hours
basis distinct from its sibling `fixed_pay_period` — the two names only make
sense as different things if `fixed_weekly_guaranteed_hours` represents a
single week's guarantee and `fixed_pay_period_guaranteed_hours` represents
the whole period's. But `caregiver_profiles.pay_frequency` is a real,
selectable setting in `CaregiverDetail.tsx` with four options — `weekly`,
`biweekly`, `semi_monthly`, `monthly` (`src/lib/types.ts`) — and neither
`calc.ts`'s `calculateTimesheet` nor `schedule.ts`'s
`computeGuaranteedHoursBase` is aware of period length at all:
`Pay.tsx`'s `computePeriodTotals` sums `actualWorkedHours` across the *entire*
pay period (however long) and passes it, together with the caregiver's flat
`overtime_threshold_hours` (default 40), into `calculateTimesheet` exactly
once. For a biweekly caregiver working 38 hours in each of two weeks (76
total, zero overtime under a real per-week rule), today's code computes
`overtime_worked_hours = max(76 - 40, 0) = 36` — a massive miscalculation of
`gross_pay_due`. The same flat-application problem hits
`fixed_weekly_guaranteed_hours` (`computeGuaranteedHoursBase`,
`src/lib/schedule.ts`): it's used as-is as the guarantee base for whatever
period is being computed, with no scaling for period length, so a biweekly
caregiver with a 30-hour weekly guarantee only ever gets a 30-hour guarantee
credited across the whole two-week period instead of 60.

This isn't a new-feature gap, it's a live-money bug for every household that
picks a non-weekly `pay_frequency` — but fixing it correctly means deciding
how to bucket calendar weeks inside a period that frequently doesn't align to
week boundaries (a semi-monthly period like Aug 1–15 starts mid-week; any
period can have a partial week at either edge), which the spec never
addresses. Should a partial week at a period's edge get the full 40-hour
threshold, a prorated one, or merge into the adjacent week? Should
`fixed_weekly_guaranteed_hours` scale by the number of
`household.week_start_day`-aligned week-starts inside the period, or by
`period_days / 7`? Both are defensible, neither is spec'd. A prior session's
own reasoning already brushed up against this exact tension without
connecting it back to `Pay.tsx`'s actual calculation: `SPEC_CHANGE_LOG.md`'s
2026-07-27 entry (Home's "This Week" card) explicitly notes the caregiver's
"pay period (frequently biweekly, rarely aligned to a calendar week)" as the
reason a payable-hours estimate was kept off the Home screen, but that
observation was never traced through to the fact that `Pay.tsx` itself has
the same misalignment problem when it actually runs the numbers.

- **Option A — leave as-is, document as a known limitation.** Overtime and
  `fixed_weekly` guarantee math is only correct when `pay_frequency ===
  'weekly'` (the DB default, and per spec 13.5 "the main approval object").
  A household already able to pick biweekly/semi-monthly/monthly gets wrong
  numbers today with no warning anywhere in the UI. Zero work, but silently
  wrong pay for real households.
- **Option B — simple period-length scaling (approximate, mechanical).**
  Scale both `overtime_threshold_hours` and `fixed_weekly_guaranteed_hours`
  by `period_days / 7` before they reach `calculateTimesheet` — e.g. a 14-day
  period gets an 80-hour threshold and double the weekly guarantee. Doesn't
  match "40 hours per calendar week" literally (a caregiver who works 70
  hours in week 1 and 10 in week 2 of a biweekly period still shows zero
  overtime under this scaling, where a strict weekly rule would show 30), but
  it's a one-line change per value, fixes the worst of today's miscalculation
  (a flat 40-hour/30-hour threshold regardless of period length), and needs
  no new UI or data model.
- **Option C — true per-calendar-week bucketing.** Split a period's time
  entries by ISO week (respecting `household.week_start_day`), run
  regular/overtime math per week and sum the results; scale
  `fixed_weekly_guaranteed_hours` by the number of week-starts inside the
  period. Matches spec 16.6 literally, but needs an explicit, currently
  unspecified rule for partial weeks at period boundaries, and is real
  calc-engine surgery (splitting time entries by week, reconciling that
  against the existing single-pass `calculateTimesheet` shape), not a
  one-line fix.

**No recommendation given** — unlike a mechanical fill-in, any fix here
changes `gross_pay_due` (an already-relied-upon, real-money number) for every
household not on weekly pay, in a direction that depends on their actual
hours pattern and could go either way, and the "correct" partial-week rule
genuinely isn't specified anywhere in the spec. Shipping a fix that's wrong
in a *different* way than today's bug is a real risk here, more than most
items on this list — worth a deliberate, informed choice rather than a guess.

### 32. Time screen is one flat, unscoped list — not spec 14.3's This Week / Previous Weeks / Corrections tabs (spec 14.3)

Spec 14.3 lists three tabs (This Week, Previous Weeks, Corrections) and,
under "Show," a per-row "scheduled vs actual" comparison (added this session,
see `SPEC_CHANGE_LOG.md` 2026-08-05) plus "missing time warnings." `Time.tsx`'s
`loadEntries` queries every `time_entries` row the caregiver has ever had,
with no date filter at all, and `activeEntries.map(...)` renders the entire
result as one reverse-chronological list — no week grouping, no navigation,
and nothing resembling a "Corrections" view. A household with months of
history sees every entry it's ever logged in one long scroll, with no way to
jump to "this week" or page through past weeks the way spec 14.3 implies.

Why this needs a decision rather than a mechanical fill-in: the "Corrections"
third of the tab structure has nothing to show yet — Q&A item 25 already
leaves the actual reject/request-correction workflow unbuilt (no
`needs_correction` UI path exists anywhere), so a Corrections tab today would
either be an empty shell or silently duplicate item 25's undecided scope.
And "This Week"/"Previous Weeks" needs its own navigation model (prev/next
week arrows? a week picker? infinite scroll grouped by week headers?) plus a
definition of "this week" for a household whose pay period isn't
calendar-weekly — the same `week_start_day`-alignment question item 31 raises
for pay math, just for display instead of money this time.

- **Option A — leave as-is.** The flat list is simpler to implement and scroll
  through for a household with only a few weeks of history; no data is
  hidden, just not pre-grouped. Zero work.
- **Option B — add This Week / Previous Weeks grouping only, skip
  Corrections until item 25 resolves.** Default the view to the current
  calendar week (via `household.week_start_day`, already used elsewhere in
  this file for validation), with a simple prev/next-week toggle to page
  through history instead of one long list. Closes the two-thirds of the tab
  structure that doesn't depend on an unresolved item.
- **Option C — full three-tab build, sequenced after item 25.** Same as B,
  plus a Corrections tab once item 25 defines what "request correction" and
  "resubmit" actually do in this codebase.

**Recommendation: B**, and only once the flat list has actually proven hard
to navigate in practice — same shape as items 22/23's calendar/Home-screen
precedent, this is a screen-structure change worth doing deliberately, and
two-thirds of the spec's literal ask (the Corrections tab) is blocked on item
25 regardless of what's decided here.

---

## Resolved items — 2026-07-31

### 27. `schedule_shifts.paid_if_family_canceled` / `.default_category` are dead columns (spec 15.6) — RESOLVED (option B for `paid_if_family_canceled`, option A for `default_category`)

**Decision (made unattended — this session ran on a schedule with nobody to
answer in chat; taken because, unlike items 22-26, both sub-decisions here
had an unambiguous recommendation with low blast radius):** Built **option
B** for `paid_if_family_canceled` only, per the recommendation. Delivered:

- A "Paid if family cancels this shift" checkbox on the Add Shift form in
  `Schedule.tsx`, defaulting to `true` (matching the column's DB default),
  shown for the weekly/biweekly/monthly/custom recurrence choices (the
  one-time option creates a `schedule_exceptions` row directly, not a
  `schedule_shifts` row, so the field doesn't apply there). All four shift-
  insert call sites now write it instead of leaving it at the DB default.
- `family_cancellation` added to the set of exception types that can
  reference an "Original shift" in the day-detail exception form (previously
  only `removed_shift`/`shortened_shift`/`extended_shift` could) — needed so
  the app knows *which* shift is being canceled when a day has more than one.
  When there's exactly one shift scheduled that day, it's auto-selected.
- Selecting a type of "Family cancellation" (or picking/changing the
  original shift while that type is selected) now defaults the exception's
  "Affects pay" checkbox from that shift's `paid_if_family_canceled` — still
  a normal checkbox the parent can override per-exception, per the option B
  spec. Linking the original shift also means `exceptionHours()` can now
  auto-calculate hours from the canceled shift's duration when no explicit
  hours/time-range override is given, which it couldn't before (family-
  cancellation exceptions had no shift link at all).

`default_category` was left unbuilt (option A) — no calculation or display
anywhere reads shift category, and inventing what "category" should *do* was
explicitly out of scope for a mechanical fill-in per the original write-up.
The column stays in place, unused, until there's an actual use for it.

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
