# Nannager

A mobile-first PWA for tracking a household nanny's schedule, time, PTO, guaranteed hours, and payment records. It is **not** a payroll processor — it never moves money, withholds taxes, or files paperwork. It's a recordkeeping tool.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Row Level Security) as the only backend
- React Router (`HashRouter`, so the static build works on GitHub Pages with no server)
- date-fns
- Installable PWA (manifest + service worker)

## Roles

- **Parent admin** — full access to settings, schedule, time, PTO, and pay.
- **Parent co-admin** — same access by default; can be restricted from specific sensitive settings.
- **Nanny** — clocks in/out or enters time manually, submits timesheets, requests PTO/sick/unpaid time, and can view pay/PTO/guaranteed-hours info if the household enables it.

All authorization is enforced in Postgres via Row Level Security, not just hidden in the UI.

## Local development

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

Apply the SQL in `supabase/migrations/` (in order) to a Supabase project before running the app.

## Build

```bash
npm run build
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the static site and publishes it to GitHub Pages.
