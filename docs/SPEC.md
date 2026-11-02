# Documento de diseño — FLIP

**FLIP:** Finanzas y Liderazgo Inteligente con un Propósito.
**Usuario:** José Leandro (uso personal, un solo usuario)
**Versión:** 1.7 — 2 de noviembre de 2026 (saldos de las cuentas). 1.6: nombre FLIP, cuentas reales, Yape en débito, reglas de efectivo y reembolsos
**Para:** construirla con Claude Code. Este documento tiene todo el contexto; los puntos que aún faltan confirmar están en la sección 17.

---

## 1. Objetivo

Una web personal **100% responsive** (se abre en el navegador y se acomoda al celular y a la computadora; **no es una app instalable**) que:

1. **Registre sola** cada gasto de BCP y Yape leyendo las notificaciones de Gmail.
2. **Calcule el sueldo de Luz del Sur** (neto, AFP, impuesto, gratificaciones, CTS) y lo proyecte en el tiempo.
3. **Ayude a salir de las deudas** con un plan y una fecha estimada.
4. **Proyecte el ahorro para un departamento** en ~3 años (meta: noviembre 2029).
5. Lleve los **ingresos de la empresa** (cuenta mancomunada, 50/50) en una vista aparte.
6. Más adelante, use **machine learning** para clasificar gastos, predecir el gasto del mes y detectar gastos raros.

**Principios**
- Primero el celular. Registrar un gasto a mano debe tomar menos de 5 segundos.
- Todo se muestra en soles; los montos en dólares se convierten con el tipo de cambio del día y se guarda también el monto original.
- **No contar nada dos veces:** pagar la tarjeta, mover plata entre cuentas propias o recibir el reembolso de un gasto compartido **no son gastos ni ingresos**.
- Si la app no entiende un movimiento, va a una **bandeja "Por revisar"**; nunca se pierde ni se adivina.

---

## 2. Stack técnico (todo gratis)

| Pieza | Herramienta |
|---|---|
| Web | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Gráficos | Recharts |
| Base de datos y login | Supabase (Postgres + Auth + Row Level Security) |
| Hosting | Vercel (plan gratis) + Vercel Cron para tareas diarias |
| Lectura de Gmail | Google Apps Script en la cuenta de Gmail del usuario |
| Diseño | Responsive, primero el celular (Tailwind breakpoints). **Sin PWA ni service worker** |
| Identidad visual | Nombre **FLIP**. Estilo tecnológico, **tema oscuro**: fondos casi negros y **verde** como color principal (inspirado en la paleta de Supabase) |
| Tipo de cambio | API pública del BCRP (desde la Fase 1, para que sea real), con respaldo manual. Si un día no hay dato (fin de semana o feriado), usar el último disponible |
| IA para clasificar (opcional) | API de Claude (Haiku) solo para correos que no se entienden; costo de centavos al mes |

**Login:** solo con Google, y solo se permite el correo del usuario (lista de permitidos). RLS activado en todas las tablas.

---

## 3. Arquitectura

```
Gmail ──(Apps Script, cada 5 min)──► POST /api/ingest  (firma con secreto compartido)
                                          │
                                          ▼
                              Guarda raw_emails (idempotente por gmail_message_id)
                                          │
                                 Parser según el asunto
                          ┌───────────────┴───────────────┐
                    Formato conocido               Formato desconocido
                          │                               │
                 transactions (confirmado)     transactions (por_revisar)
                          │                          (+ IA opcional)
                          ▼
            Reglas de comercio → categoría + etiquetas
                          │
                          ▼
            ¿Gasto en comida/salidas ≥ S/ 60? → preguntar "¿Gasto compartido?"
```

### 3.1 Apps Script (en Gmail del usuario)
- Trigger por tiempo cada 5 minutos.
- Búsqueda: `(from:"BCP Notificaciones" OR from:"YAPE Notificaciones") newer_than:3d -label:finanzas/procesado` (confirmar los correos exactos de los remitentes, ver sección 17).
- Por cada correo: manda `{gmail_message_id, from, subject, date, plain_body}` al endpoint con el header `X-Ingest-Signature` (HMAC-SHA256 del body con un secreto).
- Si responde 200, le pone la etiqueta `finanzas/procesado`. Si falla, reintenta en la siguiente vuelta.
- Función aparte `backfill(dias)` para cargar el historial la primera vez (por ejemplo, 90 días).

### 3.2 Endpoint `/api/ingest`
- Verifica la firma. Hace upsert en `raw_emails` por `gmail_message_id` (si llega dos veces, no pasa nada).
- Despacha al parser según el asunto (sección 5). Guarda la versión del parser para poder volver a leer correos viejos si se mejora.
- **Duplicados:** antes de crear un movimiento, busca uno existente con el mismo número de operación; si no hay número de operación, con el mismo monto, la misma cuenta y la hora ± 10 minutos.

---

## 4. Cuentas

Cuentas reales en la app del BCP: **Corriente soles**, **Ahorros soles**, **Dólares** y **CTS soles**, más la **Visa Oro LATAM**.

| Cuenta | Tipo | Identificador en correos | Notas |
|---|---|---|---|
| Cuenta corriente soles (sueldo) | Corriente | "Cuenta sueldo" (por confirmar) | Aquí entra el sueldo; desde aquí se paga la tarjeta |
| Cuenta de ahorros soles | Ahorros | ****? (por confirmar) | **Está asociada a Yape** y a la tarjeta de débito ****4039. Los Plin salen de aquí |
| Cuenta en dólares | Ahorros (US$) | ****? (por confirmar) | También asociada a la tarjeta de débito ****4039, solo por si acaso |
| Visa Oro LATAM Pass ****6129 | Crédito (S/; los consumos en US$ se facturan en dólares) | "****6129" | Línea S/ 6,750. Pago el día 5 de cada mes |
| CTS soles | Activo (no líquido) | Manual | Depósitos en mayo y noviembre |
| Efectivo | Billetera | Retiros de cajero | Ver la regla de efectivo abajo |
| Fondo AFP | Activo (no líquido) | Manual / calculado | El 25% puede ir a la cuota inicial del depa |
| Empresa (mancomunada) | Aparte | Manual | Solo cuenta como tuyo lo que pasas a tu cuenta |

- **Tarjeta de débito ****4039:** no es una cuenta aparte; es el medio de pago de la cuenta de ahorros soles. Los consumos con "****4039" se registran en esa cuenta.
- **Yape:** no es una cuenta aparte. Cobra de la cuenta de ahorros soles (débito ****4039), **no** de la tarjeta de crédito ****6129. Los Yapes que recibes también entran a la cuenta de ahorros soles.
- Los correos mencionan "Clasica ****2046" y "Clasica ****6060": falta confirmar a cuál de las cuentas de arriba corresponde cada una (sección 17).

**Saldos al 2 nov 2026** (lo que muestra la app del BCP): cuenta corriente soles (sueldo) **S/ 298.57** · cuenta de ahorros soles (Yape) **S/ 422.53** · cuenta en dólares **US$ 0** · CTS **S/ 0** · Visa Oro: **S/ 6,568.52 usados** (al 1 nov). Efectivo, Fondo AFP y Empresa: sin saldo registrado.

**Cómo se calcula el saldo:** saldo inicial + movimientos confirmados desde la fecha de ese saldo. Gastos, retiros y pagos de deuda restan; ingresos y reembolsos suman; transferencias y pagos de tarjeta salen de la cuenta de origen y entran a la de destino (pagar la tarjeta baja lo usado). En la tarjeta el saldo es negativo (lo usado de la línea). Si el saldo no cuadra con el banco, se corrige en Ajustes ("Saldo hoy") y desde ese momento se vuelve a contar.

**Regla de efectivo (no contar dos veces):**
- Un retiro de cajero se cuenta como gasto en la categoría "Efectivo" (efectivo sin detallar).
- Si registras a mano un gasto pagado en efectivo, ese gasto aparece en su categoría (Comida, Transporte…) y **se descuenta del "Efectivo" sin detallar**: el total gastado no cambia, solo ganas detalle.
- Si los gastos en efectivo superan lo retirado (por ejemplo, plata en efectivo que te dieron), el excedente sí cuenta como gasto nuevo.

## 5. Formatos de correo (parsers)

Todos los de BCP vienen de **"BCP Notificaciones"** y los de Yape de **"YAPE Notificaciones"**. Se identifican por el **asunto**.

| # | Asunto (contiene) | Tipo de movimiento | Campos a extraer |
|---|---|---|---|
| 1 | `Realizaste un consumo con tu Tarjeta de Crédito BCP` | **gasto** (cuenta TC 6129) | Total del consumo (S/ o $), Empresa, Fecha y hora, Número de tarjeta, Número de operación |
| 2 | `Realizaste un consumo con tu Tarjeta de Débito BCP` | **gasto** (débito 4039). Si la Empresa empieza con `PLIN-` → **pago a persona** (por_revisar) | Igual que el 1 |
| 3 | `Constancia de Transferencia a Otros Bancos` | **por_revisar** (puede ser a otra persona o a una cuenta propia en otro banco) | Monto enviado, Comisión, Total cobrado, cuenta de origen, Fecha y hora |
| 4 | `Constancia de Transferencia Entre mis Cuentas` | **transferencia interna** (no es gasto) | Monto transferido, Desde (cuenta ****), Enviado a (cuenta ****), Fecha y hora |
| 5 | `Constancia de Pago de Tarjeta de Crédito Propia` | **pago de tarjeta** (no es gasto; baja la deuda de la TC) | Monto pagado, Pagado a (VISA Oro ****6129), Tipo de pago (Pago total / mínimo), cuenta de origen (Cuenta corriente / sueldo), Fecha y hora |
| 6 | `CONSTANCIA DE PAGO DE SERVICIO - BANCA MOVIL BCP` | **gasto** de servicio fijo | Empresa (p. ej. CLARO), Servicio, Cuenta de origen (puede ser la TC ****6129), Monto total, Vencimiento, Número de operación, Fecha |
| 7 | `Tu yapeo de servicio ha sido confirmado` | **gasto** (Yape) | Monto total, Fecha y hora, Nº de operación Yape, Empresa (p. ej. Metropolitano y Corredores), Servicio |
| 8 | `Realizaste un retiro en un Agente BCP` (y probablemente uno parecido para cajero) | **retiro_efectivo** → gasto "Efectivo" | Monto retirado, Comisión por operación ("GRATIS" = 0), Fecha y hora, Número de Tarjeta de Débito |
| 9 | `Realizamos una devolución de una operación a tu Tarjeta de Débito BCP` | **devolución**: busca el movimiento original (mismo comercio y monto, últimos 30 días) y lo anula. Si no lo encuentra → ingreso por_revisar | Total devuelto, Fecha y hora, Número de Tarjeta, Nombre del Comercio (p. ej. `PLIN-NOMBRE`) |
| ? | Cualquier otro de BCP o Yape | **por_revisar** + IA opcional | Texto completo |

**Yape está asociado a la cuenta de ahorros soles (tarjeta de débito ****4039), no a la tarjeta de crédito.** Un Yape enviado a una persona llega como **consumo con tarjeta** (según el usuario; se asume formato 2, débito ****4039; confirmar con el primer correo real). Si llegan dos correos por la misma operación (uno del BCP y otro de Yape), se fusionan en un solo movimiento (mismo monto, ± 10 minutos): se queda el del BCP y se le agrega el detalle de Yape (destinatario, servicio).

**Falta ejemplo de:** abono de sueldo (si BCP lo notifica). Hasta que llegue, cae en "Por revisar".

**Formatos de fecha encontrados (cada parser debe aceptar el suyo):**
- `01 de noviembre de 2026 - 02:31 PM`
- `22 de Octubre de 2026 - 11:50 AM` (mes con mayúscula)
- `Lunes, 26 Octubre 2026 - 08:22 A. M.`
- `30 Oct, 2026 - 07:37 am`
- `27 de octubre de 2026 - 19:40 PM` ⚠️ **hora de 24 horas con "PM"**: si la hora es mayor que 12, ignorar AM/PM.

**Montos:** `S/ 1,234.56` o `$ 3.84`. Quitar las comas de miles y guardar la moneda.

**Duplicado conocido a revisar:** un pago de servicio con la TC (formato 6) puede generar también un correo de consumo (formato 1). Se resuelve con la regla de duplicados de la sección 3.2.

**Tests:** crear fixtures en texto plano por cada formato (con montos y comercios de ejemplo) y tests unitarios por parser antes de conectarlo a Gmail.

---

## 6. Modelo de datos (Supabase)

```
accounts            id, name, type(corriente|ahorros|debito|credito|billetera|activo|empresa), last4, card_last4, currency, credit_limit, payment_day, closing_day,
                    opening_balance, opening_balance_at (saldo inicial y su fecha; ver sección 4)
categories          id, name, icon, color, parent_id, kind(gasto|ingreso)
tags                id, name
merchant_rules      id, pattern (regex o "empieza con"), category_id, tags[], tx_type, priority
transactions        id, occurred_at, amount, currency, fx_rate, amount_pen,
                    account_id, counterpart_account_id (para transferencias),
                    type(gasto|ingreso|transferencia|pago_tarjeta|pago_deuda|reembolso|retiro_efectivo),
                    category_id, merchant, note, tags[],
                    source(gmail|manual|recurrente), external_op_id, raw_email_id,
                    status(confirmado|por_revisar|anulado), shared_expense_id, person_id (quién te yapeó o a quién pagaste),
                    reversal_of (id del movimiento que una devolución anula), created_at
raw_emails          id, gmail_message_id (unique), from, subject, received_at, body, parser, parser_version, parse_status, error
shared_expenses     id, transaction_id, total, my_share, note
shared_participants id, shared_expense_id, person_id, amount_owed, amount_paid
people              id, name, alias (para cruzar "PLIN-NOMBRE")
debts               id, name, kind(tarjeta|cuotas|personal), creditor_person_id, currency, original_amount, balance,
                    installment_amount, installments_total, installments_paid, next_due_date, tcea, notes
debt_payments       id, debt_id, transaction_id, amount, currency, paid_at
income_profile      id, employer, start_date, end_date, monthly_gross, grat_days_base, eps(bool), afp_name, afp_fund, afp_commission_type(flujo|mixta),
                    pay_schedule (json, p. ej. [{"day":20,"share":0.5},{"day":5,"share":0.5,"month_offset":1}]),
                    profit_sharing_salaries (4.5), bonus_salaries_max (2.0)
income_events       id, kind(sueldo|gratificacion|cts|utilidades|bono|asignacion_vacacional|empresa|otro), expected_date, expected_amount, actual_transaction_id
company_invoices    id, date, client, invoice_no, base, igv, detraccion, renta_estimada, received_amount, my_share_pct (50)
company_withdrawals id, date, amount, transaction_id
goals               id, name, target_amount, target_date, priority
budgets             id, category_id, month, amount
fx_rates            date, usd_pen
settings            uit, afp_rates, shared_prompt_threshold, etc.
```

---

## 7. Categorías y etiquetas

**Categorías de gasto:** Comida · Delivery · Salidas · Snacks · Transporte · Servicios (celular, internet) · Suscripciones · Compras · Salud (copagos EPS, farmacia) · Educación · Regalos · Pareja · Efectivo · Pago a persona · Comisiones bancarias · Intereses · Otros.

**Etiquetas:** `#hormiga` (gastos chicos y repetidos), `#suscripcion`, `#fijo`, `#compartido`, `#impulsivo`, `#empresa`, `#deducible` (restaurantes con boleta electrónica a tu DNI, ver sección 9.4), `#usd`, `#pareja`, `#viaje`.

**Reglas de comercio iniciales:**

| Comercio (contiene / empieza con) | Categoría | Etiquetas |
|---|---|---|
| `APPLE.COM/BILL` | Suscripciones | #suscripcion #usd |
| `VENDOMATICA` | Snacks | #hormiga |
| `Metropolitano` | Transporte | #fijo |
| `CLARO` | Servicios | #fijo |
| `PLIN-` | Pago a persona | → preguntar |
| `RAPPI`, `PEDIDOSYA` | Delivery | |
| Retiro de cajero | Efectivo | |

Cuando el usuario cambia la categoría de un movimiento, la app ofrece "¿Aplicar siempre a este comercio?" y crea la regla.

---

## 8. Gastos compartidos y "Te deben"

Caso típico: José paga con tarjeta una comida en grupo y sus amigos le van yapeando de a pocos. Los Yapes recibidos **no llegan por correo**.

- **Pregunta automática:** cuando entra un gasto de Comida, Delivery o Salidas ≥ S/ 60 (se puede cambiar en ajustes), la app muestra una tarjeta: *"S/ 180 en [comercio]. ¿Fue compartido?"* → Sí / No.
- **Formulario rápido:** total, mi parte (o dividir en partes iguales), personas (con autocompletado) y cuánto debe cada una.
- **"Me yapearon":** botón fijo en la pantalla de inicio → elegir persona → monto → se marca como pagado. Se registra como **reembolso**, no como ingreso, y entra a la cuenta de ahorros soles (la de Yape). Hoy no llega ningún correo cuando te yapean, así que siempre es manual.
- **Fase 1 (antes de tener gastos compartidos):** el reembolso se guarda con la persona y el monto, sin enlazarlo a un gasto, y **resta del gastado del mes** (porque solo cuenta como gasto tu parte). En la Fase 3 se podrá enlazar al gasto compartido.
- **Contabilidad:** en los reportes cuenta como gasto solo **mi parte**; lo demás queda como "por cobrar" hasta que paguen.
- **Inicio:** tarjeta "Te deben S/ X" con la lista de personas y días desde el gasto.

---

## 9. Ingresos — Luz del Sur

**Puesto:** Analista de Inteligencia Artificial Junior. **Ingreso:** 26 de octubre de 2026.
**AFP:** Prima, Fondo 2, **comisión sobre flujo de 1.60%** → descuento total **12.97%** del sueldo (10% aporte + 1.37% prima de seguro + 1.60% comisión). Solo el 10% va a tu fondo.
**Días de pago:** **el 20 y el 5**, la mitad cada uno (por defecto: el 20 es el adelanto del mes y el 5 el resto del mes anterior, con los descuentos). Tal vez cambie a pago único el 20 más adelante → `pay_schedule` editable en ajustes.

| Concepto | Regla | Monto estimado |
|---|---|---|
| Sueldo bruto | Mensual | S/ 4,785 |
| AFP | 12.97% (10% + 1.37% + 1.60%) | **S/ 620.61** |
| Impuesto a la renta (quinta) | Escala anual; deducción de 7 UIT | 2027: ~S/ 340/mes (incluye utilidades de Prima) · 2028: ~S/ 530/mes (sube por las utilidades completas) |
| **Neto de un mes normal** (promedio; la retención real puede concentrarse en los meses con utilidades) | | **nov–dic 2026: ~S/ 4,164** · **2027: ~S/ 3,825** · 2028: ~S/ 3,635 |
| Gratificación (jul y dic) | Base de 35 días = S/ 5,582.50 + 6.75% (por tener EPS) | S/ 5,959 cada una. **Dic 2026: ~S/ 1,986** (2/6, solo noviembre y diciembre cuentan como meses completos) |
| CTS | Mayo y noviembre | May 2027 ~S/ 2,550 · desde Nov 2027 ~S/ 2,860 por depósito |
| Asignación vacacional | 1 sueldo al año, cuando sales de vacaciones | Desde oct 2027 (ya con 1 año) |
| **Utilidades Luz del Sur** | **4.5 sueldos al año (dato fijo)**, proporcional a los días trabajados; se pagan en abril | **Abr 2027: ~S/ 3,950** (67 días de 2026) · **Abr 2028 en adelante: ~S/ 21,530** brutos |
| **Bono por desempeño** | Bono + utilidades llegan hasta ~6.5 sueldos → bono de **0 a 2 sueldos** | Abr 2027: S/ 0 (todavía no cumples el año) · Abr 2028 en adelante: escenario de S/ 0 a ~S/ 9,570 |
| **Utilidades Prima AFP** (trabajo anterior, feb–23 oct 2026) | 3.5 sueldos al año, proporcional a lo ganado: feb–ago a S/ 2,200 y sep–23 oct a S/ 3,200 | **Marzo 2027: ~S/ 6,100 brutos** (~S/ 5,260 después de impuesto). Rango probable S/ 5,500–6,500 |
| Pago de los 6 días de octubre | Proporcional | ~S/ 833 neto (probablemente el 5 de noviembre) |

A las utilidades y al bono no les descuentan AFP, pero sí impuesto (a tu nivel, ~14% de cada sol adicional).

**Parámetros que se pueden cambiar en ajustes:** UIT (2026 = S/ 5,500), tasas de AFP, tipo de comisión, días de pago, sueldos de utilidades (4.5) y bono máximo (2.0).

### 9.1 Notas
- **Impuesto 2026:** sumando Prima AFP (~S/ 27,500: sueldos, gratificación de julio, gratificación trunca y vacaciones truncas) y Luz del Sur (~S/ 12,200), el total de 2026 queda en ~S/ 39,700, apenas encima de las 7 UIT (S/ 38,500). **Impuesto estimado: ~S/ 100 en todo el año.** Entrega a Luz del Sur el **certificado de rentas y retenciones** de Prima para que lo retengan en diciembre y no tengas que regularizar después. La app debe tener un campo "ingresos y retenciones de otros empleadores en el año".
- **Impuesto 2027:** las utilidades de Prima (marzo) suben el impuesto del año a ~S/ 4,080 (~S/ 340/mes). Prima retiene algo al pagarlas; el resto lo ajusta Luz del Sur si le informas.
- A la gratificación no le descuentan AFP, solo impuesto.
- Todo se ajusta solo cuando llega la primera boleta real (registrar el neto real y la app recalcula).

### 9.2 Calculadora de impuesto (para el código)
Renta neta anual = bruto anual − 7 UIT. Tramos: 8% hasta 5 UIT · 14% de 5 a 20 · 17% de 20 a 35 · 20% de 35 a 45 · 30% más de 45 UIT.

### 9.3 AFP
- Guardar los aportes acumulados (10% del sueldo) como el activo "Fondo AFP".
- Para la meta del depa: hasta el 25% del fondo puede ir a la cuota inicial de la primera vivienda con un crédito hipotecario (Ley 30478).

### 9.4 Deducción adicional de 3 UIT (devolución de SUNAT)
Ciertos gastos con comprobante electrónico a tu DNI (restaurantes, hoteles, alquiler, honorarios) dan una deducción extra en la declaración anual, y SUNAT puede devolverte impuesto. La app marca esos gastos con `#deducible` y estima la devolución. *Verificar los porcentajes vigentes antes de implementarlo.*

---

## 10. Tarjeta de crédito (Visa Oro LATAM ****6129)

**Cómo funciona (como lo describió el usuario):** cada mes hay que pagar el día 5 lo consumido en el ciclo anterior. Fecha de corte: el usuario indica los días 5–7; confirmar con la "fecha de cierre" del estado de cuenta (`closing_day` editable; mientras tanto, el pago estimado suma los consumos entre un pago y el siguiente). Si pagas el **total del mes**, no hay intereses. Al pagar, la línea se libera.

**Corrección importante sobre el pago mínimo:** si pagas solo el mínimo, **lo que queda sí cobra intereses a la TEA de la tarjeta, que suele ser muy alta**, y además se acumula al mes siguiente. La app debe empujar siempre al **pago total**.

**Pantalla de tarjeta:**
- Usado vs línea (hoy: S/ 6,568.52 de S/ 6,750 → 97%).
- **"A pagar el 5/12: ~S/ X + US$ Y"**, estimado sumando los consumos del ciclo (por moneda).
- Alertas 5 días y 1 día antes del pago. Si el saldo de la cuenta sueldo no alcanza, avisar.
- Pagar la tarjeta (formato 5) no cuenta como gasto: el gasto ya se contó cuando se hizo cada consumo.
- Seguimiento de compras en cuotas (si las hay) y de millas LATAM Pass (opcional).
- Meta: usar menos del 30% de la línea (mejor para tu historial crediticio).

**Situación al 1 nov 2026:** usado S/ 6,568.52. Pago estimado del 5 de diciembre: ~S/ 2,000 + US$ 400. El resto vendría en el estado de cuenta de enero.

---

## 11. Deudas

| Deuda | Moneda | Saldo | Condiciones | Costo |
|---|---|---|---|---|
| Tarjeta Visa Oro (consumos por pagar) | S/ + US$ | S/ 6,568.52 | Pagar el total los días 5 | 0% si pagas el total |
| Crédito Yape | S/ | S/ 2,213.84 (8 cuotas × S/ 276.73). Préstamo de S/ 2,000 en 10 cuotas; 2 ya pagadas | Cobro automático el día 28; termina el 28 jun 2027 | **TCEA ~110%** (calculada: S/ 2,000 en 10 cuotas de S/ 276.73) |
| Daniela (novia) | **US$** | **US$ 489** (~S/ 1,687 a S/ 3.45) | Sin interés | 0% (pero el tipo de cambio puede variar) |
| Walter (compañero) | S/ | S/ 2,000 | Sin interés | 0% |
| **Total** | | **~S/ 12,470** | | |

**Plan sugerido:**
1. Tarjeta: siempre **pago total** (obligatorio para no pagar intereses).
2. **Prepagar el crédito Yape** apenas se pueda: es lo más caro. Prepagar reduce los intereses.
3. Daniela y Walter: acordar montos fijos por mes. A Daniela conviene pagarle en dólares cuando el tipo de cambio esté bajo.

**Pantalla de deudas:** barra de progreso por deuda, **fecha estimada en que quedas sin deudas**, intereses ahorrados por prepagar y un botón "Registrar pago" (enlaza con Plin o transferencias detectadas: cuando aparece un `PLIN-NOMBRE` que coincide con un acreedor, preguntar "¿Es un pago de tu deuda con NOMBRE?").

---

## 12. Empresa (cuenta mancomunada, 50/50)

Vista aparte. Solo ingresos.

- **Factura → lo que realmente queda:** monto facturado → − IGV 18% (es de SUNAT) → − detracción (va al Banco de la Nación y solo sirve para pagar impuestos) → − impuesto a la renta estimado (según el régimen) = **disponible** → **tu 50%**.
- Saldo actual en la cuenta: ~S/ 3,500.
- La plata de la empresa **no se suma a tus finanzas personales** hasta que la pasas a tu cuenta (`company_withdrawals` → ingreso personal con categoría "Empresa").
- Gráfico de ingresos de la empresa por mes y acumulado.

---

## 13. Pantallas

1. **Inicio:** neto del mes (entró − gastado), gastado del mes vs presupuesto, "A pagar tarjeta el 5", "Te deben", progreso de deudas, progreso de la meta del depa, últimos 5 movimientos, botones rápidos (**+ Gasto efectivo**, **Me yapearon**, **+ Ingreso**).
2. **Movimientos:** lista con filtros (mes, cuenta, categoría, etiqueta), buscador y pestaña **"Por revisar"** con un contador.
3. **Tarjeta:** ciclo, pago estimado, cuotas y alertas.
4. **Deudas:** lista, plan y fecha de salida.
5. **Ingresos:** perfil del sueldo, calendario de pagos (sueldo, gratificaciones, CTS), boletas reales vs estimadas.
6. **Metas y proyección:** meta del depa con escenarios (ver sección 14) y simulador ("¿qué pasa si gasto S/ X al mes?").
7. **Empresa:** facturas, retiros y tu 50%.
8. **Análisis:** gasto por categoría, tendencia mensual, gastos hormiga, suscripciones detectadas, gastos raros.
9. **Ajustes:** cuentas, categorías, reglas, parámetros (UIT, AFP, tipo de cambio, umbral de gasto compartido).

**Responsive (requisito, no extra):**
- **Celular (< 768 px):** barra inferior fija (Inicio · Movimientos · **+** · Metas · Más), tarjetas en una columna, tablas convertidas en listas de tarjetas, formularios en hoja inferior (bottom sheet), botones de al menos 44 px.
- **Tablet (768–1024 px):** dos columnas en el inicio, barra lateral colapsable.
- **Computadora (> 1024 px):** barra lateral fija, inicio en grilla de 3–4 columnas, tablas completas con filtros a la vista, gráficos más grandes.
- Probar cada pantalla en 375 px (iPhone), 768 px y 1440 px antes de darla por terminada.

---

## 14. Proyección (cálculo inicial)

Supuestos: AFP con comisión sobre flujo (12.97%), sin aumentos de sueldo, utilidades de Luz del Sur de 4.5 sueldos, utilidades de Prima AFP en marzo 2027, impuesto calculado por año, tipo de cambio S/ 3.45, deudas como en la sección 11, Yape prepagado al terminar las otras deudas. **No incluye CTS ni el fondo AFP.**

| Gasto de vida al mes | Sin deudas desde | Ahorrado a nov 2029 (sin bono) | Con bono de 2 sueldos |
|---|---|---|---|
| S/ 1,500 | **febrero 2027** | **~S/ 168,000** | ~S/ 185,000 |
| S/ 2,000 | marzo 2027 | ~S/ 150,000 | ~S/ 166,000 |
| S/ 2,500 | marzo 2027 | ~S/ 131,000 | ~S/ 148,000 |

Las utilidades completas (~S/ 21,500 brutos cada abril desde 2028) son la mayor parte de la diferencia.

**Además para el depa:** CTS acumulada (~S/ 16,800 a nov 2029, contando el depósito de ese mes) + hasta el 25% del fondo AFP + Bono Mivivienda (si aplica).

La app hace este cálculo en vivo, mes a mes, con los datos reales. Los escenarios se muestran como un gráfico de líneas con bandas.

### 14.1 Meta: depa de S/ 400,000

Supuestos: Nuevo Crédito Mivivienda (S/ 400k está dentro del rango; verificar el tope 2026), Bono del Buen Pagador del tramo más alto (~S/ 7,900), gastos de cierre ~2% (~S/ 8,000; si es de segunda mano sumar alcabala), TEA ~8%, 25 años. El ahorro incluye sueldo, gratificaciones, utilidades, 50% de la CTS (retirable desde 2027) y 25% del fondo AFP (~S/ 2,000–3,000). Sin aumentos de sueldo.

| Inicial | Necesitas (inicial + gastos) | Gasto S/ 1,500/mes | Gasto S/ 2,000/mes | Cuota hipotecaria aprox. |
|---|---|---|---|---|
| 10% (S/ 40,000) | ~S/ 48,000 | **dic 2027** | ene 2028 | ~S/ 2,650 + seguros |
| **20% (S/ 80,000)** | **~S/ 88,000** | **may 2028** (abr 2028 con bono) | jul 2028 | **~S/ 2,350 + seguros** |
| 30% (S/ 120,000) | ~S/ 130,000 | abr 2029 (dic 2028 con bono) | abr 2029 | ~S/ 2,050 + seguros |

**El límite real es la cuota, no la inicial:** el neto mensual regular en 2028 es ~S/ 3,635, así que una cuota de ~S/ 2,400 sería ~65% del sueldo mensual (los bancos suelen pedir bastante menos). Si el banco considera gratificaciones y utilidades (promedio ~S/ 6,770/mes), baja a ~36%. Por eso:
- Meta recomendada: **20–30% de inicial**, comprando entre **mediados de 2028 y 2029**.
- Pedir una **precalificación al banco a inicios de 2028** para saber cuánto presta realmente.
- La app debe mostrar en la pantalla de metas: inicial acumulada vs meta, fecha estimada y "cuota estimada / ingreso neto".

---

## 15. Machine learning (por fases)

| Qué | Cuándo | Cómo |
|---|---|---|
| Clasificar gastos | Desde el día 1 | Reglas → si no hay regla, Claude Haiku sugiere la categoría → cuando haya ~300 movimientos etiquetados, un clasificador propio (TF-IDF del comercio + monto + hora → regresión logística). Siempre editable |
| Detectar suscripciones | Al mes 2 | Mismo comercio y monto parecido cada ~30 días → etiqueta `#suscripcion` y aviso |
| Gastos raros | Al mes 2 | z-score por categoría y comercio: "Gastaste 3 veces tu promedio en Delivery esta semana" |
| Predecir el gasto del mes | Al mes 3–6 | A mitad de mes: "Al ritmo actual cierras en S/ X (presupuesto S/ Y)". Primero un modelo simple (promedio por día de la semana + estacionalidad), después suavizamiento exponencial o Prophet |
| Gastos hormiga | Al mes 1 | Suma mensual de gastos < S/ 15 que se repiten |
| Simulador de metas | Desde la fase 3 | Monte Carlo con la variación real de tus gastos → "70% de probabilidad de llegar a la meta en nov 2029" |

---

## 16. Seguridad y privacidad
- Login solo con Google y solo con el correo permitido. RLS en todas las tablas.
- El endpoint de ingesta exige firma HMAC; el secreto vive en las variables de entorno de Vercel y en las propiedades del Apps Script (nunca en el código).
- No guardar números completos de tarjeta: solo los últimos 4 dígitos.
- El texto de los correos (`raw_emails.body`) se borra a los 90 días; los campos extraídos se quedan.
- Exportar todo a CSV desde ajustes (respaldo).

---

## 17. Pendientes por confirmar
1. Confirmar en la primera boleta que el descuento de AFP sea 12.97% (S/ 620.61).
2. La **primera boleta real** (para ajustar el neto y confirmar cómo se reparte el pago entre el 20 y el 5).
3. Monto real de la **liquidación de Prima AFP** y del certificado de rentas y retenciones (para afinar el impuesto de 2026).
4. **Fecha de cierre** exacta de la tarjeta y si hay **compras en cuotas** (estado de cuenta / pestaña "En cuotas").
5. Correo de ejemplo de **abono de sueldo** (si BCP lo notifica).
6. Las direcciones de correo exactas de los remitentes "BCP Notificaciones" y "YAPE Notificaciones".
7. En la app BCP, confirmar que las notificaciones estén en **"desde cualquier monto"** para crédito y débito.
8. Empresa: **régimen tributario** y % de detracción de sus facturas.
9. Depa: precio objetivo **S/ 400,000** (definido). Falta: nuevo o de segunda mano (cambia los gastos de cierre) y confirmar el tope 2026 del Nuevo Crédito Mivivienda.
10. Gasto de vida mensual objetivo (para el presupuesto; por defecto S/ 1,500).
11. **Antes de la Fase 2:** a qué cuenta corresponde "Clasica ****2046" y "Clasica ****6060" (aparecen en los correos de transferencias, formatos 3 y 4). Hasta entonces los `last4` de las cuentas quedan vacíos (no se inventan).
12. Confirmar con el primer correo real que un Yape a una persona llega como consumo con débito ****4039 (formato 2).

---

## 18. Fases de construcción

**Fase 1 — Base (1–2 semanas)**
- Proyecto Next.js + Supabase + login. Tablas de la sección 6. Datos iniciales: cuentas, categorías, reglas, deudas, perfil de sueldo.
- Registro manual rápido (gasto, ingreso, "me yapearon"). Lista de movimientos. Inicio básico. Layout responsive (barra inferior en celular, barra lateral en computadora).
- *Listo cuando:* desde el navegador del celular registro un gasto en efectivo en menos de 5 segundos, lo veo en el inicio, y la misma pantalla se ve bien en la computadora.

**Fase 2 — Gmail automático (1–2 semanas)**
- Parsers 1–9 con tests usando fixtures. Endpoint de ingesta + Apps Script + backfill de 90 días.
- Duplicados, bandeja "Por revisar", reglas de comercio y conversión de dólares.
- *Listo cuando:* un consumo con la tarjeta aparece en la app en menos de 10 minutos, bien categorizado, y pagar la tarjeta no cuenta como gasto.

**Fase 3 — Dinero inteligente (1–2 semanas)**
- Gastos compartidos y "Te deben". Pantalla de tarjeta con el pago estimado. Deudas con su plan. Calendario de sueldo, gratificaciones y CTS. Meta del depa con escenarios. Vista de la empresa.
- *Listo cuando:* la app me dice cuánto pago el 5, cuánto me deben y en qué mes salgo de las deudas.

**Fase 4 — ML y análisis (continuo, desde el mes 2–3 de datos)**
- Clasificación con IA, suscripciones, gastos raros, predicción del mes y Monte Carlo para la meta.
- *Listo cuando:* la app clasifica sola más del 90% de los gastos y avisa a mitad de mes si vas a pasarte del presupuesto.

**Fase 5 — Extras (opcional, cuando todo lo anterior funcione)**
- Resumen semanal (domingo) por correo o Telegram: gastado, ahorrado, te deben, próximo pago de la tarjeta.
- Bot de Telegram para registrar rápido ("25 almuerzo", "me yapeó Juan 30").
- Patrimonio neto mes a mes (cuentas + CTS + AFP − deudas).
- Ayuda para la declaración anual de SUNAT (gastos `#deducible`, devolución estimada).
- Módulo del depa: simulador de crédito hipotecario Mivivienda (cuota inicial, cuota mensual, AFP 25%).
- Inversiones (depósito a plazo, fondos mutuos) cuando haya ahorro.

---

## 19. Notas para Claude Code
- Usar este archivo como `docs/SPEC.md` en el repo y resumir lo esencial en `CLAUDE.md`.
- Estructura sugerida: `app/` (rutas), `lib/parsers/` (un archivo por formato + `index.ts` que decide por asunto), `lib/finance/` (impuesto, AFP, gratificación, proyección, deudas), `supabase/migrations/`, `apps-script/Code.gs`, `tests/fixtures/emails/`.
- Las funciones de `lib/finance/` deben ser puras y tener tests con tolerancia de ± S/ 0.05 (por ejemplo: gratificación de diciembre 2026 = 1,986.44; utilidades Luz del Sur de abril 2027 = 4.5 × 4,785 × 67/365 ≈ 3,952.54; utilidades Prima marzo 2027 = 3.5/12 × (7 × 2,200 + (1 + 23/31) × 3,200) ≈ 6,117.47; impuesto 2027 sin utilidades de Prima ≈ 3,220.74 y con ellas ≈ 4,077.19; AFP mensual = 4,785 × 12.97% = 620.61; neto mensual promedio 2027 ≈ 3,824.62).
- Montos en `numeric(12,2)`; fechas en `timestamptz` con zona America/Lima.
- Variables de entorno: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `INGEST_SECRET`, `ALLOWED_EMAIL`, `ANTHROPIC_API_KEY` (opcional). Para Supabase local: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` y `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
- **Categorías de ingreso:** Sueldo · Gratificación · CTS · Utilidades · Bono · Asignación vacacional · Empresa · Otro (las mismas de `income_events.kind`).