-- FLIP — últimos 4 dígitos confirmados con correos reales (SPEC 1.8, sección 4):
--   ****2046: "Cuenta sueldo" en el pago de tarjeta y "Clasica ****2046" en transferencias.
--   ****6060: "Cuenta de cargo" del retiro con la tarjeta de débito ****4039 (cuenta de ahorros).
update public.accounts set last4 = '2046' where name = 'Cuenta corriente soles' and last4 is null;
update public.accounts set last4 = '6060' where name = 'Cuenta de ahorros soles' and last4 is null;
