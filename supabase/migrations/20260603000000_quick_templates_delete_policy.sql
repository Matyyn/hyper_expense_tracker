-- Ensure DELETE is permitted on quick_templates for the row owner.
-- Databases created before this policy existed silently deleted 0 rows (RLS
-- blocks the delete without raising an error), so a deleted template would
-- reappear on the next refetch. This makes the policy idempotently present.

alter table public.quick_templates enable row level security;

drop policy if exists "templates_delete" on public.quick_templates;
create policy "templates_delete" on public.quick_templates
  for delete using (auth.uid()::text = user_id);
