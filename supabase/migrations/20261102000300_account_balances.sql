-- FLIP — saldos de cuentas (pedido del usuario, SPEC 1.7, sección 4).
-- Saldo actual = opening_balance + movimientos confirmados desde opening_balance_at.
-- En tarjetas de crédito el saldo es negativo: lo usado de la línea.
alter table public.accounts
  add column opening_balance numeric(12,2),
  add column opening_balance_at timestamptz,
  add constraint accounts_opening_balance_pair
    check ((opening_balance is null) = (opening_balance_at is null));
