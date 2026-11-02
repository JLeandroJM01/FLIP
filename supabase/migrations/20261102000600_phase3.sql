-- FLIP — Fase 3 (SPEC 1.11).

-- ───────── La empresa sale del proyecto (decisión del usuario, 2 nov 2026) ─────────
drop table if exists public.company_withdrawals;
drop table if exists public.company_invoices;
delete from public.accounts a
  where a.type = 'empresa'
    and not exists (select 1 from public.transactions t where t.account_id = a.id or t.counterpart_account_id = a.id);
delete from public.categories c
  where c.kind = 'ingreso' and c.name = 'Empresa'
    and not exists (select 1 from public.transactions t where t.category_id = c.id)
    and not exists (select 1 from public.merchant_rules r where r.category_id = c.id);
delete from public.tags where name = 'empresa';

alter type public.account_type rename to account_type_old;
create type public.account_type as enum ('corriente', 'ahorros', 'debito', 'credito', 'billetera', 'activo');
alter table public.accounts alter column type type public.account_type using type::text::public.account_type;
drop type public.account_type_old;

alter type public.income_event_kind rename to income_event_kind_old;
create type public.income_event_kind as enum ('sueldo', 'gratificacion', 'cts', 'utilidades', 'bono', 'asignacion_vacacional', 'otro');
alter table public.income_events alter column kind type public.income_event_kind using kind::text::public.income_event_kind;
drop type public.income_event_kind_old;

-- ───────── Gastos compartidos (SPEC 8) ─────────
-- "No fue compartido": la pregunta ya no se vuelve a mostrar para ese gasto.
alter table public.transactions add column shared_dismissed boolean not null default false;

-- ───────── Deudas (SPEC 11) ─────────
-- Orden de pago del usuario: Daniela → Walter → prepagar el crédito Yape.
-- La tarjeta y sus cuotas no van aquí: se pagan completas cada día 5.
alter table public.debts add column payoff_order smallint;
update public.debts set payoff_order = 1 where name = 'Daniela';
update public.debts set payoff_order = 2 where name = 'Walter';
update public.debts set payoff_order = 3 where name = 'Crédito Yape';

-- ───────── Parámetros ─────────
insert into public.settings (key, value) values
  -- Fechas de pago (usuario): gratificación el 15 (jul y dic), CTS el 20 (may y nov), utilidades el 20 de abril.
  ('income_calendar', '{"gratificacion_day": 15, "cts_day": 20, "utilidades_month": 4, "utilidades_day": 20}'),
  -- Montos del SPEC 9 que no salen de una fórmula: CTS por depósito y utilidades de Prima AFP (neto).
  ('income_estimates', '{"cts": {"2027-05": 2550, "default": 2860}, "prima_utilidades": {"2027-03": 5260}, "vacation_month": 10}'),
  -- Meta del depa (SPEC 14.1): inicial 30% (usuario).
  ('depa', '{"price": 400000, "down_pct": 0.30, "closing_pct": 0.02, "bono_buen_pagador": 7900, "tea": 0.08, "years": 25}'),
  -- Supuestos de la proyección (SPEC 14): tipo de cambio y gasto de vida mensual.
  ('projection', '{"fx": 3.45, "living": 1500}')
on conflict (key) do nothing;

-- Meta del depa: inicial 30% + gastos de cierre 2% de S/ 400,000 = S/ 128,000, a nov 2029.
insert into public.goals (name, target_amount, target_date, priority)
select 'Inicial del depa (30%)', 128000, '2029-11-01', 1
where not exists (select 1 from public.goals);

-- Fondo AFP actual (usuario, 2 nov 2026): ~S/ 1,200.
update public.accounts set opening_balance = 1200, opening_balance_at = now()
  where name = 'Fondo AFP' and opening_balance is null;

-- Estados de cuenta conocidos de la tarjeta (SPEC 10): el 5 nov no hay pago (usuario);
-- el 5 dic, el estimado del SPEC (~S/ 2,000 + US$ 400). Se reemplazan con el monto real.
insert into public.settings (key, value) values
  ('card_statements', '[{"due": "2026-11-05", "pen": 0, "usd": 0, "source": "usuario"}, {"due": "2026-12-05", "pen": 2000, "usd": 400, "source": "estimado SPEC"}]')
on conflict (key) do nothing;

-- Crédito Yape: "cobro automático el día 28" (SPEC 11) desde la cuenta de Yape (ahorros).
alter table public.debts add column auto_debit_account_id uuid references public.accounts (id);
update public.debts
  set auto_debit_account_id = (select id from public.accounts where name = 'Cuenta de ahorros soles')
  where name = 'Crédito Yape';

-- Un evento por deuda y fecha (cuota automática registrada una sola vez).
alter table public.debt_payments add column due_date date;
create unique index debt_payments_debt_due_idx on public.debt_payments (debt_id, due_date) where due_date is not null;
