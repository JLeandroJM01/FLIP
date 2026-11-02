# Fixtures de correos

Texto plano (como lo entrega `GmailMessage.getPlainBody()`) de cada formato de la sección 5 del SPEC.
Formato del archivo: primera línea `Subject: …`, una línea en blanco y el cuerpo.

- **Reales (anonimizados)**: sacados de `raw_emails` con nombres, teléfonos y códigos reemplazados, y sin el pie legal.
- **Reconstruidos desde capturas** (todavía no llegó el texto real): `transferencia_otros_bancos`, `transferencia_propia`,
  `transferencia_terceros`, `pago_servicio`, `retiro_agente`, `devolucion`. Reemplazarlos por el texto real cuando llegue
  (backfill de 90 días) y ajustar el parser si cambia algo.

Nunca guardar aquí datos personales reales.
