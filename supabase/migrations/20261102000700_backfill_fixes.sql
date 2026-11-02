-- FLIP — correcciones con los correos reales del backfill (SPEC 1.12).

-- La cuenta en dólares es la "Cuenta digital ****8175" (pagos de la Visa en US$ y transferencias entre mis cuentas).
update public.accounts set last4 = '8175' where name = 'Cuenta en dólares' and last4 is null;

-- Crédito Yape según el correo "Tu crédito ya está disponible": S/ 2,000 en 9 cuotas (total S/ 2,490.55),
-- primera el 28 oct 2026 → 1 pagada, 8 por pagar (S/ 2,213.84). TCEA calculada: 72.09% (el ~72% del SPEC).
update public.debts
  set installments_total = 9,
      installments_paid = greatest(installments_paid - 1, 1),
      tcea = 0.7209,
      notes = 'Cobro automático el día 28; termina el 28 jun 2027. S/ 2,000 en 9 cuotas de S/ 276.73 (total S/ 2,490.55). TCEA 72.09%. Prepagar apenas se pueda'
  where name = 'Crédito Yape' and installments_total = 10;

-- SUNAT como fuente del tipo de cambio.
alter table public.fx_rates drop constraint if exists fx_rates_source_check;
alter table public.fx_rates add constraint fx_rates_source_check check (source in ('bcrp', 'sunat', 'manual'));
