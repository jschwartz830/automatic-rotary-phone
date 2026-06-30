-- Fixes a chicken-and-egg bug in onboarding: a household has no members
-- until the creator's own household_users row is inserted right after the
-- household itself, so the original households_select_member policy (member
-- only) made supabase-js's .insert().select().single() return zero rows and
-- fail. Run this against any database that already applied 0002_rls.sql.

drop policy if exists households_select_member on public.households;

create policy households_select_member on public.households
  for select
  using (public.is_household_member(id) or created_by = auth.uid());
