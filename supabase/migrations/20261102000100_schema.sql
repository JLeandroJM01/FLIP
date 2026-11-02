-- FLIP — esquema completo (docs/SPEC.md, sección 6).
-- Montos en numeric(12,2); fechas con hora en timestamptz (zona de negocio: America/Lima).
-- Cambios respecto al SPEC 1.5, acordados con el usuario (SPEC 1.6):
--   * accounts.type incluye 'corriente'; accounts.card_last4 = tarjeta de débito asociada a la cuenta.
--   * transactions.person_id (quién te yapeó / a quién pagaste).
--   * raw_emails.from → from_address (from es palabra reservada).

-- ───────────────────────── tipos ─────────────────────────

create type public.currency_code as enum ('PEN', 'USD');
create type public.account_type as enum ('corriente', 'ahorros', 'debito', 'credito', 'billetera', 'activo', 'empresa');
create type public.category_kind as enum ('gasto', 'ingreso');
create type public.tx_type as enum ('gasto', 'ingreso', 'transferencia', 'pago_tarjeta', 'pago_deuda', 'reembolso', 'retiro_efectivo');
create type public.tx_source as enum ('gmail', 'manual', 'recurrente');
create type public.tx_status as enum ('confirmado', 'por_revisar', 'anulado');
create type public.rule_match as enum ('contiene', 'empieza_con', 'regex');
create type public.parse_status as enum ('pendiente', 'ok', 'desconocido', 'error');
create type public.debt_kind as enum ('tarjeta', 'cuotas', 'personal');
create type public.afp_commission_type as enum ('flujo', 'mixta');
create type public.income_event_kind as enum ('sueldo', 'gratificacion', 'cts', 'utilidades', 'bono', 'asignacion_vacacional', 'empresa', 'otro');

-- ───────────────────────── catálogos ─────────────────────────

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type public.account_type not null,
  last4 text check (last4 ~ '^[0-9]{4}$'),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  currency public.currency_code not null default 'PEN',
  credit_limit numeric(12,2) check (credit_limit >= 0),
  payment_day smallint check (payment_day between 1 and 31),
  closing_day smallint check (closing_day between 1 and 31),
  notes text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  parent_id uuid references public.categories (id) on delete set null,
  kind public.category_kind not null,
  sort_order smallint not null default 0,
  unique (name, kind)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^[a-z0-9_]+$') -- sin '#'
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  alias text, -- para cruzar "PLIN-NOMBRE"
  created_at timestamptz not null default now()
);

create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  match_type public.rule_match not null default 'contiene', -- sin distinguir mayúsculas
  category_id uuid references public.categories (id) on delete cascade,
  tags text[] not null default '{}',
  tx_type public.tx_type,
  requires_review boolean not null default false, -- "→ preguntar" (p. ej. PLIN-)
  priority smallint not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────── correos ─────────────────────────

create table public.raw_emails (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  from_address text,
  subject text,
  received_at timestamptz,
  body text, -- se borra a los 90 días (SPEC 16)
  parser text,
  parser_version text,
  parse_status public.parse_status not null default 'pendiente',
  error text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── movimientos ─────────────────────────

create table public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid, -- FK agregada después de transactions
  total numeric(12,2) not null check (total > 0),
  my_share numeric(12,2) not null check (my_share >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (my_share <= total)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  amount numeric(12,2) not null check (amount > 0), -- el sentido lo da el tipo
  currency public.currency_code not null default 'PEN',
  fx_rate numeric(10,4) check (fx_rate > 0), -- S/ por US$; null en soles
  amount_pen numeric(12,2) not null check (amount_pen > 0),
  account_id uuid not null references public.accounts (id),
  counterpart_account_id uuid references public.accounts (id), -- transferencias
  type public.tx_type not null,
  category_id uuid references public.categories (id) on delete set null,
  merchant text,
  note text,
  tags text[] not null default '{}',
  source public.tx_source not null default 'manual',
  external_op_id text, -- número de operación del banco / Yape
  raw_email_id uuid references public.raw_emails (id) on delete set null,
  status public.tx_status not null default 'confirmado',
  shared_expense_id uuid references public.shared_expenses (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  reversal_of uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  check (currency <> 'PEN' or (fx_rate is null and amount_pen = amount)),
  check (currency = 'PEN' or fx_rate is not null),
  check (counterpart_account_id is null or counterpart_account_id <> account_id)
);

alter table public.shared_expenses
  add constraint shared_expenses_transaction_id_fkey
  foreign key (transaction_id) references public.transactions (id) on delete cascade;

create index transactions_occurred_at_idx on public.transactions (occurred_at desc);
create index transactions_account_idx on public.transactions (account_id, occurred_at desc);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_status_idx on public.transactions (status) where status = 'por_revisar';
create index transactions_external_op_idx on public.transactions (external_op_id) where external_op_id is not null;
create index transactions_tags_idx on public.transactions using gin (tags);
create index transactions_person_idx on public.transactions (person_id) where person_id is not null;

create table public.shared_participants (
  id uuid primary key default gen_random_uuid(),
  shared_expense_id uuid not null references public.shared_expenses (id) on delete cascade,
  person_id uuid not null references public.people (id),
  amount_owed numeric(12,2) not null check (amount_owed >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  unique (shared_expense_id, person_id)
);

-- ───────────────────────── deudas ─────────────────────────

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.debt_kind not null,
  creditor_person_id uuid references public.people (id),
  account_id uuid references public.accounts (id), -- tarjeta asociada (kind = tarjeta)
  currency public.currency_code not null default 'PEN',
  original_amount numeric(12,2) check (original_amount >= 0),
  balance numeric(12,2) not null check (balance >= 0),
  installment_amount numeric(12,2) check (installment_amount >= 0),
  installments_total smallint check (installments_total > 0),
  installments_paid smallint not null default 0 check (installments_paid >= 0),
  next_due_date date,
  tcea numeric(8,4) check (tcea >= 0), -- fracción: 1.1020 = 110.20%
  notes text,
  created_at timestamptz not null default now(),
  check (installments_total is null or installments_paid <= installments_total)
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency public.currency_code not null default 'PEN',
  paid_at timestamptz not null
);

-- ───────────────────────── ingresos ─────────────────────────

create table public.income_profile (
  id uuid primary key default gen_random_uuid(),
  employer text not null,
  start_date date not null,
  end_date date,
  monthly_gross numeric(12,2) not null check (monthly_gross > 0),
  grat_days_base smallint not null default 30 check (grat_days_base > 0),
  grat_bonus_rate numeric(6,4) not null check (grat_bonus_rate >= 0), -- bonificación extraordinaria (0.0675 con EPS)
  eps boolean not null default false,
  afp_name text,
  afp_fund smallint check (afp_fund between 0 and 3),
  afp_commission_type public.afp_commission_type,
  pay_schedule jsonb not null default '[]',
  profit_sharing_salaries numeric(4,2) not null default 0,
  bonus_salaries_max numeric(4,2) not null default 0,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.income_events (
  id uuid primary key default gen_random_uuid(),
  kind public.income_event_kind not null,
  expected_date date not null,
  expected_amount numeric(12,2) check (expected_amount >= 0),
  actual_transaction_id uuid references public.transactions (id) on delete set null,
  note text
);

-- ───────────────────────── empresa ─────────────────────────

create table public.company_invoices (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client text not null,
  invoice_no text,
  base numeric(12,2) not null check (base >= 0),
  igv numeric(12,2) not null default 0 check (igv >= 0),
  detraccion numeric(12,2) not null default 0 check (detraccion >= 0),
  renta_estimada numeric(12,2) not null default 0 check (renta_estimada >= 0),
  received_amount numeric(12,2) check (received_amount >= 0),
  my_share_pct numeric(5,2) not null default 50 check (my_share_pct between 0 and 100)
);

create table public.company_withdrawals (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  amount numeric(12,2) not null check (amount > 0),
  transaction_id uuid references public.transactions (id) on delete set null
);

-- ───────────────────────── metas, presupuesto, parámetros ─────────────────────────

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  priority smallint not null default 0
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1), -- primer día del mes
  amount numeric(12,2) not null check (amount >= 0),
  unique nulls not distinct (category_id, month)
);

create table public.fx_rates (
  date date primary key,
  usd_pen numeric(10,4) not null check (usd_pen > 0),
  source text not null default 'bcrp' check (source in ('bcrp', 'manual'))
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Correos permitidos para entrar (se llena desde ALLOWED_EMAIL con `npm run db:allow`).
create table public.allowed_emails (
  email text primary key check (email = lower(email))
);
