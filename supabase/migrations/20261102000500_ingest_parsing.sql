-- FLIP — Fase 2: lectura de correos (SPEC 1.10, sección 5).
-- Correos que no son movimientos (configuración de tarjeta, compra rechazada): se guardan
-- pero no crean nada.
alter type public.parse_status add value if not exists 'ignorado';

-- El pase a cuotas (formato 11) crea una deuda; su número de operación evita duplicarla.
alter table public.debts add column external_op_id text unique;

-- Búsqueda de duplicados (SPEC 3.2): mismo monto y cuenta en ± 10 minutos.
create index transactions_dedupe_idx on public.transactions (account_id, amount_pen, occurred_at);

-- Sueldo automático (SPEC 9.5): un evento por tipo de ingreso y fecha (evita registrarlo dos veces).
create unique index income_events_kind_date_idx on public.income_events (kind, expected_date);

-- Impuesto de quinta estimado por mes/año (SPEC 9): 2026 ~S/ 100 retenidos en diciembre;
-- 2027 ~S/ 340/mes (4,077.21 / 12); 2028 ~S/ 530/mes. Se ajusta con la primera boleta real.
insert into public.settings (key, value)
values ('monthly_tax_estimate', '{"2026": 0, "2026-12": 100, "2027": 339.77, "2028": 530}')
on conflict (key) do nothing;
