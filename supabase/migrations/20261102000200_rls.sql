-- FLIP — Row Level Security en todas las tablas (SPEC 2 y 16).
-- Un solo usuario: solo puede leer y escribir quien inició sesión con un correo
-- de public.allowed_emails. El rol anon no tiene acceso a nada.

create function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'tags', 'people', 'merchant_rules', 'raw_emails',
    'shared_expenses', 'transactions', 'shared_participants', 'debts', 'debt_payments',
    'income_profile', 'income_events', 'company_invoices', 'company_withdrawals',
    'goals', 'budgets', 'fx_rates', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "solo el usuario permitido" on public.%I for all to authenticated
         using ((select public.is_allowed_user())) with check ((select public.is_allowed_user()))',
      t
    );
  end loop;
end
$$;

-- La lista de permitidos solo la toca el service role (RLS sin políticas = nadie más).
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

-- Las tablas que se creen en el futuro tampoco quedan abiertas a anon por defecto.
alter default privileges in schema public revoke all on tables from anon;
