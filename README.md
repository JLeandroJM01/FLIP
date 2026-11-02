# FLIP

**Finanzas y Liderazgo Inteligente con un Propósito.** Web personal de finanzas (un solo usuario), 100% responsive, sin PWA.
La especificación completa está en [docs/SPEC.md](docs/SPEC.md) y lo esencial para desarrollar, en [CLAUDE.md](CLAUDE.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth con Google + RLS) · Vercel.

---

## Correr en local

Requisitos: Node 24, Docker Desktop abierto.

```bash
npm install
cp .env.example .env.local      # y completa los valores (ver abajo)
npm run db:start                # Supabase local en Docker (la 1ra vez descarga imágenes)
```

Crea `.env.development.local` con las claves del Supabase **local** (`npx supabase status -o env` las muestra):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY local>
SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY local>
```

```bash
npm run db:allow                # agrega ALLOWED_EMAIL a la lista de permitidos (local)
npm run dev                     # http://localhost:3100
```

- `.env.local` = Supabase en la nube; `.env.development.local` = Supabase local (gana en `npm run dev`). Ninguno se versiona.
- El puerto es **3100** (el 3000 lo usa otro proyecto).
- Para entrar con Google en local, el cliente OAuth de Google debe tener la URI de redirección `http://127.0.0.1:54321/auth/v1/callback`.
- `npm run db:reset` vuelve a crear la base local (migraciones + seed). Después corre `npm run db:allow` otra vez.

### Tests

```bash
npm test             # unitarios: finanzas (valores del SPEC), formato, validación, BCRP
npm run test:db      # RLS contra el Supabase local
npm run test:e2e     # Playwright: flujos + capturas en 375, 768 y 1440 px (e2e/screenshots/)
npm run lint && npm run typecheck
```

Los tests e2e crean una sesión del usuario permitido **solo en el Supabase local** (le ponen una contraseña aleatoria, sin pasar por Google) y borran al final los movimientos que crean (nota que empieza con `e2e`).

---

## Desplegar (Vercel + Supabase)

### 1. Base de datos en Supabase (nube)

```bash
npx supabase login
npx supabase link --project-ref <ref>          # FLIP: htzukrilogohdstlqnim
npx supabase db push --include-seed            # migraciones + datos iniciales
npm run db:allow:cloud                         # usa .env.local (nube)
```

En el panel de Supabase → **Authentication → URL Configuration**:
- Site URL: `https://<tu-dominio>.vercel.app`
- Redirect URLs: `https://<tu-dominio>.vercel.app/**` y `http://localhost:3100/**`

En **Authentication → Providers → Google**: activado, con el Client ID y Secret de Google Cloud.

### 2. Google Cloud (cliente OAuth "Web")

- Orígenes autorizados: `https://<tu-dominio>.vercel.app` y `http://localhost:3100`.
- URIs de redirección: `https://<ref>.supabase.co/auth/v1/callback` y `http://127.0.0.1:54321/auth/v1/callback`.
- Pantalla de consentimiento en modo *Testing* con tu correo como usuario de prueba (nadie más puede entrar).

### 3. Vercel

1. *Add New → Project* → importa el repo de GitHub (framework: Next.js, sin cambios de build).
2. Variables de entorno (Production y Preview):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `ALLOWED_EMAIL` | tu Gmail |

`SUPABASE_SERVICE_ROLE_KEY` e `INGEST_SECRET` **no** hacen falta todavía: se agregan en la Fase 2 (endpoint de ingesta).

3. Deploy. Abre la URL, entra con Google y registra un gasto desde el celular.

---

## Estado de la Fase 1

Hecho:
- Login solo con Google y solo para `ALLOWED_EMAIL` (proxy + callback + RLS en todas las tablas).
- Esquema completo de la sección 6 del SPEC, RLS en todas las tablas y datos iniciales (cuentas, categorías, etiquetas, reglas de comercio, personas, deudas, perfil de ingresos, parámetros).
- `lib/finance/`: AFP, impuesto de quinta, gratificación, utilidades, neto y resumen del mes (efectivo y reembolsos sin contar dos veces), con tests con los valores de la sección 19.
- Pantallas: Inicio básico, Movimientos (lista, filtros, buscador, pestaña "Por revisar", editar y anular), registro rápido (+ Gasto, + Ingreso, "Me yapearon"), Metas (marcador de la Fase 3), Más y Ajustes mínimos.
- Responsive: barra inferior en celular, barra lateral colapsable en tablet y fija en computadora; hoja inferior en celular y diálogo en computadora.
- Tipo de cambio: BCRP con respaldo manual.

### Pendiente
- **Desplegar**: aplicar las migraciones al Supabase en la nube y crear el proyecto en Vercel (pasos de arriba).
- **BCRP**: verificar desde Vercel que la serie `PD04640PD` y el formato de respuesta son los correctos (desde la máquina de desarrollo respondió con una página antibots). Si falla, queda el ingreso manual.
- "¿Aplicar siempre a este comercio?" al cambiar la categoría (SPEC 7): tiene sentido cuando lleguen los comercios de Gmail (Fase 2).
- Exportar todo a CSV desde Ajustes (SPEC 16).
- Presupuestos por categoría (la tabla `budgets` existe; hoy solo hay el presupuesto mensual total).
- Editar en Ajustes el resto del perfil de ingresos (sueldo bruto, AFP, utilidades); hoy solo los días de pago.
- Últimos 4 dígitos de las cuentas (quedan vacíos hasta que se confirmen).

## Para empezar la Fase 2 (Gmail automático)

Necesito:
1. **Un correo real de cada formato** (sección 5, formatos 1–9) en texto plano. Puedes cambiar montos y nombres, pero deja la estructura igual. Van a `tests/fixtures/emails/`.
2. Las **direcciones exactas** de "BCP Notificaciones" y "YAPE Notificaciones" (SPEC 17.6).
3. A qué cuenta corresponden **"Clasica ****2046"** y **"Clasica ****6060"** (salen en las transferencias).
4. El primer correo de un **Yape enviado a una persona** (para confirmar que llega como consumo con débito ****4039) y, si existe, el de **abono de sueldo**.
5. Confirmar en la app BCP que las notificaciones estén en **"desde cualquier monto"**.
6. La app **desplegada en Vercel** (el Apps Script necesita la URL del endpoint) y un `INGEST_SECRET` (`openssl rand -hex 32`) en Vercel y en las propiedades del Apps Script.
7. Acceso para crear el proyecto de **Apps Script** en tu Gmail (script.google.com): lo creas tú y pegas el código de `apps-script/Code.gs`.
