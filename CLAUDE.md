# CLAUDE.md

**FLIP** — Finanzas y Liderazgo Inteligente con un Propósito. Web personal de finanzas de José Leandro (un solo usuario). **La fuente de verdad es [docs/SPEC.md](docs/SPEC.md)**: ante cualquier duda, consultarlo; si algo no está ahí o es ambiguo, preguntar en vez de inventar datos o reglas.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Gráficos con Recharts (desde la Fase 3).
- Supabase: Postgres + Auth (solo Google) + Row Level Security en **todas** las tablas.
- Hosting en Vercel (plan gratis) + Vercel Cron.
- Gmail → Google Apps Script → `POST /api/ingest` con firma HMAC (Fase 2).
- Tests: Vitest (unitarios, tolerancia ± S/ 0.05 en lib/finance) y Playwright (capturas responsive).
- Web 100% responsive. **No es PWA**: nada de manifest ni service worker.
- Identidad: tema oscuro tecnológico, fondos casi negros y verde como color principal (estilo paleta de Supabase). Colores como tokens en el tema de Tailwind/shadcn, no sueltos en los componentes.
- Tipo de cambio: API del BCRP con respaldo manual (último dato disponible si el día no tiene).

## Estructura
```
app/                    rutas (App Router)
components/             UI (components/ui = shadcn)
lib/supabase/           clientes de Supabase (browser, server, middleware)
lib/finance/            funciones PURAS: impuesto de quinta, AFP, gratificación, utilidades, neto, proyección, deudas
lib/parsers/            un archivo por formato de correo + index.ts que decide por asunto (Fase 2)
lib/format.ts           formato de soles y fechas
supabase/migrations/    esquema SQL (tablas de la sección 6 del SPEC)
supabase/seed.sql       datos iniciales (cuentas, categorías, reglas, deudas, perfil de ingresos)
apps-script/Code.gs     script de Gmail (Fase 2)
tests/                  tests unitarios; tests/fixtures/emails/ para los parsers
e2e/                    Playwright (capturas en 375, 768 y 1440 px)
```

## Comandos
```
npm run dev            # servidor local
npm run build          # build de producción
npm run lint
npm test               # Vitest
npm run test:e2e       # Playwright
npx supabase start     # Supabase local (requiere Docker)
npx supabase db reset  # aplica migraciones + seed en local
```

## Reglas de negocio clave
- **No contar nada dos veces.** Pagar la tarjeta (`pago_tarjeta`), mover plata entre cuentas propias (`transferencia`) y recibir el reembolso de un gasto compartido (`reembolso`) **no son gastos ni ingresos**. En reportes, de un gasto compartido solo cuenta **mi parte**.
- Yape no es una cuenta: cobra de la **cuenta de ahorros soles** (tarjeta de débito ****4039), no de la tarjeta de crédito. La tarjeta ****4039 tampoco es una cuenta: es el medio de pago de la cuenta de ahorros.
- Efectivo: el retiro de cajero es gasto "Efectivo" (sin detallar). Un gasto manual en efectivo va a su categoría y **se descuenta del Efectivo sin detallar** (el total no cambia); solo el excedente sobre lo retirado cuenta como gasto nuevo.
- "Me yapearon" = `reembolso` con `person_id`, entra a la cuenta de ahorros soles y **resta del gastado del mes**. No es ingreso.
- Si un movimiento no se entiende → `status = por_revisar`. Nunca se pierde ni se adivina.
- La plata de la empresa no es personal hasta que se retira a una cuenta propia.
- Montos en `numeric(12,2)`. Los montos en US$ guardan el original (`amount`, `currency`, `fx_rate`) y su equivalente `amount_pen`.
- Fechas en `timestamptz`; la zona horaria de negocio es **America/Lima** (el "mes" y el "día" se calculan en hora de Lima, no en UTC).
- Interfaz **en español**. Soles con formato `es-PE`: `S/ 1,234.56` (`Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })`).
- Primero el celular: registrar un gasto a mano en < 5 segundos; botones de al menos 44 px.
- Responsive: < 768 px barra inferior (Inicio · Movimientos · + · Metas · Más); 768–1024 px barra lateral colapsable; > 1024 px barra lateral fija. Verificar cada pantalla en 375, 768 y 1440 px.

## Finanzas (lib/finance)
- Funciones puras, sin acceso a la base de datos, con tests que usan los valores de la sección 19 del SPEC.
- AFP 12.97% (10% aporte + 1.37% seguro + 1.60% comisión sobre flujo). A gratificaciones, utilidades y bono no se les descuenta AFP, sí impuesto.
- Impuesto de quinta: renta neta = bruto anual − 7 UIT; tramos 8% (hasta 5 UIT), 14% (5–20), 17% (20–35), 20% (35–45), 30% (> 45). UIT 2026 = S/ 5,500.
- Parámetros (UIT, tasas AFP, días de pago, sueldos de utilidades, bono máximo, umbral de gasto compartido) viven en `settings`/`income_profile`, no en el código.

## Seguridad
- Login solo con Google y solo para `ALLOWED_EMAIL`. RLS en todas las tablas.
- Nada de secretos en el código: `.env.local` (no se versiona) y `.env.example` como plantilla.
- Variables: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL`, `INGEST_SECRET`, `ANTHROPIC_API_KEY` (opcional); para Supabase local, `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` y `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
- Solo últimos 4 dígitos de tarjetas. `raw_emails.body` se borra a los 90 días.

## Forma de trabajo
- **Claude no hace operaciones de git** (ni init, commit, push ni clone): las hace solo José. Claude deja los cambios en pasos pequeños y propone el mensaje de commit de cada uno.
- Antes de dar una pantalla por terminada: capturas de Playwright en 375, 768 y 1440 px.
