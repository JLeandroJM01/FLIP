-- FLIP — datos iniciales (docs/SPEC.md). Solo datos del SPEC; lo que no se conoce queda en null.
-- El correo permitido NO va aquí: se carga desde ALLOWED_EMAIL con `npm run db:allow`.

-- ───────── Cuentas (sección 4) ─────────
insert into public.accounts (name, type, last4, card_last4, currency, credit_limit, payment_day, notes, sort_order) values
  ('Cuenta corriente soles', 'corriente', '2046', null, 'PEN', null, null, 'Aquí entra el sueldo; desde aquí se paga la tarjeta', 1),
  ('Cuenta de ahorros soles', 'ahorros',  '6060', '4039', 'PEN', null, null, 'Asociada a Yape y a la tarjeta de débito ****4039. Los Plin salen de aquí', 2),
  ('Cuenta en dólares',       'ahorros',  null, null,   'USD', null, null, 'También asociada a la tarjeta de débito ****4039, por si acaso', 3),
  ('Visa Oro LATAM Pass',     'credito',  '6129', null, 'PEN', 6750, 5,    'Pago el día 5 de cada mes. Los consumos en US$ se facturan en dólares', 4),
  ('Efectivo',                'billetera', null, null,  'PEN', null, null, 'El retiro cuenta como gasto "Efectivo"; los gastos en efectivo se descuentan de ahí', 5),
  ('CTS soles',               'activo',   null, null,   'PEN', null, null, 'Depósitos en mayo y noviembre', 6),
  ('Fondo AFP',               'activo',   null, null,   'PEN', null, null, 'Prima, Fondo 2. Hasta el 25% puede ir a la cuota inicial del depa', 7),
  ('Empresa (mancomunada)',   'empresa',  null, null,   'PEN', null, null, 'Solo cuenta como tuyo lo que pasas a tu cuenta', 8);

-- Saldos (SPEC 4): lo que el usuario veía en su app del BCP al cargar FLIP (2 nov 2026).
-- La tarjeta usa el dato del SPEC: S/ 6,568.52 usados al 1 nov 2026 (saldo negativo).
update public.accounts set opening_balance = 298.57, opening_balance_at = now() where name = 'Cuenta corriente soles';
update public.accounts set opening_balance = 422.53, opening_balance_at = now() where name = 'Cuenta de ahorros soles';
update public.accounts set opening_balance = 0,      opening_balance_at = now() where name = 'Cuenta en dólares';
update public.accounts set opening_balance = 0,      opening_balance_at = now() where name = 'CTS soles';
update public.accounts set opening_balance = -6568.52, opening_balance_at = '2026-11-01 00:00:00-05' where name = 'Visa Oro LATAM Pass';

-- ───────── Categorías (sección 7) ─────────
insert into public.categories (name, icon, color, kind, sort_order) values
  ('Comida',               'utensils',        '#f59e0b', 'gasto', 1),
  ('Delivery',             'bike',            '#f97316', 'gasto', 2),
  ('Salidas',              'party-popper',    '#ec4899', 'gasto', 3),
  ('Snacks',               'cookie',          '#eab308', 'gasto', 4),
  ('Transporte',           'bus',             '#38bdf8', 'gasto', 5),
  ('Servicios',            'smartphone',      '#60a5fa', 'gasto', 6),
  ('Suscripciones',        'repeat',          '#a78bfa', 'gasto', 7),
  ('Compras',              'shopping-bag',    '#c084fc', 'gasto', 8),
  ('Salud',                'heart-pulse',     '#f87171', 'gasto', 9),
  ('Educación',            'graduation-cap',  '#2dd4bf', 'gasto', 10),
  ('Regalos',              'gift',            '#fb7185', 'gasto', 11),
  ('Pareja',               'heart',           '#f472b6', 'gasto', 12),
  ('Efectivo',             'banknote',        '#a3e635', 'gasto', 13),
  ('Pago a persona',       'user-round',      '#94a3b8', 'gasto', 14),
  ('Comisiones bancarias', 'landmark',        '#78716c', 'gasto', 15),
  ('Intereses',            'percent',         '#ef4444', 'gasto', 16),
  ('Otros',                'circle-ellipsis', '#9a9a9a', 'gasto', 17),
  ('Sueldo',                'briefcase',      '#3ecf8e', 'ingreso', 1),
  ('Gratificación',         'sparkles',       '#34d399', 'ingreso', 2),
  ('CTS',                   'piggy-bank',     '#10b981', 'ingreso', 3),
  ('Utilidades',            'trending-up',    '#22c55e', 'ingreso', 4),
  ('Bono',                  'award',          '#4ade80', 'ingreso', 5),
  ('Asignación vacacional', 'tree-palm',      '#6ee7b7', 'ingreso', 6),
  ('Empresa',               'building-2',     '#14b8a6', 'ingreso', 7),
  ('Otro',                  'circle-plus',    '#9a9a9a', 'ingreso', 8);

-- ───────── Etiquetas (sección 7) ─────────
insert into public.tags (name) values
  ('hormiga'), ('suscripcion'), ('fijo'), ('compartido'), ('impulsivo'),
  ('empresa'), ('deducible'), ('usd'), ('pareja'), ('viaje');

-- ───────── Reglas de comercio (sección 7) ─────────
-- "Retiro de cajero → Efectivo" no es una regla de comercio: lo asigna el parser
-- del formato 8 (tipo retiro_efectivo) en la Fase 2.
insert into public.merchant_rules (pattern, match_type, category_id, tags, requires_review, priority)
select r.pattern, r.match_type::public.rule_match, c.id, r.tags, r.requires_review, r.priority
from (values
  ('APPLE.COM/BILL', 'contiene',    'Suscripciones',  array['suscripcion', 'usd'], false, 10),
  ('VENDOMATICA',    'contiene',    'Snacks',         array['hormiga'],            false, 10),
  ('Metropolitano',  'contiene',    'Transporte',     array['fijo'],               false, 10),
  ('CLARO',          'contiene',    'Servicios',      array['fijo'],               false, 10),
  ('PLIN-',          'empieza_con', 'Pago a persona', array[]::text[],             true,  20),
  ('RAPPI',          'contiene',    'Delivery',       array[]::text[],             false, 10),
  ('PEDIDOSYA',      'contiene',    'Delivery',       array[]::text[],             false, 10)
) as r(pattern, match_type, category, tags, requires_review, priority)
join public.categories c on c.name = r.category and c.kind = 'gasto';

-- ───────── Personas y deudas (sección 11) ─────────
insert into public.people (name) values ('Daniela'), ('Walter');

insert into public.debts (name, kind, creditor_person_id, account_id, currency, original_amount, balance,
                          installment_amount, installments_total, installments_paid, next_due_date, tcea, notes)
values
  ('Visa Oro LATAM (consumos por pagar)', 'tarjeta', null,
   (select id from public.accounts where name = 'Visa Oro LATAM Pass'),
   'PEN', null, 6568.52, null, null, 0, '2026-12-05', 0,
   'Pagar el total los días 5 (0% de interés si pagas el total). Saldo al 1 nov 2026'),
  ('Crédito Yape', 'cuotas', null, null,
   'PEN', 2000, 2213.84, 276.73, 10, 2, '2026-11-28', 1.1020,
   'Cobro automático el día 28; termina el 28 jun 2027. TCEA calculada con 10 cuotas de S/ 276.73 sobre S/ 2,000. Prepagar apenas se pueda'),
  ('Daniela', 'personal', (select id from public.people where name = 'Daniela'), null,
   'USD', 489, 489, null, null, 0, null, 0,
   'Sin interés. Conviene pagarle en dólares cuando el tipo de cambio esté bajo'),
  ('Walter', 'personal', (select id from public.people where name = 'Walter'), null,
   'PEN', 2000, 2000, null, null, 0, null, 0,
   'Sin interés');

-- ───────── Perfil de ingresos (sección 9) ─────────
insert into public.income_profile (employer, start_date, monthly_gross, grat_days_base, grat_bonus_rate, eps,
                                   afp_name, afp_fund, afp_commission_type, pay_schedule,
                                   profit_sharing_salaries, bonus_salaries_max)
values ('Luz del Sur', '2026-10-26', 4785, 35, 0.0675, true,
        'Prima', 2, 'flujo',
        '[{"day": 20, "share": 0.5}, {"day": 5, "share": 0.5, "month_offset": 1}]',
        4.5, 2.0);

-- ───────── Parámetros (secciones 8, 9, 9.1 y 17) ─────────
insert into public.settings (key, value) values
  ('uit', '{"2026": 5500}'),
  ('afp_rates', '{"aporte": 0.10, "seguro": 0.0137, "comision": 0.016}'),
  ('shared_prompt_threshold', '60'),
  ('shared_prompt_categories', '["Comida", "Delivery", "Salidas"]'),
  ('monthly_budget', '1500'),
  ('default_accounts', jsonb_build_object(
     'gasto',     (select id from public.accounts where name = 'Efectivo'),
     'ingreso',   (select id from public.accounts where name = 'Cuenta corriente soles'),
     'reembolso', (select id from public.accounts where name = 'Cuenta de ahorros soles'))),
  ('other_employers_income', '{"2026": {"employer": "Prima AFP", "income": 27500, "withheld": null, "estimated": true}}');
