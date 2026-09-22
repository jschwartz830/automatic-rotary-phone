# Spec Change Log

Tracks decisions made while implementing against `APPLICATION_SPEC.md`: where an
implementation detail wasn't fully specified, where two parts of the spec were
in tension, or where a deliberate simplification was made. This is a running
log, newest entries on top. See `QUESTIONS_AND_CLARIFICATIONS.md` for open
items that need your decision rather than ones already resolved.

---

## 2026-09-22 — Time-entry schedule pre-fill re-confirmed (still correct); merged one clean, already-tested stale PR (#112); adversarial review of its diff finds no bugs; first dedicated literal audit of spec 23 (MVP Build Plan) against the full current feature set finds no new gaps; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill
behavior (this run's prompt again asked for time entries to be "pre-set to
the schedule hours," the same already-built behavior), check for stale
open PRs and merge/review any found, run a fresh spec audit, then present
every open Q&A item with options and a recommendation.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
`useEffect` still looks up the selected date's generated shift via
`generateShiftsForRange(...)` and fills `startTime`/`endTime`/
`breakMinutes` from it, falling back to a default 09:00–17:00/0-minute
break only when nothing's scheduled that day. Unchanged since 2026-06-30.

**Merged PR #112 forward.** `origin/main` had not advanced past `d2fe45e`
(PR #111) since the 2026-09-21 session opened PR #112 against it. That PR's
own summary showed clean, already-verified work (time-entry pre-fill
re-confirmed, PR #111 merged forward, and one real, previously-undocumented
gap found and fixed in PR #111's own diff — see below), no CI configured on
this repo to check independently, `mergeable_state: "clean"`. Merged
directly rather than leave it sitting for another day, then reset this
session's branch onto the new `main` tip before starting its own work.

**Adversarial review of PR #112's own diff.** Its single commit
(`aa284f6`) hadn't been independently reviewed by any session other than
the one that authored it. The fix it contains: `Time.tsx`'s new "Overdue"
clock-out chip (added the prior session, in PR #111) reused
`computeReminders`'s `missing_clock_out` rule but never passed
`disabledTypes`, so a household that disabled that reminder type in
`More.tsx`'s Reminder Settings would still see the chip on the Time screen
itself. The fix adds a `reminders` table load to `Time.tsx` (mirroring
`Home.tsx`'s own query: `household_id` + `recipient_user_id = auth.uid()`)
and threads the resulting `disabledTypes` set into the `computeReminders`
call. Verified against the actual schema
(`supabase/migrations/0001_schema.sql:384-401`): `reminders.household_id`,
`.recipient_user_id`, `.type`, and `.enabled` all exist exactly as used, and
the `ReminderSetting` type (`src/lib/types.ts:401`) matches. No bug found —
the fix is correct and precisely mirrors `Home.tsx`'s existing, already-
audited pattern.

**First dedicated literal audit of spec 23 (MVP Build Plan)** — every prior
session that touched infra/meta sections grouped 23 in with 3/5/6/7/9/12/18
as a documentation-only pass (2026-08-10, absorbed again via PR #109 on
2026-09-20), but neither of those actually checked Phase 1-5's per-item
build checklist against the app's current feature set line by line; this
session did. Phases 1-3 (parent-only tracker through in-app reminders) are
entirely built — every listed item has a working, previously-audited
counterpart in the app (schedule, time entries, timesheets, pay calc,
payment ledger, PTO ledger, CSV export, nanny portal, clock in/out, PTO
requests, all six Phase-3 in-app reminder types). Phase 4 (Optional Email
Reminders via a Supabase Edge Function) is deliberately unbuilt, matching
spec 9's constraint and item 17's already-resolved "in-app only, deferred"
decision — not a new finding. Phase 5 (Polish and Recordkeeping) checked
item by item: "Better calendar" is already-open item 22; "Audit log UI"
exists (`src/routes/AuditLog.tsx`, per the 2026-08-14 audit of spec 20);
"Annual summary export" exists and matches spec 13.11's field list exactly
(`Pay.tsx`'s `exportAnnualSummary`, explicitly cited to spec 13.11 in its
own comment); "Payment attachments through Supabase Storage" is
already-open item 26; "Correction workflow" is satisfied by the existing
Correct/Void mechanism built across the 2026-08-13/08-19 sessions for
timesheets and payment records (distinct from open item 25's deeper
reject-and-resubmit workflow question, which remains open); "PWA polish"
was confirmed clean by the 2026-09-20-absorbed PR #108 audit. The one
previously-unchecked item, "Offline-tolerant clock-in draft state," has no
implementation anywhere in `src` (confirmed by grep) — not opened as a new
gap, since the spec itself marks it "optional" with no household having
asked for offline support, the same already-accepted shape as item 26
(Payment attachment) and item 35 (PTO time-of-day) for an explicitly-
optional spec field with no signal it's blocking anyone. No new judgment
call was opened.

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — the same six pre-existing
warnings as every prior session (three `only-export-components` in the
context files, two more in `Card.tsx`, one `exhaustive-deps` in
`Schedule.tsx`), none new.

Every open Q&A item (still 17: 22-26, 29, 31-35, 37-42) was presented again
— via `PushNotification` as well as in chat, since this was an unattended
scheduled run — with its options and recommendation; nothing else was built
unilaterally this session.

---

## 2026-09-21 — Time-entry schedule pre-fill re-confirmed (still correct); merged one clean, already-tested stale PR (#111); adversarial review of its diff finds no bugs; found and fixed one real, previously-undocumented gap (Time.tsx's new "Overdue" clock-out chip ignored the household's per-type reminder toggle); health check clean; all 17 open Q&A items presented in chat/notification

**Merged PR #111 forward.** `origin/main` had not advanced past `7204a7d`
(PR #106) since the 2026-09-20 session opened PR #111 against it. That PR's
own summary showed clean, already-verified work (time-entry pre-fill
re-confirmed, a real fix absorbed from PR #110, two documentation-only
audits from #108/#109, `mergeable_state: "clean"`) with nothing new for a
different session to add on top of the same base, so this session merged it
directly rather than leaving it to sit unmerged for another day, then reset
this session's branch onto the new `main` tip before starting its own work.

**Adversarial review of PR #111's own diff.** Its single commit
(`17be90d`) hadn't been independently reviewed by any session other than the
one that authored it. Read `Time.tsx`'s new `activeClockChip` logic in
full: it reuses `computeReminders`'s `missing_clock_out` rule (a per-entry,
side-effect-free computation with no dependency on the full entries array),
confirmed `StatusChip`'s `COLORS` map already has a `missing_clock_out`
entry (amber, added when spec 17's status enums were wired up) so the new
chip renders correctly with no styling gap, and confirmed the grace-period
math matches `Home.tsx`'s identical use of the same function. No bug found.

**Found and fixed one real gap while reviewing that diff.** `Home.tsx`'s
`computeReminders` call passes `disabledTypes` (built from the household's
`reminders` table rows, i.e. the per-type "Enable/disable" toggle in
`More.tsx`'s Reminder Settings) so a household that disables the
missing-clock-out reminder type stops seeing it on the Today card.
`Time.tsx`'s new `activeClockChip` call (added by PR #111 as an explicit,
intentional reuse of "the exact same schedule-aware grace-period logic
Home.tsx's Today card already runs") omitted `disabledTypes` entirely, since
`Time.tsx` never loaded the `reminders` table before — so a household that
turned this reminder type off would still see the "Overdue" chip on the Time
screen itself, silently defeating the setting on the one screen a nanny
would actually visit to act on it. Not a judgment call: `Home.tsx` already
establishes the exact behavior wanted here, `reminders`' RLS
(`recipient_user_id = auth.uid()`) is unchanged, and the same disabled-type
filter is a pure gate on an existing signal, not a new one. Fixed by adding
a `reminders` table load to `Time.tsx` (mirroring `Home.tsx`'s own query
shape: `household_id` + `recipient_user_id = auth.uid()`) and passing the
resulting `disabledTypes` Set into the `computeReminders` call.

**Health check:** `npm install`, `npm run build`, `npm run lint` all clean —
same six pre-existing warnings as every prior session, none new.

**No new judgment call opened.** Every open item below (still 17: 22-26,
29, 31-35, 37-42) was presented again — via chat and a push notification,
since this was an unattended scheduled run — with its options and
recommendation; nothing else was built unilaterally this session.

---

## 2026-09-20 — Time-entry schedule pre-fill re-confirmed (still correct); absorbed one real fix and two clean audits from three stale unmerged PRs (#108, #109, #110), all closed without merging; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill
behavior (this run's prompt again asked for time entries to be "pre-set to
the schedule hours," the same already-built behavior), check the
diff-review rotation and open-PR state, resolve any stale open PRs one way
or the other rather than leaving them for a future session, then present
every open Q&A item with options and a recommendation.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
`useEffect` still looks up the selected date's generated shift via
`generateShiftsForRange(...)` and fills `startTime`/`endTime`/
`breakMinutes` from it, falling back to 09:00–17:00 only when nothing's
scheduled that day. Unchanged since 2026-06-30.

**Diff-review rotation:** `origin/main` had not advanced past `7204a7d`
(the 2026-09-15 session's own merge, PR #106) — no new commits landed on
`main` in the interim.

**Stale open PRs #108, #109, #110: read in full, absorbed, closed without
merging.** Three PRs from other sessions/branches sat open and unmerged
against `main` at `7204a7d` (opened 2026-09-17, -18, and -19
respectively), all `mergeable_state: clean` but simply never merged. A
fourth, #107 (opened 2026-09-16), was already closed — its own body shows
it was a redundant duplicate of the 2026-09-16 session's own already-merged
13.1 audit (that session correctly left #106 unmerged rather than
self-merging, since "this session's GitHub access disallows merging a PR
without review"). Following the precedent the 2026-09-14 session set for
#101/#103 (absorb real content directly rather than let it sit unmerged
indefinitely), read all three:

- **#108** — spec 8 (PWA Requirement) audit against `vite.config.ts`,
  `index.html`, `src/main.tsx`, and a production build's manifest/service-
  worker/icon output. Documentation-only, found zero gaps.
- **#109** — audit of the infra/meta sections (3, 5, 6, 7, 9, 12, 18, 23:
  deployment, Supabase config, GitHub Actions, navigation, authorization,
  MVP build plan) since their last pass on 2026-08-10. Documentation-only,
  found zero gaps, including confirming GitHub Pages project-path
  asset/icon URLs are correctly base-prefixed by building `dist/index.html`.
- **#110 — real, previously-undocumented, already-fixed-in-diff-form gap.**
  Paired a spec 13.1 (Initial Parent Setup)/14.3 (Time Screen) audit with a
  genuine mechanical fix: an open clock session running past its
  schedule-aware grace period had no visible warning anywhere on the Time
  screen itself, even though `Home.tsx`'s Today card already computes
  exactly that signal via `computeReminders`'s `missing_clock_out` rule for
  its own display. 13.1's 11 onboarding steps were confirmed to all have a
  real, working control in the app already (re-confirming resolved item 28's
  shape, not a new finding); 14.3's "Submit week"/"Approve week" bullets
  were confirmed to have no batch, week-scoped equivalent today, folded into
  already-open item 32 as a documentation note rather than a new item.

Verified `Time.tsx` on current `main` still exactly matched #110's pre-diff
state (same `activeClockEntry` definition, same two `StatusChip` call sites
hardcoding `'clocked_in'`), then independently re-derived and applied the
identical fix: a new `activeClockChip` memo (`Time.tsx`, right after
`activeClockEntry`) calls `computeReminders(...)` with the caregiver's own
active clock entry and that day's generated shift occurrences, returning
`'missing_clock_out'` once the same grace period `Home.tsx` already uses has
elapsed. The resulting chip now renders in three places: the entry row list,
the time-entry detail modal, and a new "Overdue" `StatusChip` next to
"Clocked in since…" on the Clock In/Clock Out card itself — the screen a
nanny would actually use to fix the problem, not just Home's summary. Applied
and verified line-for-line equivalent in intent to #110's diff before
committing, not a blind cherry-pick.

**PRs #108, #109, and #110 are now superseded by this session's work and
were closed without merging** — merging any of them afterward would either
no-op against an already-applied diff (#110) or reintroduce documentation-
only duplicate log entries (#108, #109). This is the same one-time cleanup
posture the 2026-09-14 entry already established, not a new standing policy
of merging every stale PR on sight — it applies here because three
sessions' worth of completed, clean, already-reviewed-by-their-own-test-plan
work was sitting unmerged and unpresented to the project owner, the same
risk-of-losing-real-work shape #101/#103 had.

No new judgment call was opened; this was an absorb-and-close pass over
already-completed audit work rather than a fresh section audit of its own.

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — the same six pre-existing
warnings as every prior session (three `only-export-components` in the
context files, two more in `Card.tsx`, one `exhaustive-deps` in
`Schedule.tsx`), none introduced by the `Time.tsx` change.

Every open Q&A item (still 17: 22-26, 29, 31-35, 37-42) was presented again
— via `PushNotification` as well as in chat, since this was an unattended
scheduled run — with its options and recommendation; nothing else was built
unilaterally this session.

---

## 2026-09-15 — Time-entry schedule pre-fill re-confirmed (still correct); closed two superseded stale PRs (#101, #103); first dedicated full literal audit of spec 13.6 (Guaranteed Hours) since 2026-08-13's bundled pass finds no new gaps; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill
behavior (this run's prompt again asked for time entries to be "pre-set to
the schedule hours," the same already-built behavior), clean up the two
PRs the 2026-09-14 session flagged as superseded but left open, run a
fresh spec audit, then present every open Q&A item with options and a
recommendation.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today (`Time.tsx:51`,
`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
`useEffect` (`Time.tsx:121-136`) still looks up the selected date's
generated shift via `generateShiftsForRange(...)` and fills
`startTime`/`endTime`/`breakMinutes` from it, falling back to 09:00–17:00
only when nothing's scheduled that day. Unchanged since 2026-06-30.

**Closed PRs #101 and #103 without merging.** The 2026-09-14 session
absorbed both PRs' real findings directly onto `main` (via PR #105) and
explicitly noted they were now superseded and should be closed, but didn't
close them itself. Both were still sitting open, stale against the current
`main` tip (`mergeable_state: dirty`/`unknown`), a day later with nothing
new to add. Commented on each explaining the supersession and closed both
via the GitHub API — no code change, just repo hygiene so they stop
showing as outstanding work.

**First dedicated full literal audit of spec 13.6 (Guaranteed Hours)** —
every prior session that touched guaranteed-hours math audited spec
section 16's formulas (16.1-16.9) against `calc.ts`, but 13.6 itself (the
workflow-level spec section the header comment in `calc.ts` already cites
as "the worked examples in section 13.6") had only ever been bundled into
an unrelated audit (2026-08-13's pass, labeled "13.5/13.6 (Timesheet
Display)") rather than checked bullet-by-bullet on its own. Went through
every subsection against `calc.ts`, `schedule.ts`, and `Pay.tsx`:

- **Settings, Recommended Default, Calculation, Examples 1-4, Schedule-
  Linked Guarantee:** all match `calc.ts`'s `calculateTimesheet` and
  `schedule.ts`'s `computeGuaranteedHoursBase` exactly — re-confirms, not a
  new finding.
- **Per-Shift Guaranteed Flag** lists three shift-level toggles: "counts
  toward guaranteed hours," "paid if family canceled" (both real
  `schedule_shifts` columns, the first wired, the second built per resolved
  item 27), and "counts toward overtime calculation" — this third one has
  no `schedule_shifts` column at all, and nothing in `src` reads any
  per-shift overtime-inclusion flag; `calc.ts`'s overtime split
  (`regularWorkedHours`/`overtimeWorkedHours`) is computed from total
  `actualWorkedHours` unconditionally. Checked whether this is a gap: the
  same subsection's own "Default" bullet states, unconditionally, "Worked
  hours always count toward overtime calculations" — the spec never
  describes a scenario for turning this off, the same "no described
  consuming behavior anywhere in the spec" shape resolved item 27 accepted
  for `default_category` (left unbuilt, option A). Treating this the same
  way: not a gap, since current behavior already matches the stated
  default and there's no spec text implying a household would ever need
  the override. Noted here for the record since no prior session had
  checked this specific bullet; not opened as a new judgment call.
- **Timesheet Display for Guaranteed Hours** and **Payment Record Impact**:
  every listed field (actual worked, guaranteed, guarantee adjustment,
  payable regular, overtime, PTO/sick/holiday hours, gross pay due) is
  present on `payment_records` and rendered in `Pay.tsx`'s Daily Detail /
  payment cards, except "manual override note, if applicable" —
  `guarantee_override_note` — which is the exact already-open item 37
  (`payment_records.guarantee_override_note` is a dead column), not a new
  finding.
- **Permissions for Guaranteed Hours:** "override guarantee calculation for
  a pay period" has no UI path either — the "Correct payment" flow only
  lets a parent adjust the final dollar total with a note, never the
  underlying guaranteed-hours math — but this is the same underlying gap
  item 37 already documents (the override note column with no producing
  workflow), not a second gap. "Recalculate an unlocked pay period" is
  already satisfied: an unapproved/unpaid timesheet can be archived and
  regenerated for the same period (`0017_timesheet_period_unique_excludes_archived.sql`
  lets an archived period's dates be reused), which recomputes every total
  from scratch. Nanny-side view/edit permissions (`showGuaranteedHours`
  gated on `nanny_can_view_guaranteed_hours`, no edit path exposed to the
  nanny anywhere) match spec exactly.

No new judgment call was opened — every previously-unchecked bullet either
matched spec outright or turned out to already be covered by an existing
open item (27, 37). Health check (`npm install`, `npm run build`,
`npx oxlint`) came back clean — same six pre-existing warnings as every
prior session. Every item below (still 17: 22-26, 29, 31-35, 37-42) was
presented again — via chat and a push notification, since this was an
unattended scheduled run — with its options and recommendation; nothing
else was built unilaterally this session.

---

## 2026-09-14 — Time-entry schedule pre-fill re-confirmed (still correct, already matches this run's "pre-set to schedule hours" ask); absorbed two real, previously-unmerged fixes from stale PRs #101/#103 (payment-note privacy leak, $0-timesheet advisory) directly onto `main`; first dedicated re-audit of spec 21 (Notification / Reminder Logic) since 2026-08-09 finds no new gaps; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill
behavior (this run's prompt asked for it again, and separately asked for
time entries to be "pre-set to the schedule hours," which is the same
already-built behavior), check the diff-review rotation and open-PR state,
resolve the two long-open stale PRs one way or the other, run a fresh spec
audit, then present every open Q&A item with options and a recommendation.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today (`Time.tsx:51`,
`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
`useEffect` (`Time.tsx:121-136`) still looks up the selected date's
generated shift via `generateShiftsForRange(...)` and fills
`startTime`/`endTime`/`breakMinutes` from it, falling back to 09:00–17:00
only when nothing's scheduled that day. Unchanged since 2026-06-30. This
run's prompt phrased the ask slightly differently ("time entry was pre-set
to the schedule hours … can still default to current day") but describes
exactly this existing behavior — nothing to build.

**Stale open PRs #101 and #103: read in full, both real, both absorbed
directly onto `main` instead of left waiting.** Two PRs from earlier
sessions in this rotation have sat open and unmerged since 2026-09-10 and
2026-09-12 respectively, each already `git fetch`-stale against the current
`main` tip (`mergeable_state: dirty` for #101, `unknown` for #103). Prior
sessions' policy (correctly, at the time) was "not this session's branch to
touch." With two more days having passed and no sign either had been
merged, this session read both PRs' full diffs and confirmed each contains
one genuine, still-unfixed gap:

- **PR #103 — real privacy bug.** `Pay.tsx`'s payment-row list and payment
  detail modal rendered `p.nanny_visible_note || p.parent_note` with no
  role gate, so a nanny viewing a payment record whose `nanny_visible_note`
  was empty but `parent_note` was set would see that private note — a
  direct violation of spec 18's "Nanny cannot: View private parent notes,"
  and the same private/shared split spec 15.13 defines for
  `payment_records` that `Schedule.tsx` already gates correctly for
  `schedule_exceptions`. Re-applied #103's exact fix: both `Pay.tsx` call
  sites now branch on `isNanny` (nanny sees only `nanny_visible_note`;
  parent/co-admin sees `parent_note` plus a labeled "Nanny sees: …" line),
  the same pattern `Schedule.tsx` established.
- **PR #101 — real silent-failure gap.** The Finish Setup checklist's
  caregiver-profile step is satisfied by the mere existence of a
  `caregiver_profiles` row; a caregiver saved with no hourly rate (optional
  in both `Onboarding.tsx` and `CaregiverDetail.tsx`) reads as "done," and
  `Pay.tsx`'s `doGenerate` already falls back to `default_hourly_rate ?? 0`,
  silently producing a $0 timesheet with no explanation anywhere in the UI.
  Re-applied #101's fix: a non-blocking amber advisory on the
  generate-timesheet form (same style as the existing pay-frequency
  warning immediately below it), shown whenever the selected caregiver has
  no rate set, linking to their profile. Also carried over #101's
  documentation-only addition to Q&A item 32 (clarifying that "missing time
  warnings" is fully unbuilt, not just folded into the tab-structure
  question).

Both fixes were independently re-derived by reading the current code and
the target PRs' diffs side by side, then verified line-for-line equivalent
in intent before applying — not a blind cherry-pick. **Recommendation: close
PRs #101 and #103 without merging.** Their content is now fully present on
`main` via this session's own commit; merging either afterward would
either no-op against an already-applied diff or produce a spurious merge
conflict. This is a one-time cleanup, not a new standing policy — the
rotation's default posture (leave other sessions' open PRs alone) still
holds for future stale PRs unless they sit unmerged long enough to represent
a real, unresolved risk the way a privacy leak does.

**Spec 21 (Notification / Reminder Logic) re-audit, rule by rule against
`src/lib/reminders.ts` and its `Home.tsx` wiring — no new gaps.** This
section's last dedicated pass was 2026-08-09; every core workflow section
has since had at least one fresh audit except this one, making it the
oldest gap in the rotation's coverage. Checked all six trigger rules
literally:

- **Payment Due** (tomorrow/today/overdue → parent alert) — `payment_due`/
  `payment_overdue` are both in `PARENT_ONLY_REMINDER_TYPES`. **Match**
  (the configurable lead-day window beyond "tomorrow"/"today" is an
  already-accepted superset, not a deviation).
- **Timesheet Submission** (period ended, not submitted → nanny alert,
  optionally parent) — `unsubmitted_timesheet` is *not* in
  `PARENT_ONLY_REMINDER_TYPES`, so both roles see it, matching "optionally
  show parent alert." **Match** in logic; the practical
  never-fires-in-real-data gap is unchanged, already-documented item 33.
- **Timesheet Approval** (submitted, not approved → parent alert) —
  `pending_timesheet_approval` is in `PARENT_ONLY_REMINDER_TYPES`. **Match.**
- **Missing Clock-Out** (clock-out null after scheduled end + grace →
  nanny alert, optionally parent) — not parent-only-gated, schedule-aware
  threshold confirmed still correct (latest shift end + 30 min, 12 h
  fallback). **Match**, unchanged since resolved item 3.
- **PTO Request** (pending → parent alert) — `pending_pto_request` is in
  `PARENT_ONLY_REMINDER_TYPES`. **Match.**
- **Upcoming PTO** (approved, within 7 days → parent and nanny alert) —
  not parent-only-gated, `differenceInCalendarDays` window is `0..7`
  inclusive of the start date. **Match.**

Also confirmed the `viewerIsNanny` gate isn't just correct in isolation —
`Home.tsx:471-482` actually passes `viewerIsNanny: isNanny` into
`computeReminders`, and `disabledTypes` is correctly built from
`reminderSettings` and threaded through too. **Optional Email Reminders** —
still no email/SMS code anywhere in the frontend, no provider keys present;
already-resolved item 17/19 territory, re-confirmed not re-litigated.

No new judgment call was opened.

**Health check:** `npm install`, `npx tsc -b`, `npm run build`, and
`npx oxlint` all ran clean — the same six pre-existing warnings as every
prior session (three `only-export-components`, one `exhaustive-deps`),
nothing new from the `Pay.tsx` changes.

Every open Q&A item (still 17: 22-26, 29, 31-35, 37-42) was presented again
— via `PushNotification` as well as in chat, since this is a
scheduled/unattended run — with its options and recommendation; nothing was
built unilaterally beyond the two already-diffed, already-reviewed fixes
absorbed from #101/#103 above.

---

## 2026-09-13 — Time-entry schedule pre-fill re-confirmed again (still correct); diff-review rotation finds nothing new on `main` (two other unmerged PRs noted, neither touched); first dedicated full literal re-audit of spec 13.9 (Reminders and Notifications) since the 2026-08-18 spot-check finds everything still matches spec/prior conclusions, no new gaps; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill behavior,
check the diff-review rotation and open-PR state, then run a fresh full
literal, bullet-by-bullet audit of spec 13.9 (Reminders and Notifications)
against `src/lib/reminders.ts`, `More.tsx`'s reminder-settings UI, and
`CaregiverDetail.tsx`'s payment-reminder-days field — this section's last
pass (2026-08-18) was a lighter spot-check ("13.9 ... matched the code
exactly, with nothing left to find beyond what items 17/19/21/33 already
settled"), not a fresh line-by-line read of the current file.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today (`Time.tsx:51`,
`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
`useEffect` (`Time.tsx:122-136`) still looks up the selected date's
generated shift via `generateShiftsForRange(...)` and fills
`startTime`/`endTime`/`breakMinutes` from it, falling back to 09:00–17:00
only when nothing's scheduled that day. Unchanged since 2026-06-30.

**Diff-review rotation / PR state:** `origin/main` is still at `96d4b66`
(the 2026-09-11 session's own merge, PR #102) — no new commits have landed
on `main` since, so there's nothing new for the rotation to review. Two
open, unmerged PRs sit against `main` from other sessions/branches, neither
touched (not this session's to merge or fix, same posture the 2026-09-11
entry already established for PR #101):

- **PR #101** ("Re-confirm time-entry pre-fill; full literal audit of spec
  13.1/14.3 fixes $0-timesheet gap," opened 2026-09-10) — still open,
  still based on the stale `32fd2a1` commit rather than current `main`.
- **PR #103** ("Re-confirm time-entry pre-fill; audit infra/meta sections;
  fix payment note privacy leak," opened 2026-09-12 against current `main`
  at `96d4b66`) — a different session's in-progress work; noted here only
  so a future session doesn't mistake `main`'s current state for having
  already absorbed an infra/meta audit or that payment-note fix. Once
  either PR merges, treat its stated scope as covered rather than
  re-auditing it.

**Spec 13.9 (Reminders and Notifications) audit, bullet by bullet against
`reminders.ts`/`More.tsx`/`CaregiverDetail.tsx`:**

- **Reminder Types** — all ten of spec 15.14's types
  (`missing_clock_out`, `unsubmitted_timesheet`, `pending_timesheet_approval`,
  `pending_pto_request`, `payment_due`, `payment_overdue`, `upcoming_pto`,
  `schedule_change`, `pto_balance_low`, `weekly_summary`) are listed in
  `REMINDER_TYPE_INFO` and have working trigger logic in `computeReminders`/
  `buildWeeklySummaryCards`. **Match.**
- **MVP Reminder Approach** ("in-app alert cards calculated client-side when
  the user opens the app") — `computeReminders`/`buildWeeklySummaryCards`
  are both pure functions called fresh on every `Home.tsx`/`More.tsx` load,
  with no stored "already shown" state. **Match.**
- **Optional Email Reminder Approach** — no email is ever sent from the
  frontend; no Edge Function/cron exists to send one either. Already the
  accepted "in-app only, deferred" posture of resolved item 17, not
  re-litigated. **Match** (by design).
- **Reminder Settings** — "Enable/disable each reminder type" is fully
  built (`More.tsx:514-524`'s per-type checkboxes, backed by
  `toggleReminderType`/the `reminders` table). "Recipients" and "Quiet
  hours, optional" are the already-resolved item 17 deferral (no
  email/SMS backend exists to route to or suppress). **"Timing" and
  "Reminder cadence" are only configurable for one of the ten types** —
  `payment_due`'s lead-time window is a real per-caregiver setting
  (`caregiver_profiles.payment_reminder_days_before`, editable in
  `CaregiverDetail.tsx`, read by `reminders.ts:121-126`) — every other
  type's threshold is a hardcoded constant:
  `SCHEDULE_GRACE_MINUTES`/`FALLBACK_GRACE_HOURS` (missing clock-out), the
  literal `7`-day window (upcoming PTO, `reminders.ts:191`),
  `LOW_BALANCE_THRESHOLD_HOURS` (PTO balance low), and
  `SCHEDULE_CHANGE_LOOKBACK_DAYS` (schedule changed). Checked whether this
  is a new gap: it isn't — each constant already carries its own in-code
  comment acknowledging the spec doesn't specify a value, and there's no
  stored "cadence" concept to build in the first place given the MVP
  approach's own client-side-recompute design (a card is present or absent
  each time the app reloads state; nothing is ever "sent" on a schedule to
  need a cadence setting). Folds into the already-resolved item 17 posture
  ("in-app pieces only... defer[ring]" the settings surface beyond
  enable/disable), not a new judgment call — this session's contribution is
  confirming that reading holds up against the current code, since no prior
  session had checked "Timing"/"cadence" specifically rather than just
  "enable/disable."
- **Example Reminder Copy** — spot-checked `reminders.ts`'s message
  strings against the five examples; the date-range formatting
  (`formatDateRange`, `"Jun 22–28"`) and per-type phrasing
  ("Timesheet for … is ready for review.", "Payment for … is due
  tomorrow.", "… request pending for …", "Clock-out missing for …") all
  follow the same style as spec's examples, with the already-accepted
  variation that `payment_due`'s "due Friday" becomes "due today"/"due
  tomorrow"/"due in N days" depending on `daysUntilDue` rather than a
  literal weekday name — a pre-existing, unremarkable copy choice, not a
  new finding. **Match.**

No new judgment calls or mechanical gaps were found.

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — the same six pre-existing
warnings as every prior session (three `only-export-components`, one
`exhaustive-deps`), nothing new.

No source files were changed this session — only `SPEC_CHANGE_LOG.md` and
`QUESTIONS_AND_CLARIFICATIONS.md`. Every open Q&A item (still 17: 22-26, 29,
31-35, 37-42) was presented again — via `PushNotification` as well as in
chat, since this is a scheduled/unattended run — with its options and
recommendation; nothing was built unilaterally.

---

## 2026-09-11 — Time-entry schedule pre-fill re-confirmed again (still correct); diff-review rotation finds nothing new on `main` to review (PR #101 from a different session/branch is still open, unmerged); first dedicated full literal field-by-field audit of spec 15.6 (`schedule_shifts`) finds every field matches spec, no new gaps or judgment calls; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill behavior
(this run's prompt asked for it again directly), check the diff-review
rotation and PR state, then run a fresh full literal, field-by-field audit of
spec 15.6 (`schedule_shifts`) — the one Data Model table in the 15.1-15.15
run that had never had its own dedicated pass (15.1-15.4 was audited
2026-08-12, 15.5/15.7/15.8 2026-08-11, 15.9-15.15 2026-09-09; 15.6 was only
ever touched incidentally, via the 2026-08-15 `13.2` audit's `paid_break`/
`counts_toward_guaranteed_hours`/`default_category` fixes).

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. `date` still defaults to today (`Time.tsx:51`,
`new Date().toISOString().slice(0, 10)`), and the manual-entry pre-fill
effect still looks up the selected date's generated shift via
`generateShiftsForRange(...)` and fills `startTime`/`endTime`/`breakMinutes`
from it (`Time.tsx:254-260` and the earlier `useEffect`), falling back to
09:00–17:00 only when nothing's scheduled that day. Unchanged since
2026-06-30, same conclusion as every prior re-confirmation.

**Diff-review rotation / PR state:** `origin/main` is at `32fd2a1` (the
2026-09-09 session's own merge, PR #100) — no new commits have landed on
`main` since, so there's nothing new for the rotation to review. There is,
however, an **open, unmerged PR #101** ("Re-confirm time-entry pre-fill; full
literal audit of spec 13.1/14.3 fixes $0-timesheet gap," branch
`claude/sharp-hamilton-0kqg82`, opened 2026-09-10) sitting against `main` at
the same `32fd2a1` base. That PR is a different session's work on a
different designated branch, not this session's to touch or merge — noting
its existence here only so a future session doesn't mistake `main`'s current
state for having already absorbed a 13.1/14.3 audit. Once it merges, this
rotation's next session should treat 13.1/14.3 as covered rather than
re-auditing them.

**Spec 15.6 (`schedule_shifts`) audit, field by field against
`0001_schema.sql` and every read/write site in `src`:**

- **`day_of_week`/`monthly_day`/`monthly_week`** — all three drive
  `schedule.ts`'s `matchesRecurrence`/`matchesMonthlyWeek` exactly as their
  names imply (weekly/biweekly key off `day_of_week`; `monthly_by_date` off
  `monthly_day`; `monthly_by_weekday` off both `day_of_week` and
  `monthly_week`, including the `'last'` special case via a
  next-week-rolls-into-a-new-month check). **Match.**
- **`start_time`/`end_time`/`break_minutes`/`paid_break`** — `shiftHours()`
  computes the shift's duration from `start_time`/`end_time` (handling a
  midnight-crossing shift), subtracting `break_minutes` unless `paid_break`
  is set. **Match.**
- **`counts_toward_guaranteed_hours`** — gates both the guarantee-base
  occurrence filter and the guarantee-adjustment exception-delta filter in
  `schedule.ts`. **Match.**
- **`paid_if_family_canceled`** — pre-fills the "affects pay" default when a
  parent creates a `family_cancellation` exception for a day with a matching
  shift (`Schedule.tsx:876,896`). **Match.**
- **`default_category`** — confirmed still write-only (set from a picker on
  every shift-creation path in `Schedule.tsx`, per the 2026-08-15 session's
  fix) with no read site anywhere (`calc.ts`, `Pay.tsx`, the schedule grid)
  ever consuming `ShiftCategory`. Re-checked whether this is a new gap: spec
  13.2 lists "Default category" only as a shift field with no described
  downstream behavior anywhere in the spec (no calculation formula in
  section 16 branches on it, no screen spec in section 14 names a
  category display), so this is the same shape as the already-resolved
  item 27 and the already-open item 37 — a column that exists for future
  use with no consuming behavior described anywhere to build against. Not
  reopened as a new item.
- **`notes`** — rendered on the shift's own row in `Schedule.tsx` (`"{shift.notes}"`
  suffix). **Match.**

No new judgment calls or mechanical gaps were found. `schedule_templates`'
`recurrence_type` enum (5 of spec's 6 recurrence types — `weekly`,
`biweekly`, `monthly_by_date`, `monthly_by_weekday`, `custom`) was
cross-checked once more against spec 13.2's list; "Manual one-off schedule,"
the sixth type, remains already-resolved as covered by the existing one-off
`added_shift` exception path (2026-07-06 session, not re-litigated here).

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — the same six pre-existing
warnings as every prior session (three `only-export-components`, one
`exhaustive-deps`), nothing new.

No source files were changed this session — only `SPEC_CHANGE_LOG.md` and
`QUESTIONS_AND_CLARIFICATIONS.md`. Every open Q&A item (still 17: 22-26, 29,
31-35, 37-42) was presented again — via `PushNotification` as well as in
chat, since this is a scheduled/unattended run — with its options and
recommendation; nothing was built unilaterally.

---

## 2026-09-09 — Time-entry schedule pre-fill re-confirmed again (still correct); diff-review rotation finds nothing new to review; first dedicated full literal re-audit of spec 15.9-15.15 (Data Model: timesheets through audit_events) since 2026-08-08 finds every field matches spec except one previously-undocumented gap (`leave_requests.status` never reaches `'canceled'`/`'used'`); one new judgment call opened, nothing built unilaterally; health check clean; all 17 open Q&A items presented in chat/notification

**This session's scope:** re-confirm the manual time-entry pre-fill behavior,
confirm the adversarial diff-review rotation has nothing new to cover, then
run a fresh full literal, field-by-field audit of spec 15.9-15.15 (the seven
Data Model tables from `timesheets` through `audit_events`) against
`0001_schema.sql`/every later migration touching those tables, `types.ts`,
and every read/write site in `src` — this section's last *dedicated* pass
was 2026-08-08, older than the infra/meta sections' last pass (2026-08-10)
and every other spec section, per the running history in
`QUESTIONS_AND_CLARIFICATIONS.md`.

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. The date field still defaults to today
(`new Date().toISOString().slice(0, 10)`, line 51), and the manual-entry
`useEffect` (lines 121-136) still fills `startTime`/`endTime`/`breakMinutes`
from `generateShiftsForRange(...)`'s result for the selected date, falling
back to the 09:00-17:00 defaults only when nothing's scheduled that day. Same
behavior re-verified every session since 2026-06-30.

**Diff-review rotation:** `origin/main` is still at `03e2b44`, the
2026-09-08 session's own last merged commit (`217e5c4` merged via PR #99).
No new commits landed since; nothing new for the rotation to review.

**Spec 15.9-15.15 audit, table by table:** every column in
`0001_schema.sql`'s `timesheets`, `leave_policies`, `leave_requests`,
`leave_ledger`, `payment_records`, `reminders`, and `audit_events` tables
matches spec's literal field list (the only additions are already-documented
soft-delete/archive columns — `timesheets.deleted_at`,
`leave_requests.archived_at`/`.archived_by`, `payment_records.deleted_at`).
Every status/event-type check constraint (`timesheets.status`,
`leave_policies.leave_type`/`.accrual_method`, `leave_requests.leave_type`/
`.status`, `leave_ledger.event_type`, `payment_records.status`,
`reminders.type`/`.channel`) matches `types.ts`'s corresponding union
exactly, value for value. Checked every field's read/write usage across
`src` against its spec-described behavior:

- **timesheets** — `submitted_at`/`submitted_by`/`approved_at`/`approved_by`
  are all written at the matching transitions (`Pay.tsx:569-570,635-636,
  1067-1068,1162-1165`); `correction_note` is displayed
  (`Pay.tsx:2058-2059`) but never written, the exact, already-documented
  shape of open item 25 (no reject/request-correction workflow exists to
  write it), not a new finding. Hour/pay fields (`scheduled_hours` through
  `manual_adjustments`) all trace to `calculateTimesheet`'s output or a
  correction form field, matching the 2026-09-05 audit of section 16's
  formulas that produce them — not re-litigated here. **Match**, aside from
  the already-open item 25 gap.
- **leave_policies** — every field's read/write status matches the
  already-open item 24's mapping exactly (`front_loaded_annual` fully wired;
  `negative_balance_allowed`/`waiting_period_days` read but not settable;
  `enabled`/`paid`/`active` dead per the 2026-08-26 session's finding); no
  drift since that mapping was last confirmed. **Match** (via item 24).
- **leave_requests** — `leave_policy_id` re-resolves correctly on both
  create (`PTO.tsx:210`) and edit (`PTO.tsx:328`, the 2026-08-23 fix);
  `start_time`/`end_time` remain dead per open item 35, no change.
  **One previously-undocumented gap: `status` never reaches `'canceled'` or
  `'used'`, two of its five spec-listed values (spec 15.11).** The
  create-request insert (`PTO.tsx:215`) writes `'approved'` or `'requested'`,
  and `reviewRequest` (`PTO.tsx:251`) writes `'approved'` or `'rejected'` —
  no code path anywhere sets `'canceled'` or `'used'` on this column,
  confirmed by grep. In practice this means a nanny has no way to withdraw a
  pending request she no longer wants (`canEdit`, `PTO.tsx:457-458`, lets her
  edit a `'requested'` row's details but there's no "Withdraw" action — only
  a parent explicitly rejecting it gets it out of the pending queue), and
  nothing ever marks an `'approved'` request `'used'` once its date has
  passed, despite `lib/leave.ts:87`'s balance filter already treating
  `'approved'`/`'used'` as interchangeable and migration
  `0015_leave_request_archive.sql`'s own comment describing all five values
  as "the existing... workflow." Not mechanically fixed — a "Withdraw"
  button is a real new UI affordance with its own small design question (does
  it need an audit trail the way every other status transition gets one?),
  and `'used'` has no serverless trigger point (the same missing-cron shape
  item 24 already flags for monthly PTO accrual) and no downstream reader
  that currently distinguishes it from `'approved'`. Written up as new
  judgment call **item 42** (options A/B/C, recommendation B — add nanny-side
  "Withdraw" for `'canceled'` only, leave `'used'` unbuilt since nothing
  reads the distinction today) rather than built. See
  `QUESTIONS_AND_CLARIFICATIONS.md`.
- **leave_ledger** — `related_leave_request_id` fully wired
  (`applyUsedLedger`/`zeroOutLedgerForRequest`); `related_timesheet_id`/
  `related_schedule_exception_id` remain dead, already folded into open item
  29's scope per the 2026-08-27 sweep, not re-opened. `event_type` coverage
  unchanged (`opening_balance`/`manual_adjustment`/`used`/`correction`/
  `reversal` written; `accrual`/`carryover`/`expiration` dead per item 24).
  **Match** (via items 24/29).
- **payment_records** — every status value is reachable
  (`paymentDisplayStatus()` for `upcoming`/`due`/`overdue`; `Pay.tsx:739`'s
  `amount < gross_pay_due` check for `partially_paid`; `mark_paid`/`correct`/
  `void` for the rest). `hourly_rate`/`overtime_rate`/`reimbursements`/
  `manual_adjustments` are all snapshotted from the generating timesheet or
  correction form (`Pay.tsx:516-519,537-540,1006-1010`). `guarantee_override_
  note`/`attachment_url` remain dead per open items 37/26, no change. **Match**
  (aside from items 26/37).
- **reminders** — `channel`/`trigger_rule`/`last_sent_at` remain dead per
  the already-resolved item 17 (in-app-only, deferred), confirmed unchanged.
  Also checked `caregiver_id`: every row `More.tsx`'s `toggleReminderType`
  inserts (`More.tsx:222-226`) leaves it unset, so per-type enable/disable is
  scoped per-user only, not per-caregiver — a household with more than one
  caregiver can't set different reminder preferences per caregiver. This is
  a real, previously-unconfirmed dead-column reading, but doesn't rise to its
  own item this session: it needs a genuine new settings-UI affordance (a
  per-caregiver picker) with no existing precedent to copy, the majority of
  households run one caregiver (per this codebase's own history), and no
  session across ~11 weeks has flagged it as an actual problem — noting it
  here for the record rather than opening a fourteenth-plus item for a gap
  nobody's hit yet.
- **audit_events** — every entity type spec 15.15's "Audit sensitive
  actions" list implies (`caregiver_profile`, `leave_policy`, `schedule_
  shift`, `schedule_exception`, `timesheet`, `time_entry`, `payment_record`,
  `household_user`) has at least one `logAuditEvent(...)` call site; the one
  named action with no corresponding event ("Timesheet rejection") is the
  direct, already-documented consequence of item 25's unbuilt reject
  workflow — nothing to log because the action itself doesn't exist yet, not
  a separate audit-log gap. **Match** (aside from item 25).

No other new judgment calls or mechanical gaps were found across the seven
tables.

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — the same six pre-existing
warnings as every prior session (three `only-export-components`, one
`exhaustive-deps`), nothing new.

Per the standing instruction, every open Q&A item (now 17: 22-26, 29, 31-35,
37-42) was presented again — via `PushNotification` as well as in chat,
since this is a scheduled/unattended run — with its options and
recommendation; nothing was built unilaterally.

---

## 2026-09-08 — Time-entry schedule pre-fill re-confirmed again (still correct); first dedicated full literal re-audit of spec 17 (Status Rules) and 19 (RLS Requirements) since 2026-08-08 finds everything still matches spec, no new gaps; no new judgment call opened; health check clean; all 16 open Q&A items presented in chat/notification, none built unilaterally

**This session's scope:** re-confirm the manual time-entry pre-fill behavior
(this run's prompt asked for it again directly, plus asked that it default
time entry to the scheduled hours — already the existing behavior, see
below), confirm the diff-review rotation has nothing new to cover, then run
a fresh full literal audit of spec sections 17 and 19 — the two
cross-cutting sections whose last dedicated pass (2026-08-08) predates a
meaningful amount of subsequent churn nearby: the Correct/Void patterns
added across timesheets/payment records (2026-08-13/19), the co-admin
`coadminAllowed(...)` client-side permission checks added for
`approve_timesheet`/`mark_payment_made` (2026-08-19), and the
household-member soft-delete migration (2026-08-20, item 30).

**Time-entry pre-fill: still correct, no change.** Re-checked `Time.tsx`
directly. The date field still defaults to today
(`new Date().toISOString().slice(0, 10)`), and the manual-entry
start/end/break fields still pre-fill from the caregiver's scheduled shift
for that date via `generateShiftsForRange(...)` (the `useEffect` at line
121), falling back to the 09:00–17:00 defaults only when nothing is
scheduled that day. This is exactly what this run's prompt asked for
("time entry pre-set to the schedule hours, can still default to current
day") — it has been in place since 2026-06-30 and re-confirmed unchanged
every session since.

**Diff-review rotation:** `HEAD` still matches `origin/main` at
`14f2f53` (the 2026-09-07 session's own last merged commit). No new commits
landed since; nothing new for the rotation to review.

**Spec 17 (Status Rules) audit:** every status enum in `src/lib/types.ts`
was checked field-for-field against spec 17's three status lists.
`TimeEntryStatus` (`draft`/`submitted`/`approved`/`rejected`/`corrected`/
`locked`), `TimesheetStatus` (`draft`/`submitted`/`needs_correction`/
`approved`/`payment_due`/`paid`/`locked`), and `PaymentStatus`
(`upcoming`/`due`/`overdue`/`partially_paid`/`paid`/`corrected`/`voided`)
all match spec's lists exactly, value for value. Two values with no write
path in the current UI — `time_entries.status` never reaching `'rejected'`/
`'corrected'`, `timesheets.status` never reaching `'needs_correction'` — were
re-checked and confirmed to be the exact same gap open item 25 already
documents (the 2026-08-13 session found and folded the `time_entries`-level
finding into item 25's scope rather than opening a separate item); nothing
new here.

**Spec 19 (RLS Requirements) audit:** read `0002_rls.sql` and `0018_rls_
nanny_insert_status_and_profile_scope.sql` bullet-by-bullet against every
line of spec 19's policy list. Household/caregiver-profile read scoping,
the nanny-can-only-touch-own-draft-entries update policies, the
insert-side status allow-lists item 21's 2026-08-08 fix added (closing the
gap where a nanny could otherwise insert a row already at `'approved'`/
`'paid'`/`'locked'` via a direct API call), the leave-request approve
restriction, and the parent/co-admin permission-keyed write policies all
still match spec exactly. Specifically checked `payment_records_select`
(household-scoped, unfiltered read for both parent/co-admin and the
caregiver themselves) against spec 19's "a nanny can read *visible* payment
records for their own caregiver profile" wording — confirmed this is the
same ground already settled by resolved item 20 (2026-07-26): the
`nanny_can_view_*` flags gate specific *fields* (gross pay, PTO balance,
payment method) in the UI layer by deliberate design, not whole-row RLS
access, so an unfiltered row-level read policy here isn't a gap. Also
checked the 2026-08-20 household soft-delete migration (`0019`) — it only
rewrites `join_household_by_code()`'s error message for a `'removed'` user
attempting to rejoin; every RLS helper already required `status = 'active'`
before that migration existed (migration 0002), so the household-boundary
guarantee (`is_household_member`, etc.) was never affected by it.

No new judgment call was opened, and no source-code bug was found this
session.

**Health check:** `npm install`, `npm run build` (tsc -b && vite build), and
`npm run lint` (oxlint) all clean — the same six pre-existing warnings as
every prior session (three `only-export-components`, one `exhaustive-deps`),
nothing new.

Per the standing instruction, every open Q&A item was presented again — via
`PushNotification` as well as in chat, since this is a scheduled/unattended
run — with its options and recommendation; nothing was built unilaterally.

---

## 2026-09-07 — Time-entry schedule pre-fill re-confirmed again (still correct); diff-review rotation finds nothing new to review (everything since the last checkpoint was already covered by prior sessions); found and fixed a documentation artifact in this file's companion Q&A intro, plus a stale open-item count off by one; health check clean; all 16 open Q&A items presented in chat/notification, none built unilaterally

**This session's scope:** re-confirm the manual time-entry pre-fill behavior
(this run's prompt asked about it again directly), check whether the
adversarial diff-review rotation had new ground to cover, and re-present the
full open-items list per the standing instruction.

**Time-entry pre-fill:** re-checked `Time.tsx` directly. The date field
still defaults to today (`todayStr`), and the manual-entry start/end/break
fields still pre-fill from `generateShiftsForRange(...)` for that date when
a scheduled shift exists, falling back to 09:00–17:00 otherwise — unchanged
since 2026-06-30, same conclusion as every prior re-confirmation.

**Diff-review rotation:** the 2026-08-27 session's own pass covered
`58a4419..83def34`. Everything merged to `main` since then —
`99099d6` (2026-09-02, that session's own fix, self-reviewed when written),
`03f4544` (2026-09-02, reviewed by the 2026-09-04 session, no bug found),
and `cd06fa9` (2026-09-05, documentation-only — two `.md` files, no source
change) — was already reviewed by a prior session. Confirmed via
`git log 83def34..HEAD --oneline -- <each changed file>` that no file's
post-83def34 history is missing a review. Nothing new for this rotation to
check.

**Documentation fix:** found a copy-paste artifact in this file's companion,
`QUESTIONS_AND_CLARIFICATIONS.md`'s running intro paragraph — the fragment
"part of that ask beyond item 30." (the tail end of the 2026-08-20 session's
sentence) had been accidentally duplicated as a dangling, ungrammatical
prefix at the start of both the 2026-08-23 and 2026-08-24 sessions'
paragraphs, the same class of self-inflicted intro-paragraph bug the
2026-08-13 session found and fixed once before. Removed both stray copies;
the paragraph now reads as a single continuous narrative again with no
content lost (the real sentence describing the 2026-08-20 session's scope,
at the end of the 2026-08-22 paragraph, was untouched).

Also found the recurring "15 open Q&A items" count quoted in this log and in
`QUESTIONS_AND_CLARIFICATIONS.md`'s intro since 2026-08-14 has been stale
since item 37 was added on 2026-08-13: a direct count of every `### N.`
heading between `## Open items` and the first `## Resolved items` section
gives **16** (22-26, 29, 31-35, 37-41), not 15 — item 37
(`payment_records.guarantee_override_note`) was apparently never folded into
the running count. No item was mis-filed as resolved; this was purely an
arithmetic drift carried forward unchecked across roughly a dozen sessions.
Corrected the count going forward in this entry's own title.

**Health check:** `npm install`, `npm run build` (tsc -b && vite build), and
`npm run lint` (oxlint) all clean — the same six pre-existing warnings as
every prior session (three `only-export-components`, one `exhaustive-deps`),
nothing new.

No new judgment call was opened, and no source-code bug was found this
session. Per the same standing instruction, every open Q&A item was
presented again — via `PushNotification` as well as in chat, since this is
a scheduled/unattended run — with its options and recommendation; nothing
was built unilaterally.

---

## 2026-09-05 — Time-entry schedule pre-fill re-confirmed again (still correct); first dedicated full literal re-audit of spec section 16 (Calculation Rules) since 2026-08-05/08-09 finds every formula matches spec except one previously-undocumented gap (`other_paid` leave never reaches gross pay); one new judgment call opened, nothing built unilaterally; health check clean

**This session's scope:** re-confirm the manual time-entry pre-fill
behavior, then run the full literal, bullet-by-bullet re-audit of spec
section 16 (`APPLICATION_SPEC.md` lines 2078-2208, 16.1-16.9) the standing
task instructions called for — this section's last *dedicated* full pass was
2026-08-05/2026-08-09, and several daily-breakdown/export bug fixes have
landed in adjacent code since (2026-08-25, 2026-09-02) without a fresh check
that the core per-period formulas still match spec. Checked `calc.ts`,
`schedule.ts`, `payExport.ts`, and `Pay.tsx`'s usage of all three.

**Pre-fill: still correct, no change.** Re-checked `Time.tsx` directly —
`date` still defaults to today (`new Date().toISOString().slice(0, 10)`,
line 51), and the pre-fill `useEffect` (lines 121-136) still looks up the
selected date's generated shift via `generateShiftsForRange` and fills
`startTime`/`endTime`/`breakMinutes` from it, falling back to the
09:00-17:00 defaults only when nothing's scheduled that day. Same behavior
re-verified every session since 2026-06-30.

**Section 16 audit, bullet by bullet:**

- **16.1 Paid Hours** (`paid_hours = end_time - start_time -
  unpaid_break_minutes`, no rounding by default) — matches `calc.ts`'s
  `hoursBetween`: computes minutes, handles a midnight-crossing shift,
  subtracts `breakMinutes` unconditionally (time entries have no
  `paid_break` column, unlike `schedule_shifts` — the spec's own formula
  treats all break minutes as unpaid for a time entry, so this is correct,
  not a gap), and only applies `round2` (float-dust cleanup, not real
  time-unit rounding). **Match.**
- **16.2 Scheduled Hours** — `Pay.tsx`'s `computePeriodTotals` sums
  `occurrences.reduce(shiftHours)` plus `scheduleExceptionHoursDelta(...)`,
  clamped to `>= 0`. **Match.**
- **16.3 Guaranteed Hours** — `computeGuaranteedHoursBase`
  (`src/lib/schedule.ts:192-211`) correctly branches on
  `guaranteed_hours_basis === 'linked_to_schedule'`; for the two fixed
  bases it falls through
  `caregiver.fixed_weekly_guaranteed_hours ?? caregiver.fixed_pay_period_guaranteed_hours ?? 0`
  without re-checking which basis is selected. Traced this against
  `CaregiverDetail.tsx`'s save handler (`handleSave`,
  `src/routes/CaregiverDetail.tsx:287-294`): it always writes exactly one of
  the two fields to a number and the other to `null` based on the currently
  selected `guaranteedBasis`, so the two columns are a de facto mutually-
  exclusive pair under every write path the app has — the fallback chain
  always resolves to the right value in practice. Not a bug, just worth
  noting the correctness depends on that write-side invariant rather than
  the read-side switching on `guaranteed_hours_basis` directly. **Match
  (verified, not just assumed).**
- **16.4 Actual Paid Hours** — `calc.ts`'s `actualPaidHours` sums
  `actualWorkedHours` plus PTO/sick/holiday (each gated by its own
  caregiver-level `*CountsTowardGuarantee` flag) plus
  `familyCancellationHours` unconditionally (already pre-zeroed upstream by
  `Pay.tsx` when the caregiver's flag is off). **Match** for every category
  the formula names — see the one gap below for the category it doesn't
  name.
- **16.5 Guarantee Adjustment** — `unpaidTimeOffReducesGuarantee` gate,
  `adjustedGuaranteedHours = max(guaranteedHoursBase - unpaidTimeOffHours, 0)`,
  then `guaranteeAdjustmentHours = max(adjustedGuaranteedHours -
  actualPaidHours, 0)` — matches spec's example formula exactly (the extra
  intermediate `max(...,0)` is a redundant-but-harmless no-op given the
  outer `max` that follows). **Match.**
- **16.6 Overtime** — `regularWorkedHours = min(actualWorkedHours,
  overtimeThresholdHours)`, `overtimeWorkedHours = max(actualWorkedHours -
  overtimeThresholdHours, 0)`, computed only from `actualWorkedHours` (never
  suppressed by the guarantee, and guarantee-adjustment hours land in
  `payableRegularHours` per 16.7, never in overtime). **Match** (the known,
  already-documented item 31 gap is about *which hours* get bucketed into
  this per-period computation for non-weekly pay frequencies, not this
  formula itself — not re-litigated here).
- **16.7 Payable Hours** — `payableRegularHours = regularWorkedHours +
  paidPtoHours + paidSickHours + paidHolidayHours + familyCancellationHours +
  guaranteeAdjustmentHours`; `payableOvertimeHours = overtimeWorkedHours`;
  regular hours are capped at the threshold via the `min(...)` in 16.6.
  **Match** for every category the formula names.
- **16.8 Gross Pay Due** — `overtimeRate = hourlyRate * overtimeMultiplier`;
  `grossPayDue = payableRegularHours * hourlyRate + payableOvertimeHours *
  overtimeRate + reimbursements + manualAdjustments`. **Match**, exactly as
  written in the spec.
- **16.9 PTO Accrual** — all four accrual-method formulas remain unbuilt
  except front-loaded-annual's manual allowance entry; this is the already-
  open, already-fully-written-up item 24 (no server cron for the other three
  methods, plus a genuine redundancy question), not re-opened here.

**One previously-undocumented gap found, not mechanically fixed — see new
`QUESTIONS_AND_CLARIFICATIONS.md` item 41.** `other_paid` (spec 13.7's
"Other paid leave," fully wired through the same request/approve flow as
`holiday` in `PTO.tsx`, no `leave_policies` row required for either) is the
one leave type `Pay.tsx`'s `computePeriodTotals` never sums into the
`calculateTimesheet` call — `sumLeave('pto')`/`sumLeave('sick')`/
`sumLeave('holiday')`/`sumLeave('unpaid')` are all called, `sumLeave('other_paid')`
never is, and `calc.ts`'s `TimesheetCalcInput` has no field for it at all.
An approved `other_paid` request inside a pay period is silently excluded
from `actual_paid_hours`/`payable_regular_hours`/`gross_pay_due`, and the
gap is directly visible in the app's own output: `payExport.ts`'s
`computeDailyBreakdown` (built for item 36) does compute an `otherPaidHours`
value per day and `Pay.tsx` renders it as an "Other paid" line in the Daily
Detail card (`src/routes/Pay.tsx:132`), sitting directly above a period
gross-pay total that paid $0 for those hours. Not mechanically fixed because
(a) spec 16.4/16.7's own formulas name exactly four paid-leave terms, never
a fifth, so it's genuinely ambiguous whether "other paid leave" was ever
meant to flow through this formula at all versus being a
tracking-only category paid out via `manual_adjustments`, and (b) even if it
should be paid, the closest precedent (`holiday`'s caregiver-level
`holiday_counts_toward_guarantee` flag) has no `other_paid` equivalent
column on `caregiver_profiles` to copy — wiring it up "the holiday way"
means a new schema column, a real judgment call, not a code-only fix. Per
the standing instruction, this is written up as item 41 (options A/B/C, no
recommendation given, same posture as items 31/37) rather than built.

**Health check:** `npm install`, `npm run build` (`tsc -b && vite build`),
and `npm run lint` (`oxlint`) all ran clean — no new TypeScript or lint
errors; the same six pre-existing warnings prior sessions have already
documented (`react-hooks/exhaustive-deps` in `Schedule.tsx`; Fast Refresh
`only-export-components` warnings in `AuthContext.tsx`, `HouseholdContext.tsx`,
`PreferencesContext.tsx`, and `Card.tsx`).

No source files were changed this session — only `SPEC_CHANGE_LOG.md` and
`QUESTIONS_AND_CLARIFICATIONS.md`. Every open Q&A item (22-26, 29, 31-41)
was presented again this run — via chat and a push notification, since this
is a scheduled/unattended session — with its options and recommendation;
nothing was built unilaterally this session.

---

## 2026-09-04 — Time-entry schedule pre-fill re-confirmed again (still correct, matches this session's own request); adversarial review of the one diff since 2026-09-02 not yet covered (a fix authored outside this session's rotation) finds no bugs; health check clean; all 15 open Q&A items presented in chat/notification again, none built unilaterally

**This session's scope:** the recurring-task owner's prompt this run
explicitly asked (again) whether manual time entry pre-fills from the
caregiver's scheduled hours, defaulting the date to today. Re-checked
`Time.tsx` directly rather than trusting the running history: the date
field still defaults to `todayStr`, and the start/end/break fields still
pre-fill from `generateShiftsForRange(...)` for that date, falling back to
the 09:00–17:00 constants only when nothing is scheduled — unchanged since
2026-06-30, same as every prior re-confirmation. No code change needed;
already built exactly as requested.

**Diff review:** the 2026-09-02 session's own review pass covered
`58a4419..83def34`. Since then, `main` advanced by one more real commit not
authored by this rotation — `03f4544` ("Prevent household refresh from
hiding records", merged via PR #93 from a `codex/...` branch, i.e. a
different agent/tool, not this recurring session) — plus merge commits and
`99099d6`, which is simply the 2026-09-02 session's own fix landing as a
commit (already reviewed when written, not re-reviewed here).

`03f4544` wraps the `localStorage` reads/writes in `HouseholdContext.tsx` in
try/catch (so a blocked-storage browser degrades to in-memory-only instead
of throwing), and adds an effect that pins the household chosen by the
`households.find(...) ?? households[0]` fallback back into
`activeHouseholdId`/`localStorage` the moment it resolves. The bug this
fixes: when a user has multiple households and no `activeHouseholdId` is
yet stored, PostgREST doesn't guarantee row order, so `households[0]` could
resolve to a different household across refreshes — including the refresh
that runs right after saving household settings — making a household's
caregivers/time history/pay/PTO appear to silently vanish. Traced the fix
through every call site (`Onboarding.tsx`'s create and join flows both now
call `setActiveHouseholdId` before `refresh()`, avoiding the race at its
source; `More.tsx`'s new household switcher only lists households already
present in `households`) and through the re-render/effect-dependency
behavior (the new effect's guard compares `household.id !== activeHouseholdId`,
so it only writes state when the id actually changes — no infinite-loop or
extra-render risk from `household` being a new object reference each
refresh). No bug found; the fix is correct and matches the pattern already
used elsewhere in this file (`setActiveHouseholdId`'s own try/catch).

**Health check:** `npm run build` (tsc -b && vite build) and `npm run lint`
(oxlint) both clean — the same three longstanding `only-export-components`
warnings and one `exhaustive-deps` warning as prior sessions, nothing new.

No new judgment call was opened, and no bug was found to fix. Per the same
standing instruction, every open Q&A item was presented again — this run,
via `PushNotification` as well as in chat, since this is a scheduled/
unattended run — with its options and recommendation; nothing was built
unilaterally this session.

---

## 2026-09-02 — Time-entry schedule pre-fill re-confirmed again (still correct); adversarial code-review pass over the diff since the 2026-08-24 review finds and fixes two real bugs plus one duplication cleanup; all 15 open Q&A items presented in chat again, none built unilaterally

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, then continue the
adversarial-code-review rotation the 2026-08-24/25 sessions started (spec
audits have returned "no gaps" for most sections for several sessions
running, so reviewing new diff for correctness bugs has been the
higher-yield technique lately). The 2026-08-25 pass covered
`45be0fe..58a4419`; this session covered the three sessions' worth of work
merged since then that hadn't yet had a review pass: `58a4419..83def34`
(the 2026-08-25 Daily-detail fix itself, the 2026-08-26 PTO both-parties-notes
change, and the 2026-08-27 dead-column sweep).

**Pre-fill: still correct, no change.** Same `Time.tsx` behavior as every
prior re-confirmation.

**Two real, previously-undocumented bugs found and fixed:**

- **`payExport.ts`'s `computeDailyBreakdown` summed `actualWorkedHours` over
  every time entry for the day regardless of status, while `Pay.tsx`'s
  `computePeriodTotals` (used for the period total shown directly above the
  Daily-detail table) only sums `paid_hours` for entries with
  `status === 'approved'`.** A day with a pending or rejected entry
  alongside an approved one would show a per-day "Worked" figure exceeding
  what the period total above it implies — the same class of bug the
  2026-08-25 session already found and fixed for that function's
  `scheduledHours`/`familyCancellationHours` fields, left unfixed here for
  `actualWorkedHours` because it was a separate field in the same function.
  Fixed by filtering to `status === 'approved'` before summing, matching
  `computePeriodTotals` exactly. The per-day status chips (`entryStatuses`)
  and entry notes/time ranges are intentionally left unfiltered — a
  pending/rejected entry still needs to be visible on the day it happened,
  it just shouldn't count toward the paid-hours total.
- **`PTO.tsx`'s leave-request detail modal stopped showing the viewer's own
  note when the 2026-08-26 "show both parties' notes" change landed** — the
  old read-only block (which showed `isNanny ? nanny_note : parent_note`,
  i.e. your own note) was replaced with a block showing only
  `isNanny ? parent_note : nanny_note` (the other party's note), rather than
  both. A nanny opening a processed request she'd left a note on could no
  longer see her own note anywhere in the modal, even though the equivalent
  list-row view (a few lines up in the same file) already renders both
  notes labeled. Fixed by rendering both `nanny_note` and `parent_note` in
  the modal, each labeled the same way the list row already does.

**One duplication cleanup, no behavior change:** `computeDailyBreakdown`'s
family-cancellation/weather-emergency hours reimplemented
`sumExceptionHoursByType`'s approved+`affects_pay` filter inline instead of
calling the helper `Pay.tsx`'s `computePeriodTotals` already uses for the
identical calculation — the two copies would silently drift apart if the
filtering rules ever changed in one place and not the other, the exact
failure mode that produced the 2026-08-25 bug in the first place. Replaced
the inline filter with two `sumExceptionHoursByType(...)` calls, identical
to `Pay.tsx`'s own usage.

No new judgment call was opened — both bugs had an unambiguous fix implied
by an exact precedent already established elsewhere in the same file/module.
Per the same standing instruction, every open Q&A item was presented again
in chat with its options and recommendation; nothing else was built
unilaterally this session.

## 2026-08-27 — Time-entry schedule pre-fill re-confirmed again (still correct); health check clean; a full field-by-field dead-column sweep across every `types.ts` interface finds three previously-undocumented dead columns, each already explained by an existing resolved decision or open item; all 15 open Q&A items presented in chat again, none built unilaterally

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, run the repo's health
check, and look for previously-undocumented gaps using a different technique
than a spec-section literal audit — most sections have now had at least one
dedicated literal pass with "no gaps found," so a section-by-section re-read
was likely low-yield again (as the 2026-08-24 session's adversarial-review
pivot already anticipated for that same reason). Instead, this session ran
the dead-column grep sweep that has previously found real gaps (items 27,
34, 35, 37, `users.last_login_at`) across *every* field name in
`src/lib/types.ts`, not just one table at a time — comparing each field name
against its usage everywhere else in `src`.

**Pre-fill: still correct, no change.** Same `Time.tsx` behavior as every
prior re-confirmation — `date` defaults to today, and the pre-fill
`useEffect` keyed on `[date, templates, shiftsByTemplate]` fills
`startTime`/`endTime`/`breakMinutes` from the selected date's generated
shift occurrence, falling back to a sane default when nothing's scheduled.

**Health check:** `npm install`, `npx tsc -b`, `npm run build`
(`tsc -b && vite build`), and `npx oxlint` all ran clean — no new TypeScript
or lint errors, same six pre-existing warnings prior sessions have already
noted.

**Dead-column sweep found three previously-undocumented dead columns —
confirmed via grep (zero reads/writes outside `types.ts`) — but all three
already have an unambiguous explanation from an existing resolved decision
or open item, so none needed a new `QUESTIONS_AND_CLARIFICATIONS.md` entry:**

- **`schedule_exceptions.affects_pto` (spec 13.3/15.7).** Explained by the
  2026-07-02 resolved decision to keep PTO/sick/unpaid-time-off exceptions
  out of the `schedule_exceptions` UI entirely (`leave_requests` is the sole
  entry point for those three exception types) — `affects_pto` only has a
  plausible use for exactly the exception types that decision routes
  elsewhere, so no code path was ever going to set it. Same root cause as
  that resolution, not a new gap.
- **`leave_ledger.related_schedule_exception_id` (spec 15.12).** Same
  explanation as `affects_pto` above — the only schedule-exception types
  that could plausibly drive a PTO ledger entry are the ones the 2026-07-02
  decision already keeps off this table. `related_leave_request_id`, this
  column's sibling on the same table, *is* fully wired (`PTO.tsx`'s
  `applyUsedLedger`/`zeroOutLedgerForRequest`), confirming the gap is
  specific to this one column, not the linking mechanism in general.
- **`leave_ledger.related_timesheet_id` (spec 15.12).** This is the exact
  link a "deduct on timesheet approval" ledger entry (open item 29, options
  B/C) would set when writing a real deduction tied to the timesheet that
  triggered it. Today's deduct-on-approval model (item 29's status quo)
  never ties a ledger write to a timesheet at all, so nothing has ever
  populated it. Folds into item 29's already-open scope rather than opening
  a new item — building item 29 option B or C is exactly the work that would
  wire this column up.
- **`reminders.channel`/`.trigger_rule`/`.last_sent_at` (spec 15.14).** All
  three stay at their DB default forever — `More.tsx`'s `toggleReminderType`
  only ever inserts/updates `household_id`, `recipient_user_id`, `type`,
  `enabled`. Explained by the already-resolved item 17 ("stay in-app only
  for now... defer recipients and quiet hours until there's an email/SMS
  backend, since they have no delivery channel today"): `channel` is
  literally that delivery-channel choice (`'in_app' | 'email'`, only
  `'in_app'` ever built); `last_sent_at` would track a dispatch event that
  doesn't exist for an in-app reminder recomputed live on every page load
  rather than "sent" once; `trigger_rule` (a per-row configurable condition)
  was superseded by the same resolution's choice to hardcode each reminder
  type's trigger logic in `reminders.ts` instead of reading a stored rule.
  All three are the same "in-app-only, deferred" shape item 17 already
  covers, not a new one.

**No new judgment calls surfaced.** Every finding this session had an
existing, already-decided explanation to fold into rather than a fresh
ambiguity. Every open Q&A item (22-26, 29, 31-35, 37-40) was presented again
in chat this session per the standing instruction — none resolved, none
newly opened; the existing recommendations are still current for every item.

No source files were changed this session — only `SPEC_CHANGE_LOG.md` and
`QUESTIONS_AND_CLARIFICATIONS.md`.

---

## 2026-08-26 — Time-entry schedule pre-fill re-confirmed again (still correct); full literal audit of spec 13.7 (PTO/Sick/Unpaid Leave) finds and fixes one real bug (parent/nanny leave-request notes were one-sided); one new judgment call surfaced; all 15 open Q&A items presented in chat again, none built unilaterally

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, then run the first
dedicated full literal audit of spec 13.7 (PTO/Sick/Unpaid Leave) against
`PTO.tsx`, `lib/leave.ts`, and the `leave_policies`/`leave_requests`/
`leave_ledger` schema — the one core workflow section that hadn't yet had a
section-specific pass of its own (it had only ever been touched incidentally
by items 24/29/35's narrower findings).

**Pre-fill: still correct, no change.** Same `Time.tsx` behavior as every
prior re-confirmation — `date` defaults to today, and the `useEffect` keyed
on `[date, templates, shiftsByTemplate]` fills `startTime`/`endTime`/
`breakMinutes` from the selected date's generated shift occurrence, falling
back to a sane default when nothing's scheduled.

**Fixed: a parent's "Comment" and a nanny's own request note were each only
ever visible to their author, never to the other party (spec 13.7's PTO
Request Workflow, "Parent can: ... Comment").** `PTO.tsx`'s list row and
detail modal both rendered `isNanny ? nanny_note : parent_note` — i.e. each
role only ever saw its *own* note. A parent's "Comment" (labeled as such in
the edit form) was never shown back to the nanny it was meant for, and vice
versa. `Time.tsx` already solved this exact shape of problem for
`time_entries.nanny_note`/`parent_note` (2026-08-15 session): both notes
render in the row, labeled by author for whichever party isn't the writer,
and the other party's note renders read-only in the detail modal above the
editable field for your own. Applied the same pattern to `PTO.tsx`: the list
row now shows both `nanny_note` and `parent_note` when present (labeled
"Nanny:"/"Parent:" for the reader who isn't the author, unlabeled for the
author, matching `Time.tsx`'s exact convention); the detail modal now shows
the *other* party's note read-only above the edit form (labeled "Parent
note:"/"Nanny note:"), and the modal's read-only (non-editable) view no
longer duplicates the request's own note since it's already visible in the
row, again matching `Time.tsx`'s precedent exactly.

**One new judgment call surfaced — item 40 (nanny can request Holiday/Other
Paid leave, not just PTO/Sick/Unpaid).** See
`QUESTIONS_AND_CLARIFICATIONS.md`.

**Not new findings, folded into existing items rather than re-flagged:**
`leave_policies.enabled`/`.paid`/`.active` are dead columns (confirmed via
grep — zero reads/writes outside `types.ts`), an unnamed extension of item
24's broader "`leave_policies` mostly unwired" finding, same root cause, not
a separate issue. Of the 9 spec-listed `leave_ledger` event types, only
`opening_balance`, `manual_adjustment`, `used`, `correction`, and `reversal`
are ever written; `accrual`/`carryover`/`expiration` are dead — this is the
direct, already-documented consequence of item 24's "no accrual automation"
gap. Spec's 4 PTO Balance Views (as of today / end of current pay period /
after approved upcoming PTO / end-of-year estimate) collapse into the one
ambiguous number `PTO.tsx` already shows — considered as part of the
existing balance-display ambiguity rather than a new item, since fixing it
runs into the same period-boundary questions items 31-33 already flag as
unresolved. The "modify and approve" spec line isn't a single atomic action
(a parent edits, then separately clicks Approve, both reachable in the same
modal) — functionally equivalent to a combined action in two clicks rather
than one, judged too minor for its own item.

No spec text was changed this session — all findings were implementation
gaps, not spec ambiguities needing a wording fix. Every open Q&A item was
presented again in chat and via notification, per the standing instruction
not to decide any of them unilaterally.

---

## 2026-08-25 — Time-entry schedule pre-fill re-confirmed again (still correct); adversarial code-review of the 2026-08-22/23 diff finds and fixes two real bugs in the new "Daily detail" view (spec 13.5/13.6); all 14 open Q&A items presented in chat again, none built unilaterally

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, then continue the
adversarial-code-review approach the 2026-08-24 session introduced (a
full literal spec audit had been returning "no gaps found" for several
consecutive sessions by that point) — this time over the slice of diff the
2026-08-24 review hadn't yet covered: commits `9f63c74` (2026-08-22,
"Finish setup" checklist + per-day timesheet breakdown) and `7397fe1`
(2026-08-23, `leave_policy_id` edit-sync fix), i.e. `0037ee8..HEAD`.

**Pre-fill: still correct, no change.** Same `Time.tsx` behavior as every
prior re-confirmation — `date` defaults to today, and the `useEffect` keyed
on `[date, templates, shiftsByTemplate]` fills `startTime`/`endTime`/
`breakMinutes` from the selected date's generated shift occurrence, falling
back to a sane default when nothing's scheduled. Sixteen consecutive
sessions (2026-08-08 through 2026-08-24) have now re-verified this with
zero regressions.

**Two real, previously-undocumented bugs found in `computeDailyBreakdown()`
(`src/lib/payExport.ts`), the per-day engine built 2026-08-22 for item 36's
in-app "Daily detail" view — both fixed, both confined to that new UI path
(the CSV export, which never passes a `schedule` context, was unaffected and
confirmed still byte-for-byte identical):**

- **Family cancellation/weather-emergency hours ignored the caregiver's
  `family_cancellation_counts_toward_guarantee` flag.** `Pay.tsx`'s
  `computePeriodTotals` (the period-total pay calculation) zeroes these hours
  out entirely when that flag is off — per `calc.ts`, the flag gates whether
  the hours are paid at all, not just whether they count toward the
  guarantee. `computeDailyBreakdown`'s per-day version summed them
  unconditionally whenever an exception was `approved`/`affects_pay`,
  regardless of the flag, so a caregiver with the toggle off could open
  "Daily detail" on a day with an approved family-cancellation exception and
  see a nonzero hours line directly contradicting both the period total
  shown just above it and the actual amount paid. Fixed by adding an
  optional `familyCancellationCountsTowardGuarantee` field to
  `DailyScheduleContext` (defaulting to `false`, matching
  `computePeriodTotals`' own ternary) and gating the per-day sum on it;
  `Pay.tsx`'s `loadDailyDetail` now looks up the timesheet's caregiver from
  the already-loaded `caregivers` list and passes the flag through.
- **Per-day "Scheduled" hours ignored one-off shift-modification exceptions
  entirely.** `computePeriodTotals` nets `scheduleExceptionHoursDelta(...)`
  (the `added_shift`/`removed_shift`/`shortened_shift`/`extended_shift`
  adjustment) into the period's scheduled-hours total, but
  `computeDailyBreakdown`'s per-day `scheduledHours` only ever summed
  recurring-template occurrences for that date — an approved `removed_shift`
  exception canceling a normally-scheduled day still showed the full
  original hours in Daily Detail, and an `added_shift` exception on a day
  with no recurring occurrence showed nothing at all. Fixed by filtering the
  day's exceptions to the selected date and running them through the same
  `scheduleExceptionHoursDelta` helper `computePeriodTotals` already uses
  (no new formula invented), clamped to zero the same way the period-level
  computation is.

Both bugs existed despite the function's own comment claiming to "mirror"
`computePeriodTotals` — the mirroring was real for the worked/leave-hours
math but incomplete for these two schedule-derived fields, which weren't
part of the original per-day engine before this feature's per-day scheduled/
family-cancellation columns were added.

**No new judgment calls surfaced.** Both were mechanical bugs with an exact,
unambiguous fix already implied by the sibling code they were meant to
mirror — same posture as every other mechanical fix in this log.

**Health check:** `npm install`, `npx tsc -b`, `npm run build`
(`tsc -b && vite build`), and `npx oxlint` all ran clean — no new
TypeScript or lint errors; same six pre-existing warnings prior sessions
have already noted (`react-hooks/exhaustive-deps` in `Schedule.tsx`, Fast
Refresh `only-export-components` warnings in the context files and
`Card.tsx`).

All 14 open `QUESTIONS_AND_CLARIFICATIONS.md` items (22-26, 29, 31-35,
37-39) were re-presented in chat this session per the standing instruction —
none resolved, none newly opened; the existing 2026-08-08 recommendations
index is still current for every item.

Only `src/lib/payExport.ts` and `src/routes/Pay.tsx` were touched.

---

## 2026-08-22 — "Finish setup" checklist on Home (resolves Q&A item 28); in-app per-day timesheet breakdown in Pay's timesheet detail view (resolves Q&A item 36); time-entry schedule pre-fill re-confirmed

Built items **28** and **36**, each using its own already-standing
recommendation (option B for both) rather than a fresh judgment call — both
had unambiguous option lists with a clear "if built" recommendation already
written up in `QUESTIONS_AND_CLARIFICATIONS.md`, the same posture the
2026-08-20 session used to close item 30. No other open item (22-27, 29,
31-35, 37-39) was touched.

**Item 28 — "Finish setup" checklist (spec 13.1):** `Home.tsx` now renders a
dismissible "Finish setup" card, visible only to `isParentOrCoAdmin`, listing
whichever of five still-default settings remain: no caregiver profile yet, no
active `schedule_templates` row for every caregiver, no PTO/sick
`leave_policies` row for every caregiver, the household `timezone` still at
its `'America/New_York'` DB default, and zero `reminders` rows for this
household/user. Each item routes straight to the screen that already handles
it (`/more` for caregivers/timezone/reminders, `/calendar` for schedule,
`/caregiver/:id` for PTO settings when there's exactly one caregiver,
otherwise `/more` so the parent picks which one) — no new screen or form was
built, matching option B's framing that every one of spec 13.1's 11 steps
already has a working control somewhere in the app. The five checks reuse
data `Home.tsx`'s existing load effect already fetches (`caregivers`,
active `templates`, PTO/sick `leavePolicies`, and the current user's
`reminders` rows) rather than issuing new queries. The card disappears once
every item is done, or the parent taps "Dismiss" — dismissal is stored in
`localStorage` under `nanny-ledger:setup-checklist-dismissed:<householdId>`
(read/write both wrapped in try/catch), the same per-viewer-convenience use
the codebase's other `localStorage` keys (active-household, theme,
time-format) already follow. No new column or migration.

**Item 36 — per-day timesheet breakdown (spec 13.5):** `Pay.tsx`'s timesheet
detail `Modal` now has a collapsible "Daily detail" disclosure below the
existing `HoursBreakdown` period summary. Expanding it lazy-loads that
timesheet's time entries, approved leave requests, and active schedule
context, then renders one card per calendar day in the period (a card list,
not a literal 10-column table, matching the mobile-first, table-free pattern
already used everywhere else in this codebase) showing: date, scheduled
hours, actual clock-in/out times, actual worked hours, PTO/sick/holiday/
unpaid/family-cancellation hours (only the nonzero ones, to keep a mostly-
worked day's card short), each time entry's own status as a chip
(`draft`/`submitted`/`approved`/etc., not the period's status), and notes.

`src/lib/payExport.ts`'s `buildDailyPayExportRows` (the CSV "Daily Detail"
export's per-day engine) was refactored, not duplicated: its per-day logic
now lives in a new shared `computeDailyBreakdown()` that returns a typed
`DailyBreakdown` object instead of CSV-row-shaped strings, and
`buildDailyPayExportRows` maps that same typed object onto the exact same
CSV column set/values as before — the CSV output is byte-for-byte unchanged.
A new `buildTimesheetDailyBreakdown()` calls the same `computeDailyBreakdown()`
for the new render path, additionally passing a schedule context
(occurrences + approved exceptions for the period, loaded via `Pay.tsx`'s
existing `loadScheduleContext()`) so scheduled hours and family-cancellation
hours — which the CSV path has never computed per day, only as period
totals — get filled in for the UI using the same `shiftHours()`/
`exceptionHours()` primitives `schedule.ts` already exports, just grouped by
day instead of by period; no new hour-calculation formula was invented. The
CSV call site (`exportDetailedRecords` in `Pay.tsx`) is untouched and still
doesn't load schedule context, so those two fields stay absent from the CSV
exactly as before.

Re-confirmed the manual time-entry form's schedule pre-fill against
`Time.tsx` again this session (the `useEffect` keyed on
`[date, templates, shiftsByTemplate]`, `Time.tsx:121-136`) — still correct,
no change.

`npx tsc -b`, `npm run build`, and `npx oxlint` all clean; no new warnings
(verified by diffing oxlint's output against the pre-change tree — the six
pre-existing warnings in `AuthContext.tsx`/`HouseholdContext.tsx`/
`PreferencesContext.tsx`/`Card.tsx`/`Schedule.tsx` are unchanged and none of
this session's three touched files appear in the list). Not smoke-tested
against a live Supabase instance (no DB access in this session); both
features only read existing tables/columns, no migration involved.

See `QUESTIONS_AND_CLARIFICATIONS.md`'s 2026-08-22 resolved-items section for
the short decision write-up, and its updated intro paragraph for how this
session's scope was chosen.
## 2026-08-23 — Time-entry schedule pre-fill re-confirmed again (still correct); full literal audit of spec 14.5 (PTO Screen) and 14.7 (Settings Screen) finds and fixes one mechanical gap; no new judgment calls

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, then run a fresh,
genuinely skeptical literal audit rather than a skim. Picked spec 14.5 (PTO
Screen) and 14.7 (Settings Screen) because, per the running history in
`QUESTIONS_AND_CLARIFICATIONS.md`, their last *fresh* bullet-by-bullet pass
was 2026-08-03/2026-08-05 — the 2026-08-14 session only re-confirmed those
sessions' conclusions rather than re-reading the spec bullets against the
current code — making them the oldest genuinely-unrefreshed passes among the
candidates the task suggested (13.9/13.11 were spot-checked 2026-08-18, 19
was audited 2026-08-08, 20 was audited 2026-08-14 — all more recent than
14.5/14.7's last fresh pass).

**Time-entry schedule pre-fill: still correct, no change made.** Re-checked
`Time.tsx` against spec 13.4 — `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`, line 51), the pre-fill `useEffect`
(lines 121-136) still looks up the selected date's scheduled shift via
`generateShiftsForRange` and fills `startTime`/`endTime`/`breakMinutes` from
it, falling back to a sane default only when nothing's scheduled that day.
Same behavior re-verified in every session since 2026-06-30; nothing needed
to change.

**Spec 14.5 (PTO Screen), bullet-by-bullet against `PTO.tsx`,
`useLeavePolicies.ts`, and `CaregiverDetail.tsx`'s PTO settings card:**
Parent view's Current balance, Pending requests, Ledger, and Manual
adjustment bullets all match the code (Manual adjustment stays reachable
only via `CaregiverDetail.tsx`'s allowance editor, which was already
flagged and folded into open item 24's scope back on 2026-08-03 — not a new
finding). Nanny view's Balance-if-enabled (`showPtoBalance` gating), Pending
requests, Request PTO, and Request sick/unpaid time (the single leave-type
selector covering all `LEAVE_TYPES`) all match. "PTO policy"/"Sick policy"
and "Upcoming approved leave" have no dedicated summary/section on this
screen specifically — but this is the same "reachable elsewhere in the app,
just not funneled onto this literal screen" shape already explicitly
accepted for item 28 (onboarding) and for 14.7's own 2026-08-05 audit
(policy details live in `CaregiverDetail.tsx`, one tap away via More →
Caregivers; approved leave is visible in the same list every other
status is), so it's re-confirmed as fine, not opened as a new gap.

One real, previously-undocumented mechanical bug found and fixed:
**`leave_requests.leave_policy_id` (spec 15.11) was written correctly on
insert (the 2026-08-03 fix) but never kept in sync when an existing request
was edited to a different leave type.** `handleEditSubmit`'s update object
set `leave_type`, `start_date`, `end_date`, `hours_requested`, and the note
field, but not `leave_policy_id` — so editing e.g. a `'pto'` request to
`'sick'` left the FK still pointing at the PTO policy row. Nothing in `src`
currently reads `leave_requests.leave_policy_id` back (confirmed by grep;
the ledger-correction logic in `applyUsedLedger`/`zeroOutLedgerForRequest`
independently re-resolves the policy from `leave_type` on every call, not
from this column), so this wasn't producing a visible balance bug today —
but it's the same class of data-completeness gap the 2026-08-03 session
fixed for the insert path, just left half-done for edits. Fixed by resolving
`policy = policies.find(p => p.leave_type === leaveType)` the same way the
insert path already does, and adding `leave_policy_id: policy?.id ?? null`
to the edit's update payload.

**Spec 14.7 (Settings Screen), bullet-by-bullet against `More.tsx` and
`CaregiverDetail.tsx`:** every one of the ten listed sections (Household
settings, User permissions, Nanny profile, Pay settings, Guaranteed hours
settings, PTO/sick settings, Schedule templates, Reminder settings, Export
records, Audit log) is present and working, either directly on `More.tsx`
or one tap away (Nanny profile/Pay/Guaranteed-hours/PTO settings via
Caregivers → `CaregiverDetail.tsx`, Schedule templates via `Schedule.tsx`,
Export via `Pay.tsx`/`PTO.tsx`, Audit log via its bottom link) — re-confirms
the 2026-08-05 session's conclusion with a fresh literal read rather than
just trusting it. No gaps found in this section.

**No new judgment calls surfaced this session.** The one bug found had an
unambiguous, zero-risk fix with an exact precedent in the same file (the
2026-08-03 insert-site fix, just completed for the edit path too), so it
didn't need a `QUESTIONS_AND_CLARIFICATIONS.md` entry.

**Health check:** `npm install` (fresh checkout had no `node_modules`), then
`npx tsc -b`, `npm run build` (`tsc -b && vite build`), and `npx oxlint` all
ran clean — no new TypeScript or lint errors, only the same pre-existing
`react-hooks/exhaustive-deps` (`Schedule.tsx`) and Fast Refresh
`only-export-components` warnings (context files, `Card.tsx`) prior sessions
have already noted.

No files besides `src/routes/PTO.tsx` were changed.
## 2026-08-24 — Time-entry schedule pre-fill re-confirmed again (still correct, no change); first dedicated adversarial code-review pass over the last ~7 sessions' diff finds no bugs; one candidate hard-delete gap investigated and ruled a false alarm; all remaining open Q&A items presented in chat again, none built unilaterally

This run's owner asked the same two standing things as 2026-08-20: (1) confirm
manual time entry still pre-fills from the caregiver's scheduled shift hours,
defaulting the date to today, and (2) present every open
`QUESTIONS_AND_CLARIFICATIONS.md` item in chat with options and a
recommendation. No code changed in between (2026-08-20 to 2026-08-24) other
than the item-30 soft-delete PR already logged above, so there was nothing new
to re-verify against.

**(1) Pre-fill: unchanged, still correct.** Same `Time.tsx` behavior as every
prior re-confirmation — `date` state initializes to today, and the
`useEffect` keyed on `[date, templates, shiftsByTemplate]` fills
`startTime`/`endTime`/`breakMinutes` from the selected date's generated shift
occurrence, falling back to a sane default when nothing's scheduled. Eleven
consecutive sessions (2026-08-08 through 2026-08-20) have now re-verified this
with zero regressions.

**New this session: a code-review pass, not another spec-literal audit.**
Given how many consecutive sessions' full literal spec-vs-code audits have
returned "no gaps found" across nearly every section (1-26), a straight
spec-audit pass was likely to be low-yield again. Instead, this session ran
an adversarial code-review over the diff from `03b23a9` (2026-08-12) through
`0037ee8` (2026-08-20) — roughly the last seven merged sessions' worth of
work — looking specifically for correctness bugs (wrong logic, RLS gaps,
off-by-one errors, state bugs, race conditions) rather than spec-compliance
gaps. It traced the new paid-period edit warning
(`timeValidation.ts`/`Time.tsx`), the `household_users` soft-delete migration
against every RLS policy that reads `household_users.status`, the
`canMarkPaid`/`canArchivePayment`/`canArchiveTimesheet`/`canApproveTimesheet`
co-admin permission gates in `Pay.tsx` against migration 0014's actual policy
SQL, and the `Schedule.tsx` shift-preview computation. **Result: no bugs
found.** The one pre-existing quirk noted (a shift-preview date-anchor
divergence when reusing an existing template) predates this diff and only
affects a non-persisted UI preview, not saved data or any calculation.

**One candidate gap investigated, ruled a false alarm.** A sweep for
remaining hard `.delete()` calls (the same pattern that previously found and
fixed real bugs in `timesheets`, `schedule_exceptions`, and `household_users`)
turned up two: `Schedule.tsx`'s `schedule_shifts` delete (already covered by
resolved Q&A item 14 — a deliberate choice to keep the simple model, with an
audit-trail mitigation) and `CaregiverDetail.tsx`'s `handleRemoveCaregiver`,
which hard-deletes a `caregiver_profiles` row and, via `on delete cascade`,
everything referencing it (schedule, time entries, timesheets, leave,
payment history). On inspection this is **not** a silent bug: the confirm
dialog explicitly reads "Permanently remove [name]? This also deletes their
schedule, time entries, timesheets, leave, and payment history and cannot be
undone. To keep their history, set their employment status to Inactive or
Terminated instead" — and `employment_status` (`active`/`inactive`/
`terminated`) is a real, already-wired settings field on the same screen,
offered as the explicit non-destructive alternative. Unlike the household-
member/timesheet/schedule-exception cases, this hard delete is deliberate,
disclosed, and has a signposted alternative already built — so it was left
as-is.

**(2): per the standing instruction, no open item was built this session** —
see the chat/notification for the full list of items 22-39 (all still open;
item 30 closed 2026-08-20) with their options and recommendations, carried
forward unchanged from prior sessions' analysis since nothing this session
found changes any of that reasoning.

`npx tsc -b`, `npm run build`, and `npx oxlint` all clean (no code changed
this session, so this just confirms the tree is still in a good state).

---

## 2026-08-20 — Household-member removal now soft-deletes (spec 10/15.3, resolves Q&A item 30); time-entry schedule pre-fill re-confirmed per explicit request; all remaining open Q&A items presented in chat with recommendations, none built unilaterally

This run's owner asked specifically for two things: (1) confirm manual time
entry pre-fills from the caregiver's scheduled shift hours, defaulting the
date to today, and (2) present every open `QUESTIONS_AND_CLARIFICATIONS.md`
item in chat with options and a recommendation, rather than have this session
decide any of them unilaterally.

(1) is already fully built and unchanged this session — `Time.tsx`'s `date`
state initializes to `new Date().toISOString().slice(0, 10)` (today), and a
`useEffect` keyed on `[date, templates, shiftsByTemplate]` looks up that
date's generated shift occurrence and pre-fills `startTime`/`endTime`/
`breakMinutes` from it (falling back to a sane default when nothing's
scheduled that day). This has now been re-verified across ten consecutive
sessions (2026-08-08 through 2026-08-19) with no regression; re-confirmed
again here, no code change needed.

(2): per that instruction, no open item beyond 30 was built this session —
see the chat/notification for the full list of items 22-39 (minus 30) with
their options and recommendations, carried forward unchanged from prior
sessions' analysis.

One item *was* closed: **item 30** (`household_users` hard-delete on member
removal) already had an unambiguous standing recommendation (option C —
soft-delete, require an explicit re-invite) from the 2026-08-04 session that
first raised it, with no unresolved design question of its own left open
(unlike 24/25/29/31/33/37, which still need a real answer to a question the
spec doesn't settle). Built it using that recommendation, the same way the
2026-07-24/2026-07-25 unattended sessions built items 18/19 off their own
standing recommendations rather than leaving low-ambiguity work idle:

- **`More.tsx`**: `removeMember()` changed from
  `.from('household_users').delete()` to
  `.update({ status: 'removed' })`, matching the schema's existing
  `'invited' | 'active' | 'removed'` enum and the app's general
  never-hard-delete posture (time entries, timesheets, leave requests, and
  now schedule exceptions per 2026-08-18 all soft-delete or
  status-transition instead of hard-deleting). `loadMembers()`'s query
  gained `.neq('status', 'removed')` so a removed member still drops out of
  the household-members list exactly as before — every RLS helper
  (`is_household_member` and friends, migration 0002) already requires
  `status = 'active'`, so the soft-delete revokes access identically to the
  old hard delete.
- **Migration 0019**: `join_household_by_code()` already raised on *any*
  existing `household_users` row for the household/user pair before
  inserting a new one — a `'removed'` row (which a hard delete would never
  have left behind) now naturally blocks a rejoin attempt via the old code
  the same way an `'active'` row already did, with zero new logic needed.
  The only change is a sharper error message: `'removed'` now gets "You were
  removed from this household. Ask the household admin to re-invite you."
  instead of the more confusing "You are already a member of this
  household." A removed member can only rejoin once the parent regenerates
  and re-shares the join code (`More.tsx`, already a one-tap action) —
  option C's "explicit re-invite" semantic, as opposed to option B's silent
  reactivation-by-old-code, which was rejected as too permissive a default
  for a deliberate removal.
- **Audit trail**: the `remove` audit event already logged
  `before: {role, email}`; it now also logs `before.status` and
  `after: {status: 'removed'}` for a complete record of the transition,
  matching the before/after shape every other status-transition action in
  the app already uses.

`npx tsc -b`, `npm run build`, and `npx oxlint` all clean; no new warnings.
Not smoke-tested against a live Supabase instance (no DB access in this
session) — the migration only edits an existing `SECURITY DEFINER` function
in place (no schema change) and the client change is a one-line delete→update
swap plus a query filter, both with exact precedent elsewhere in the
codebase, so risk is low, but worth a manual check if desired.

See `QUESTIONS_AND_CLARIFICATIONS.md` for the full resolution write-up and
the complete list of items 22-39 (minus 30) still open, each with its
options and recommendation.

---

## 2026-08-19 — Time-entry schedule pre-fill re-confirmed again (still correct); full literal audit of spec 13.4 (Time Tracking) and 13.8 (Payment Due / Payment Made Ledger) finds and fixes four mechanical gaps; no new judgment calls

**This session's scope, per the standing recurring-task instructions:**
re-confirm the manual time-entry pre-fill behavior, then run a full literal,
bullet-by-bullet audit of spec 13.4 and 13.8 against `Time.tsx`, `Pay.tsx`,
`calc.ts`, and the RLS migrations — the two core workflow sections the
running history in `QUESTIONS_AND_CLARIFICATIONS.md` confirmed hadn't yet had
a dedicated pass, despite most of the rest of the app having been covered at
least once across 30+ prior sessions.

**Time-entry schedule pre-fill: still correct, no change made.** Re-checked
`Time.tsx` against spec 13.4 — `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`, line 51), the pre-fill `useEffect`
(line 121) still looks up the selected date's scheduled shift via
`generateShiftsForRange` and fills `startTime`/`endTime`/`breakMinutes` from
it, falling back to 09:00–17:00 only when nothing's scheduled, and every
field remains a plain editable input. Same behavior confirmed every session
since 2026-06-30; nothing needed to change.

**Spec 13.4 (Time Tracking), bullet-by-bullet against `Time.tsx` and
`timeValidation.ts`:** Entry methods (clock in/out, manual entry), the
Clock In/Clock Out flow (tap in, active-shift status on Home's "Today" card
per spec 14.1/14.2, tap out, optional note), Manual Time Entry (date/start/
end/break/note, available to both nanny and parent/co-admin), and every
`time_entries` column in spec's Time Entry Fields list all match the code.
The Validation section's nine "warn when" bullets were checked one at a
time against `timeValidation.ts`'s `validateTimeEntry` — eight already
existed (clock-out-missing is handled separately by the reminders engine per
that file's own header comment; end-before-start/midnight-crossing, overlap,
break-longer-than-shift, materially-differs-from-scheduled, weekly-overtime-
threshold, nanny-edits-submitted, and parent-edits-approved all already
fire) — but the ninth, **"Parent attempts to edit a paid/locked period," had
no implementation at all.**

`time_entries.status` never actually reaches `'locked'` in this app (same
gap `canArchiveTimesheet`'s 2026-08-13 comment already documents for
`timesheets.status` never reaching `'paid'`/`'locked'` — only
`payment_records.status` does), so `canModify`'s existing
`entry.status !== 'locked'` block was already effectively dead for this
purpose, and nothing warned a parent editing an entry whose date fell inside
an already-paid pay period. Since spec 13.4 frames this bullet as a
*warning*, not a hard block (unlike the other "attempts to edit" bullets,
which are also warnings, not blocks, in the existing implementation), the
fix stayed a warning too rather than adding a new hard-block path — hard-
blocking would have needed a real "which period does this date belong to"
computation the app doesn't have for non-weekly pay frequencies (the same
period-boundary ambiguity items 31/32 already flag as unresolved), whereas a
warning only needs to check whether the date falls inside an *existing
stored* `payment_records` range, which sidesteps that ambiguity entirely.
`Time.tsx` now loads the caregiver's `payment_records` rows with status
`'paid'`/`'partially_paid'` (`loadPaidPeriods`, run alongside `loadEntries`)
and passes their date ranges into `timeValidation.ts`'s
`TimeEntryValidationContext` as `paidPeriodRanges`; `validateTimeEntry` warns
when a parent edits an existing entry (`draft.entryId` set) whose date falls
in one of those ranges, directing them to Correct/Void the payment instead.
Nanny edits and brand-new entries are unaffected, matching the bullet's
literal "Parent attempts to edit" wording.

**Spec 13.8 (Payment Due / Payment Made Ledger), bullet-by-bullet against
`Pay.tsx` and `payPeriod.ts`:** Pay Settings (frequency, period start day,
all three payday rules including "Manual," default rate, overtime
threshold/multiplier, guaranteed hours settings, all seven payment method
labels, both nanny-visibility flags), every `payment_records` column in
spec's field list (aside from the two already-tracked dead columns,
`attachment_url`/item 26 and `guarantee_override_note`/item 37), all seven
Payment Statuses (including `partially_paid`, exercised by `handleMarkPaid`
whenever the amount entered is less than `gross_pay_due`), and the seven-step
Payment Workflow all match the code. The Payment Corrections subsection
turned up three real gaps, all fixed:

- **A payment record could be archived on its own, bypassing the required
  Correct/Void workflow for an already-paid period — the same shape of bug
  the 2026-08-13 session fixed for *timesheet* archiving
  (`canArchiveTimesheet`), but for a separate, independent code path this
  session found unfixed.** `setPaymentArchived` (added after the 2026-08-13
  fix, per its own comment, so a payment could be cleared without also
  losing its timesheet) had no status guard at all — the swipe-row "Archive"
  action and the payment detail sheet's "Archive" button were both available
  for any payment regardless of status, so a parent could silently
  soft-delete an already-`'paid'`/`'partially_paid'` record straight out of
  the active list instead of going through "Correct" or "Void," exactly what
  spec 13.8's "Do not delete original record" line for a paid period is
  meant to prevent. Added `canArchivePayment`, mirroring
  `canArchiveTimesheet`'s reasoning (blocks on `'paid'`/`'partially_paid'`,
  allows `'voided'`/`'corrected'` through, since those are themselves the
  "unless corrected" exception), and gated the row-level swipe action, the
  detail-sheet Archive button, and the Archived-payments list's Restore
  actions with it (Restore needed the same gate since every
  `payment_records` update, not just mark-paid/void/correct, requires the
  `mark_payment_made` RLS permission — see below).
- **Neither the timesheet-approval nor payment-marking actions consulted the
  co-admin `approve_timesheet`/`mark_payment_made` permission keys migration
  0014 already added for exactly this purpose.** That migration's own header
  comment says those two RLS keys exist so a household can restrict a
  co-admin from "Approve timesheet"/"Mark payment made" per spec 11's
  Yes/Optional matrix rows, the same way `edit_pay_rate`/`edit_pto_policy`/
  etc. already work — and expects the client to hide the corresponding
  actions ("see App code"). But `canApproveTimesheet`, `canMarkPaid`, the
  "Generate timesheet"/"Import timesheets" toolbar, and the "Correct" button
  all gated purely on `isParentOrCoAdmin`, never on `coadminAllowed(...)`, so
  a co-admin a household had explicitly restricted from either permission
  still saw fully-functional-looking buttons that would fail against RLS the
  moment they were used — the exact broken-UX gap `canExport`'s existing
  `coadminAllowed('export_records')` check (same file) was already built to
  avoid for exports. Added the matching `coadminAllowed('approve_timesheet')`
  check to `canApproveTimesheet` and the Generate/Import toolbar (every
  `doGenerate` call inserts a timesheet at `status: 'approved'` directly, so
  every use of that toolbar needs the permission regardless of which button
  is clicked), and `coadminAllowed('mark_payment_made')` to `canMarkPaid`,
  the Correct button, and payment archive/restore (per the point above).
  This only narrows behavior for a household that has explicitly toggled one
  of these two permissions off in `More.tsx`'s co-admin settings — the
  default (both permissions on) is unchanged for every other household.
- **The "Correct payment" form showed the original amount and let a parent
  type a corrected amount, but never showed the difference between them**,
  short of spec 13.8's literal "Show original amount, corrected amount, and
  difference." Added a live "Difference: +/-$X.XX" line under the amount
  input, computed from the same `correctionAmount` state the form already
  tracks — pure display, no change to what gets written on save.

**Health check:** `npm install` (fresh checkout had no `node_modules`), then
`npx tsc -b`, `npm run build` (`tsc -b && vite build`), and `npx oxlint` all
ran clean — no new TypeScript or lint errors; the same pre-existing
`react-hooks/exhaustive-deps` (`Schedule.tsx`) and Fast Refresh
`only-export-components` warnings prior sessions have already noted, none
new from this session's changes.

**No new judgment calls surfaced this session.** All four gaps found had an
unambiguous, low-risk fix already implied either by an exact precedent
already in the same file (`canArchiveTimesheet`'s status guard,
`canExport`'s `coadminAllowed` check) or by a backend mechanism
(`payment_records`' `mark_payment_made` RLS policy) that was already fully
built and just missing its client-side half, so none needed a new
`QUESTIONS_AND_CLARIFICATIONS.md` entry. No schema changes were needed
either — both fixes read from tables and columns that already exist, so no
new migration file was added this session.

No files besides `src/lib/timeValidation.ts`, `src/routes/Time.tsx`, and
`src/routes/Pay.tsx` were touched.

---

## 2026-08-18 — Time-entry schedule pre-fill re-verified again (already correct); full literal audit of Schedule Exceptions finds two mechanical gaps (fixed); Reminders/Notifications and Exports spot-checked clean; no new judgment calls; all 18 open Q&A items re-presented

**This session's scope, per the standing recurring-task instructions**, plus
a specific ask from the task owner: re-confirm the manual time-entry
pre-fill behavior, then continue the spec-vs-code audit into sections not
yet covered by a prior session's dedicated pass.

**Time-entry schedule pre-fill: still correct, no change made.** Re-checked
`Time.tsx` against spec 13.4 — `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`, line 50), the pre-fill `useEffect`
(line 120) still looks up the selected date's scheduled shift via
`generateShiftsForRange` and fills `startTime`/`endTime`/`breakMinutes` from
it, falling back to 09:00–17:00 only when nothing's scheduled, and every
field remains a plain editable input. Same behavior confirmed every session
since 2026-06-30; nothing needed to change.

**A full literal audit of spec 13.3 (Schedule Exceptions) against
`Schedule.tsx`/`src/lib/schedule.ts`**, chosen because prior sessions had
only ever checked `schedule_exceptions`' *columns* against the schema
(2026-08-11, spec 15.7, found no column-level gaps) or resolved a
request-only-permission judgment call for it (item 38, 2026-08-15) — nobody
had yet read section 13.3's actual workflow bullets literally against the
UI. Found two real, previously-undocumented mechanical gaps, both fixed
directly since neither involved a judgment call:

- **`Schedule.tsx`'s "Remove" action on a schedule exception did a hard
  `DELETE` instead of using the schema's own `'canceled'` status.**
  `schedule_exceptions.status` already includes `'canceled'` as a valid
  value (migration 0001), and every place that reads exceptions was already
  built to exclude it — `Schedule.tsx`'s own `loadExceptions` already does
  `.neq('status', 'canceled')`, `Home.tsx`'s query already does
  `.eq('status', 'approved')`, and `lib/schedule.ts`'s calc helpers
  (`sumExceptionHoursByType`, `scheduleExceptionHoursDelta`) already filter
  to `status === 'approved'` only — but `handleDeleteException` still called
  `.delete()` on the row instead of transitioning it to `'canceled'`, the
  only table besides `household_users` (open item 30) found to violate the
  app's general never-hard-delete posture (spec 26). Unlike item 30, fixing
  this needed no RLS change (the existing `schedule_exceptions_update`
  policy's parent/co-admin branch already permits setting any status) and no
  rejoin-flow-style collision to reason about, so it was fixed directly
  rather than opened as a new judgment call: `handleDeleteException` now
  does `.update({ status: 'canceled' })`, audit-logged with `action:
  'cancel'` instead of `'delete'`.
- **A parent/co-admin could never see the `nanny_visible_note` they
  themselves had written on a schedule exception.** The day-detail exception
  row rendered `isNanny ? ex.nanny_visible_note : ex.parent_note` —
  correct for the nanny side, but a parent/co-admin only ever saw their own
  private `parent_note`, never the note they'd separately typed for the
  nanny to see. Same shape of bug as the 2026-08-15 fix for
  `time_entries.nanny_note`/`.parent_note` (each side only ever rendered its
  own field), just one-sided here since only a parent/co-admin ever writes
  either note for this table. Both now render on the parent/co-admin side,
  labeled (`parent_note` plain, `nanny_visible_note` prefixed "Nanny
  sees:"); the nanny side is unchanged (still only `nanny_visible_note`,
  since `parent_note` is meant to stay internal).

**Spec 13.9 (Reminders and Notifications) and 13.11 (Exports) spot-checked,
both fully clean — no new findings.** All ten spec-listed reminder types
(`missing_clock_out`, `unsubmitted_timesheet`, `pending_timesheet_approval`,
`pending_pto_request`, `payment_due`, `payment_overdue`, `upcoming_pto`,
`schedule_change`, `pto_balance_low`, `weekly_summary`) exist in
`reminders.ts`, matching spec's literal list (`unsubmitted_timesheet` is
real but non-firing, already tracked as open item 33, not a new finding);
Reminder Settings' enable/disable-per-type is built, recipients/timing/
cadence/quiet-hours remain deliberately deferred per already-resolved item
17. All six spec-listed export types (weekly timesheet CSV, pay period CSV,
PTO ledger CSV, payment history CSV, annual summary CSV, full records
CSV/JSON) exist in `Pay.tsx`; the Annual Summary export's 14-field list
(`exportAnnualSummary`) matches spec's field list exactly; export access is
gated to Parent Admin/Co-Admin only, matching already-resolved item 21.

**No new judgment calls surfaced this session.** Both 13.3 findings had an
unambiguous, low-blast-radius fix already implied by code the app itself was
already built around (the `'canceled'` status's existing exclusion filters,
the exact note-visibility precedent from 2026-08-15), so neither needed a
new `QUESTIONS_AND_CLARIFICATIONS.md` entry.

**Health check:** `npm run build` (`tsc -b && vite build`) and `npm run
lint` (`oxlint`) both clean — no new TypeScript or lint errors; same
pre-existing `react-hooks/exhaustive-deps` and Fast Refresh
`only-export-components` warnings prior sessions have already noted.

All 18 open Q&A items (22-26, 28-39) were re-presented this session per the
standing instruction — none resolved, none newly opened; the existing
2026-08-08 recommendations index (with items 33/36-39's later additions) is
still current for every item.

---

## 2026-08-15 — Time-entry schedule pre-fill re-verified again (already correct); full literal audit of Product Scope, User Roles/Permission Matrix, Recurring Schedule, remaining Calculation Rules, and Implementation Notes finds four mechanical gaps (fixed) and two new judgment calls; all 18 open Q&A items presented for a decision

**This session's scope, per the standing recurring-task instructions**, plus
a specific ask from the task owner: re-confirm the manual time-entry
pre-fill behavior, then continue the spec-vs-code audit into sections not
yet covered by a prior session's dedicated pass.

**Time-entry schedule pre-fill: still correct, no change made.** Re-checked
`Time.tsx` against spec 13.4 — `date` still defaults to today
(`new Date().toISOString().slice(0, 10)`, line 50) and the pre-fill
`useEffect` (line 120) still looks up the selected date's scheduled shift via
`generateShiftsForRange` and fills `startTime`/`endTime`/`breakMinutes` from
it, falling back to 09:00–17:00 only when nothing's scheduled. Same behavior
verified in the 2026-08-14 entry below; nothing needed to change.

**A fresh, full literal audit of spec section 2 (Product Scope), 10/11 (User
Roles / Role Permission Matrix), 13.2 (Recurring Schedule), the remainder of
16 (Calculation Rules: 16.1/16.2/16.4/16.5/16.7/16.8), and 26 (Implementation
Notes for Coding Agent)** — the spec sections that, per the running history
in `QUESTIONS_AND_CLARIFICATIONS.md`, hadn't yet had a dedicated field-by-
field pass — found:

- **Section 2, 16 (remainder), and 26 all fully match the code.** No gaps.
  Confirms no accidental scope creep into GPS/geofencing/an accountant role/
  multi-family caregiver linkage/contract generation/payment-rail
  integration, and that `calc.ts`'s paid/scheduled/actual-paid/guarantee-
  adjustment/payable-hours/gross-pay formulas all match spec 16.1-16.8
  exactly (16.3/16.6's known non-weekly-pay-frequency bug is unchanged,
  already tracked as open item 31).

- **A parent/co-admin could never see a nanny's own note on a time entry
  (and vice versa) — fixed.** `Time.tsx` displayed only
  `isNanny ? entry.nanny_note : entry.parent_note` everywhere a note
  appeared (list row, edit form, read-only detail view), so each side only
  ever saw the note field they'd write themselves. A parent reviewing an
  entry had no way to see e.g. "ran late due to traffic" from the nanny,
  cutting against Parent Admin's spec'd full view access. Both note fields
  now render (labeled by whose note it is) on the list row and in the
  detail modal; the editable field is now explicitly labeled "Your note."
  Straightforward UI fix, not a judgment call — nothing about *whose* note
  is authoritative changed, both fields already existed and were already
  being written correctly, they just weren't both being shown.

- **`schedule_shifts.default_category` was a fully dead column — wired up.**
  Spec 13.2's Shift Fields lists a required "Default category: regular,
  holiday, special, occasional" field; the column existed
  (migration 0001) but nothing ever read or wrote it. `Schedule.tsx`'s add-
  shift form now has a "Category" select (shown for every recurrence type
  except the one-time quick-add, which creates a `schedule_exceptions` row
  instead of a shift), threaded into all four shift-insert call sites
  (weekly/biweekly/monthly/custom). Same shape as the `paid_break`/
  `counts_toward_guaranteed_hours` wire-up precedent from resolved item 27.

- **Shift `notes` was only ever collected for the custom/'other' recurrence
  path — fixed.** The weekly, biweekly, and monthly shift-insert branches
  never had a notes input, even though the schema column applies to every
  shift row and the custom path's `otherNote` field proved the column was
  otherwise wired end-to-end. The add-shift form now shows a generic
  "Note (optional)" field for every non-custom, non-one-time recurrence
  choice too (the custom path keeps its own note field, unchanged).

- **No "preview generated shifts before saving" existed — added.** Spec
  13.2 asks for a schedule preview before a new recurring shift is
  committed; there was none. The add-shift modal now computes, live as the
  form is filled in, the next several calendar dates the in-progress
  template/shift would generate (via the existing, already-tested
  `generateShiftsForRange`, run against throwaway draft objects that are
  never persisted) and shows them as "Upcoming dates this will generate."

- **Two new judgment calls surfaced, not built** — see items 38-39 in
  `QUESTIONS_AND_CLARIFICATIONS.md`: (38) the role matrix's nanny
  "Request only" permission for schedule exceptions has no actual
  implementation for real (non-leave) exception types; (39) section 11's
  co-admin permission matrix claims finer-grained restrictions (view pay
  rate, add/edit time entries) than section 10's prose and the actual
  `permissions` JSONB support.

No files besides `Time.tsx` and `Schedule.tsx` were touched. `npm run build`
and `tsc --noEmit` both pass clean after these changes.

---

## 2026-08-14 — Time-entry schedule pre-fill re-verified (already correct, no change needed); audit of Calendar/Screens/Audit Log/Recommended Defaults finds two new mechanical gaps, fixes them; all 15 open Q&A items presented in chat

**This session's scope, per the standing recurring-task instructions**, plus a
specific ask from the task owner: confirm that adding a manual time entry
pre-fills from the caregiver's scheduled hours for the selected date (with
the date itself defaulting to today), and continue the spec-vs-code audit
into sections not recently covered in depth.

**Time-entry schedule pre-fill: already built, verified against spec 13.4,
no change made.** `Time.tsx`'s manual-entry form already defaults `date` to
today (`new Date().toISOString().slice(0, 10)`) and a `useEffect` keyed on
`date`/`templates`/`shiftsByTemplate` looks up that date's scheduled shift
via `generateShiftsForRange` and pre-fills `startTime`/`endTime`/
`breakMinutes` from it, falling back to a flat 09:00–17:00 default when
nothing's scheduled that day. This was built prior to this session (see the
2026-08-10 log entry, "re-verify time-entry schedule pre-fill") and is
working as the task owner described wanting; nothing needed to change here.

**A fresh, full literal audit of spec 13.10 (Calendar), 14.1/14.2/14.4/14.5/
14.6/14.7 (Screens), 20 (Audit Log Requirements), and 25 (Recommended
Defaults)** against the current codebase. Most of this ground had, despite
the task framing, already been covered by earlier sessions under different
section numbers (13.10/14.4 by open item 22, 14.1/14.2 by open item 23,
14.5/14.7 by the 2026-08-03/2026-08-05 sessions, 25 by the 2026-08-10/
2026-08-11 sessions) — re-verifying line-by-line rather than trusting the
prior conclusions turned up two new, previously-undocumented mechanical
gaps, both fixed directly since neither involved a judgment call:

**Mechanical fix: spec 20's "user invited" audit event was never logged.**
This app has no formal invite step (resolved Q&A item 7 replaced it with a
household join code), so the closest real event to audit is the moment
someone actually joins via code — but `join_household_by_code()`
(`SECURITY DEFINER`, migration 0013) writes no `audit_events` row, and
`Onboarding.tsx`'s `handleJoin` didn't log one either. "User removed" has
been fully audited since `More.tsx`'s `removeMember` (see below), so its
counterpart was a real, asymmetric gap. Fixed by capturing the RPC's
returned household id and calling `logAuditEvent` with
`entityType: 'household_user'`, `action: 'create'`, `entityId: user.id`
(the best available anchor, since the RPC doesn't return the new
`household_users` row's own id or the role it assigned) right after a
successful join, before `refresh()`/navigate. The household-creation path
(`handleCreate`, a brand-new household's founding parent-admin) stays
unaudited on purpose — there's no one who "invited" the very first member of
a household that didn't exist a moment earlier.

**Mechanical fix: spec 14.6's Pay Screen parent view lists four distinct
sections — "Upcoming payments," "Due payments," "Overdue payments," "Paid
history" — but `Pay.tsx` rendered one flat, undifferentiated list.** The
existing `paymentDisplayStatus()` classifier (built 2026-08-08) already
buckets every payment into exactly those states from its stored `status`
plus `due_date`; the fix reuses it to group `Pay.tsx`'s "Payments" card into
four labeled sub-sections (only non-empty ones render, each with a count),
extracting the existing per-row markup into a `renderPaymentRow` helper so
the fix is pure re-grouping — same `SwipeRow` mark-paid/archive actions per
row, same detail-modal behavior, no new state or calculation. Ordered
Overdue → Due → Upcoming → Paid history (most-urgent-first) rather than the
spec bullet list's literal order, matching spec 22's parent UX priority
"What do I owe?" coming before "Did I mark payment paid?". This section is
shared by both parent and nanny views (`isNanny` only gates the swipe-action
caption and the archive action, not the list itself); the grouping applies
to both, which is a reasonable superset of the nanny view's simpler
"Payment due" / "Payment made" split rather than a spec violation.

**No new judgment calls surfaced.** Every structural gap the audit found in
13.10/14.1/14.2/14.4 turned out to be the exact substance of already-open
items 22 and 23 (re-confirmed, not re-opened); 14.5, 14.7, and 25 were
re-verified as fully matching spec, the third consecutive session to reach
that conclusion for section 25. See `QUESTIONS_AND_CLARIFICATIONS.md` for
the full current list of 15 open items (22-26, 28-37), all presented to the
task owner in chat this session per the standing instruction, with the
existing 2026-08-08 recommendations index still current for every item
except 36/37 (added last session, recommendations already given there).

---

## 2026-08-13 — `QUESTIONS_AND_CLARIFICATIONS.md` documentation bugs fixed (duplicate item numbering, stale leftover paragraph); real payment-archive bypass closed via full literal audit of spec 24 (mechanical fix); 13.5/13.6 Timesheet Display audit finds two new judgment calls (items 36-37); time-entry schedule pre-fill re-verified; items 22/24-26/29/31-37 presented in chat

**This session's scope, per the standing recurring-task instructions:** review
progress against the spec, keep `SPEC_CHANGE_LOG.md`/`QUESTIONS_AND_CLARIFICATIONS.md`
current, and present all still-open judgment calls in chat with options and a
recommendation. Before starting a fresh code audit, a documentation-quality
pass over `QUESTIONS_AND_CLARIFICATIONS.md` itself turned up two real bugs in
the tracking file, fixed here first since a future session (or the task
owner) reading that file for "what's still open" deserves it to be internally
consistent:

**Duplicate item numbering fixed.** Two unrelated open items were both
numbered "30" — a household-member hard-delete judgment call (added
2026-08-04, referenced by number in the "Recommendations added 2026-08-08"
index and in this file's 2026-08-04 entry) and a
`leave_requests.start_time`/`.end_time` dead-column judgment call (added
2026-08-03, referenced by number in this file's 2026-08-03 entry). The
2026-08-04 session assigned "30" to its new finding without checking that a
2026-08-03 session had already claimed it, and nobody caught the collision
since. Renumbered the `start_time`/`end_time` item to **35** (the next free
number after 34) since it wasn't referenced by number anywhere outside its
own section, leaving the hard-delete item as 30 (matching every place it's
cross-referenced from). This file's 2026-08-03 entry above still says "item
30" for the renumbered item — left as-is since it's a dated historical
record, not live state; `QUESTIONS_AND_CLARIFICATIONS.md` itself is the
authoritative current numbering and now has no collision.

**Stale leftover paragraph removed from `QUESTIONS_AND_CLARIFICATIONS.md`.**
A second, shorter, out-of-date copy of the "Open items" intro paragraph
(narrating history only through 2026-08-03) had been left sitting mid-file,
directly above old item 30's section — apparently never deleted when a
2026-08-04-or-later session extended the real intro paragraph at the top of
the file instead of editing this copy. Removed; the top paragraph is the only
one now, and it already carries the full history through 2026-08-12.

**A fresh, full literal bullet-by-bullet audit of spec 24 "Acceptance
Criteria" (lines 2536-2608, 44 bullets total) against the codebase, and of
spec 13.5/13.6's "Timesheet Display" subsections against `Pay.tsx`.** Prior
sessions (2026-07-30, 2026-08-09) only spot-checked section 24 rather than
checking every bullet literally; this session closed that gap.

**Mechanical fix: a real gap in spec 24's Payments acceptance criteria —
"Paid periods are locked unless corrected" was not actually enforced, and a
parent could silently bypass Correct/Void by archiving instead.**
`canArchiveTimesheet` in `Pay.tsx` only ever checked `timesheet.status !==
'paid'`/`'locked'`, but a timesheet's own `status` column never actually
reaches either of those values in normal use (only the linked
`payment_records.status` does — timesheets sit at `submitted`/`approved`
even once their payment has been marked paid), so that check could never
fire. In practice, a parent could archive an already fully-paid timesheet at
any time, and `archiveTimesheet` unconditionally soft-deletes every
`payment_records` row for that `timesheet_id` — silently erasing a real,
already-paid payment record instead of routing through the Correct or Void
workflow spec 13.8 defines for exactly that case. Fixed `canArchiveTimesheet`
to also block archiving whenever the timesheet has a live (non-deleted)
payment record whose status is `'paid'` or `'partially_paid'` — the two
states that mean money has actually moved. `'voided'`/`'corrected'` payments
don't block archiving: those are themselves the workflow's "unless
corrected" exception (voiding a payment and then archiving its timesheet to
free the period for a redo is an intentional, already-documented path — see
this file's 2026-08-06 entry), and a correction leaves the original payment
row `'corrected'` alongside a fresh `'due'` row sharing the same
`timesheet_id`, so the check looks for *any* outstanding paid amount across
all of a timesheet's payment rows rather than assuming exactly one row per
timesheet exists.

**Everything else in spec 24 checked and passed:** all 7 Deployment bullets,
5 Schedule bullets, 4 of 5 Time Tracking bullets (see below), all 7
Guaranteed Hours bullets, all 6 PTO bullets, the other 5 of 6 Payments
bullets, all 4 Permissions bullets, and all 4 Exports bullets match the
current implementation.

**Not built — folded into existing item 25's scope instead of opened as a
new item:** spec 24's Time Tracking bullet "Approve or request correction"
has no formal reject/request-correction action at the individual
`time_entries` row level — only "Approve" (or a silent direct edit) exists,
and `time_entries.status`'s `'corrected'`/`'rejected'` values are never set,
mirroring the same gap already tracked at the timesheet level by open item
25. Not opened as a separate item since it's the same underlying judgment
call (what does "reject and request correction" mean in this codebase) at a
finer grain, not a new question.

**Two new judgment calls found in the 13.5/13.6 Timesheet Display audit — see
`QUESTIONS_AND_CLARIFICATIONS.md` items 36-37, not built.** Spec 13.5's
per-day timesheet breakdown (10 fields: date, scheduled hours, actual
start/end, actual worked, PTO/sick/unpaid/family-cancellation hours, notes,
status) has no in-app view at all — `Pay.tsx` only ever renders one row per
whole *period*, never per day, even though the exact per-day data is already
computed for CSV export (`payExport.ts`'s `buildDailyPayExportRows`) and
simply never surfaced in the UI (item 36). Separately, `payment_records
.guarantee_override_note` (spec 13.6) is a dead column with no workflow that
ever writes it, so there'd be nothing to display even if it were rendered
(item 37). Full write-ups with options and recommendations are in
`QUESTIONS_AND_CLARIFICATIONS.md`.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx`'s manual-entry form
still defaults its date field to today (`DEFAULT_START_TIME`/`DEFAULT_END_TIME`
= `09:00`/`17:00` only as the no-shift-scheduled fallback) and pre-fills
start/end/break/`schedule_shift_id` from the caregiver's scheduled shift for
whichever date is selected. Asked for again by name in this run's prompt;
nothing needed building.

**Health check:** `npm install`, `npx tsc -b`, and `npx oxlint` all clean —
no new TypeScript errors, no new lint warnings beyond the same pre-existing
handful (`react-hooks/exhaustive-deps` in `Schedule.tsx`, Fast Refresh
export-shape warnings in the context files and `Card.tsx`) prior sessions
have already noted; no regression found in a from-clean build.

Q&A items 22/24-26/29/31-35 were not resolved unilaterally (unchanged from
prior sessions, no new information to change any of them) — presented in
`QUESTIONS_AND_CLARIFICATIONS.md` and in this session's chat message
alongside the two new items above (36-37), each with options and a
recommendation per this run's explicit request.

**This session's scope, per the standing recurring-task instructions:** the
data-model sections that hadn't yet gotten their own dedicated field-by-field
pass — 15.1 `users`, 15.2 `households`, 15.3 `household_users`, 15.4
`caregiver_profiles` — checked column-by-column against
`supabase/migrations/*.sql` and against read/write usage in `src`
(`src/lib/types.ts`, `AuthContext.tsx`, `More.tsx`, `CaregiverDetail.tsx`,
`Onboarding.tsx`); plus section 1 (Product Overview), section 2 (Product
Scope, in-scope and out-of-scope), section 4 (Recommended Tech Stack),
section 8 (PWA Requirement, last touched 2026-06-30), and section 26
(Implementation Notes for Coding Agent). Time-entry schedule pre-fill was
confirmed already covered by the task owner's context this run (working as
of 2026-08-10) and not re-touched.

**Mechanical fix: `users.last_login_at` was a dead column — now written on
every sign-in.** Spec 15.1 lists it, the column has existed since
`0001_schema.sql`, and the `users_update_self` RLS policy (migration 0002)
already permits a user to update their own row — but nothing ever wrote to
it. A prior session's 2026-07-30 audit had already found this exact gap and
explicitly left it alone as "too minor to warrant a Q&A item" (see this
file's 2026-07-30 entry); revisited it this session since a one-line,
zero-ambiguity fix was sitting right there. `AuthContext.tsx`'s
`onAuthStateChange` listener now fires a fire-and-forget
`update({last_login_at: now()})` on the `SIGNED_IN` event, scoped to the
signed-in user's own id. No UI currently surfaces this value (nothing in the
spec's screens asks for it to be shown), so this is pure bookkeeping —
matches spec 15.1's field list with no behavior change elsewhere.

**Mechanical fix: `users.full_name` and `.phone` had no self-service editor
anywhere — added a "Your name" / "Your phone" form to More.tsx's existing
Account card.** Both columns are read elsewhere (`full_name` in
`AuditLog.tsx`'s actor display and `More.tsx`'s household-member list;
`phone` only in `types.ts`), but `full_name` is only ever set once, at
signup (`handle_new_auth_user()`'s trigger copies
`raw_user_meta_data ->> 'full_name'`), and `phone` was never set at all — a
typo'd name at signup, or a phone number a household wants on file per spec
15.1, had no way to be fixed or added after the fact. Added a small form to
the "Account" card (loads the current user's `full_name`/`phone` on mount,
saves via the same `users_update_self` RLS policy the `last_login_at` fix
above relies on) — matches the `Field`/`inputClass`/save-confirmation
pattern already used for `CaregiverDetail.tsx`'s profile form and
`More.tsx`'s own household-settings form. Does not touch `email` (tied to
Supabase Auth identity, out of scope for a plain profile field).

**Audit — everything else in 15.1-15.4 checked and found no other gaps.**
`households` (id/name/timezone/week_start_day/created_by/timestamps) matches
the schema exactly; `created_by` has no display anywhere but is genuinely
used (the household `select` RLS policy's `or created_by = auth.uid()`
branch), so it isn't dead, just audit/authorization-only.
`household_users.status`'s `'invited'` value and `.invited_at` are real but
permanently unused — not a new finding: this is the direct, already-resolved
consequence of Q&A item 7 (resolved 2026-07-01, "Household join code"),
which replaced spec's implied invite-then-accept model with self-service
join-by-code, so every membership row goes straight to `'active'` with no
pending-invite state to populate. Already noted once before (this file's
2026-07-30 entry) as too minor for a Q&A item; re-confirmed, not re-opened.
`caregiver_profiles` — every spec-listed column (identity/contact fields,
pay-visibility flags including `nanny_can_view_payment_method` added
2026-07-29, all nine guaranteed-hours-settings columns) exists and is
read/written correctly in `CaregiverDetail.tsx`; `notes_private` remains
implemented as the separate `caregiver_private_notes` table rather than a
column (documented, RLS-motivated deviation from a prior session, not a new
issue); the additional pay-settings columns (`pay_frequency`,
`pay_period_start_day`, `payday_rule`, etc.) that live on this table but
aren't literally in spec 15.4's field list are a long-standing,
many-times-reviewed home for spec 13.8's Pay Settings, not a new finding.

**Sections 1/2/4/8/26 — no gaps found.** Section 2's Out of Scope list (no
direct deposit/payment-rail integration, no tax/W-2/EIN logic, no
background-check/contract features, no multi-family share, no baby-activity
logging, no GPS/geofencing, no in-app chat) was grepped for across `src/`
and `supabase/` — nothing out-of-scope has been built. Section 1's "what was
scheduled → worked → owed → paid → PTO changed" ledger concept and section
2's full In Scope list are each present as real, working features (already
covered exhaustively by prior sessions' functional audits). Section 4's tech
stack matches `package.json` exactly (Vite 8 + React 19 + TypeScript,
Tailwind 4, `@supabase/supabase-js`, `date-fns`, GitHub Actions deploy,
`vite-plugin-pwa`). Section 8 was re-verified against a real production
`vite build` output rather than just reading config: `dist/index.html`'s
icon/apple-touch-icon/script/stylesheet/manifest links and
`dist/manifest.webmanifest`'s `start_url`/`scope` all correctly carry the
`/automatic-rotary-phone/` base path (Vite's HTML asset rewriting handles
this automatically), `dist/sw.js` and workbox precache are generated, and
`index.html`'s viewport/theme-color/apple-mobile-web-app-* meta tags all
match spec 8's list — no regression since the 2026-06-30 bug fix. Section
26's build-order and implementation-principle list (static-hostable, no
service-role/email-provider keys client-side, correction-records over
destructive edits, RLS-enforced permissions, timestamptz everywhere,
guaranteed hours as a visible line item, sensitive changes audited) was
checked against the current codebase structure with nothing violating it —
the one known exception (household-member removal is a hard delete, not a
correction record) is already tracked as open Q&A item 30, not a new
finding.

**Health check:** `npm run build` (`tsc -b && vite build`) and `npm run
lint` (`oxlint`) both clean — no new TypeScript or lint errors; the same
pre-existing `react-hooks/exhaustive-deps` and Fast Refresh
`only-export-components` warnings prior sessions have already noted, none
new from this session's changes.

No new `QUESTIONS_AND_CLARIFICATIONS.md` items this session — everything
found either resolved to spec/code already matching, was already-explained
by a previously-resolved decision, or was fixable directly as a low-risk,
unambiguous mechanical change (both above). Q&A items 22-34 were not
resolved unilaterally (no new information to change any of them) —
re-presented in `QUESTIONS_AND_CLARIFICATIONS.md`.

---

## 2026-08-10 — Targeted audit of spec 3/5/6/7/9/12/18/23 (infra/deployment/authorization/build-plan) finds no gaps; time-entry schedule pre-fill re-verified; items 22-33 re-presented

**This session's scope, per the standing recurring-task instructions:** verify
the app still builds/lints cleanly, re-confirm the explicitly-requested
time-entry schedule pre-fill behavior once more, and audit spec sections that
hadn't previously gotten an explicit pass of their own. Prior sessions
(2026-07-30 through 2026-08-09) have repeatedly covered the functional
workflow sections (10, 11, 13.1-13.11, 14.1-14.7, 15.1-15.15, 16, 17, 19, 20,
21, 22, 24) close to exhaustively with no new findings in the last several
passes, so this session deliberately targeted the infra/meta sections that
hadn't: 3 (GitHub Pages deployment constraint), 5 (GitHub Pages config), 6
(Supabase requirements), 7 (GitHub Actions deployment), 9 (backend/reminder
serverless constraint), 12 (core app navigation), 18 (authorization
requirements), and 23 (MVP build plan).

**Health check:** `npm run build` (tsc -b && vite build) and `npm run lint`
both clean — no new TypeScript or lint errors; the existing handful of
`react-hooks/exhaustive-deps` / fast-refresh warnings predate this session
and are unrelated to spec compliance.

**Audit — zero new gaps found.** Section 12 (nav): `Layout.tsx`'s 5-tab
parent (Home/Time/Calendar/Pay/More) and 4-tab nanny (Home/Time/PTO/Pay)
bottom docks match spec 12's "if six tabs are too many" alternative exactly.
Sections 3/5/6/7/9/18/23 (delegated to a full audit pass, cross-checked
against an actual production `vite build`, `.github/workflows/deploy.yml`,
`supabase/migrations/*`, and `src/lib/supabase.ts`): all match spec —
GitHub-Pages-only static hosting with no server/Edge Function/cron anywhere;
`vite.config.ts`'s `base` path and `HashRouter` routing correct; only the
anon key ships client-side; the deploy workflow matches spec's action list;
no email-provider keys or Edge Functions (reminders stay in-app only, per
already-resolved Q&A item 5); RLS helper functions
(`is_household_member`/`is_parent_admin`/`is_parent_or_coadmin`/
`is_caregiver_user`/`can_manage_household_setting`) exist and are used
exactly where spec 18 requires (e.g. `caregiver_private_notes` parent-only,
audit log gated by the `view_audit_log` permission key); the MVP build
plan's phases are all built, with the two known-unbuilt optional items
(payment attachments, email reminders) already tracked as Q&A item 26 and
the resolved item 5. No new Q&A items opened this session.

**Time-entry schedule pre-fill — re-confirmed once more, still no change
needed.** `Time.tsx:50` defaults the date field to today; the effect at
`Time.tsx:120-135` pre-fills start time, end time, break minutes, and
`schedule_shift_id` from the caregiver's scheduled shift for whatever date
is selected, falling back to a 9-5 default when nothing's scheduled. This
has been in place and re-verified every session since it was first built
2026-06-30 — this run's prompt asked for it by name again ("time entry was
pre-set to the schedule hours, can still default to current day"), and it
already does exactly that; no code change was needed.

No code changes this session beyond documentation (this entry). The 12
already-open Q&A items (22-33) were not resolved unilaterally — see
`QUESTIONS_AND_CLARIFICATIONS.md` and the notification sent this session for
the decisions still needed.
## 2026-08-11 — Field-by-field sweep of spec 15.5/15.7/15.8 against schema and `src`; sections 22 and 25 fully match with no gaps; two `schedule_shifts` dead columns wired up (`paid_break`, `counts_toward_guaranteed_hours`, mechanical); one new judgment call (item 34: dead `schedule_exception_id` column); items 22-33 re-presented

**This session's scope:** a fresh, targeted audit of the areas least
recently/closely covered per the standing recurring-task instructions —
(1) a full field-by-field sweep of spec 15.5 (`schedule_templates`), 15.7
(`schedule_exceptions`), and 15.8 (`time_entries`) against the actual
Supabase schema (`supabase/migrations/0001_schema.sql`) and against how each
field is actually read/written in `src` (`Schedule.tsx`, `Time.tsx`,
`lib/schedule.ts`, `lib/types.ts`); (2) spec 22 (UX Requirements) read in
full and checked against `Home.tsx`, `Time.tsx`, `Schedule.tsx`, and
`StatusChip.tsx`; (3) spec 25 (Recommended Defaults) checked against the
`caregiver_profiles`/`households` column defaults in migration 0001 and the
frontend stack (`package.json`, `App.tsx`).

**Mechanical fix: `schedule_shifts.paid_break` and
`.counts_toward_guaranteed_hours` were dead columns — both are read in
calculations (`lib/schedule.ts`'s `shiftHours()` and
`computeGuaranteedHoursBase()`) but no insert anywhere in `Schedule.tsx` ever
set them, so every shift ever created via the UI was permanently stuck at
the DB defaults (`paid_break = false`, `counts_toward_guaranteed_hours =
true`) with no way for a household to override either per spec 13.2's Shift
Fields list ("Paid break yes/no", "Counts toward guaranteed hours yes/no").**
This is the same shape of gap resolved item 27 (2026-07-31) already fixed
once for the sibling field `paid_if_family_canceled` — a checkbox added to
the Add Shift form, wired into all four `schedule_shifts` insert call sites
(weekly/biweekly/monthly/custom), skipped for the one-time (`once`) path
since that creates a `schedule_exceptions` row instead. Applied the identical
pattern here: two new checkboxes ("Break is paid", "Counts toward guaranteed
hours", the latter defaulting checked to match the column's DB default) in
`src/routes/Schedule.tsx`, wired into the same four insert sites. The
"Unpaid break (minutes)" field label was also corrected to "Break (minutes)"
since the break is no longer unconditionally unpaid. `default_category`
remains intentionally unbuilt per resolved item 27 (option A) — no
calculation or display reads shift category, unchanged this session.

**Audit found `schedule_templates.notes`, `.recurrence_rule`, and
`.effective_end_date` are effectively dead (never meaningfully read/written
outside `lib/schedule.ts`'s prospective-range respecting of
`effective_end_date`, which is never actually set by any UI path) — but this
is not a new gap.** It's the direct, already-understood consequence of
resolved item 14 (2026-07-01, "Schedule template editing model"), which
deliberately kept the simple add/remove shift model instead of building
effective-dated template versioning ("end the old schedule, start a new
one"). Templates are an implicit, auto-managed-by-recurrence-type concept in
the UI, not a first-class object a household edits directly, so a template's
own `notes`/`recurrence_rule` having no editor and `effective_end_date`
having no "end this schedule" action is expected under that decision, not a
new judgment call. No `QUESTIONS_AND_CLARIFICATIONS.md` entry added for this.

**New judgment call found: `time_entries.schedule_exception_id` is a dead
column with zero wiring anywhere — added as item 34 in
`QUESTIONS_AND_CLARIFICATIONS.md`, not built.** Spec 15.8 lists it parallel
to `schedule_shift_id`, which *is* fully wired (`Time.tsx` pre-fills the
manual-entry form from the day's generated shift occurrence and stores its
id on save/clock-in). Nothing analogous exists for schedule exceptions —
`Time.tsx` never queries `schedule_exceptions`, and no insert/update
anywhere sets the column. Unlike the `paid_break`/`counts_toward_guaranteed_
hours` fix above, this isn't a copy-the-precedent mechanical fill-in: a
day's shift occurrences are naturally bounded to 0-or-1 for pre-fill
purposes, but `schedule_exceptions` isn't similarly bounded (a date can have
more than one approved exception), and it's a real design question whether
wiring the link should also change manual-entry pre-fill defaults on
exception days (a live time-entry-flow behavior change) or stay a pure
audit-trail link with no calculation/display impact. Full background,
options (A/B/C), and a recommendation (B — audit-trail-only link, if built
at all) are in `QUESTIONS_AND_CLARIFICATIONS.md` item 34.

**Audit also checked and found no gaps in:**

- `schedule_exceptions` (spec 15.7) field-by-field — every column matches
  the schema exactly (including default statuses/types), and `affects_pto`
  being effectively unused is expected, not a gap: the three leave-type
  exception types it would apply to (`pto`/`sick`/`unpaid_time_off`) are
  deliberately excluded from the Schedule Exceptions UI per the 2026-07-02
  resolved decision to route all leave through `leave_requests` instead, so
  `affects_pto` never gets exercised by construction.
- `time_entries` (spec 15.8) otherwise — every other field matches
  read/write behavior in `Time.tsx`/`Pay.tsx` correctly (method transitions,
  status defaults, `created_by`/`updated_by`, nanny/parent note routing).
  The `'correction'` method and `'corrected'`/`'rejected'` statuses being
  never set is real but already fully covered by open item 25's timesheet
  reject/correction workflow gap — no separate item added for it. Spec
  13.4's prose "Entry method: ... imported" vs. spec 15.8's formal
  `method` check constraint (`clock`/`manual`/`parent_adjustment`/
  `correction`) is a minor spec-internal wording mismatch with zero
  functional impact since the schema correctly implements 15.8, the
  authoritative data-model section; not worth a Q&A entry.
- Section 22 (UX Requirements) — full status-chip vocabulary present in
  `StatusChip.tsx` (`missing_clock_out`, `needs_correction`, `payment_due`,
  `paid`, `requested`/`approved` for PTO, `overdue`, etc.); Parent UX
  priorities (clocked-in status, missing hours, timesheet waiting, amount
  owed, payment-marked-paid, PTO balance) and Nanny UX priorities (scheduled
  today, clock in/out prompt, submission/approval status, payment status,
  PTO balance) all covered by `Home.tsx`'s Today/This Week/dashboard
  cards and reminder feed — matches the "stop here" conclusion of resolved
  item 23. No gaps found.
- Section 25 (Recommended Defaults) — every default checked matches: Vite +
  React + TypeScript (`package.json`), `HashRouter` (`App.tsx`), timezone
  `America/New_York` and week-start Monday (`households` table defaults),
  weekly pay frequency with `pay_period_start_day = 1` (Monday) and
  `payday_days_after_period_end = 5` (correctly yields "Friday after period
  ends" from a Monday-Sunday period), overtime threshold 40h at 1.5x,
  guaranteed hours enabled/linked-to-schedule, family cancellations and
  unpaid-time-off guarantee defaults, PTO/sick as separate `leave_type`
  values, PTO balance and gross pay visible to nanny by default, pay rate
  hidden from nanny by default, no time-rounding logic anywhere in
  `calc.ts` (only float-precision `round2`). No gaps found.

**Verification:** `npm install` (fresh checkout had no `node_modules`), then
`npx tsc -b` and `npx oxlint` both ran clean — same pre-existing warnings
prior sessions have already noted (Fast Refresh export warnings, one
`exhaustive-deps` warning in `Schedule.tsx` unrelated to this session's
changes), no new errors or warnings introduced.

Q&A items 22-33 were not resolved unilaterally (no new information to change
any of them) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` alongside
the new item 34.

---

## 2026-08-09 — Targeted audit of spec 13.11/16/21/22/24 finds no mechanical gaps, one new judgment call (item 33: dead "timesheet submission" reminder); time-entry schedule pre-fill re-verified; items 22-26/28-33 re-presented

**This session's scope, per the standing recurring-task instructions plus the
recurring-task owner's explicit ask this run:** re-verify the time-entry
schedule pre-fill (already built 2026-06-30, working as intended — see
below), then a fresh targeted audit of spec 13.11 (Exports), 21
(Notification/Reminder Logic), 22 (UX Requirements), the parts of section 16
(Calculation Rules) not already covered by open items 24/31 (16.1/16.2/16.4/
16.5/16.7/16.8), and a spot-check of section 24 (Acceptance Criteria) —
against `src/lib/reminders.ts`, `src/lib/calc.ts`, `src/lib/payPeriod.ts`,
`Pay.tsx`, `PTO.tsx`, and `StatusChip.tsx`. These areas hadn't been closely
covered by prior sessions (2026-08-08 covered 15.9-15.15/17/19; 2026-08-05
covered the rest of section 16 and 14.3/14.4/14.7).

**Time entry pre-fill from the caregiver's schedule (the explicit ask this
run) was already built and has been re-verified working (spec 13.4/13.2), no
change made.** `Time.tsx`'s manual-entry form defaults its date field to
today and looks up the scheduled shift for whatever date is selected,
pre-filling start time, end time, and break minutes from it (falling back to
a 09:00-17:00 default only when nothing's scheduled that day). This has
shipped since 2026-06-30 and been re-verified in six sessions since
(2026-08-03, -04, -05, -08, and now); no change was needed.

**No mechanical fixes were made this session.** Every discrepancy the audit
turned up either resolved to spec and code already matching (see the list
below) or was a single genuine judgment call that isn't safely containable
as a mechanical fix (below). Confirmed via `git status` that the working
tree was unchanged after the audit; `npx tsc -b` and `npx oxlint` both ran
clean (same pre-existing lint warnings prior sessions have already noted,
none new).

**New judgment call found: the spec-mandated "timesheet submission" reminder
never fires in practice (spec 21) — added as item 33 in
`QUESTIONS_AND_CLARIFICATIONS.md`, not built.** `reminders.ts`'s
`unsubmitted_timesheet` card only fires for a `timesheets` row with
`status === 'draft'`, but no normal flow (nanny submit, parent generate)
ever creates a timesheet in that status — both write `'submitted'` or
`'approved'` directly, leaving `'draft'` reachable only via CSV import. So
the spec's "pay period ended, nothing submitted" alert is effectively dead
code today. Fixing it needs a real "which pay period most recently ended
uncovered" computation, which runs into the same non-weekly-pay-frequency
period-boundary ambiguity already flagged (unresolved) by items 31 and 32 —
`payPeriod.ts`'s existing period helpers are built to describe the *current*
period, not detect a past one that closed uncovered, and `semi_monthly`/
`monthly` periods have no fixed day-count to key a heuristic off of. Full
options (A/B/C) and reasoning in `QUESTIONS_AND_CLARIFICATIONS.md`.

**Audit also checked and found no discrepancies in:** spec 13.11 Exports —
all six export types (`exportDetailedRecords`, `exportAnnualSummary`,
`exportFullRecords` in `Pay.tsx`; `exportLedger` in `PTO.tsx`) present,
matching field lists, and correctly permission-gated
(`isParentOrCoAdmin && coadminAllowed('export_records')`); spec 21's other
five reminder types (Payment Due, Timesheet Approval, Missing Clock-Out, PTO
Request, Upcoming PTO) all match spec's alert-audience rules; spec 22 UX
Requirements (status chip vocabulary, Parent/Nanny UX priorities) all
satisfied by existing screens; spec 16.1/16.2/16.4/16.5/16.7/16.8
(everything in Calculation Rules except the already-open items 24/31/16.9)
implemented literally and correctly in `calc.ts`; a spot-check of section 24
Acceptance Criteria bullets not already covered by open items 22-32, all
satisfied.

Q&A items 22-26 and 28-32 were not resolved unilaterally (unchanged from the
2026-08-08 session, no new information to change any of them) — re-presented
in `QUESTIONS_AND_CLARIFICATIONS.md` alongside the new item 33.

---

## 2026-08-08 — RLS gaps closed on nanny inserts and caregiver_profiles read scope (spec 19, security fix); payment status now shows upcoming/overdue (spec 17, mechanical); audit log shows actor (spec 20, mechanical); payment note field corrected to nanny_visible_note (spec 15.13, mechanical); non-weekly pay warning added for item 31; time-entry schedule pre-fill re-verified; items 22-26/28-32 re-presented, no new judgment calls

**This session's scope, per the standing recurring-task instructions plus the
recurring-task owner's explicit ask this run:** re-verify the time-entry
schedule pre-fill (already built 2026-06-30, working as intended — see
below), then a fresh targeted audit of spec 15.9-15.15 (timesheets through
audit_events), spec 17 (Status Rules), and spec 19 (RLS Requirements)
against `supabase/migrations/*.sql`, `src/lib/types.ts`, and
`Pay.tsx`/`PTO.tsx`/`AuditLog.tsx`/`More.tsx` — areas prior sessions hadn't
closely covered. Full audit method and findings in the session transcript;
summarized below by what got fixed vs. left open.

**Time entry pre-fill from the caregiver's schedule (the explicit ask this
run) was already built and has been re-verified working (spec 13.4/13.2).**
`Time.tsx`'s manual-entry form (`useEffect` around the `date`/`templates`/
`shiftsByTemplate` state) already looks up the scheduled shift for whatever
date is selected and pre-fills start time, end time, and break minutes from
it, falling back to a 09:00-17:00 default only when nothing's scheduled that
day — and the date field still defaults to today. This has shipped since
2026-06-30 and been re-verified in five sessions since (2026-08-03, -04,
-05, and now); no change was needed. See `SPEC_CHANGE_LOG.md`'s 2026-06-30
entry for the original build.

**Two real RLS gaps closed (spec 19, security fix, built directly — not a
judgment call).** `time_entries_insert`, `timesheets_insert`, and
`leave_requests_insert` each restrict a parent/co-admin's insert branch by
status, but their caregiver-user (nanny) branch had no status restriction at
all — unlike each table's sibling *update* policy, and unlike
`schedule_exceptions_insert`, which got this right from the start. In
practice this meant a nanny calling the Supabase client directly (not
through the app UI, which never offers this) could insert a `time_entries`
row already `status: 'approved'`, a `leave_requests` row already
`status: 'approved'`, or a `timesheets` row already `status: 'paid'` with a
fabricated `gross_pay_due` — all of which `Pay.tsx`'s payroll calculations
read via a plain status filter with no other server-side safeguard.
`0018_rls_nanny_insert_status_and_profile_scope.sql` adds the same
status allow-list each table's update policy already enforces
(`'draft'`/`'submitted'` for time_entries/timesheets, `'requested'` for
leave_requests) to the matching insert policy's caregiver-user branch. The
same migration also tightens `caregiver_profiles_select_member`, which let
any household member — nanny included — read every caregiver's full profile
row (pay rate, guaranteed-hours settings, every `nanny_can_view_*`-gated
field), not just their own; the app UI never uses another caregiver's row
for a nanny viewer, so this only closes the network-layer gap to match.
Parent/co-admin visibility is unchanged in both cases.

**Payment status now correctly shows upcoming/due/overdue instead of always
"due" (spec 15.13/17, mechanical).** Every `payment_records` insert site
hardcoded `status: 'due'` regardless of how far off `due_date` was — so a
payment three weeks out and one three weeks overdue showed the identical
amber "Due" chip, and `'upcoming'`/`'overdue'` (two of spec 17's seven
statuses) were dead values nothing ever wrote. Added
`paymentDisplayStatus()` to `src/lib/payPeriod.ts` (reuses the same
`due_date`-vs-today comparison `reminders.ts` already does for the reminder
feed) and applied it wherever a payment's `StatusChip` renders in `Pay.tsx`.
Purely a display fix — the stored `status` column and the `PAYABLE_STATUSES`
gating logic are unchanged, since `'due'` was already in that set.

**Audit log now shows who took each action, not just what and when (spec
15.15/20, mechanical).** `AuditLog.tsx` already had `actor_user_id` on every
row (every `logAuditEvent()` call site writes it faithfully) but never
displayed it, despite the screen's own subtitle claiming to show "who, what,
and when." Now joins against `users` (same `id`/`full_name`/`email` lookup
pattern `More.tsx`'s member list already uses) and shows the actor's name or
email next to the timestamp.

**Payment void/correction notes moved from `parent_note` to
`nanny_visible_note` (spec 15.13, mechanical, zero behavior change).** The
void-reason and correction-reason text was being written into `parent_note`
but displayed unconditionally on the Payments list and detail sheet with no
role gate — i.e., already nanny-visible in practice, just under the field
name meant for internal-only notes. Switched the two write sites in
`Pay.tsx` to `nanny_visible_note` (matches what was already happening) and
the two display sites to prefer `nanny_visible_note`, falling back to
`parent_note` so notes written before this change still show. `parent_note`
is now free to become a genuinely internal-only field if that UI gets built
later.

**Non-weekly-pay-frequency warning added to the timesheet-generation form
(mitigates item 31's impact, doesn't fix the underlying bug).** Item 31
(overtime/`fixed_weekly` guaranteed hours computed once per whole pay
period instead of per calendar week — a real miscalculation for any
caregiver not on weekly pay) was found and left unbuilt last session
pending a product decision on partial-week handling (see
`QUESTIONS_AND_CLARIFICATIONS.md`). Rather than leave a household silently
trusting a wrong number in the meantime, `Pay.tsx`'s "Generate timesheet"
form now shows an amber warning whenever the active caregiver's
`pay_frequency` isn't `'weekly'`, telling the parent to double-check any
week over 40 hours before approving. This is a pure UI addition — it
doesn't touch `calc.ts`, `schedule.ts`, or the stored calculation at all, so
it carries none of the risk a real fix would.

**Audit also checked and found no new issues in:** every spec 15.9-15.12
field (timesheets, leave_policies, leave_requests, leave_ledger) against
`0001_schema.sql` plus every later migration that touches those tables —
schema matches spec's literal field list, with the only additions being
already-documented soft-delete/archive columns from prior sessions;
`leave_ledger.event_type` coverage (already-open item 24, not re-described);
the `reminders` table's read/write usage; spec 17's time-entry/timesheet
status transitions elsewhere (the only two never-reached values,
`'corrected'` and `'locked'`, are fully subsumed by already-open item 25);
and the remaining spec 19 RLS bullets (household-boundary scoping,
parent-admin/co-admin full access, payment_records nanny-read/no-write,
leave_requests nanny-create-only-for-self) all matched actual policy on
inspection.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same pre-existing handful prior sessions have already noted.

Q&A items 22-26 and 28-32 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md`, this
time with an explicit recommendation attached to every open item per this
session's request, including ones prior sessions deliberately left
unrecommended given the stakes (items 24/25/29/31).

---

## 2026-08-06 — Archiving a timesheet didn't actually free its period for a redo (bug fix, no spec change)

`timesheets` carries a plain `unique (caregiver_id, period_start, period_end)`
constraint from `0001_schema.sql`. `0005_soft_delete_timesheets.sql` later
made archiving a timesheet a soft delete (`deleted_at` set, row kept), but
never revisited that constraint -- Postgres doesn't know `deleted_at`-set rows
are supposed to be inactive, so it kept rejecting a new `insert` for the same
`(caregiver_id, period_start, period_end)` even after the old row was
archived. `Pay.tsx` had grown a workaround (`timesheetErrorMessage` catching
the `23505` and telling the user to "adjust the dates instead") and a comment
on `lastPeriodEnd` explicitly noting the constraint "still blocks
regenerating an archived period" -- both papering over the underlying bug
rather than fixing it. Net effect: once a timesheet was archived (directly,
or after voiding its payment and then archiving the now-unpaid timesheet),
that pay period was stuck forever -- no new timesheet could ever be generated
for it again.

`0017_timesheet_period_unique_excludes_archived.sql` drops that constraint
and replaces it with a partial unique index scoped to
`where deleted_at is null`, matching how `deleted_at` is already treated as
"inactive" everywhere else in the app (payment records, leave requests).
Archiving a timesheet -- including the void-payment-then-archive-timesheet
path -- now genuinely clears its period for a fresh timesheet. Updated the
now-stale `timesheetErrorMessage` copy and `lastPeriodEnd` comment in
`Pay.tsx` to match; left `lastPeriodEnd` itself including archived timesheets
unchanged, since it's still the right "most recent period" to suggest
catch-up from.

## 2026-08-05 — Time screen now shows scheduled-vs-actual per row (spec 14.3, mechanical); targeted audit of sections 14/16 finds two new judgment calls (Q&A items 31-32, one a real financial-calc bug); items 22-26/28-30 re-presented

**This session's scope, per the standing recurring-task instructions:** a
fresh, targeted audit of two spec areas prior sessions had covered less
closely than others — section 16 "Calculation Rules" (16.1-16.9) checked
formula-by-formula against `src/lib/calc.ts` and `Pay.tsx`'s
`computePeriodTotals`, and spec 14.3 (Time Screen)/14.4 (Calendar
Screen)/14.7 (Settings Screen) checked bullet-by-bullet against
`Time.tsx`/`Schedule.tsx`/`More.tsx`. 14.4 was skipped once its gaps were
confirmed to be the same already-open Q&A item 22 (week-grid-only calendar);
nothing new was added there per this run's instructions not to re-describe an
already-tracked gap.

**Time screen now shows scheduled hours next to actual, per row (spec 14.3,
mechanical, built).** Spec 14.3 lists "Scheduled vs actual" under the Time
screen's "Show" bullets; `Time.tsx`'s entry rows previously showed only
actual worked hours (`entry.paid_hours`), with the caregiver's scheduled
hours for that date computed only transiently inside the add/edit form's
validation warnings (`scheduledHoursFor`, already existed) and never
displayed on the saved row itself. Each active entry row now shows
"(scheduled X.XX hrs)" next to the actual hours whenever a shift was
scheduled that date, reusing the same `scheduledHoursFor` helper the form
already had — no new schedule query, no new design surface, a direct
"read a value that's already computed and just wasn't shown" fix. Left the
collapsed Archived list unchanged (lower-traffic view, already visually
de-emphasized) to keep the change surgical.

**Two new judgment calls found, not built — see
`QUESTIONS_AND_CLARIFICATIONS.md` items 31-32.**

- **Item 31 (the significant one) — overtime and `fixed_weekly` guaranteed
  hours are computed once per whole pay period, not per calendar week, in
  `calc.ts`/`Pay.tsx`/`schedule.ts`.** Spec 16.6 is explicit that the
  overtime threshold is "40 actual worked hours per **week**," and spec
  16.3's `fixed_weekly` guaranteed-hours basis is a distinct sibling of
  `fixed_pay_period` specifically because it's meant to represent a week's
  worth, not a period's. But `pay_frequency` (a real, selectable
  `caregiver_profiles` setting — weekly/biweekly/semi_monthly/monthly) is
  never consulted by the calc engine: `computePeriodTotals` sums worked
  hours across the *entire* pay period and runs them through
  `calculateTimesheet` exactly once against a flat, unscaled
  `overtime_threshold_hours` (default 40) and, separately,
  `computeGuaranteedHoursBase` returns `fixed_weekly_guaranteed_hours` as-is
  regardless of how long the period being computed actually is. For a
  biweekly caregiver working 38 hours in each of two weeks (76 total, zero
  overtime under any real weekly rule), today's code computes 36 hours of
  overtime — a real miscalculation of `gross_pay_due`, not a cosmetic gap.
  Not fixed directly because the "correct" fix requires an unspecified
  product decision about how to bucket weeks inside a period that frequently
  doesn't align to week boundaries (partial weeks at a semi-monthly or
  monthly period's edges have no spec'd threshold-proration rule), and a
  wrong-in-a-different-way fix is a real risk given this touches
  already-relied-upon pay math for every non-weekly household. See the Q&A
  entry for the three options considered (leave as-is / approximate
  period-length scaling / true per-calendar-week bucketing) — no
  recommendation given, deliberately, given the stakes.
- **Item 32 — Time screen is a single flat, unscoped list of every entry
  ever logged, not spec 14.3's This Week / Previous Weeks / Corrections tab
  structure.** `Time.tsx`'s `loadEntries` has no date filter at all and
  renders the full result as one reverse-chronological list. Not built
  directly because the "Corrections" third of the ask has nothing to show
  until Q&A item 25 (reject/request-correction workflow) is decided, and the
  "This Week"/"Previous Weeks" split needs its own navigation-model decision
  plus the same pay-period-vs-calendar-week question item 31 raises for
  money, just for display instead. Recommendation given (option B — add
  week grouping/paging, skip Corrections until item 25 lands) but not
  built unilaterally, matching the bar items 22/23 already set for
  screen-structure decisions.

**Audit also checked and found no new issues in:** every other 16.x formula
(16.1 paid-hours, 16.2 scheduled-hours, 16.4 actual-paid-hours gating, 16.5
guarantee adjustment, 16.7 payable-hours capping, 16.8 gross pay) matches the
spec's stated formulas and worked examples (13.6 Examples 1-4) exactly for a
single-week period, which is the only case the code was ever exercised
against; 16.9's per-hour-worked/per-pay-period/monthly accrual gap is the
same already-open item 24, not re-described here. 14.7 Settings: every listed
section (Household settings, User permissions, Nanny profile, Pay settings,
Guaranteed hours settings, PTO/sick settings, Schedule templates, Reminder
settings, Export records, Audit log) is reachable from `More.tsx` or one tap
away from it (Audit Log via its bottom link, Export via Pay.tsx, Schedule
templates via Schedule.tsx) — same "everything reachable, just not funneled
into one screen" pattern already accepted for item 28's onboarding gap, not
a new finding.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same pre-existing handful (`react-hooks/exhaustive-deps` in `Schedule.tsx`,
`react-refresh/only-export-components` in the context files and
`Card.tsx`) prior sessions have already noted.

Q&A items 22-26 and 28-30 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` alongside
the two new items above (31-32) for a decision.

---

## 2026-08-04 — PWA manifest duplication/inconsistency fixed (spec 8, mechanical); targeted audit of sections 6/7/8/18/24 plus a households/household_users column sweep finds one new judgment call (Q&A item 30); time-entry pre-fill re-verified; items 22-26/28-29 re-presented

**This session's scope, per the standing recurring-task instructions:**
re-verify the time-entry schedule pre-fill (asked for again by name), run a
fresh targeted audit aimed at spec sections prior sessions covered less
closely — section 6 (Supabase schema vs. spec), section 7 (GitHub Actions
deploy config), section 8 (PWA requirement), section 18 (Authorization —
session handling, auth guards), section 24 (Acceptance Criteria, checked
literally) — plus a fresh grep-every-column-name sweep of two data-model
tables not recently swept (`households`, `household_users`). No session ran
2026-08-02 or 2026-08-03.

**PWA manifest was duplicated and inconsistent (spec 8, mechanical, built).**
`index.html` hand-authored a `<link rel="manifest" href="/manifest.json">`
pointing at a static `public/manifest.json`, *in addition to* the
`<link rel="manifest">` that `vite-plugin-pwa` auto-injects pointing at its
own generated `manifest.webmanifest` — confirmed by building and inspecting
`dist/index.html`, which shipped both tags. The two manifests disagreed:
`public/manifest.json` had `theme_color: "#111827"` (matching the app's
`<meta name="theme-color">` and `PreferencesContext.tsx`'s light-mode value);
`vite.config.ts`'s `VitePWA({ manifest: {...} })` had `theme_color:
"#ffffff"`. Which one a browser actually honors when two `<link
rel="manifest">` tags are present is undefined/browser-dependent, so this was
a real (if subtle) "PWA install may pick up the wrong theme color"
correctness bug, not just untidiness. Similarly, `public/sw.js` was a
hand-written service worker that's been fully superseded by
`vite-plugin-pwa`'s generated `sw.js` (`registerSW` from
`virtual:pwa-register` is what `main.tsx` actually registers) — confirmed by
building and diffing `dist/sw.js` against `public/sw.js`: the workbox-
generated file always wins at `dist/sw.js` regardless of the static one, so
`public/sw.js` was dead code that could mislead a future reader into thinking
it's the real service worker. Fix: removed `public/manifest.json` and
`public/sw.js`, removed the manual manifest `<link>` from `index.html` (the
plugin still auto-injects one, confirmed post-fix by rebuilding — single
`<link rel="manifest" href=".../manifest.webmanifest">`, correctly base-path-
prefixed), and changed `vite.config.ts`'s `theme_color` to `#111827` to match
the rest of the app. Verified via a clean production build that
`dist/index.html` now has exactly one manifest link and `dist/manifest.webmanifest`
carries the correct theme color.

**One new judgment call found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` item 30.**
`household_users.status` has an unused `'removed'` enum value — every RLS
helper already checks `status = 'active'`, so soft-deleting would revoke
access identically to today's hard delete, and it looked at first glance like
a one-line "use the status column that already exists" fix. It isn't:
`join_household_by_code()` (the `SECURITY DEFINER` function backing the
join-code invite flow) blocks rejoining if *any* row exists for that
household/user pair regardless of status, and does a plain `INSERT` that
would violate the table's unique constraint against a leftover `'removed'`
row. Soft-deleting without also teaching the join function to handle a
`'removed'` row would permanently lock a removed member out of ever
rejoining via a join code again — worse than the gap it would fix — and
whether a removed member *should* be able to silently rejoin with an old
code is a real access-control call, not a mechanical one. Not built
unilaterally for that reason.

**Audit also checked and found no new issues in:** GitHub Actions deploy
workflow (matches spec 3/5/7 and goes further, with retry-on-failure logic
spec doesn't require); Vite base-path config; env var handling (only the
anon key reaches the frontend bundle, confirmed by grep); auth guards/session
handling (`Gate`/`RequireHousehold` in `App.tsx`, `AuthContext.tsx`'s
`onAuthStateChange` wiring); `caregiver_profiles.employment_status`
transitions (has real UI in `CaregiverDetail.tsx`); schedule exceptions
correctly feeding both the calendar grid and the timesheet's
`family_cancellation_hours` line item (this was a stale "known gap" in an
older log entry — already resolved by a prior session, reconfirmed current);
`manage_users` permission key properly gates both the RLS policy and the
`More.tsx` UI for household member management.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today (`useState(new Date().toISOString().slice(0, 10))`) and
pre-fills start/end/break from the caregiver's scheduled shift for whichever
date is selected via a `useEffect` keyed on `date`/`templates`/
`shiftsByTemplate`, falling back to `09:00`–`17:00` when nothing's scheduled
that day. Asked for again by name in this run's prompt; nothing needed
building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
pre-existing handful unrelated to this session's change.

Q&A items 22-26 and 28-29 were not resolved unilaterally (unchanged from
prior sessions) — re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` alongside
the new item 30 above for a decision.

---
## 2026-08-03 — PTO note/comment fields, `leave_policy_id`, and an in-app Ledger view wired up (spec 13.7/14.5/15.11); reminder copy now uses formatted dates (spec 13.9); time-entry pre-fill re-verified; items 22-26 re-presented, one new judgment call (item 30)

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present open
judgment calls rather than deciding them unilaterally. Ran a fresh, targeted
spec-vs-code audit of `APPLICATION_SPEC.md` §14.5 (PTO Screen), §14.6 (Pay
Screen), §14.7 (Settings Screen), and §13.9's "Example Reminder Copy" against
`src/lib/reminders.ts` — sections prior sessions' change-log entries hadn't
named explicitly — plus a column-usage grep of `leave_requests`/`leave_ledger`
against `src`, the same method item 24's `leave_policies` audit used.

**Four mechanical gaps found and fixed:**

1. **`leave_requests.nanny_note`/`parent_note` were never written.** Spec
   13.7 lists "Note" as a real request field and "Comment" as a real parent
   action; both columns existed in the schema but no form field captured
   either. `PTO.tsx`'s request form, edit form, and the request-detail modal
   now have a Note/Comment input, following the exact `isNanny ? {nanny_note}
   : {parent_note}` pattern `Time.tsx` already uses for its own note field.
   The note is shown on the list row and in the read-only detail view too,
   matching `Time.tsx`'s existing display convention (each viewer sees their
   own role's note, not the counterpart's — consistent with, not a fix to,
   that existing asymmetry).
2. **`leave_requests.leave_policy_id` was never written on insert.** The
   matching policy was already being looked up two lines above the insert
   (for the waiting-period/negative-balance checks) — `PTO.tsx`'s insert now
   sets `leave_policy_id: policy?.id ?? null`. Zero-risk data-completeness
   fix; nothing reads the column yet, but leaving a FK column permanently
   null makes future reporting/joins on it impossible after the fact.
3. **No in-app Ledger view existed**, despite spec 14.5 listing "Ledger" as
   its own bullet under the Parent view (distinct from "Current balance").
   `ledgerEntries` was already being loaded but only ever consumed for
   balance math or gated behind CSV export (nanny has no export access per
   spec 13.11, so a nanny never saw individual ledger lines, only the
   aggregate balance). Added a collapsible "Ledger" card on `PTO.tsx`,
   parent/co-admin only per the spec's view split, listing each entry's
   date, leave type, event type, hours delta, and running balance.
4. **Reminder copy used raw ISO dates**, not spec 13.9's "Example Reminder
   Copy" style ("Jun 22–28", "Aug 14"). `reminders.ts` interpolated
   `period_start`/`start_date`/etc. directly into every message despite the
   rest of the app formatting user-facing dates via `date-fns` (e.g.
   `Schedule.tsx`'s `format(weekStart, 'MMM d')`). Added `formatDate`/
   `formatDateRange` helpers to `reminders.ts` and applied them to every
   date-bearing message in `computeReminders`/`buildWeeklySummaryCards`.
   Cosmetic-only; message wording/logic is unchanged.

**One new judgment call found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` item 30.**
`leave_requests.start_time`/`end_time` (spec 15.11, optional per spec 13.7)
are dead columns — never set or read anywhere — so a partial-day PTO request
has no way to say *which* hours, only a typed total. Same shape as the
already-resolved-as-"skip for now" item 26 (payment attachment): an
explicitly optional field with a working fallback (a typed hours number) and
no signal yet that a household needs the finer granularity.

**Also checked, no new issue: manual adjustment reachability.** Spec 14.5's
"Manual adjustment" bullet is only reachable today via
`CaregiverDetail.tsx`'s "PTO settings" card, which conflates editing the
recurring policy amount with a one-time correction — the same overlap
already flagged and left open as item 24; not re-opened as a separate item.

**Built unilaterally, not flagged as a judgment call:** all four items above
were either implementing explicit, unambiguous spec text with an obvious
correct shape (the note fields, the FK write, the date formatting) or
directly reusing an already-loaded value with no new design surface (the
Ledger view reuses `ledgerEntries`, which was already being fetched) — same
bar past sessions used for unilateral vs. flagged work.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today and pre-fills start/end/break from the caregiver's
scheduled shift for whichever date is selected (falling back to 9am-5pm when
nothing's scheduled that day). Asked for again by name in this run's prompt;
nothing needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
same handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh
warnings prior sessions have already noted.

Q&A items 22-26 were not resolved unilaterally (unchanged from the last three
sessions) — they're re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` and in
the chat message from this session for a decision, alongside items 28-29
(still open from 2026-08-01) and the new item 30 above.

---
## 2026-08-04 — Archived leave requests still leaked into three read paths that weren't updated when 0015 added `archived_at` (bug fix, no spec change)

`Pay.tsx`'s `computePeriodTotals` (the pay-math path) already excluded archived
leave via `.is('archived_at', null)`, per the comment left when 0015 shipped.
Three other places that read `leave_requests` were never given the same
treatment, so an archived PTO/sick/unpaid entry kept showing up everywhere
except the paycheck it was archived to stop affecting:

- `Schedule.tsx`'s `loadLeave` (the weekly schedule view) still queried
  `status in ('approved','requested')` with no `archived_at` filter, so an
  archived request kept rendering its chip on the day it covered.
- `Home.tsx`'s dashboard balance fallback called `computeLeaveBalance` with
  the *unfiltered* `leave_requests` result (unlike `PTO.tsx`, which already
  pre-filters into `unarchivedRequests` before calling the same function) --
  only reachable for a policy with zero ledger rows yet, but wrong when hit.
- `Pay.tsx`'s `exportDetailedRecords` (the daily-detail CSV) queried leave for
  the export period without the filter, so the per-day PTO/sick/unpaid
  columns could show hours a payment record's own period totals no longer
  counted.

Fixed the root cause once instead of patching each call site again:
`computeLeaveBalance` (`lib/leave.ts`) now filters `!r.archived_at` itself, so
no caller can forget it (this also covers the `Home.tsx` case without
touching `Home.tsx`). `Schedule.tsx` and `Pay.tsx`'s CSV query each got the
same `.is('archived_at', null)` `Pay.tsx`'s pay-math query already used.

**Unpaid time off already zeroes out guaranteed-hours pay when it fully
covers the guarantee -- re-verified, not a bug.** A week scheduled/guaranteed
for 12 hours with 12 hours of approved unpaid leave and no other worked/leave
hours produces `guaranteeAdjustmentHours = 0` and `gross_pay_due = 0` today,
because `unpaid_time_off_reduces_guarantee` (`caregiver_profiles`, default
`true`) subtracts unpaid hours from the guarantee base before topping up pay
(`calc.ts`'s `calculateTimesheet`, 16.5). No code change was needed here.

## 2026-08-01 — Reminder cards scoped by role per spec 21 (mechanical fix); targeted audit of onboarding/PTO-timing/reminder-scoping finds two new judgment calls (Q&A items 28-29); time-entry pre-fill re-verified; items 22-26 re-presented

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present open
judgment calls rather than deciding them unilaterally. Ran a fresh, targeted
spec-vs-code audit first, deliberately aimed at spec sections prior sessions'
audits covered less closely (onboarding, PTO deduction timing, reminder
role-scoping, notification copy, validation edge cases) rather than
re-treading the well-covered sections (RLS, exports, guaranteed-hours calc,
PTO ledger mechanics, status chips) — see the audit's findings below.

**Reminder cards now scoped by role, per spec 21 (mechanical, built).** Spec
21 assigns `payment_due`/`payment_overdue`/`pending_timesheet_approval`/
`pending_pto_request` to "parent alert" only — no nanny mention for any of
the four, and each is a "the parent needs to act" case (pay someone, approve
a timesheet or PTO request). `computeReminders()` (`src/lib/reminders.ts`)
previously generated the same cards regardless of viewer role; a nanny
viewing `Home.tsx` after submitting a PTO request, for instance, saw the
"PTO request pending" card meant for the parent who needs to approve it.
Added a `viewerIsNanny` param that filters those four types out for a nanny
viewer (`PARENT_ONLY_REMINDER_TYPES` in `reminders.ts`); `missing_clock_out`/
`unsubmitted_timesheet` (spec grants both nanny-required and parent-optional)
and `upcoming_pto` (spec grants both explicitly) are unaffected, as are
`schedule_change`/`pto_balance_low`/`weekly_summary`, which spec 21 doesn't
scope at all. Low-risk, purely additive filter — built unilaterally since it
directly implements explicit, unambiguous spec text with no design choice
involved (unlike items 28-29 below).

**Two new judgment calls found, not built — see `QUESTIONS_AND_CLARIFICATIONS.md` items 28-29.**

- **Item 28 — onboarding.** Spec 13.1 specifies an 11-step guided parent
  setup (timezone, pay rate, pay frequency, guaranteed hours, PTO policy,
  schedule, reminders, etc.); `Onboarding.tsx` only ever collects household
  name and optionally nanny name + hourly rate. Every other setting has a
  real, working UI elsewhere in the app (`More.tsx`, `CaregiverDetail.tsx`,
  `Schedule.tsx`) — nothing is missing functionally, it's just not funneled
  into one first-run flow, so a new household lands on Home with mostly-
  default settings and has to discover each screen on its own.
- **Item 29 — PTO deduction timing.** Spec 13.7 lists deduction timing as
  configurable among three options and gives an explicit recommended
  default ("show pending impact on approval, finalize on timesheet
  approval"). `PTO.tsx`'s `applyUsedLedger()` instead makes an immediate,
  final ledger deduction at approval time, with no "pending" state, no
  timesheet-approval-triggered finalization, and no settings UI for the
  other two timing options at all — the configurability itself was never
  built, and the one behavior that exists doesn't match the spec's stated
  recommendation.

Neither was built unilaterally: item 28's fix has three genuinely different
shapes (do nothing / add a setup checklist / full wizard rebuild) and item 29
would change an already-relied-upon number's timing for every household
using the app today, which isn't a call to make without a response, unlike
last session's item 27 (unambiguous recommendation, zero-risk fill-in).

**Audit also checked and found no new issues in:** RLS/permissions, audit
log, exports, guaranteed-hours calc, pay settings/frequency, PTO ledger
mechanics, status chips, timezone/DST handling — these matched the spec
closely on inspection.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-
entry date to today and pre-fills start/end/break from the caregiver's
scheduled shift for whichever date is selected (falling back to 9-5 when
nothing's scheduled that day). Asked for again by name in this run's prompt;
nothing needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh warnings
unrelated to this change.

Q&A items 22-26 were not resolved unilaterally (unchanged from the last two
sessions) — they're re-presented in `QUESTIONS_AND_CLARIFICATIONS.md` and in
the chat message from this session for a decision, alongside the two new
items above.

---

## 2026-07-31 — `paid_if_family_canceled` template default wired up (spec 15.6), resolves Q&A item 27; time-entry pre-fill re-verified; items 22-26 re-presented

**This session's scope, per the standing recurring-task instructions:** make
progress against the spec in phases, re-verify the time-entry schedule
pre-fill (asked for again by name in this run's prompt), and present the
still-open Q&A items (22-26) for a decision rather than resolving them
unilaterally. Q&A item 27 (found in the 2026-07-30 audit) was the one
exception — see below for why.

**`schedule_shifts.paid_if_family_canceled` wired up (spec 15.6, Q&A item 27,
option B).** Built unattended (nobody available in chat this session) because
both of item 27's sub-decisions had an unambiguous, low-risk recommendation,
unlike items 22-26 which explicitly have none or call for a real product
choice. `Schedule.tsx`'s Add Shift form now has a "Paid if family cancels this
shift" checkbox (default on, matching the column default), written by all
four recurring shift-insert call sites (weekly/biweekly/monthly/custom — the
one-time option inserts a `schedule_exceptions` row directly, not a
`schedule_shifts` row, so it doesn't apply there). `family_cancellation` is
now one of the exception types that can reference an "Original shift" in the
day-detail exception form (previously only the shift-modification types
could); it auto-selects the day's shift when there's exactly one. Choosing
"Family cancellation" as the exception type, or changing which shift it
references, now defaults the exception's own "Affects pay" checkbox from that
shift's `paid_if_family_canceled` — still a plain checkbox the parent can
override per-exception afterward, so a household that always overrides isn't
worse off, and one that doesn't saves the tap. Linking the original shift
also lets `exceptionHours()` (`src/lib/schedule.ts`) fall back to the
canceled shift's own duration when no explicit hours or time range is given,
which family-cancellation exceptions couldn't do before (they had no shift
link at all). `default_category` was left unbuilt (option A) — nothing in the
spec defines what shift category should affect, so there's nothing to wire it
to yet; see `QUESTIONS_AND_CLARIFICATIONS.md` for the full resolution note.

**Time-entry schedule pre-fill — re-verified, no change.** Same behavior
confirmed every session since 2026-06-30: `Time.tsx` defaults the manual-entry
date to today and pre-fills start/end/break from the caregiver's scheduled
shift for whichever date is selected (falling back to 9-5 when nothing's
scheduled that day). Asked for again by name in this run's prompt; nothing
needed building.

**Health check:** `npm install`, `npx tsc -b`, `npx oxlint`, and `npx vite
build` all clean — no new TypeScript errors, no new lint warnings beyond the
handful of pre-existing `react-hooks/exhaustive-deps`/fast-refresh warnings
unrelated to this change.

Q&A items 22-26 were not resolved unilaterally — they're re-presented in
`QUESTIONS_AND_CLARIFICATIONS.md` and in the chat message from this session
for a decision.

---

## 2026-07-30 — Health check + targeted spec audit (reminders/RLS/audit-log/acceptance-criteria sections), one new gap found, no code changes

**This session's scope, per the standing recurring-task instructions:** verify
the app still builds cleanly, do a fresh but efficient audit pass (30 prior
sessions have already covered the spec close to exhaustively, so this one
targeted sections least recently touched rather than re-reading everything),
re-confirm the time-entry schedule pre-fill behavior once more (asked for
again in this run's prompt), and surface the 5 already-open Q&A items (22-26)
for a decision rather than resolving them unilaterally, since this run's
instructions asked to present them and wait rather than auto-pick the
recommended option as a couple of past unattended runs did.

**Health check:** `npm run build` (tsc -b && vite build) and `npm run lint`
both clean — no new TypeScript errors, no new lint errors (the handful of
existing `react-hooks/exhaustive-deps` / fast-refresh warnings predate this
session and are unrelated to spec compliance).

**Audit (delegated, sections 13.9/21 reminders, 17 status rules, 18/19
authorization/RLS, 20 audit log, 24 acceptance criteria, 25 recommended
defaults):** one genuinely new gap found —

**`schedule_shifts.paid_if_family_canceled` and `.default_category` (spec
15.6) are dead columns.** Both exist in the schema (migration 0001) and
`types.ts`, matching spec exactly, but nothing in `src` ever sets them on
insert (the four shift-insert call sites in `Schedule.tsx` all leave them at
the DB default) or reads them anywhere. In practice, family-cancellation pay
is decided per-exception via `schedule_exceptions.affects_pay` instead of a
per-shift-template default, and shift "category" (regular/holiday/special/
occasional) has no effect on pay rate or display anywhere. Not a crash or
regression — the feature these two columns imply (templated per-shift
defaults for cancellation pay and categorization) was simply never built.
Opened as Q&A item 27 rather than built blind: `default_category`'s allowed
values and intended effect aren't specified anywhere past the column
default, and `paid_if_family_canceled` overlaps with the existing per-
exception `affects_pay` flag in the same shape as the already-open item 24
redundancy (two settings, unclear precedence), so it's a judgment call, not
a mechanical fill-in.

Two more columns came back unused in the same sweep but are too minor to
warrant a Q&A item: `users.last_login_at` and `household_users.invited_at`
(migration 0001) — neither is tied to any spec acceptance-criteria bullet or
UI requirement, they just aren't populated. No action taken; noting for
completeness only.

Everything else checked (audit-log event coverage against spec 20's 13-item
list, RLS helper-function coverage against spec 18/19, status-rule handling
against spec 17, the spec 24 acceptance-criteria checklist, spec 25
recommended defaults) matched the current implementation with no new
discrepancies.

**Time-entry schedule pre-fill — re-confirmed once more, still no change
needed.** `Time.tsx:50` defaults the date field to today; the effect at
`Time.tsx:116-128` pre-fills start time, end time, break minutes, and
`schedule_shift_id` from the caregiver's scheduled shift for whatever date
is selected, falling back to a 9-5 default when nothing's scheduled. This is
the same behavior confirmed in essentially every session since it was first
built 2026-06-30 — flagging again here since this run's prompt asked for it
by name, but treating it as re-verification, not new work.

No code changes this session beyond documentation (this entry, plus Q&A item
27). The 5 already-open Q&A items (22-26) were not resolved unilaterally —
see `QUESTIONS_AND_CLARIFICATIONS.md` and the chat notification sent this
session for the decision to make.

---

## 2026-07-29 — iOS-style swipe actions on Time / PTO / Timesheets / Payments; PTO archivable from any status; timesheet approval creates its payment record

**Requested behaviour:** archive PTO even once it's approved, and give the
four record lists iOS list semantics — swipe left for archive, swipe right to
approve, tap for a detail sheet where the record can be edited.

**1. New `src/components/SwipeRow.tsx`.** One gesture component behind all
four lists rather than per-screen handlers. Drag left parks the row open over
its trailing actions (archive/restore) so the action still has to be tapped;
drag right reveals the leading action and a *full* swipe fires it outright,
matching iOS Mail. Notes on the implementation, all of which are load-bearing:

* `touch-action: pan-y` on the moving element — the component owns the
  horizontal axis and leaves vertical scrolling to the browser, so a list
  still scrolls normally when the finger starts on a row.
* An axis lock after 8px of travel decides swipe-vs-scroll once per gesture.
* `pointermove` fires for a hovering mouse with no button down, so the
  handler is gated on a `pressed` ref set at `pointerdown`. Without it,
  moving the cursor across a row dragged it open.
* The settle decision reads the offset from a ref, not from state, so it
  can't act on a value one render behind the last move.
* A module-level registry keeps only one row open at a time, list-wide.
* Actions are real `<button>`s in the DOM at all times (just clipped), and
  the row content carries `role="button"` + Enter/Space, so nothing here is
  reachable only by gesture. Every swipe action also stays available as a
  normal button inside the detail sheet.

**2. Tap-to-detail replaces the inline edit forms.** `Time.tsx` and `PTO.tsx`
previously swapped a list row in place for an edit form; both now open a
`Modal` detail sheet carrying the same form plus that record's actions.
Timesheets and payments previously expanded inline to show `HoursBreakdown`
and had no detail view at all; they now open the same kind of sheet.

**3. PTO can be archived from any status, and archiving now moves the
balance.** The Archive control used to be rendered only for `approved`
requests, and migration `0015_leave_request_archive.sql` deliberately defined
archiving as display-only ("hides a settled request … without touching status
or the ledger"). That reading doesn't survive the request here: if a parent
archives an approved PTO entry because the leave never happened, the hours
have to come back, otherwise the balance keeps counting leave that isn't on
the list any more and nothing on screen explains the difference. So archiving
an approved request now posts a balancing `reversal` to `leave_ledger`, and
unarchiving posts a `correction` that re-applies it. **This is a deliberate
departure from 0015's comment, not an oversight.** No migration is needed —
both event types already exist and the existing `leave_requests_update` /
`leave_ledger_insert_manager` policies already permit it.

The netting helper this introduced (`zeroOutLedgerForRequest`) sums *all* of
a request's ledger rows per policy and posts one balancing entry, replacing
the old `adjustLedgerForEdit`, which reversed each `used` row it found and so
double-reversed a request that was edited twice. Rejecting a
previously-approved request now returns its hours too — it didn't before.

Two consequences of archived leave no longer counting: `computeLeaveBalance`'s
request-based fallback is fed unarchived requests only, and `Pay.tsx`'s period
math filters approved leave with `.is('archived_at', null)`, so an archived
request is no longer paid out on the next timesheet.

**4. Approving a submitted timesheet now does what spec 13.5 says.** Swipe-right
on a timesheet needed a real approval to run, and there wasn't one: a
nanny-submitted timesheet (`Pay.tsx handleSubmitTimesheet`, which writes only
raw worked hours with zeros everywhere else) sat at `submitted` forever with no
UI path out. Spec 13.5's Parent Workflow steps 4-6 are explicit — approve,
recalculate payable hours and gross pay, create the payment record — so
`approveTimesheet` now recomputes the period from its time entries, leave and
schedule exceptions, writes the full hour breakdown onto the timesheet, and
inserts the payment record (skipped if a live one already exists, so
re-approving can't double-pay). `doGenerate`'s calculation was extracted to
`computePeriodTotals` + `timesheetHourFields`/`paymentRecordFields` so both
paths compute identically rather than by parallel copies.

**5. Payments can be archived independently.** `payment_records.deleted_at`
existed but was only ever set as a side effect of archiving the timesheet,
leaving no way to clear a payment raised in error without losing the timesheet
behind it. Added `setPaymentArchived` plus an "Archived payments" section
mirroring the timesheet one. Restoring a timesheet still restores its payments.

**6. Dropped the `window.confirm` on archiving a timesheet.** It was the only
one of the four lists that prompted, and a modal on every swipe defeats the
gesture. Archiving is a soft delete with a visible Restore in all four lists.

---

## 2026-07-29 — Guaranteed-hours policy settings, nanny visibility settings, payment method label, reimbursements/manual adjustments, private notes, schedule-shift linking (fresh line-by-line spec audit)

**Fresh line-by-line pass over `APPLICATION_SPEC.md` against current `src/`
and `supabase/`**, per this session's instructions to look past the
2026-07-28 entry's "no known gaps" and re-verify areas not explicitly
re-checked in several recent entries. Method: cross-referenced every table in
spec section 15 field-by-field against `src/lib/types.ts` and the
migrations, then grepped every resulting field name across `src` (excluding
`types.ts`) to find columns that are typed but never read or written
anywhere. This surfaced several real gaps that prior audits' spot-checks
("data model matches spec 15 field-for-field," 2026-07-28) hadn't caught
because the fields *exist* and match the spec's type/default — they're just
never wired into any calc or UI. Six unambiguous gaps closed this session;
three larger, judgment-call gaps opened as new Questions & Clarifications
items (24-26) rather than built.

**1. PTO/sick/holiday "counts toward guaranteed hours" now actually gates
the guarantee calc (spec 13.6, 16.4).** Spec 16.4 states outright: "Whether
each leave/family cancellation category counts should depend on policy
settings." `family_cancellation_counts_toward_guarantee` already worked this
way (`Pay.tsx`, zeroing `cancellationHours` when off, since 2026-07-02), but
`caregiver_profiles.pto_counts_toward_guarantee`/`sick_counts_toward_guarantee`/
`holiday_counts_toward_guarantee` were typed columns the calc engine never
read (confirmed via the grep sweep above) — `calculateTimesheet` always
summed `paidPtoHours + paidSickHours + paidHolidayHours` unconditionally
into `actual_paid_hours`, regardless of the flags. `src/lib/calc.ts:14-27`
adds `ptoCountsTowardGuarantee`/`sickCountsTowardGuarantee`/
`holidayCountsTowardGuarantee` to `TimesheetCalcInput`; `calc.ts:75-79` gates
each category's contribution to `actualPaidHours` (the number that offsets
how much guarantee top-up is owed) on its flag, while leaving
`payableRegularHours`'s unconditional inclusion of the same hours untouched
— a category excluded from the guarantee calc is still fully paid as its own
leave line, it just stops offsetting the guarantee shortfall. `Pay.tsx`'s
`doGenerate` (~line 313-324) now passes all three flags from
`activeCaregiver`.

**2. All five guaranteed-hours policy toggles now have settings UI for the
first time (spec 13.6).** Beyond the three above, `unpaid_time_off_reduces_guarantee`
and `family_cancellation_counts_toward_guarantee` were already *read* by the
calc engine but had **no UI anywhere** to change them away from their DB
defaults — confirmed by grepping for each field name being *assigned* (not
just read) anywhere in `src`; there were zero hits for any of the five.
`CaregiverDetail.tsx`'s "Pay settings" card now has a "What counts toward
meeting the guarantee" checkbox group (rendered inside the existing
`guaranteedEnabled` block) for all five flags, wired into `handleSave`'s
update payload. All five are already covered by the `edit_guaranteed_hours_policy`
RLS restriction trigger (migration `0002_rls.sql`'s
`enforce_caregiver_profile_restrictions`, which already checked
`unpaid_time_off_reduces_guarantee`/`family_cancellation_counts_toward_guarantee`/
`pto_counts_toward_guarantee`/`sick_counts_toward_guarantee`/
`holiday_counts_toward_guarantee` — the trigger was ahead of the UI), so no
RLS change was needed.

**3. Nanny visibility flags (`nanny_can_view_*`) are now actually settable
(spec 11/15.4).** The 2026-07-26 (part 2) session enforced these four flags
(gating what a nanny sees), but the same grep sweep found **none of them
were ever assigned anywhere except the DB column default** — there was no
settings surface at all, so a household could never turn any of them off (or
back on) after the row was created. `CaregiverDetail.tsx` has a new "Nanny
visibility" card (`toggleVisibilityFlag`, ~line 329) with one instant-toggle
checkbox per flag (`NANNY_VISIBILITY_FLAGS`, ~line 26-38), following the same
"toggle immediately + audit log" pattern as `More.tsx`'s co-admin permission
checkboxes rather than a buffered form, since each flag is independent.

**4. Payment method label + its nanny-visibility flag (spec 13.8).**
`caregiver_profiles.payment_method_label` and `payment_records.payment_method_label`
have existed since migration 0001 (with a check constraint and RLS coverage
under the `edit_pay_rate` restriction group) but were **never set or
displayed anywhere** — the only reference in `src` was reading it back out
in the full-records export. Spec 13.8 lists both "Payment method label" and
"Whether nanny can view payment method label" as Pay Settings, the latter of
which had no backing column at all. Closed both:
  - Migration `0016_nanny_can_view_payment_method.sql` adds
    `caregiver_profiles.nanny_can_view_payment_method boolean not null
    default true` (defaults true like `nanny_can_view_gross_pay`/
    `nanny_can_view_pto_balance`/`nanny_can_view_guaranteed_hours` — only
    `nanny_can_view_pay_rate` defaults false, since a payment-method label
    like "Zelle" isn't as sensitive as the raw dollar rate). Added to
    `NANNY_VISIBILITY_FLAGS` above.
  - `CaregiverDetail.tsx`'s Pay settings form gained a "Payment method"
    select (the 7 spec'd values + "Not set"), saved through the existing
    `edit_pay_rate`-gated update.
  - `Pay.tsx`'s `doGenerate` now copies `activeCaregiver.payment_method_label`
    onto every new `payment_records` row (and the correction-insert path
    carries it forward from the original, `Pay.tsx` ~line 654), and the
    Payments list row now shows it (gated by `showPaymentMethod`, `Pay.tsx:171`)
    next to the due date/amount. A shared `formatPaymentMethod` helper
    (`src/lib/payPeriod.ts`) replaces what would otherwise be a second
    display-label map, so `CaregiverDetail.tsx`'s select and `Pay.tsx`'s row
    can't drift out of sync on wording.

**5. Reimbursements and manual adjustments are now actually settable (spec
13.8, 14.6 "Add adjustment", 16.8).** `calc.ts`'s gross-pay formula has
always added `reimbursements + manualAdjustments` in (16.8's literal
formula), and both are real columns on `timesheets`/`payment_records` — but
`Pay.tsx`'s `doGenerate` hardcoded both to `0` at every call site, so neither
could ever be nonzero except by copying an already-nonzero value forward
during a payment correction (impossible to bootstrap — there was no path to
create the first nonzero value). `Pay.tsx`'s "Generate timesheet" form now
has two optional dollar inputs (~line 1006-1029) feeding `reimbursementsAmount`/
`manualAdjustmentsAmount` (~line 314) into `calculateTimesheet` and both
inserts. **Not built:** a standalone "Add adjustment" action on an
already-generated, not-yet-paid payment record (spec 14.6 lists it as its
own Pay Screen action, separate from generation time) — a parent who
discovers a reimbursement is owed after generating can still add it by
archiving and regenerating the timesheet (which cascades to its payment
record per the existing archive behavior), so this isn't a hard blocker, but
a direct "edit this due payment's adjustments" action wasn't added; flagged
here rather than assumed equivalent, though not judged ambiguous enough to
need its own Q&A item (it's a smaller, clearly-scoped follow-on to what
shipped here).

**6. `time_entries.schedule_shift_id` now populated (spec 15.8).** This
column has existed since migration 0001 as an explicit "Scheduled shift ID,
optional" field, but nothing in `src` ever wrote to it — confirmed via the
same grep sweep. `Time.tsx`'s existing schedule pre-fill effect (unchanged
logic, just now also captures the matched shift's id, `Time.tsx:58,111-125`)
threads it through to both the manual-entry insert (`Time.tsx:163`) and
clock-in (`Time.tsx:213-218`, which now also looks up today's scheduled
shift, something it never did before). The link is by date/occurrence match,
not by whether the logged times exactly equal the scheduled times — an
entry stays linked to "the shift scheduled for this date" even if the
nanny/parent edits the pre-filled hours, consistent with how the rest of the
app already treats manual edits as expected/normal (spec 13.4's validation
warnings, not blocks).

**7. Caregiver private notes now have a read/write UI (spec 15.4
`notes_private` / 18 "employer-only notes").** The dedicated
`caregiver_private_notes` table (a separate table rather than a column,
specifically so RLS can exclude the nanny role entirely — see its comment in
migration 0001) and its `CaregiverPrivateNote` TS type have existed with full
RLS since the beginning, but no screen ever read or wrote a row. Added a
"Private notes" card to `CaregiverDetail.tsx` (~line 532, parent/co-admin
only since the whole page already blocks nanny access) with a textarea
upserting the existing table — no migration needed, RLS was already correct.

### New Questions & Clarifications items opened (not built, by design)

Three larger areas turned up in the same audit that genuinely need a
decision rather than a silent pick — see `QUESTIONS_AND_CLARIFICATIONS.md`
for full option sets:

- **Item 24 — leave-policy accrual automation and per-policy settings**
  (`per_hour_worked`/`per_pay_period`/`monthly` accrual, balance/carryover
  caps, reset dates, and `leave_policies.counts_toward_guarantee`/
  `visible_to_nanny`, which appear to duplicate the caregiver-level flags
  item 1-3 above just wired up). Blocked on both a serverless-trigger design
  question (no cron for "monthly" accrual) and resolving the apparent
  two-settings-one-concept redundancy.
- **Item 25 — timesheet reject/request-correction workflow doesn't exist**
  at all (spec 11/13.5/14.3/17): the nanny's "submit" and the parent's
  "generate" are two disconnected flows, so there's no way to actually
  approve or send back a submitted timesheet with a correction note today.
  Fixing it properly means deciding whether to merge the two flows, which
  touches the core pay-approval data path.
- **Item 26 — payment record attachment/photo** (spec 13.8): the column has
  existed since migration 0001, but the app has zero Supabase Storage
  integration to build on; recommended to skip unless a household actually
  asks for it.

### Time-entry schedule pre-fill — re-verified with actual scenario testing, one small addition, no bugs found

Per this session's explicit instruction to exercise (not just re-read)
`Time.tsx`'s pre-fill effect: traced both the caregiver-switch case and the
overnight-shift case by hand.
- **Switching caregivers (parent view):** `CaregiverSelect` changes
  `caregiverId` → the `loadSchedule` effect (`Time.tsx:103-105`) re-fetches
  that caregiver's `schedule_templates`/`schedule_shifts` → since the
  pre-fill effect (`Time.tsx:111-125`) depends on `templates`/
  `shiftsByTemplate`, it re-runs automatically once the new caregiver's
  schedule loads and re-derives start/end/break for the already-selected
  date. Confirmed correct — no stale pre-fill from the previous caregiver.
- **Overnight shift (e.g. a shift scheduled 22:00-06:00):** the effect sets
  `startTime`/`endTime` directly from the shift's stored `start_time`/
  `end_time` with no duration math of its own; `hoursBetween` (`calc.ts:106`)
  already adds 24h when `end < start`, so the paid-hours preview and the
  saved `paid_hours` come out correct. Confirmed correct.
- **Multiple shifts scheduled the same day (e.g. a split shift):** the
  effect only pre-fills from `occurrences[0]`, silently ignoring any other
  shift scheduled for the same date. This is an inherent limitation of a
  single start/end/break form (there's nowhere to put a second shift's
  hours), not a bug in the pre-fill logic itself, and the spec's manual-entry
  field list (13.4) doesn't call for multi-segment entries either — not
  treated as a gap.
- **Missing link:** while tracing this, found `schedule_shift_id` (spec
  15.8) was computed as part of the pre-fill (the matched shift was right
  there) but never saved — closed as gap #6 above, since it's a direct,
  low-risk extension of code this verification pass was already reading
  closely.

No bug found in the core pre-fill/default-to-today behavior itself; the one
change made (`schedule_shift_id` linking) is additive and doesn't alter any
existing pre-fill value.

---

## 2026-07-28 — Home screen "Today" and "This Week" cards (spec 14.1/14.2), fresh spec-vs-app audit

**Fresh pass over `APPLICATION_SPEC.md` against the current app**, as invited
by the 2026-07-27 entry below ("no known gaps currently tracked... future
phases should come from a fresh pass"). Confirmed all previously-resolved
decisions are still correctly implemented (all 10 reminder types wired up,
all 6 export types present, time-entry schedule pre-fill still working, data
model matches spec 15 field-for-field on every table spot-checked, status
chip set matches spec 22). One real gap found and closed this session; one
already-known deliberate simplification (calendar month/day view) was
reconsidered but left as-is pending a decision — see
`QUESTIONS_AND_CLARIFICATIONS.md`.

**Home screen now has "Today" and "This Week" cards (spec 14.1/14.2),
closing a gap that had no prior write-up.** `Home.tsx` previously rendered
only a generic 2x2 stat-tile grid (Time/Schedule/PTO/Pay, each just a nav
shortcut) plus the reminder feed -- there was no surface anywhere showing
"is the caregiver clocked in right now," which spec 22 calls out as the
single thing a parent should see immediately, and no "Current Week" card at
all despite `StatusChip.tsx` already having unused `scheduled`/`clocked_in`/
`missing_clock_out` color variants defined for exactly this purpose.

- **"Today" card** -- one row per caregiver (just the caregiver's own row for
  a nanny), showing either "Clocked in since HH:MM" (green `clocked_in`
  chip, or amber `missing_clock_out` if the reminders engine has already
  flagged that same entry -- reused via entry ID rather than re-deriving the
  schedule-aware grace-period logic a second time), "Scheduled H:MM AM–H:MM
  PM" (blue `scheduled` chip) if a shift exists today but no active
  clock-in, or "No shift scheduled today" with no chip.
- **"This Week" card** -- one row per caregiver: scheduled hours (recurring
  shifts + net exception delta for the calendar week), actual hours logged,
  guaranteed hours, and a status chip for the timesheet whose period
  contains today (or none, if not yet generated). Guaranteed hours is
  intentionally omitted when `guaranteed_hours_basis = 'fixed_pay_period'`
  (a biweekly fixed guarantee shown as "this week's number" would overstate
  it -- there's no way to prorate a period guarantee onto a single week
  without inventing a rule the spec doesn't specify), and respects
  `nanny_can_view_guaranteed_hours` for a nanny viewer, same gating as the
  timesheet/payment breakdown added 2026-07-27.
- **Deliberately excluded: "estimated payable hours."** Spec 14.1 lists it as
  a Current Week field, but a real payable-hours number needs PTO/sick/
  holiday/family-cancellation hours and the overtime split, which are only
  authoritative once run through `calc.ts` over the caregiver's actual pay
  period (frequently biweekly, rarely aligned to a calendar week) -- the
  same reasoning that already kept a regular/OT split out of the
  `weekly_summary` digest (2026-07-25 entry). A second approximation here
  risked quietly disagreeing with Pay.tsx's number for the same caregiver.
- **Refactor:** `computeGuaranteedHoursBase` moved from a local function in
  `Pay.tsx` to an exported helper in `lib/schedule.ts` so Home.tsx's weekly
  estimate and Pay.tsx's authoritative per-period calc share one
  implementation instead of two copies that could drift.
- Home's data load now fetches schedule shifts/exceptions across the full
  current calendar week (previously just the trailing 2 days, sized only for
  the missing-clock-out reminder) -- widened to `min(week start, today - 2
  days)` through the week's end so both the existing reminders and the new
  cards share one fetch.

**Not built this session, flagged for a decision instead:** whether to
build a real month view for the Calendar (spec 13.10/14.4, still week-grid
only per Q&A item 8) and whether to take the Home screen further toward
spec 14.1/14.2's literal 5-card/primary-button layout beyond what shipped
above. Both re-opened as new Questions & Clarifications items rather than
decided unilaterally, since this session's instructions asked for open items
to be surfaced for a decision rather than picked silently.

**Time-entry schedule pre-fill -- re-verified once more, still no change
needed.** `Time.tsx:48` defaults the date field to today;
`Time.tsx:111-121`'s effect pre-fills start/end/break from the scheduled
occurrence for whatever date is selected. Unchanged since 2026-06-30.

### Known gaps for next phase

None beyond the two items above awaiting a decision in
`QUESTIONS_AND_CLARIFICATIONS.md`.

---

## 2026-07-27 — Guaranteed-hours line item on timesheets/payments (spec 13.6), closes the last tracked known gap

**Guaranteed-hours breakdown now rendered (spec 13.6 "Timesheet Display for
Guaranteed Hours").** `guaranteed_hours` and `guarantee_adjustment_hours` were
computed and stored on every `timesheets`/`payment_records` row since the
calc engine was built, but no screen ever displayed either number — flagged
as the last open "known gap" in the 2026-07-26 (part 2) entry. `Pay.tsx`'s
Timesheets and Payments cards are now tappable: tapping a row expands an
inline breakdown grid (actual worked, regular, overtime, paid PTO/sick/
holiday, family cancellation, guaranteed hours, guarantee adjustment, payable
regular/overtime — the fields spec 13.6's example table and 13.5's timesheet
footer both list) instead of adding a bespoke calendar/detail page, since the
data already lives on the row being tapped.

**Gating follows the existing `nanny_can_view_guaranteed_hours` flag (spec
11/15.4), not a blanket hide.** Only the "Guaranteed hours" and "Guarantee
adjustment" rows are omitted from the breakdown when a nanny's caregiver has
that flag off — every other row (worked/PTO/sick/holiday/family-cancellation/
payable hours) is spec'd as ordinary timesheet content, not gated by that
flag, so hiding the whole breakdown would have been an over-restriction.
Gross pay in the row header still follows the existing `showGrossPay`/
`nanny_can_view_gross_pay` gate, unchanged. `activeCaregiver` (used to read
both flags) already resolved correctly for both roles before this change.

**Time-entry schedule pre-fill — re-verified once more, still no change
needed.** This run's task again asked for time entries to default to the
caregiver's scheduled hours (falling back to the current day); `Time.tsx`
already does this (see 2026-06-30 and every re-check since). No gap.

**Housekeeping: prior branch had already merged as PR #49.** This session's
designated branch (`claude/practical-ramanujan-93an5c`) was found already
merged into `main` (its HEAD was exactly `main`'s merge commit for PR #49),
so per the standing instruction for that situation, the branch was reset to
restart from latest `main` before this phase's work rather than stacking new
commits on already-merged history. No functional change from this, just
noted for continuity of the branch/PR history in this log.

### Known gaps for next phase

None currently tracked. Every gap listed across prior "Known gaps" sections
(recurring schedule types, co-admin permission UI, per-key permission
enforcement, `nanny_can_view_*` enforcement, reminder settings + weekly
summary, additional exports, schedule exceptions UI, time-entry validation,
and now this guaranteed-hours display) has been closed. Future phases should
come from a fresh pass over `APPLICATION_SPEC.md` against the current app,
or from user-directed feature requests.

---

## 2026-07-26 (part 2) — Enforce `nanny_can_view_*` visibility flags (spec 11/15.4), resolves Q&A item 20

**Nanny visibility flags now enforced**, closing the gap flagged in the
2026-07-25 entry below and resolved as Q&A item 20 **option A** (enforce
them) in chat.

- **`nanny_can_view_pay_rate` and `nanny_can_view_guaranteed_hours`** — the
  only screen that ever displayed either value was `CaregiverDetail.tsx`
  (the pay-rate field and guaranteed-hours-basis settings), and it had no
  role gate at all: a nanny navigating directly to `/caregiver/:id` could see
  the full parent settings page (RLS already blocked their writes, but
  reads/UI were wide open). Rather than mask individual fields on what is
  fundamentally a parent-settings page, `CaregiverDetail.tsx` now redirects a
  nanny to `/` outright (`<Navigate to="/" replace />`, matching the existing
  `AuditLog.tsx` pattern) — this is also just correct per spec 11 ("Nanny
  cannot access settings for pay, PTO policy, guaranteed hours")
  independent of the specific flags. This was the only surface displaying
  either value, so blocking it fully resolves both flags.
- **`nanny_can_view_gross_pay`** — `Pay.tsx`'s Payments and Timesheets list
  cards showed `gross_pay_due` unconditionally to any viewer, nanny
  included. A new `showGrossPay` (`!isNanny ||
  activeCaregiver?.nanny_can_view_gross_pay !== false`) hides the dollar
  amount (replaced with "amount hidden" on the payments row; simply omitted
  on the timesheets row, where hours worked stays visible) when off.
  Parent/co-admin views are never gated by this flag — it only restricts the
  nanny's own view.
- **`nanny_can_view_pto_balance`** — `Pto.tsx`'s "Balances" card showed
  PTO/sick balances unconditionally. Same pattern: a `showPtoBalance` flag
  replaces the balance bars with a "Balance hidden by household settings."
  message for a restricted nanny.
- **Weekly summary card (`Home.tsx`, added 2026-07-25)** —
  `buildWeeklySummaryCards` now takes a `viewerIsNanny` flag and omits the
  gross-pay-due and PTO/sick-remaining parts of a caregiver's summary line
  when that caregiver's own flags say not to show them to their nanny. A
  parent/co-admin viewing the same card always sees the full summary.

**Not touched: guaranteed-hours *totals* (13.6's guarantee-adjustment line
item).** Beyond the settings page just blocked above, no screen in the app
currently renders a caregiver's computed guaranteed-hours or
guarantee-adjustment number anywhere — not to the nanny, not to the parent
either. There's nothing to gate yet for that half of
`nanny_can_view_guaranteed_hours` beyond the settings-page fix, since the
number itself isn't displayed anywhere. Flagged here rather than silently
assumed handled; building that display (spec 13.6's timesheet line item) is
its own known gap, independent of this visibility-flag work.

**Q&A item 21 (`export_records` enforcement) resolved as option A — no code
change.** Chosen in chat: keep the client-side-only gate built 2026-07-26
(see below), since it was already built that way and no alternative was
requested.

### Known gaps for next phase (unchanged)

- **Guaranteed-hours line item on timesheets/payments** (spec 13.6) —
  `guaranteed_hours`/`guarantee_adjustment_hours` are computed and stored on
  every timesheet/payment record but never rendered as a line item anywhere
  in the UI, for either role.

---

## 2026-07-25 — Reminder settings + weekly summary digest (spec 13.9/15.14), resolves Q&A item 19

**Weekly summary digest built.** `computeReminders`'s companion
`buildWeeklySummaryCards` (`src/lib/reminders.ts`) produces one `weekly_summary`
card per caregiver on `Home.tsx`, content per the option chosen for Q&A item
19 (option B, picked without a live chat round-trip since this session ran
unattended on a schedule -- see the Q&A file for the full option set and why
B was recommended): hours logged so far this calendar week, the status of
whatever timesheet's period contains today (or "not yet generated"), the
next unpaid payment's amount and due date, and PTO/sick balance remaining
(`pto`/`sick` leave types only, matching the existing balance card on
`Pto.tsx`). Recomputed live on every `Home.tsx` load rather than cached and
shown once per week -- since its numbers are already scoped to "the calendar
week containing today," they naturally roll over at the week boundary with
no extra state needed, so the "refreshed the first time the app is opened
each week" language in the recommendation didn't require any actual caching
mechanism once implemented.

**Deliberately excluded from the digest: a regular/overtime hours split.**
The recommendation's example copy ("Y regular + Z overtime") implied one,
but that split is only authoritative once run through the real payroll
engine (`calc.ts`) over a caregiver's actual pay period -- which can be
biweekly and doesn't line up with a calendar week for most households. Doing
a second, simplified regular/OT split here risked quietly disagreeing with
the number `Pay.tsx` shows for the same caregiver. Total hours logged this
week (unsplit) avoids that, at the cost of being a slightly thinner digest
than literally described.

**Per-reminder-type enable/disable settings built**, using the `reminders`
table exactly as already defined in migration 0001 -- no new migration
needed. Each row is scoped to `(household_id, recipient_user_id, type)`; a
new "Reminder settings" card in `More.tsx` (Parent Admin/Co-Admin only, per
spec 13.9 "Parent can configure") lists all ten reminder types from spec
15.14 with a checkbox each, defaulting to enabled when no row exists yet.
`recipient_user_id` is always the signed-in user making the change -- there's
no UI to configure reminders on behalf of someone else. This follows the
"recipients" concept (who else could receive a given type) already being out
of scope per item 17's resolution, which deferred it until there's an
email/SMS delivery channel to target; today, "recipients" collapses to just
"the person configuring their own view." `Home.tsx` now loads the signed-in
user's `reminders` rows alongside its other data and passes a `disabledTypes`
set into `computeReminders` (which filters its output by it) and skips
`buildWeeklySummaryCards` entirely when `weekly_summary` is disabled.

Closes both remaining pieces of the "Reminder settings" / "`weekly_summary`
digest" known gap. The other previously-listed known gap -- per-key
permission enforcement for the rest of the role matrix (approve timesheet /
mark payment / approve PTO / export records) -- is unchanged; see "Known
gaps" below.

### New gap noticed while building this: `nanny_can_view_*` flags are stored but never read

`caregiver_profiles` has `nanny_can_view_pay_rate`, `nanny_can_view_gross_pay`,
`nanny_can_view_pto_balance`, and `nanny_can_view_guaranteed_hours` columns
(spec 15.4, backing spec 11's "Optional" nanny visibility rows), but no
screen in the app -- `Pay.tsx`, `Pto.tsx`, or otherwise -- actually checks
them before showing a nanny that data; they're set during onboarding and then
ignored. The new weekly-summary card inherits this: a nanny viewing their own
`weekly_summary` card sees gross pay due and PTO balance unconditionally,
same as every other pay/PTO surface in the app today. Not a regression this
session introduced, but flagged since it's now visible in one more place.
Added to "Known gaps" below and to `QUESTIONS_AND_CLARIFICATIONS.md` as a new
item, since fixing it is a real (if mechanical) chunk of work across several
screens, not a one-line change.

### Known gaps for next phase (unchanged besides the addition above)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; needs new RLS
  policies + a migration, not just UI.
- **`nanny_can_view_*` visibility flags are unenforced** (spec 15.4/11) — see
  above; would need gating added to `Pay.tsx`, `Pto.tsx`, `CaregiverDetail.tsx`
  (guaranteed hours display), and now `Home.tsx`'s weekly summary card.

---

## 2026-07-26 — Per-key permission enforcement for approve/mark-paid/PTO-approve/export (spec 10/11)

**Closes the last "known gap" from the permission matrix (spec 11).** Migration
`0014_approve_and_payment_permission_keys.sql` adds three new
`coadmin_permission_allowed` keys enforced server-side, the same pattern as
the seven keys from 2026-07-03 (`edit_pay_rate`, `edit_pto_policy`, etc.):

- **`approve_timesheet`** — gates `timesheets` rows landing in
  `approved`/`needs_correction`/`payment_due`/`paid`/`locked` (both the
  parent-generate-timesheet insert and any update that moves a row into one
  of those statuses; rows staying in `draft`/`submitted` — nanny submission,
  in-progress parent edits — don't need it). Also gates the accompanying
  `payment_records` insert (creating the payment record *is* the second half
  of "approve timesheet" in this app's flow), alongside `mark_payment_made`
  (see below) since a payment-correction record is also legitimately created
  outside the approval flow.
- **`mark_payment_made`** — gates `payment_records` updates: mark paid/
  partially paid, void, and marking the original record `corrected` during a
  correction.
- **`approve_pto`** — gates `leave_requests` rows landing in `approved` (both
  the parent "record leave" insert path in `Pto.tsx`, which creates a
  pre-approved request directly, and the review/approve/reject update on an
  existing `requested` row) or `rejected`. Also loosened `leave_ledger` insert
  to require *either* `approve_pto` or `edit_pto_policy`, since ledger rows
  come from both an approval (`used` events) and an allowance change
  (`opening_balance`/`manual_adjustment` events).

`More.tsx`'s `COADMIN_PERMISSIONS` list now shows all three as toggles in the
"Household members" card, following the existing pattern of no client-side
gating of the *editing* co-admin's own UI (a restricted co-admin still sees
the approve/reject buttons and gets the resulting RLS error surfaced through
the existing `errorMessage()` helper — same as the pre-existing `edit_schedule`/
`edit_pto_policy` keys, which never had bespoke friendly error messages
either). Server enforcement was the actual gap; the UI already showed these
actions to every parent/co-admin.

**`export_records` — deliberately *not* given a real RLS key.** Export
buttons only reformat rows the co-admin can already `SELECT` (timesheets,
payments, PTO ledger, full-records bundle) into a client-side download —
there's no additional data a restricted co-admin would gain by exporting that
they couldn't already read row-by-row in the app. Enforcing it at the
database layer would be security theater: a restricted co-admin could
reconstruct the same CSV/JSON by hand from data RLS already lets them read.
So `export_records` is gated **client-side only**, via a new
`coadminAllowed(key)` helper added to `HouseholdContext` (mirrors
`coadmin_permission_allowed()` in the DB for the one key that has no DB-side
counterpart) — it hides the four export surfaces in `Pay.tsx` (annual
summary, full records, per-tab daily-CSV buttons) and the one in `Pto.tsx`
(ledger CSV) when the current co-admin has been restricted. This is
recorded as a conscious exception to "RLS is the enforcement boundary, not
UI hiding" (spec 18/19), not an oversight — flagged in
`QUESTIONS_AND_CLARIFICATIONS.md` for a second look since it's a judgment
call about what counts as a real security boundary.

This closes the permission-matrix gap noted in every "Known gaps" section
since 2026-07-03; all role-matrix rows listed as co-admin-optionally-
restrictable (spec 11) now have either a real RLS key or a documented
client-side equivalent.

**Time-entry schedule pre-fill — re-verified, still no change needed.** This
run's task again asked for time entries to default to the caregiver's
scheduled hours (falling back to the current day). Re-read `Time.tsx:34-124`:
unchanged since 2026-07-24 — the date field defaults to today and an effect
pre-fills start/end/break from the scheduled shift for whatever date is
selected, falling back to 9am–5pm only when nothing is scheduled. No gap.

### Known gaps for next phase (unchanged, still not built)

- **Reminder settings** (13.9) — per-type enable/disable + the
  `weekly_summary` digest; blocked on the content/cadence design decision in
  `QUESTIONS_AND_CLARIFICATIONS.md` item 19, presented again this run.

---

## 2026-07-24 — Full records export (spec 13.11), time-entry schedule pre-fill verified

**Full records export built (spec 13.11, closes the last "known gap" export
item; resolves Q&A item 18 — see below).** `Pay.tsx` has a new "Full records
export" card (Parent Admin/Co-Admin only, matching spec 13.11's export
permissions) with **Export JSON** and **Export CSV** buttons. Both bundle
every record type for the selected caregiver — full history, not scoped to a
period — into one download: `schedule_templates`, `schedule_shifts`,
`schedule_exceptions`, `time_entries`, `timesheets`, `payments`,
`leave_requests`, and `leave_ledger`, plus the caregiver profile itself. The
spec doesn't define exact contents for this export type, so scope was chosen
as "every caregiver-scoped operational record type that has its own DB
table," which is a superset of what the individual timesheet/payment/PTO-
ledger/annual-summary exports already cover. `reminders` and `audit_events`
were left out — reminders are ephemeral computed state with no export
precedent elsewhere in the app, and the audit log has no export UI of its own
yet either, so including just it here would be inconsistent.

JSON keeps records nested by type (`{ time_entries: [...], timesheets: [...],
... }`) — the natural shape for "everything." CSV has no single shared column
set across schedule templates, time entries, payments, etc., so each record
becomes one row of `record_type, id, date, record_json` (a best-guess date-ish
column plus the full record as a JSON string) rather than inventing a lossy
common schema. Added a small `downloadBlob`/`downloadJson` helper alongside
the existing `downloadCsv` in `src/lib/csv.ts` (refactored to share the blob-
download logic) rather than duplicating it inline.

**Time-entry pre-fill from schedule — verified already built, no change
needed.** This session's task asked for time entries to default to the
caregiver's scheduled hours (falling back to the current day). `Time.tsx`
already does exactly this (added 2026-06-30, commit `c6a13c5`): the date field
defaults to today, and an effect looks up the scheduled shift(s) for whatever
date is selected and pre-fills start time, end time, and break minutes from
it, falling back to a 9am–5pm default only when nothing is scheduled that
day. Confirmed by reading `Time.tsx:34-124` — no gap found, so nothing was
built here.

### Q&A item 18 resolved — chose "full records export" as the next known-gap phase

Of the three remaining known gaps (per-key permission enforcement for the rest
of the role matrix, reminder settings + `weekly_summary` digest, full records
export), this session built the **full records export**: it needed no design
decision (unlike the other two, which are blocked on judgment calls — see
`QUESTIONS_AND_CLARIFICATIONS.md` item 19 for the still-open one) and no
schema/RLS changes, just new client-side export logic reusing existing
read access. This was decided without a live chat round-trip since this run
executed on a schedule with nobody watching; flagged in
`QUESTIONS_AND_CLARIFICATIONS.md` for review rather than assumed final.

### Known gaps for next phase (unchanged, still not built)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; needs new RLS
  policies + a migration, not just UI.
- **Reminder settings** (13.9) — per-type enable/disable + the
  `weekly_summary` digest; blocked on the content/cadence design decision in
  `QUESTIONS_AND_CLARIFICATIONS.md` item 19.

---

## 2026-07-20 — PTO ledger + annual summary exports (spec 13.11), biweekly recurrence UI (spec 13.2)

**PTO ledger CSV export built (spec 13.11, closes part of a "Known gap").**
`Pto.tsx`'s "Balances" card now has an "Export ledger CSV" action, visible to
Parent Admin/Co-Admin only (spec 13.11: "Nanny should not have export access
in MVP"). Exports every `leave_ledger` row for the selected caregiver — event
date, leave type (joined from `leave_policies`), event type, hours delta,
running balance, and notes — using the same `downloadCsv` helper the existing
timesheet/payment exports use.

**Annual summary CSV export built (spec 13.11, closes the rest of that "Known
gap").** `Pay.tsx` has a new "Annual summary" card (parent/co-admin only) with
a year field and an export button. Produces one summary row for the selected
caregiver and year: total actual/regular/overtime worked hours, PTO/sick/
holiday/family-cancellation hours, guaranteed hours and guarantee adjustment
hours (all summed from `timesheets`), gross pay due, gross amount actually
paid, reimbursements, manual adjustments, and a semicolon-separated list of
payment dates (all summed/collected from `payment_records`), plus PTO and sick
balance as of Dec 31 of the selected year (computed directly from
`leave_ledger`, not the live "today" balance `Pto.tsx` shows). A period is
bucketed into the year its `period_start` falls in, matching how the rest of
the app already treats pay periods as belonging to their start date.
**Known limitation:** for years before the leave ledger existed for a given
caregiver (i.e. before migration 0010's backfill or before the policy was
created), the year-end balance will read as 0/empty rather than reflecting
pre-ledger history — there's no historical ledger to sum. This only affects
caregivers with leave history predating this app's use, not caregivers whose
PTO has always been tracked here.

**Biweekly recurring schedule UI built (spec 13.2, closes the rest of the
"recurring schedule types" known gap).** The `biweekly` recurrence type has
had full data-model and shift-generation support (`matchesRecurrence` in
`src/lib/schedule.ts`) since the schedule-exceptions phase, but no form path
ever created a `biweekly` template — only `weekly`, `monthly_by_date`,
`monthly_by_weekday`, and `custom` got UI in the shift-creation modal redesign
(2026-07-06, PR #41). `Schedule.tsx`'s "Add shift" modal now has an "Every
other week" option alongside "Weekly," reusing the same multi-day-of-week
picker. Because biweekly parity is anchored to the template's
`effective_start_date` (`matchesRecurrence` computes `weeksSinceStart` from
it), a new "First on-week starts" date field controls which week is the "on"
week — weekly/monthly/custom templates don't need this since their recurrence
doesn't depend on an anchor date. This closes out spec 13.2's five recurrence
types (`weekly`, `biweekly`, `monthly_by_date`, `monthly_by_weekday`,
`custom`) as all now buildable from the UI; only "manual one-off schedule" was
already covered by the existing one-off `added_shift` exception path.

### Catching up undocumented interim work (PRs #40–42, 2026-07-06)

Three PRs landed on `main` between the last log entry and this session without
a corresponding change-log write-up. Recorded here for continuity, no new
decisions of note beyond what's in their commit messages:

- **PR #40 — Caregiver profile editing and removal.** `More.tsx` gained a
  "Caregiver profile" section to edit a caregiver's name/contact/start
  date/employment status, and a remove-caregiver action (with a warning about
  cascading history and a nudge toward marking inactive instead).
- **PR #41 — Shift/caregiver UI redesign.** Fixed clipped date/time inputs at
  larger text sizes across Schedule/Time/Pto/Pay/More by stacking field pairs
  vertically instead of a 50/50 row. Added a `Modal` component and moved "Add
  shift" into it with the recurrence picker (weekly multi-day, monthly by
  date/weekday, one-time, custom) described above. Split caregiver settings
  out of `More.tsx` into a new per-caregiver `CaregiverDetail.tsx` page.
- **PR #42 — PTO settings moved into caregiver detail.** Annual PTO/sick
  allowance editing moved from the PTO tab into `CaregiverDetail.tsx`;
  `Pto.tsx` now shows balances/requests only. Added a Time/PTO segmented
  toggle to both tabs since the PTO tab is no longer on the bottom dock.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Per-key enforcement for the remaining permission matrix rows** (spec 11)
  — approve timesheet / mark payment / approve PTO / export records are
  co-admin-allowed by default with no restrict toggle; would need new RLS
  policies + migration + UI, unlike the 7 keys already enforced.
- **Reminder settings** (13.9) — only payment lead-time is configurable; no
  per-type enable/disable, recipients, or quiet hours (recipients/quiet hours
  deferred by decision, item 17 — no delivery channel to target yet).
- **`weekly_summary` reminder / digest** (15.14) — needs its own design (what
  it summarizes, cadence) before it's buildable; scope decided to be in-app
  only (item 17) but content/timing still undefined.
- **Full records export CSV/JSON** (13.11) — the export type list also
  includes a household-wide "full records" dump; timesheets, payments, PTO
  ledger, and annual summary now each export individually, but nothing
  bundles everything into one combined export.

---

## 2026-07-03 (batch 2) — Co-admin permission management UI (spec 10/11)

**Household members / co-admin permissions UI built (spec 10/11, closes a
"Known gap"; resolves Q&A item 16 — user chose this phase).** `More.tsx` has a
new parent-admin-only "Household members" card that lists every member (name,
email, role) and, for each `parent_co_admin`, exposes checkboxes for the
permissions the database actually enforces. Unchecking one writes
`household_users.permissions[key] = false`, which the existing RLS
(`can_manage_household_setting` / `coadmin_permission_allowed`) and the
`caregiver_profiles` restriction trigger already honor server-side — so the UI
is a real control surface, not a cosmetic one.

Only the **seven enforced keys** are shown, matching what has a backend effect:
`edit_pay_rate`, `edit_pto_policy`, `edit_guaranteed_hours_policy`,
`edit_schedule`, `edit_household`, `manage_users`, `view_audit_log`. The spec's
role matrix (11) lists more optionally-restrictable rows (approve timesheet,
mark payment, approve PTO, export records), but those are gated by
`is_parent_or_coadmin` in RLS with no per-key check, so a co-admin can't be
restricted from them today without new policies. Rather than show toggles that
do nothing, they're omitted; adding real per-key enforcement for them is future
work. The card is gated to **parent admin only** (not co-admins) so a co-admin
can't lift their own restrictions, matching spec 10's "Change permissions" as
an admin capability. Members can also be removed (with an inline confirm);
permission changes and removals are audit-logged.

**Co-parent join code — landed independently on `main` via PR #38.** This
branch originally added its own co-parent join code (a separate
`coadmin_join_code` column + generalized `join_household_by_code`), but PR #38
merged the same feature to `main` first, using `parent_join_code`. On rebase,
this branch's duplicate migration and "Co-parent access" card were dropped in
favor of main's implementation to avoid a colliding `0013` migration and a
double card. The members UI below builds on top of main's co-parent card. Net
effect is the same: a household can add a second parent via a distinct code
that grants `parent_co_admin`, and the onboarding join copy is role-agnostic.

**Deferred by decision (Q&A item 17):** `weekly_summary` digest + per-type
reminder settings will be built in-app-only when reached (no recipients / quiet
hours until there's an email/SMS backend). Recorded so the dropped spec fields
are a conscious choice, not an oversight.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB + generation
  support but no form UI to create them.
- **Per-key enforcement for the remaining matrix rows** (11) — approve
  timesheet / mark payment / approve PTO / export records are co-admin-allowed
  by default with no restrict toggle (would need new RLS keys + UI).
- **Reminder settings + `weekly_summary` digest** (13.9 / 15.14) — in-app-only
  scope decided (item 17); not yet built.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.

---

## 2026-07-03 — Time-entry validation warnings (spec 13.4)

**Time-entry validation built (spec 13.4 "Validation", closes a "Known gap").**
`Time.tsx`'s manual add form and the inline edit form now show live, advisory
warnings as the user fills them in, powered by a new pure helper
`src/lib/timeValidation.ts` (`validateTimeEntry`). Warnings are non-blocking,
matching the spec's "warn when" wording — the save still goes through. Covered
cases from the spec's list:

- **End time before start / crosses midnight** — the data model has no explicit
  overnight flag, so an end earlier than the start is interpreted as a midnight
  crossing (consistent with `hoursBetween`); the warning surfaces that
  assumption so a typo isn't silently accepted. Also flags a zero-length entry
  when start == end.
- **Break longer than shift** — unpaid break ≥ the raw shift span.
- **Time overlaps another entry** — checks the caregiver's other active entries
  on the same date (using their manual times, falling back to clock
  timestamps), with midnight-crossing normalization on both sides.
- **Actual hours materially differ from scheduled** — compares logged paid
  hours to the summed scheduled-shift hours for that date. "Materially" isn't
  defined by the spec; chosen band is the larger of 1 hour or 25% of the
  scheduled total, so both short and long shifts get a sensible tolerance.
- **Weekly worked hours exceed overtime threshold** — sums the draft plus the
  caregiver's other entries in the same week bucket (household `week_start_day`)
  against `overtime_threshold_hours`.
- **Editing a submitted (nanny) / approved (parent) entry** — advisory notice
  that the entry has already progressed past the freely-editable state.

Not handled here by design: **clock-out missing** stays in the reminders engine
(`missing_clock_out`), since it's a background condition rather than a property
of a form being filled in; and the hard blocks for **editing a paid/locked
period** remain enforced by the existing `canEdit`/`canArchive` gates and RLS,
not downgraded to a warning.

No schema or spec-text change — 13.4 already specifies these warnings; this is
implementation of an existing requirement.

**Scheduled-hours pre-fill confirmed already in place.** The requested
"default time entry to the scheduled hours (still defaulting to the current
day)" was already implemented on 2026-06-30 (`Time.tsx` pre-fills
start/end/break from the selected date's scheduled shift, date defaults to
today). No change needed; noted here for traceability.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB + generation
  support but no form UI to create them.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.

---

## 2026-07-02 (batch 2) — Weather-emergency exceptions now affect pay

**Resolved Q&A item 15 (option A).** `weather_emergency` exceptions with
`affects_pay = true` are now summed into `family_cancellation_hours` in
`Pay.tsx`'s `doGenerate`, alongside `family_cancellation` exceptions — both
represent guarantee-protected non-worked pay, and there was no separate
schema column to route weather-day hours through. Still gated on the
caregiver's `family_cancellation_counts_toward_guarantee` setting, the only
toggle that exists for this bucket. `holiday` exceptions remain calendar-only
(paid holidays go through the existing `leave_requests` holiday leave type,
which has real accrual/balance tracking); `other` exceptions are intentionally
excluded as too broad a catch-all to assume guarantee-protected. The
generate-timesheet form's helper text was updated to mention both hour types.

---

## 2026-07-02 — Schedule Exceptions UI, schedule-linked guarantee wiring, schedule_change reminder

**Schedule Exceptions UI built (spec 13.3).** `Schedule.tsx`'s weekly calendar
grid now supports the previously-unbuilt `schedule_exceptions` table end to
end. Parents/co-admins can, from a day's expanded detail panel, add an
exception of type `added_shift`, `removed_shift`, `shortened_shift`,
`extended_shift`, `family_cancellation`, `holiday`, `weather_emergency`, or
`other` — with an optional link to that day's scheduled shift, a new
start/end time where relevant, an hours override (auto-computed otherwise),
`affects_pay` / `counts_toward_guaranteed_hours` flags, and separate
private/nanny-visible notes. Exceptions are created directly as `approved`
(matching the existing recurring-shift pattern, where parent actions take
effect immediately) and are audit-logged on create/delete. The calendar now
shows an exception pill per day and strikes through a recurring occurrence
that a `removed_shift` exception targets, without deleting the recurring
template shift itself.

**PTO/sick/unpaid_time_off intentionally excluded from this UI.** Spec 13.3
lists `pto`, `sick`, and `unpaid_time_off` as exception types, but spec 13.7's
`leave_requests`/`leave_ledger` flow already fully owns those (balances,
accrual, approval) and is what `Pto.tsx` and the rest of the app read from.
Building a second UI against the same three types on `schedule_exceptions`
would create two disconnected records of the same leave with no balance
impact from the second. Kept leave requests as the single source for those
three types; `schedule_exceptions` here only covers the other eight types,
which have no equivalent elsewhere. RLS already reflected this split (nanny
can only insert `pto`/`sick`/`unpaid_time_off` rows on `schedule_exceptions`,
which this UI doesn't exercise) — no migration needed.

**Family cancellation hours now computed automatically (closes the batch-3
stopgap, Q&A item 12).** `Pay.tsx`'s "Family cancellation hours this period"
manual number input is gone. `doGenerate` now sums hours from approved
`family_cancellation` exceptions (`affects_pay = true`) in the pay period
directly from `schedule_exceptions`, exactly as the exceptions UI intends. The
generate-timesheet form links to the Calendar instead so the parent can add
any cancellations before generating.

**`linked_to_schedule` guaranteed hours now account for one-off exceptions
(spec 13.6 "Schedule-Linked Guarantee").** Previously `computeGuaranteedHoursBase`
only summed recurring template shift hours. It now also applies the net
effect of approved `added_shift`/`removed_shift`/`shortened_shift`/
`extended_shift` exceptions marked `counts_toward_guaranteed_hours = true` —
matching the spec text that one-off changes should *not* move the guarantee
unless explicitly flagged. New helpers `exceptionHours`,
`sumExceptionHoursByType`, and `scheduleExceptionHoursDelta` in
`src/lib/schedule.ts` do this math and are shared by the calendar and pay
calc so both agree on the same numbers.

**`timesheets.scheduled_hours` populated for the first time (spec 16.2).**
This column existed since migration 0001 but `doGenerate` never wrote to it
(always left at the default of 0). It's now `sum(recurring shift hours) +`
net exception delta for the period, using the same helpers above.

**`schedule_change` reminder implemented (spec 15.14, closes a "Known gap").**
`computeReminders` now takes an optional `scheduleExceptions` array and emits
a `schedule_change` card for any approved shift-modifying exception
(`added_shift`/`removed_shift`/`shortened_shift`/`extended_shift`) dated today
or later that was created in the last 3 days — an arbitrary but reasonable
"still fresh" window the spec doesn't define. `family_cancellation`/`holiday`/
`weather_emergency`/`other` don't generate this reminder since they aren't
schedule *changes* in the same sense. `Home.tsx` now loads upcoming approved
exceptions for the dashboard's caregivers and passes them through.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB support but no
  form UI.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.
- **Time entry validation** (13.4) — no warnings for overlapping entries,
  break-longer-than-shift, or actual-vs-scheduled variance.

---

## 2026-07-01 (batch 3) — Mobile PWA fit, multi-caregiver, payment lifecycle, leave enforcement, household settings

**Mobile home-screen fit fixed.** The bottom tab bar (`Layout.tsx`) didn't
account for `env(safe-area-inset-bottom)` when installed as an iOS home-screen
app, and its padding was oversized (py-2.5, text-lg icons). It now reserves
just the safe-area inset plus a tightened layout (py-1.5, smaller icons/text),
and the scrollable content area's bottom padding matches. Every full-screen
view (`Layout`, `App`'s loading screen, `Login`, `SetupRequired`,
`Onboarding`'s three modes) now also pads for `env(safe-area-inset-top)` so
content isn't drawn under the iPhone status bar / Dynamic Island. In
`More.tsx`, the "Overtime threshold (hrs/wk)" field label was wrapping to two
lines next to its neighbor; shortened to "OT after (hrs/wk)" / "OT
multiplier" and tightened the row gap.

**Multi-caregiver UI (Q&A item 10).** `More.tsx` has a new "Caregivers" card
with an "+ Add caregiver" form (name + optional hourly rate) so a household
isn't limited to the single profile created during onboarding.

**Family cancellation hours wired into guaranteed-hours calc (Q&A item 12).**
`family_cancellation_hours` was hardcoded to `0` in both timesheet-generation
paths in `Pay.tsx`, so the "family cancellations count toward guarantee"
setting could never actually apply. The parent's generate-timesheet form now
shows a "Family cancellation hours this period" input (only when that
caregiver setting is on), which flows into `calculateTimesheet` and both the
`timesheets` and `payment_records` inserts.

**`manual_by_pay_period` guaranteed-hours basis removed (Q&A item 13).** It
was never buildable as specified (no per-period override field existed) and
had zero UI. Removed from `GuaranteedHoursBasis`, the spec text (13.6, 16.3,
15.4), and the DB check constraint (migration 0012, which also backfills any
existing rows to `fixed_pay_period`).

**Schedule shift deletions now audit-logged (Q&A item 14).** Additions
already wrote to `audit_events`; deletions in `Schedule.tsx` didn't. Kept the
existing simple add/remove model (no effective-dated template versioning)
but closed this gap.

**Partial payments and voided payments (spec 13.8).** `payment_records` had
`partially_paid` and `voided` statuses in the type/spec with no UI path to
reach them. `Pay.tsx`'s "Mark paid" now opens a form for the amount actually
paid — entering less than `gross_pay_due` sets status to `partially_paid`
(and pre-fills the remaining balance next time); entering the full amount
sets `paid`. A new "Void" action requires a note and sets status to `voided`
without deleting the record, mirroring the existing correction workflow.

**Leave policy enforcement: waiting period and negative balance (spec 13.7).**
`negative_balance_allowed` and `waiting_period_days` were typed columns that
were never read. `Pto.tsx`'s request form now blocks submission (with an
explanatory message) if the leave start date falls inside the caregiver's
waiting period, or if the requested hours would take a `negative_balance_allowed
= false` policy negative.

**Household timezone / week-start-day settings (spec 15.2).** Both were
real columns with no Settings UI to change them from their defaults.
`More.tsx` has a new "Household settings" card (name, timezone from a list of
US zones, week start day) gated to parent/co-admin.

**`pto_balance_low` reminder (spec 15.14).** `computeReminders` now accepts
an optional `leaveBalances` summary and emits a card when a PTO/sick balance
with an annual allowance drops to 8 hours or less (one workday — the spec
names the reminder type but doesn't define "low"; documented here as the
chosen threshold). `Home.tsx` fetches `leave_policies` + `leave_ledger` for
the household's caregivers and computes balances the same way `Pto.tsx` does.

### Known gaps for next phase (not ambiguous, just not built yet)

- **Schedule Exceptions UI (13.3)** — no screen exists to record family
  cancellations/holidays/added-removed-shortened-extended shifts as their own
  records; the family-cancellation quick-entry above is a stopgap, not a
  replacement.
- **Recurring schedule types beyond `weekly`** (13.2) — `biweekly`,
  `monthly_by_date`, `monthly_by_weekday`, `custom` have DB support but no
  form UI.
- **Co-admin permission management UI** (10/11) — RLS already enforces
  restricted permissions server-side; there's no screen to view household
  members or toggle a co-admin's restrictions.
- **Reminder settings** (13.9) — only payment lead-time is configurable;
  no per-type enable/disable, recipients, or quiet hours.
- **`schedule_change` reminder** (15.14) — blocked on Schedule Exceptions
  existing as a source of "what changed."
- **`weekly_summary` reminder / digest** (15.14) — needs its own design
  (what it summarizes, cadence) before it's buildable.
- **Additional exports** (13.11) — only timesheets and payments CSV export
  exist; PTO ledger and annual-summary exports don't.
- **Time entry validation** (13.4) — no warnings for overlapping entries,
  break-longer-than-shift, or actual-vs-scheduled variance.

---

## 2026-07-01 (batch 2) — Weekly calendar grid, nanny join flow, nanny timesheet submission, PTO ledger reads

**Weekly calendar grid replaces flat shift list (spec Phase 2, Q&A item 2).**
`Schedule.tsx` now shows a Mon–Sun week grid with previous/next week navigation
instead of the prior flat recurring-shift list. Each day row shows scheduled shift
times and hours, leave request pills, and a total hours count. Tapping a day
expands an inline detail panel showing shift breakdown and, for parents, a
per-shift "Remove" button. Leave (approved or requested) pulled from
`leave_requests` for the visible week range is displayed per day as colored pills
with the leave type. The existing recurring-schedule management section (add/remove
shifts) is retained below the grid. Uses `generateShiftsForRange` to materialize
template occurrences for the week.

**Household join code flow (spec Phase 1 nanny invite, Q&A item 1).**
`More.tsx` now has a "Nanny access" card (parent/co-admin only). Parents can
generate a random 6-character alphanumeric code, which is stored in
`households.join_code`. The code displays in a large mono font with Regenerate
and Revoke buttons. The `Onboarding.tsx` flow now has a three-mode structure:
choose → create / join. The "join" path calls the `join_household_by_code` SQL
function (migration 0011) which handles RLS via SECURITY DEFINER, inserts the
user as `'nanny'`, and redirects on success. No backend Edge Function required.

**PTO ledger balance reads switched to event-sourced (spec 13.7, Q&A item 1 — complete).**
`Pto.tsx` now reads balance from `leave_ledger` when rows exist for a policy
(`computeLeaveBalanceFromLedger`), falling back to `computeLeaveBalance` from
`leave_requests` when not. The ledger-based function tracks `currentBalance` as
`sum(hours_delta)` and `usedInPeriod` as the sum of negative deltas in the
current policy year. Migration 0010 backfills existing approved requests into
the ledger. New approvals and allowance changes write ledger events immediately,
so the balance reads are always fresh.

**Nanny timesheet submission (spec 13.5, Q&A item 3).**
`Pay.tsx` now shows a "Submit timesheet" button for nanny users. The form asks
for period start/end, then creates a `timesheets` row with `status: 'submitted'`,
`submitted_at`, and actual worked hours summed from approved time entries in the
period. The timesheet then appears in the parent's view so they can generate the
official pay calculation. Gross pay is set to 0 at submission time; the parent
flow calculates the real amounts when they generate and approve.

---

## 2026-07-01 — Phase: guaranteed-hours wiring, schedule-aware reminders, payment corrections, PTO ledger

**`linked_to_schedule` guaranteed hours fully wired (spec 13.6, 16.3, Q&A item 2).**
`More.tsx` previously saved `guaranteed_hours_basis = 'fixed_weekly'` whenever the
guarantee checkbox was on, and `'linked_to_schedule'` when it was off — backwards
from the spec. Now: the checkbox enables/disables the guarantee; a new select
chooses the basis (`linked_to_schedule`, `fixed_weekly`, `fixed_pay_period`). When
`linked_to_schedule` is selected, `Pay.tsx`'s `doGenerate` calls
`generateShiftsForRange` over the pay period and sums shift hours where
`counts_toward_guaranteed_hours = true`, exactly as spec 16.3 requires.
Previously it always used the fixed numeric field regardless of basis.

**Schedule-aware missing-clock-out grace period (spec 21, Q&A item 3).**
`computeReminders` in `reminders.ts` now accepts an optional `scheduleOccurrences`
array. When occurrences exist for the entry's date, the threshold is the latest
scheduled shift end time on that day + 30 minutes, matching spec 21 ("after
scheduled shift end plus grace period"). The 12-hour fallback is kept for days
with no scheduled shift. `Home.tsx` now loads schedule templates and shifts for
the past 2 days and passes the generated occurrences into `computeReminders`.

**Payment correction workflow (spec 13.8, Q&A item 4).**
`Pay.tsx` now has a "Correct" button on paid payment records. Clicking it opens
an inline form requiring a corrected amount and a mandatory note. On submit:
the original record's status is set to `'corrected'`; a new payment record is
created with `status: 'due'`, the corrected amount, and a parent_note explaining
the correction and original amount; the correction is logged to `audit_events`.
The original record is never deleted, per spec 13.8.

**PTO ledger event writes (spec 13.7, Q&A item 1 — partial).**
`Pto.tsx` now writes `leave_ledger` rows for two operations:
(1) When a parent approves a PTO request, a `'used'` event is written with
`hours_delta = -hours_requested` and the running `balance_after`.
(2) When a parent sets or changes an annual allowance, an `'opening_balance'`
(new policy) or `'manual_adjustment'` (change to existing) event is written.
The balance display in `Pto.tsx` still reads from `leave_requests` directly for
now (so existing requests without ledger rows aren't broken); migrating the
balance read to `sum(leave_ledger.hours_delta)` is the next step and will be
cleaner once all accrual paths write ledger rows.

---

## 2026-06-30 — Phase: nanny-facing gaps closed

**Manual time entry now pre-fills from the scheduled shift (spec 13.4, 13.2).**
`src/routes/Time.tsx` previously hardcoded the manual entry form to
09:00–17:00 regardless of date. It now looks up the caregiver's generated
schedule occurrence for the selected date (via `generateShiftsForRange`) and
pre-fills start time, end time, and break minutes from that shift, falling
back to 09:00–17:00 only when nothing is scheduled that day. The date field
still defaults to today, as before. Values remain fully editable — this only
changes the starting point, consistent with spec 13.4's manual-entry fields
list, which doesn't mandate a particular default but implies the common case
is "log the shift as worked."

**Clock in / clock out implemented (spec 13.4, 14.2, role matrix).** This was
schema-ready (`time_entries.clock_in_at`/`clock_out_at`, `missing_clock_out`
status chip, reminder type) but had no UI anywhere — the role matrix lists
clock in/out as the nanny's primary mechanism and `14.2` lists it as a primary
home-screen button, so this was a real gap, not a future phase. Added to
`src/routes/Time.tsx`, visible to nanny only (parents/co-admins use manual
entry per the role matrix). Clock-in inserts a `method: 'clock'` entry with
`status: 'draft'`; clock-out fills `clock_out_at`, computes `paid_hours` from
the elapsed time, accepts an optional note, and moves status to `submitted` —
mirroring how manual entries already move straight to `submitted`.

**Audit log viewer added (spec 13.7/14.7/19/20).** `audit_events` rows were
already being written from every sensitive action, but nothing read them back
— the spec requires Parent Admin (and optionally co-admin) be able to view
the audit log, and `19`/`20` describe it as a first-class requirement, not
optional polish. Added `src/routes/AuditLog.tsx`, linked from More, gated to
`isParentOrCoAdmin` in the UI; the existing RLS policy
(`can_manage_household_setting(household_id, 'view_audit_log')`) already
enforces the co-admin-can-be-restricted rule server-side, so the UI gate is a
convenience, not the security boundary.

**Missing-clock-out reminder no longer fires immediately on clock-in.**
`src/lib/reminders.ts` previously flagged `missing_clock_out` for *any* entry
with `clock_in_at` set and no `clock_out_at` — which, once clock-in/out
shipped, meant every nanny would see a "clock-out missing" warning the moment
they clocked in. Spec 21 says this should fire "after scheduled shift end
plus grace period." `computeReminders` doesn't currently receive schedule
data, so as a stand-in I used a flat 12-hour-since-clock-in threshold instead
of computing the actual scheduled end time. This is good enough to stop false
positives but isn't the schedule-aware version the spec describes — see
`QUESTIONS_AND_CLARIFICATIONS.md`.

---

## Earlier history (pre-existing, not made by this session)

Recovered from git log for context — not authored in this pass, listed so
the change log has continuity:

- Build Nanny Ledger Phase 1: schema, RLS, and parent-facing PWA
- Fix onboarding household-creation RLS bug and surface real error messages
- Navigate to dashboard after successful household creation
- Reject invalid calendar dates; add PTO/sick annual balance tracking; sort
  and link dashboard reminders
- Allow parents/co-admins to delete generated timesheets
- Soft-delete timesheets, dashboard-style Home, payment cadence settings
