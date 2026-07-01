# Nanny Time, PTO, Guaranteed Hours & Payment Tracker — Full Product Spec

## 1. Product Overview

Build a mobile-first web app / PWA that can be saved to an iPhone home screen and used by a household to manage nanny scheduling, actual hours worked, PTO, guaranteed hours, and payment recordkeeping.

The app should deploy through **GitHub Pages** as a static frontend connected to Supabase.

The app is **not** a payroll processor. It should not move money, file taxes, generate W-2s, calculate official tax withholding, or integrate with payment rails. It should be a lightweight operational ledger for:

* Recurring nanny schedule
* One-off schedule changes
* Time-in/time-out tracking
* Weekly timesheet submission and approval
* Planned PTO / sick time / unpaid time off
* PTO accrual and balance tracking
* Guaranteed hours calculations
* Payment due / payment made logging
* Reminders and audit history
* Nanny self-service access with limited permissions

Primary goal: create a simple, trustworthy source of truth for:

**What was scheduled → what was worked → what is owed → what was paid → how PTO changed**

---

## 2. Product Scope

### In Scope

* Mobile-first PWA
* GitHub Pages static deployment
* Supabase auth/database/RLS backend
* Parent/admin login
* Nanny login
* Role-based permissions
* Recurring schedule templates
* Schedule exceptions
* Clock in / clock out
* Manual time entry
* Weekly timesheets
* Parent approval workflow
* Guaranteed hours
* PTO / sick / unpaid leave tracking
* PTO accrual logic
* Payment due tracking
* Payment made logging
* In-app reminders/alerts
* Email reminders if implemented through Supabase Edge Functions or another secure backend service
* Exportable records
* Audit log

### Out of Scope

* Direct deposit
* Venmo/Zelle/payment integrations
* Payroll tax filing
* W-2 generation
* Official tax withholding calculation
* EIN registration
* State registration
* Workers’ comp management
* Background checks
* Contract generation
* Accountant role
* Multi-family nanny share
* Baby activity logging
* GPS tracking
* Geofencing
* In-app chat

---

## 3. Deployment Requirement: GitHub Pages

The app must be deployable to **GitHub Pages** as a static site.

### Hard Deployment Constraints

Because GitHub Pages is static hosting, the app must not rely on:

* Next.js API routes
* Server actions
* Server-side rendering
* Middleware that requires a server runtime
* Node-only backend code
* Runtime backend environment variables
* Any persistent server process after deployment

All app functionality must run as a static frontend using client-side calls to Supabase, except for optional backend jobs implemented separately through Supabase Edge Functions, Supabase scheduled functions, or another secure backend service.

### Preferred Architecture

Use:

* Vite
* React
* TypeScript
* Tailwind CSS
* Supabase
* GitHub Pages

This is preferred over Next.js because GitHub Pages is static-only and Vite is simpler for a static PWA.

### Acceptable Alternative

Next.js is acceptable only if configured for static export:

```js
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

Do not use any Next.js features that are incompatible with static export.

---

## 4. Recommended Tech Stack

Use this unless there is a strong reason not to.

* Frontend: Vite + React + TypeScript
* Styling: Tailwind CSS
* Backend/database/auth: Supabase
* Database: Postgres
* Auth: Supabase Auth
* Hosting: GitHub Pages
* Deployment: GitHub Actions
* Date/time handling: date-fns or Luxon
* Timezone: household-level timezone setting, default `America/New_York`
* PWA: manifest, service worker, installable home-screen app
* Optional email reminders: Supabase Edge Functions + Resend/Postmark

Important: do not expose private API keys in the frontend. Only use public Supabase anon keys in the browser. All sensitive backend work must be enforced through Supabase Row Level Security and/or Supabase Edge Functions.

---

## 5. GitHub Pages Configuration

The app should support deployment at either:

* A custom domain, e.g. `https://mydomain.com`
* A GitHub Pages project path, e.g. `https://username.github.io/repo-name`

### Vite Base Path

For a GitHub Pages project path, configure `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'REPLACE_WITH_REPO_NAME';

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
});
```

If using a custom domain, use:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
});
```

### Routing

Because GitHub Pages does not support server-side route fallback by default, use one of these approaches:

Preferred:

* Use hash-based routing, e.g. `/#/time`, `/#/calendar`, `/#/settings`

Alternative:

* Generate a `404.html` fallback that serves the SPA shell

For simplicity, use React Router with `HashRouter`.

---

## 6. Supabase Requirements

Use Supabase for:

* Auth
* Database
* Row Level Security
* Household/user permissions
* Storage if payment attachments are added later
* Optional Edge Functions for email reminders
* Optional scheduled functions for automated reminders

### Environment Variables

For Vite:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The Supabase anon key will be exposed in the frontend. Therefore:

* All data access security must be enforced through Supabase Row Level Security.
* Do not rely on client-side permission checks alone.
* Never expose service role keys in the frontend.
* Never expose email provider API keys in the frontend.

### Supabase Auth Redirect URLs

Configure Supabase Auth redirect URLs to include:

```text
http://localhost:5173/**
https://username.github.io/repo-name/**
https://customdomain.com/**
```

Auth callback must work entirely client-side.

---

## 7. GitHub Actions Deployment

Create:

```text
.github/workflows/deploy.yml
```

Use this workflow for Vite:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build static site
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Package Scripts

Use:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  }
}
```

---

## 8. PWA Requirement

The app must be installable to the iPhone home screen.

Include:

* `manifest.json`
* App icons
* Apple touch icon
* Theme color
* Mobile viewport settings
* Service worker if appropriate
* Offline-friendly shell if practical

The app should work correctly from the GitHub Pages URL and respect the configured base path.

Suggested app metadata:

```json
{
  "name": "Nanny Ledger",
  "short_name": "Nanny",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 9. Backend / Reminder Constraint

Because GitHub Pages cannot run backend jobs, any automated reminders must be handled one of three ways:

### MVP Option

Use in-app reminder cards only.

Examples:

* Payment due
* Payment overdue
* Missing timesheet
* Missing clock-out
* Pending PTO request

These are calculated client-side when the user opens the app.

### Better Option

Use Supabase scheduled functions or Supabase Edge Functions to send reminder emails.

### Do Not Do This

Do not call Resend, Postmark, Twilio, or any email/SMS provider directly from the frontend, because that would expose private API keys.

---

## 10. User Roles

### Parent Admin

Full access.

Can:

* Create/edit household
* Invite users
* Create/edit nanny profile
* Set pay rate
* Set pay frequency
* Set guaranteed hours rules
* Set PTO/sick accrual rules
* Create/edit recurring schedule
* Create/edit schedule exceptions
* View all time entries
* Edit time entries
* Approve/reject timesheets
* Approve/reject PTO requests
* Mark payments due/made
* Export records
* View audit log
* Change permissions

### Parent Co-Admin

Second parent / spouse role.

Default should be nearly identical to Parent Admin, except permissions can optionally restrict sensitive settings.

Can by default:

* View all records
* Create/edit schedule
* Approve timesheets
* Approve PTO
* Mark payments made
* Receive reminders

Can optionally be restricted from:

* Editing pay rate
* Editing PTO policy
* Editing guaranteed hours policy
* Inviting/removing users

### Nanny

Limited self-service role.

Can:

* View assigned schedule
* Clock in / clock out
* Manually enter time
* Edit draft time entries
* Submit weekly timesheet
* View approval status
* View parent comments on timesheets
* Request planned PTO
* Request sick time
* Request unpaid time off
* View approved PTO balance if enabled
* View payment due/payment made status
* View gross pay/payment details if enabled
* View guaranteed hours and guarantee adjustment if enabled

Cannot:

* Edit recurring schedule
* Edit pay rate
* Edit PTO accrual rules
* Edit starting PTO balance
* Edit guaranteed hours rules
* Approve timesheets
* Mark payments made
* Delete historical approved records
* View employer-only notes
* View audit log
* Change permissions

---

## 11. Role Permission Matrix

| Feature                        | Parent Admin | Parent Co-Admin |                                     Nanny |
| ------------------------------ | -----------: | --------------: | ----------------------------------------: |
| View schedule                  |          Yes |             Yes |                                       Yes |
| Edit recurring schedule        |          Yes |    Yes/Optional |                                        No |
| Add schedule exception         |          Yes |    Yes/Optional |                              Request only |
| Clock in/out                   |           No |              No |                                       Yes |
| Add manual time entry          |          Yes |    Yes/Optional |                                       Yes |
| Edit draft time entry          |          Yes |    Yes/Optional |                                       Yes |
| Edit submitted time entry      |          Yes |    Yes/Optional | Until approved or correction request only |
| Submit timesheet               |          Yes |             Yes |                                       Yes |
| Approve timesheet              |          Yes |    Yes/Optional |                                        No |
| Reject/request correction      |          Yes |    Yes/Optional |                                        No |
| View pay rate                  |          Yes |    Yes/Optional |                                  Optional |
| Edit pay rate                  |          Yes |        Optional |                                        No |
| View gross pay due             |          Yes |             Yes |                                  Optional |
| Mark payment made              |          Yes |    Yes/Optional |                                        No |
| View payment made              |          Yes |             Yes |                                       Yes |
| Request PTO                    |          Yes |             Yes |                                       Yes |
| Approve PTO                    |          Yes |    Yes/Optional |                                        No |
| View PTO balance               |          Yes |             Yes |                                  Optional |
| Edit PTO policy                |          Yes |        Optional |                                        No |
| Edit guaranteed hours settings |          Yes |        Optional |                                        No |
| View guaranteed hours          |          Yes |             Yes |                                  Optional |
| Export records                 |          Yes |        Optional |                                        No |
| View audit log                 |          Yes |        Optional |                                        No |
| Manage users                   |          Yes |        Optional |                                        No |

---

## 12. Core App Navigation

### Parent Navigation

Use bottom tabs on mobile:

1. Home
2. Time
3. Calendar
4. PTO
5. Pay
6. Settings

If six tabs are too many, use:

1. Home
2. Time
3. Calendar
4. Pay
5. More

Where More includes PTO, Settings, Exports, Audit Log.

### Nanny Navigation

Use bottom tabs:

1. Home
2. Time
3. PTO
4. Pay

---

## 13. Core Workflows

## 13.1 Initial Parent Setup

Parent Admin should complete an onboarding flow:

1. Create household
2. Set household timezone
3. Add nanny profile
4. Enter nanny start date
5. Enter pay rate
6. Choose pay frequency
7. Configure guaranteed hours
8. Configure PTO/sick policy
9. Create recurring schedule
10. Invite nanny, optional
11. Configure reminders

Parent can skip nanny invite and use parent-only mode initially.

---

## 13.2 Recurring Schedule

The app must support recurring schedules that carry forward.

### Schedule Recurrence Types

Support:

* Weekly
* Biweekly
* Monthly by date
* Monthly by weekday pattern
* Custom date range
* Manual one-off schedule

### Schedule Template Fields

Each recurring schedule template should include:

* Nanny/caregiver
* Name
* Recurrence type
* Recurrence rule
* Effective start date
* Optional effective end date
* Timezone
* Active/inactive
* Notes

### Shift Fields

Each shift should include:

* Day of week
* Start time
* End time
* Break minutes
* Paid break yes/no
* Counts toward guaranteed hours yes/no
* Paid if family cancels yes/no
* Default category: regular, holiday, special, occasional
* Notes

### Schedule Behavior

* Schedule templates should apply prospectively.
* Editing a schedule should not silently change historical approved timesheets.
* Parent should be able to end an existing schedule and start a new one as of an effective date.
* Schedule preview should show generated shifts before saving.

---

## 13.3 Schedule Exceptions

Schedule exceptions modify a specific day or shift without changing the recurring template.

### Exception Types

Support:

* Added shift
* Removed shift
* Shortened shift
* Extended shift
* Family cancellation
* Nanny PTO
* Sick time
* Unpaid time off
* Holiday
* Weather/emergency closure
* Other

### Exception Fields

* Date
* Type
* Original scheduled shift, if applicable
* New start time
* New end time
* Paid hours
* Affects pay yes/no
* Affects PTO yes/no
* Counts toward guaranteed hours yes/no
* Parent note
* Nanny visible note
* Status: draft, requested, approved, rejected, canceled
* Created by
* Approved by
* Created timestamp
* Updated timestamp

### Exception Behavior

* Nanny can request exceptions for PTO/sick/unpaid time.
* Parent approves or rejects.
* Approved exceptions should appear in calendar and timesheet.
* Exceptions should be reflected in guaranteed hours logic based on settings.

---

## 13.4 Time Tracking

The nanny should be able to log actual time worked.

### Entry Methods

Support two methods:

1. Clock in / clock out
2. Manual entry

### Clock In / Clock Out

Nanny can:

* Tap “Clock In”
* See active shift
* Tap “Clock Out”
* Add optional note

If nanny forgets to clock out:

* Show missing clock-out alert
* Allow manual correction
* Remind nanny and/or parent in-app

### Manual Time Entry

Nanny can manually enter:

* Date
* Start time
* End time
* Break minutes
* Note

Parent can also manually enter or correct time.

### Time Entry Fields

* Caregiver ID
* Date
* Scheduled shift ID, optional
* Clock in timestamp
* Clock out timestamp
* Manual start time
* Manual end time
* Break minutes
* Paid hours
* Entry method: clock, manual, parent adjustment, imported
* Status: draft, submitted, approved, rejected, corrected, locked
* Nanny note
* Parent note
* Created by
* Updated by
* Created timestamp
* Updated timestamp

### Validation

Warn when:

* Clock-out is missing
* End time is before start time
* Time overlaps another entry
* Shift crosses midnight
* Break is longer than shift
* Actual hours materially differ from scheduled hours
* Weekly worked hours exceed overtime threshold
* Nanny edits a submitted entry
* Parent edits an approved entry
* Parent attempts to edit a paid/locked period

---

## 13.5 Weekly Timesheets

The weekly timesheet is the main approval object.

### Timesheet Period

Default:

* Weekly
* Week starts Monday
* Week ends Sunday

Allow this to be configured.

### Timesheet Statuses

* Draft
* Submitted
* Needs correction
* Approved
* Payment due
* Paid
* Locked

### Nanny Workflow

1. Enters time daily.
2. Reviews weekly timesheet.
3. Submits timesheet.
4. Sees status.
5. Receives correction request if parent rejects.
6. Resubmits if needed.

### Parent Workflow

1. Reviews submitted timesheet.
2. Compares scheduled vs actual.
3. Reviews PTO/sick/unpaid exceptions.
4. Approves or requests correction.
5. Upon approval, app calculates payable hours and gross pay due.
6. Payment record is created or updated.
7. Parent marks payment made when payment is complete.

### Timesheet Display

Timesheet should show one row per day.

For each day:

* Date
* Scheduled hours
* Actual start/end
* Actual worked hours
* PTO hours
* Sick hours
* Unpaid time
* Family cancellation hours
* Notes
* Status

Timesheet footer should show:

* Actual worked hours
* PTO hours
* Sick hours
* Holiday hours
* Family cancellation hours
* Guaranteed hours
* Guarantee adjustment hours
* Payable regular hours
* Overtime hours
* Gross pay due
* Timesheet status

---

## 13.6 Guaranteed Hours

The app must support guaranteed hours so the nanny can be paid for a minimum number of hours even if actual worked hours are lower.

### Guaranteed Hours Settings

Parent Admin can configure:

* Guaranteed hours enabled yes/no
* Guaranteed hours basis:

  * Linked to recurring schedule
  * Fixed weekly guarantee
  * Fixed pay-period guarantee
* Guaranteed hours amount
* Whether PTO counts toward guaranteed hours
* Whether sick time counts toward guaranteed hours
* Whether holidays count toward guaranteed hours
* Whether family cancellations count toward guaranteed hours
* Whether nanny-requested unpaid time off reduces the guarantee
* Effective start date
* Optional end date
* Notes

### Recommended Default

Default behavior:

* Guaranteed hours enabled
* Guaranteed hours linked to active recurring schedule
* If scheduled hours are 24 hours/week, guaranteed hours are 24 hours/week
* If actual worked hours are 20, pay is still based on 24
* If actual worked hours are 28, pay is based on 28
* Family cancellations count toward guaranteed hours
* Nanny-requested unpaid time off reduces the guarantee unless manually overridden
* PTO/sick can be configured separately

### Guaranteed Hours Calculation

For each pay period:

`scheduled_guaranteed_hours = hours from active recurring schedule unless manually overridden`

`actual_paid_hours = worked_hours + paid_pto_hours + paid_sick_hours + paid_holiday_hours + paid_family_cancellation_hours`

`guarantee_adjustment_hours = max(guaranteed_hours - actual_paid_hours, 0)`

`payable_hours_before_overtime = actual_paid_hours + guarantee_adjustment_hours`

Important: guaranteed hours should not suppress overtime.

Overtime should be calculated based on actual worked hours, not merely guaranteed adjustment hours, unless the household manually changes the rule.

### Example 1

* Guaranteed hours: 30/week
* Actual worked hours: 26
* PTO/sick/holiday/family cancellation: 0
* Guarantee adjustment: 4
* Payable hours: 30

### Example 2

* Guaranteed hours: 30/week
* Actual worked hours: 43
* Guarantee adjustment: 0
* Payable hours: 43
* Regular hours: 40
* Overtime hours: 3

### Example 3

* Guaranteed hours: 30/week
* Actual worked hours: 24
* Parent cancels 6 hours
* Family cancellation counts toward guarantee
* Payable hours: 30

### Example 4

* Guaranteed hours: 30/week
* Actual worked hours: 24
* Nanny takes 6 unpaid hours off
* Unpaid time off reduces guarantee
* Payable hours: 24

### Schedule-Linked Guarantee

If guaranteed hours are linked to schedule:

* App derives guaranteed hours from active recurring schedule.
* Regular recurring shifts count toward guaranteed hours by default.
* One-off added shifts do not automatically increase guaranteed hours unless marked as guaranteed.
* One-off removed shifts do not automatically reduce guaranteed hours unless marked as unpaid/non-guaranteed.
* Future schedule template changes update future guaranteed hours only.
* Historical approved or paid periods should not recalculate automatically.

### Per-Shift Guaranteed Flag

Each scheduled shift should have:

* Counts toward guaranteed hours yes/no
* Paid if family canceled yes/no
* Counts toward overtime calculation yes/no

Default:

* Regular recurring shifts count toward guaranteed hours.
* Occasional added shifts do not count toward guaranteed hours unless selected.
* Worked hours always count toward overtime calculations.
* Guarantee adjustment hours do not count as actual worked overtime hours.

### Timesheet Display for Guaranteed Hours

Show guarantee as a separate line item.

Example:

| Category             | Hours |
| -------------------- | ----: |
| Actual worked        |  22.0 |
| Paid PTO             |   0.0 |
| Paid sick            |   0.0 |
| Family cancellation  |   0.0 |
| Guaranteed hours     |  30.0 |
| Guarantee adjustment |   8.0 |
| Payable hours        |  30.0 |

### Payment Record Impact

Payment records should include:

* Actual worked hours
* Guaranteed hours
* Guarantee adjustment hours
* Payable regular hours
* Overtime hours
* PTO/sick/holiday hours
* Gross pay due
* Manual override note, if applicable

### Permissions for Guaranteed Hours

Parent Admin can:

* Enable/disable guaranteed hours
* Edit guaranteed hours settings
* Override guarantee calculation for a pay period
* Mark specific schedule exceptions as paid/unpaid under the guarantee
* Recalculate an unlocked pay period

Nanny can:

* View guaranteed hours if enabled
* View guarantee adjustment if payment/timesheet details are enabled
* See whether unpaid PTO reduces guaranteed pay
* Cannot edit guarantee settings
* Cannot override guarantee calculations

---

## 13.7 PTO / Sick / Unpaid Leave

The app should support separate leave buckets.

### Leave Types

Support:

* PTO / vacation
* Sick time
* Holiday pay
* Unpaid time off
* Family cancellation / guaranteed-hours pay
* Other paid leave

### PTO Policy Options

Each leave bucket should support:

* Enabled yes/no
* Paid or unpaid
* Accrual method:

  * Front-loaded annually
  * Accrued per hour worked
  * Accrued per pay period
  * Accrued monthly
  * Manual-only balance
  * No accrual
* Annual allowance hours
* Accrual rate
* Balance cap
* Carryover cap
* Negative balance allowed yes/no
* Waiting period, optional
* Reset date
* Visible to nanny yes/no
* Counts toward guaranteed hours yes/no
* Counts toward payable hours yes/no
* Counts toward overtime yes/no, default no unless manually enabled

### PTO Request Workflow

Nanny can request:

* PTO
* Sick time
* Unpaid time off

Request fields:

* Leave type
* Start date
* End date
* Start time, optional
* End time, optional
* Hours requested
* Note

Parent can:

* Approve
* Reject
* Modify and approve
* Comment

Approved PTO should:

* Appear on calendar
* Appear on timesheet
* Affect PTO balance based on policy
* Affect guaranteed hours based on policy

### PTO Deduction Timing

Configurable:

* Deduct on approval
* Deduct when PTO date occurs
* Deduct when timesheet is approved

Recommended default:

* Show pending impact on approval.
* Finalize deduction when timesheet is approved.

### PTO Ledger

Every PTO change must create a ledger event.

Ledger event types:

* Opening balance
* Accrual
* PTO used
* Sick used
* Manual adjustment
* Carryover
* Expiration
* Correction
* Reversal

Do not silently overwrite PTO balances.

### PTO Balance Views

Show balance:

* As of today
* End of current pay period
* After approved upcoming PTO
* End of year estimate, optional

---

## 13.8 Payment Due / Payment Made Ledger

The app should not move money. It should track what is due and what has been paid.

### Pay Settings

Parent Admin can configure:

* Pay frequency:

  * Weekly
  * Biweekly
  * Semi-monthly
  * Monthly
* Pay period start day
* Payday rule:

  * Same day each week
  * X days after pay period ends
  * Manual
* Default hourly rate
* Overtime threshold
* Overtime multiplier
* Guaranteed hours settings
* Payment method label:

  * Zelle
  * Venmo
  * Check
  * Bank transfer
  * Payroll provider
  * Cash
  * Other
* Whether nanny can view gross pay details
* Whether nanny can view payment method label

### Payment Record Fields

Each payment record should include:

* Pay period start
* Pay period end
* Timesheet ID
* Payment status
* Payment due date
* Payment made date
* Payment method label
* Actual worked hours
* Regular worked hours
* Overtime worked hours
* PTO hours
* Sick hours
* Holiday hours
* Family cancellation hours
* Guaranteed hours
* Guarantee adjustment hours
* Payable regular hours
* Gross pay due
* Reimbursements
* Manual adjustments
* Amount paid
* Parent note
* Nanny visible note
* Attachment/photo optional
* Created timestamp
* Updated timestamp
* Marked paid by

### Payment Statuses

* Upcoming
* Due
* Overdue
* Partially paid
* Paid
* Corrected
* Voided

### Payment Workflow

1. Timesheet approved.
2. App creates payment record.
3. Payment record status becomes upcoming/due based on date.
4. Parent manually pays nanny outside the app.
5. Parent marks payment made.
6. Nanny can see payment status if enabled.
7. Record becomes locked after payment unless reopened by Parent Admin.

### Payment Corrections

If a paid period needs correction:

* Do not delete original record.
* Create correction event.
* Show original amount, corrected amount, and difference.
* Require parent note.
* Log in audit trail.

---

## 13.9 Reminders and Notifications

### Reminder Types

Support:

* Nanny forgot to clock out
* Nanny has not submitted weekly timesheet
* Parent has pending timesheet approval
* PTO request pending
* Payment due tomorrow
* Payment overdue
* Upcoming PTO in next 7 days
* Schedule changed
* PTO balance low or negative
* Weekly summary

### MVP Reminder Approach

For GitHub Pages MVP, implement reminders as in-app alert cards calculated client-side when the user opens the app.

### Optional Email Reminder Approach

Email reminders require secure backend execution.

Use one of:

* Supabase Edge Functions
* Supabase scheduled functions
* External secure cron job

Do not send emails directly from the frontend.

### Reminder Settings

Parent can configure:

* Enable/disable each reminder type
* Recipients
* Timing
* Reminder cadence
* Quiet hours, optional

### Example Reminder Copy

* “Timesheet for Jun 22–28 is ready for review.”
* “Payment for Jun 22–28 is due Friday.”
* “PTO request pending for Aug 14.”
* “Clock-out missing for today’s shift.”
* “Weekly hours are ready for approval.”

---

## 13.10 Calendar

Calendar should be central to the app.

### Calendar Views

Support:

* Month view
* Week view
* Day detail

### Calendar Items

Show:

* Scheduled shifts
* Actual hours worked
* PTO
* Sick time
* Unpaid time off
* Family cancellations
* Holidays
* Payment due dates
* Payment made dates
* Missing time alerts
* Timesheet approval status

### Calendar Day Detail

When user taps a day, show:

* Scheduled shift
* Actual time entries
* Leave entries
* Notes
* Status
* Actions

Parent actions:

* Add shift
* Edit exception
* Approve PTO
* Edit time entry
* View payment impact

Nanny actions:

* Clock in/out
* Add time
* Request PTO
* Add note

---

## 13.11 Exports

Parent Admin should be able to export records.

### Export Types

* Weekly timesheet CSV
* Pay period CSV
* PTO ledger CSV
* Payment history CSV
* Annual summary CSV
* Full records export CSV/JSON

### Annual Summary

Annual summary should include:

* Total actual hours worked
* Regular worked hours
* Overtime worked hours
* PTO hours paid
* Sick hours paid
* Holiday hours paid
* Family cancellation hours
* Guaranteed hours
* Guarantee adjustment hours
* Gross pay due
* Gross amount marked paid
* Reimbursements
* Manual adjustments
* Payment dates
* PTO balance at year-end

### Export Permissions

Only Parent Admin and optionally Parent Co-Admin can export.

Nanny should not have export access in MVP.

---

## 14. Screens

## 14.1 Parent Home Screen

Cards:

1. Today

   * Scheduled shift
   * Current clock status
   * Any missing entries

2. Current Week

   * Scheduled hours
   * Actual hours
   * Guaranteed hours
   * Estimated payable hours
   * Timesheet status

3. Pending Actions

   * Timesheets awaiting approval
   * PTO requests
   * Missing clock-outs

4. Payment

   * Next due payment
   * Last payment made
   * Overdue status

5. PTO

   * Current PTO balance
   * Upcoming PTO
   * Pending requests

Primary buttons:

* Review Timesheet
* Mark Payment Made
* Add Schedule Exception
* Approve PTO
* Edit Schedule

---

## 14.2 Nanny Home Screen

Cards:

1. Today

   * Scheduled shift
   * Clock in/out button
   * Status

2. This Week

   * Hours worked
   * Timesheet status
   * Submit button if ready

3. PTO

   * Available balance if enabled
   * Upcoming PTO
   * Request PTO button

4. Payment

   * Next expected payday
   * Last payment made
   * Payment status

Primary buttons:

* Clock In / Clock Out
* Add Time Entry
* Submit Timesheet
* Request PTO

---

## 14.3 Time Screen

Tabs:

* This Week
* Previous Weeks
* Corrections

Show:

* Daily rows
* Scheduled vs actual
* Missing time warnings
* Notes
* Status chips

Actions:

* Add time
* Edit draft time
* Submit week
* Approve week
* Request correction

---

## 14.4 Calendar Screen

Views:

* Month
* Week
* Day

Filters:

* Schedule
* Worked time
* PTO/sick
* Payments
* Alerts

---

## 14.5 PTO Screen

Parent view:

* PTO policy
* Sick policy
* Current balance
* Pending requests
* Upcoming approved leave
* Ledger
* Manual adjustment

Nanny view:

* Balance, if enabled
* Pending requests
* Approved upcoming leave
* Request PTO
* Request sick/unpaid time

---

## 14.6 Pay Screen

Parent view:

* Upcoming payments
* Due payments
* Overdue payments
* Paid history
* Payment detail
* Mark paid
* Add adjustment
* Export

Nanny view:

* Payment due
* Payment made
* Approved hours
* Gross pay due if enabled
* Guarantee adjustment if enabled

---

## 14.7 Settings Screen

Sections:

* Household settings
* User permissions
* Nanny profile
* Pay settings
* Guaranteed hours settings
* PTO/sick settings
* Schedule templates
* Reminder settings
* Export records
* Audit log

---

## 15. Data Model

Use Supabase Postgres tables.

---

## 15.1 users

Represents authenticated app users.

Fields:

* id uuid primary key
* email text unique not null
* full_name text
* phone text nullable
* created_at timestamptz
* updated_at timestamptz
* last_login_at timestamptz nullable

---

## 15.2 households

Fields:

* id uuid primary key
* name text not null
* timezone text not null default 'America/New_York'
* week_start_day text default 'monday'
* created_by uuid references users(id)
* created_at timestamptz
* updated_at timestamptz

---

## 15.3 household_users

Join table for household membership and permissions.

Fields:

* id uuid primary key
* household_id uuid references households(id)
* user_id uuid references users(id)
* role text not null
* permissions jsonb
* status text default 'active'
* invited_at timestamptz nullable
* accepted_at timestamptz nullable
* created_at timestamptz
* updated_at timestamptz

Roles:

* parent_admin
* parent_co_admin
* nanny

---

## 15.4 caregiver_profiles

Fields:

* id uuid primary key
* household_id uuid references households(id)
* user_id uuid references users(id) nullable until nanny accepts invite
* name text not null
* email text nullable
* phone text nullable
* start_date date
* employment_status text default 'active'
* default_hourly_rate numeric(10,2)
* overtime_threshold_hours numeric(6,2) default 40
* overtime_multiplier numeric(4,2) default 1.5
* payment_method_label text nullable
* nanny_can_view_pay_rate boolean default false
* nanny_can_view_gross_pay boolean default true
* nanny_can_view_pto_balance boolean default true
* nanny_can_view_guaranteed_hours boolean default true
* notes_private text nullable
* created_at timestamptz
* updated_at timestamptz

Guaranteed hours fields:

* guaranteed_hours_enabled boolean default true
* guaranteed_hours_basis text default 'linked_to_schedule'
* fixed_weekly_guaranteed_hours numeric(6,2) nullable
* fixed_pay_period_guaranteed_hours numeric(6,2) nullable
* unpaid_time_off_reduces_guarantee boolean default true
* family_cancellation_counts_toward_guarantee boolean default true
* pto_counts_toward_guarantee boolean default true
* sick_counts_toward_guarantee boolean default true
* holiday_counts_toward_guarantee boolean default true

Valid guaranteed_hours_basis values:

* linked_to_schedule
* fixed_weekly
* fixed_pay_period

---

## 15.5 schedule_templates

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* name text not null
* recurrence_type text not null
* recurrence_rule jsonb
* effective_start_date date not null
* effective_end_date date nullable
* active boolean default true
* notes text nullable
* created_by uuid references users(id)
* created_at timestamptz
* updated_at timestamptz

Recurrence types:

* weekly
* biweekly
* monthly_by_date
* monthly_by_weekday
* custom

---

## 15.6 schedule_shifts

Fields:

* id uuid primary key
* schedule_template_id uuid references schedule_templates(id)
* day_of_week int nullable
* monthly_day int nullable
* monthly_week text nullable
* start_time time not null
* end_time time not null
* break_minutes int default 0
* paid_break boolean default false
* counts_toward_guaranteed_hours boolean default true
* paid_if_family_canceled boolean default true
* default_category text default 'regular'
* notes text nullable
* created_at timestamptz
* updated_at timestamptz

---

## 15.7 schedule_exceptions

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* date date not null
* exception_type text not null
* original_schedule_shift_id uuid nullable references schedule_shifts(id)
* start_time time nullable
* end_time time nullable
* paid_hours numeric(6,2) nullable
* affects_pay boolean default true
* affects_pto boolean default false
* counts_toward_guaranteed_hours boolean default false
* status text default 'approved'
* parent_note text nullable
* nanny_visible_note text nullable
* created_by uuid references users(id)
* approved_by uuid nullable references users(id)
* created_at timestamptz
* updated_at timestamptz

Exception types:

* added_shift
* removed_shift
* shortened_shift
* extended_shift
* family_cancellation
* pto
* sick
* unpaid_time_off
* holiday
* weather_emergency
* other

Statuses:

* draft
* requested
* approved
* rejected
* canceled

---

## 15.8 time_entries

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* date date not null
* schedule_shift_id uuid nullable references schedule_shifts(id)
* schedule_exception_id uuid nullable references schedule_exceptions(id)
* clock_in_at timestamptz nullable
* clock_out_at timestamptz nullable
* manual_start_time time nullable
* manual_end_time time nullable
* break_minutes int default 0
* paid_hours numeric(6,2)
* method text not null
* status text default 'draft'
* nanny_note text nullable
* parent_note text nullable
* created_by uuid references users(id)
* updated_by uuid references users(id)
* created_at timestamptz
* updated_at timestamptz

Methods:

* clock
* manual
* parent_adjustment
* correction

Statuses:

* draft
* submitted
* approved
* rejected
* corrected
* locked

---

## 15.9 timesheets

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* period_start date not null
* period_end date not null
* status text default 'draft'
* submitted_at timestamptz nullable
* submitted_by uuid nullable references users(id)
* approved_at timestamptz nullable
* approved_by uuid nullable references users(id)
* correction_note text nullable

Hour fields:

* scheduled_hours numeric(6,2) default 0
* guaranteed_hours numeric(6,2) default 0
* actual_worked_hours numeric(6,2) default 0
* regular_worked_hours numeric(6,2) default 0
* overtime_worked_hours numeric(6,2) default 0
* paid_pto_hours numeric(6,2) default 0
* paid_sick_hours numeric(6,2) default 0
* paid_holiday_hours numeric(6,2) default 0
* family_cancellation_hours numeric(6,2) default 0
* unpaid_time_off_hours numeric(6,2) default 0
* guarantee_adjustment_hours numeric(6,2) default 0
* payable_regular_hours numeric(6,2) default 0
* payable_overtime_hours numeric(6,2) default 0

Pay fields:

* hourly_rate numeric(10,2)
* overtime_rate numeric(10,2)
* gross_pay_due numeric(10,2) default 0
* reimbursements numeric(10,2) default 0
* manual_adjustments numeric(10,2) default 0

Timestamps:

* created_at timestamptz
* updated_at timestamptz

Statuses:

* draft
* submitted
* needs_correction
* approved
* payment_due
* paid
* locked

Unique constraint:

* caregiver_id + period_start + period_end

---

## 15.10 leave_policies

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* leave_type text not null
* enabled boolean default true
* paid boolean default true
* accrual_method text not null
* annual_allowance_hours numeric(6,2) nullable
* accrual_rate_hours_per_hour_worked numeric(8,4) nullable
* accrual_rate_hours_per_period numeric(6,2) nullable
* monthly_accrual_hours numeric(6,2) nullable
* balance_cap_hours numeric(6,2) nullable
* carryover_cap_hours numeric(6,2) nullable
* negative_balance_allowed boolean default false
* waiting_period_days int nullable
* reset_month int nullable
* reset_day int nullable
* visible_to_nanny boolean default true
* counts_toward_guarantee boolean default true
* counts_toward_payable_hours boolean default true
* counts_toward_overtime boolean default false
* active boolean default true
* created_at timestamptz
* updated_at timestamptz

Leave types:

* pto
* sick
* holiday
* unpaid
* other_paid

Accrual methods:

* front_loaded_annual
* per_hour_worked
* per_pay_period
* monthly
* manual_only
* none

---

## 15.11 leave_requests

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* leave_policy_id uuid references leave_policies(id)
* leave_type text not null
* start_date date not null
* end_date date not null
* start_time time nullable
* end_time time nullable
* hours_requested numeric(6,2)
* status text default 'requested'
* nanny_note text nullable
* parent_note text nullable
* requested_by uuid references users(id)
* reviewed_by uuid nullable references users(id)
* reviewed_at timestamptz nullable
* created_at timestamptz
* updated_at timestamptz

Statuses:

* requested
* approved
* rejected
* canceled
* used

---

## 15.12 leave_ledger

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* leave_policy_id uuid references leave_policies(id)
* event_date date not null
* event_type text not null
* hours_delta numeric(6,2) not null
* balance_after numeric(6,2) not null
* related_timesheet_id uuid nullable references timesheets(id)
* related_leave_request_id uuid nullable references leave_requests(id)
* related_schedule_exception_id uuid nullable references schedule_exceptions(id)
* created_by uuid references users(id)
* notes text nullable
* created_at timestamptz

Event types:

* opening_balance
* accrual
* used
* manual_adjustment
* carryover
* expiration
* correction
* reversal

---

## 15.13 payment_records

Fields:

* id uuid primary key
* caregiver_id uuid references caregiver_profiles(id)
* timesheet_id uuid references timesheets(id)
* period_start date not null
* period_end date not null
* due_date date not null
* status text default 'upcoming'

Hours:

* actual_worked_hours numeric(6,2) default 0
* regular_worked_hours numeric(6,2) default 0
* overtime_worked_hours numeric(6,2) default 0
* guaranteed_hours numeric(6,2) default 0
* guarantee_adjustment_hours numeric(6,2) default 0
* payable_regular_hours numeric(6,2) default 0
* payable_overtime_hours numeric(6,2) default 0
* paid_pto_hours numeric(6,2) default 0
* paid_sick_hours numeric(6,2) default 0
* paid_holiday_hours numeric(6,2) default 0
* family_cancellation_hours numeric(6,2) default 0

Pay:

* hourly_rate numeric(10,2)
* overtime_rate numeric(10,2)
* gross_pay_due numeric(10,2)
* reimbursements numeric(10,2) default 0
* manual_adjustments numeric(10,2) default 0
* amount_paid numeric(10,2) nullable
* payment_method_label text nullable
* paid_at timestamptz nullable
* marked_paid_by uuid nullable references users(id)
* parent_note text nullable
* nanny_visible_note text nullable
* guarantee_override_note text nullable
* attachment_url text nullable
* created_at timestamptz
* updated_at timestamptz

Statuses:

* upcoming
* due
* overdue
* partially_paid
* paid
* corrected
* voided

---

## 15.14 reminders

Fields:

* id uuid primary key
* household_id uuid references households(id)
* caregiver_id uuid nullable references caregiver_profiles(id)
* type text not null
* recipient_user_id uuid references users(id)
* enabled boolean default true
* channel text default 'in_app'
* trigger_rule jsonb
* last_sent_at timestamptz nullable
* created_at timestamptz
* updated_at timestamptz

Reminder types:

* missing_clock_out
* unsubmitted_timesheet
* pending_timesheet_approval
* pending_pto_request
* payment_due
* payment_overdue
* upcoming_pto
* schedule_change
* pto_balance_low
* weekly_summary

Channels:

* in_app
* email

Email should only be used if a secure backend function is implemented.

---

## 15.15 audit_events

Fields:

* id uuid primary key
* household_id uuid references households(id)
* actor_user_id uuid references users(id)
* entity_type text not null
* entity_id uuid not null
* action text not null
* before_json jsonb nullable
* after_json jsonb nullable
* created_at timestamptz

Audit sensitive actions:

* Pay rate change
* PTO policy change
* Guaranteed hours settings change
* Schedule template change
* Schedule exception approval
* Timesheet submission
* Timesheet approval
* Timesheet rejection
* Time entry correction
* Payment marked paid
* Payment corrected
* PTO balance adjustment
* User permission change

---

## 16. Calculation Rules

## 16.1 Paid Hours

For a time entry:

`paid_hours = end_time - start_time - unpaid_break_minutes`

Default:

* No rounding

Optional future settings:

* Round to nearest 5 minutes
* Round to nearest 10 minutes
* Round to nearest 15 minutes

---

## 16.2 Scheduled Hours

For a pay period:

`scheduled_hours = sum(generated recurring schedule shift hours + approved added shift hours - removed shift hours, based on applicable settings)`

---

## 16.3 Guaranteed Hours

If basis is linked to schedule:

`guaranteed_hours = sum(hours from schedule shifts where counts_toward_guaranteed_hours = true)`

If basis is fixed weekly:

`guaranteed_hours = fixed_weekly_guaranteed_hours`

If basis is fixed pay period:

`guaranteed_hours = fixed_pay_period_guaranteed_hours`

---

## 16.4 Actual Paid Hours

`actual_paid_hours = actual_worked_hours + paid_pto_hours + paid_sick_hours + paid_holiday_hours + family_cancellation_hours`

Whether each leave/family cancellation category counts should depend on policy settings.

---

## 16.5 Guarantee Adjustment

`guarantee_adjustment_hours = max(guaranteed_hours - actual_paid_hours, 0)`

If unpaid time off reduces guarantee, then reduce guaranteed_hours by approved unpaid time off hours before calculating guarantee adjustment.

Example:

`adjusted_guaranteed_hours = guaranteed_hours - unpaid_time_off_hours`

Then:

`guarantee_adjustment_hours = max(adjusted_guaranteed_hours - actual_paid_hours, 0)`

---

## 16.6 Overtime

Default:

* Overtime threshold: 40 actual worked hours per week
* Overtime multiplier: 1.5x

Overtime should be based primarily on actual worked hours.

Default logic:

`regular_worked_hours = min(actual_worked_hours, overtime_threshold)`

`overtime_worked_hours = max(actual_worked_hours - overtime_threshold, 0)`

Guarantee adjustment hours should be paid at regular rate by default and should not create overtime by themselves.

If actual worked hours exceed 40, overtime applies regardless of guaranteed hours.

---

## 16.7 Payable Hours

`payable_regular_hours = regular_worked_hours + paid_pto_hours + paid_sick_hours + paid_holiday_hours + family_cancellation_hours + guarantee_adjustment_hours`

`payable_overtime_hours = overtime_worked_hours`

If actual worked hours exceed 40, make sure regular worked hours are capped at 40.

---

## 16.8 Gross Pay Due

`overtime_rate = hourly_rate * overtime_multiplier`

`gross_pay_due = payable_regular_hours * hourly_rate + payable_overtime_hours * overtime_rate + reimbursements + manual_adjustments`

No tax withholding calculation in MVP.

---

## 16.9 PTO Accrual

For per-hour-worked accrual:

`pto_accrued = eligible_approved_worked_hours * accrual_rate_hours_per_hour_worked`

For per-pay-period accrual:

`pto_accrued = accrual_rate_hours_per_period when timesheet is approved`

For monthly accrual:

`pto_accrued = monthly_accrual_hours on configured monthly date`

For front-loaded annual:

`pto_accrued = annual_allowance_hours on reset date or prorated start date`

Every accrual should create a leave_ledger record.

---

## 17. Status Rules

### Time Entry Status

* Draft: nanny or parent is still editing
* Submitted: included in submitted timesheet
* Approved: parent approved
* Rejected: parent rejected
* Corrected: corrected after submission/approval
* Locked: tied to paid/locked timesheet

### Timesheet Status

* Draft: not submitted
* Submitted: awaiting parent review
* Needs correction: parent sent back
* Approved: approved but not yet paid
* Payment due: payment record due
* Paid: payment marked made
* Locked: historical paid period should not be edited without correction

### Payment Status

* Upcoming: approved but due date has not arrived
* Due: due today
* Overdue: due date passed and not paid
* Partially paid: partial amount logged
* Paid: full payment marked made
* Corrected: payment modified after paid
* Voided: record voided but retained

---

## 18. Authorization Requirements

All permissions must be enforced server-side through Supabase Row Level Security and database policies.

Do not rely only on hiding UI controls.

### Nanny Restrictions

Nanny cannot:

* Access settings for pay, PTO policy, guaranteed hours, or permissions
* Update approved time entries
* Update approved PTO requests
* Mark payments paid
* Export records
* View audit log
* View private parent notes

### Parent Admin Access

Parent Admin can access everything within their household.

### Parent Co-Admin Access

Parent Co-Admin can access everything except sensitive settings if restricted.

### Household Boundary

Users can only access records for households where they are members.

Every query must be scoped to household membership.

---

## 19. Supabase Row Level Security Requirements

Enable RLS on all tables.

At minimum, create policies so that:

* A user can only read households where they are a member.
* A user can only read caregiver profiles tied to their household.
* A nanny can only read their own caregiver profile.
* A nanny can only insert/update their own draft time entries.
* A nanny cannot update approved, paid, or locked records.
* A nanny can create leave requests for themselves.
* A nanny cannot approve leave requests.
* A nanny can read visible payment records for their own caregiver profile.
* A nanny cannot update payment records.
* Parent Admin can read/write all records in their household.
* Parent Co-Admin can read/write records based on permission settings.
* Only Parent Admin can update pay settings, PTO policy, guaranteed hours, and permissions unless explicitly delegated.

Create helper functions as needed, e.g.:

* `is_household_member(household_id uuid)`
* `is_parent_admin(household_id uuid)`
* `is_parent_or_coadmin(household_id uuid)`
* `is_caregiver_user(caregiver_id uuid)`

---

## 20. Audit Log Requirements

Create audit events for:

* User invited
* User removed
* Permission changed
* Pay rate changed
* Guaranteed hours settings changed
* PTO policy changed
* Schedule changed
* Schedule exception created/approved/rejected
* Time entry edited after submission
* Timesheet submitted
* Timesheet approved/rejected
* Payment marked paid
* Payment corrected
* PTO manually adjusted

Audit event should capture:

* Actor
* Timestamp
* Entity type
* Entity ID
* Action
* Before value
* After value

---

## 21. Notification / Reminder Logic

For MVP on GitHub Pages, calculate reminder cards client-side.

### Payment Due

If payment due date is tomorrow:

* Show parent alert

If payment due date is today:

* Show parent alert

If overdue:

* Show overdue parent alert

### Timesheet Submission

If pay period ended and timesheet not submitted:

* Show nanny alert
* Optionally show parent alert

### Timesheet Approval

If timesheet submitted and not approved:

* Show parent alert

### Missing Clock-Out

If clock_in_at exists and clock_out_at is null after scheduled shift end plus grace period:

* Show nanny alert
* Optionally show parent alert

### PTO Request

If PTO request pending:

* Show parent alert

### Upcoming PTO

If approved PTO within next 7 days:

* Show parent and nanny alert

### Optional Email Reminders

If implemented later:

* Use Supabase Edge Functions or another backend.
* Store provider API keys as backend secrets only.
* Do not expose provider keys to frontend.
* Do not run email logic from GitHub Pages frontend.

---

## 22. UX Requirements

### General

* Mobile-first
* Large tap targets
* One-handed use
* Fast clock in/out
* Minimal required typing
* Status chips everywhere
* Clear distinction between scheduled, actual, approved, payable, and paid

### Status Chips

Use labels like:

* Scheduled
* Clocked in
* Missing clock-out
* Draft
* Submitted
* Needs correction
* Approved
* Payment due
* Paid
* PTO pending
* PTO approved
* Overdue

### Parent UX Priorities

The parent should immediately see:

* Is nanny clocked in?
* Are hours missing?
* Is a timesheet waiting?
* What do I owe?
* Did I mark payment paid?
* How much PTO is left?

### Nanny UX Priorities

The nanny should immediately see:

* Am I scheduled today?
* Do I need to clock in/out?
* Have I submitted my timesheet?
* Was my timesheet approved?
* Was payment made?
* How much PTO do I have, if visible?

---

## 23. MVP Build Plan

## Phase 1 — Parent-Only Tracker

Build first:

* Vite/React/Tailwind app shell
* GitHub Pages deploy workflow
* Supabase project connection
* Auth
* Household setup
* Nanny profile
* Pay settings
* Guaranteed hours settings
* PTO/sick settings
* Recurring schedule
* Manual time entries
* Weekly timesheet
* Gross pay calculation
* Payment due/payment made logging
* Basic PTO ledger
* CSV export

No nanny login required in Phase 1.

---

## Phase 2 — Nanny Portal

Add:

* Nanny invite
* Nanny role
* Nanny dashboard
* Clock in/out
* Manual time entry
* Weekly timesheet submission
* PTO requests
* Payment status view
* Role-based permissions

---

## Phase 3 — In-App Reminders

Add:

* Missing clock-out alerts
* Unsubmitted timesheet alerts
* Pending approval alerts
* Payment due alerts
* Payment overdue alerts
* PTO request alerts
* Weekly summary card

Keep reminders in-app unless secure backend email function is implemented.

---

## Phase 4 — Optional Email Reminders

Add:

* Supabase Edge Function for email sending
* Reminder schedule
* Resend/Postmark integration using backend secrets
* Email templates
* Reminder delivery logs

Do not implement email reminders from the static frontend.

---

## Phase 5 — Polish and Recordkeeping

Add:

* Better calendar
* Audit log UI
* Annual summary export
* Payment attachments through Supabase Storage
* Correction workflow
* PWA polish
* Offline-tolerant clock-in draft state, optional

---

## 24. Acceptance Criteria

### Deployment

* App builds successfully using `npm run build`.
* Static output deploys to GitHub Pages.
* App works from GitHub Pages project path or custom domain.
* App uses correct Vite base path.
* PWA can be saved to iPhone home screen.
* No server-side runtime is required after deployment.
* No private API keys are exposed in frontend bundle.

### Schedule

* Parent can create a weekly recurring schedule.
* Schedule carries forward automatically.
* Parent can create one-off changes.
* Schedule exceptions appear in calendar and timesheets.
* Schedule changes do not modify paid historical periods.

### Time Tracking

* Nanny can clock in/out.
* Nanny can manually enter hours.
* Parent can review submitted hours.
* Parent can approve or request correction.
* Missing clock-outs are flagged.

### Guaranteed Hours

* Parent can enable guaranteed hours.
* Parent can link guaranteed hours to schedule.
* If actual paid hours are less than guaranteed hours, app creates a guarantee adjustment.
* If actual worked hours exceed guaranteed hours, app pays actual worked hours.
* If actual worked hours exceed overtime threshold, overtime is calculated.
* Guarantee adjustment appears clearly on timesheet and payment record.
* Nanny cannot edit guaranteed hours settings.

### PTO

* Parent can create PTO and sick policies.
* Nanny can request PTO.
* Parent can approve/reject PTO.
* PTO appears on calendar and timesheet.
* PTO balance updates through ledger entries.
* PTO balance can be visible or hidden from nanny.

### Payments

* Approved timesheet creates payment record.
* Payment due date is calculated.
* Parent can mark payment made.
* Payment history is preserved.
* Nanny can view payment status.
* Paid periods are locked unless corrected.

### Permissions

* Nanny cannot edit pay rate, PTO policy, guaranteed hours, or payment records.
* Parent Admin can manage all settings.
* Household data is isolated by user membership.
* Supabase RLS prevents unauthorized access even if client code is manipulated.

### Exports

* Parent can export timesheets.
* Parent can export payment history.
* Parent can export PTO ledger.
* Nanny cannot export records.

---

## 25. Recommended Defaults

Use these defaults unless overridden:

* App type: mobile-first PWA
* Hosting: GitHub Pages
* Frontend: Vite + React + TypeScript
* Backend/database/auth: Supabase
* Routing: HashRouter
* Timezone: America/New_York
* Pay period: weekly
* Week starts: Monday
* Payday: Friday after pay period ends
* Pay type: hourly
* Overtime threshold: 40 actual worked hours/week
* Overtime multiplier: 1.5x
* Guaranteed hours: enabled
* Guaranteed hours basis: linked to recurring schedule
* Family cancellations: count toward guaranteed hours
* Nanny unpaid time off: reduces guaranteed hours
* PTO: separate from sick time
* PTO balance: visible to nanny
* Gross pay due: visible to nanny
* Pay rate: hidden from nanny by default unless enabled
* Time rounding: none
* Reminders: in-app first
* Email reminders: only through secure backend function
* Approved/paid records: correction-only, no deletion

---

## 26. Implementation Notes for Coding Agent

Prioritize correctness, auditability, static deployability, and mobile usability.

Build in this order:

1. Vite React TypeScript app
2. Tailwind setup
3. GitHub Pages deploy workflow
4. PWA basics
5. Supabase client setup
6. Database schema
7. RLS policies
8. Auth and household membership
9. Parent Admin UI
10. Nanny profile/settings
11. Schedule templates
12. Time entries
13. Timesheets
14. Guaranteed hours calculation
15. Payment records
16. PTO policies and ledger
17. Nanny portal
18. In-app reminders
19. Exports
20. Audit log UI
21. Optional Supabase Edge Function email reminders

Important implementation principles:

* The app must be static-hostable on GitHub Pages.
* Do not create API routes or server actions.
* Do not assume a backend server exists after deployment.
* Use Supabase for auth, database, RLS, and optional backend functions.
* Never expose service role keys or email provider API keys.
* Never silently mutate historical approved/paid periods.
* Use correction records rather than destructive edits. Keep a record of any changes including what changes (before and after), who made the change, and when the change was made.
* Keep calculated values snapshotted on approved timesheets and payment records.
* Do not recalculate paid history unless Parent Admin explicitly reopens/recalculates.
* Enforce permissions through Supabase RLS, not just the frontend.
* Store all timestamps with timezone awareness.
* Keep the nanny UI simpler than the parent UI.
* Make guaranteed hours a visible line item, not a hidden calculation.
* Make all sensitive changes auditable.
