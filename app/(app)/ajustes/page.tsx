import { ChevronDown, LogOut } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORY_ICON_NAMES } from "@/components/category-icon-names";
import { Field, SelectField, SettingsForm } from "@/components/settings/settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { currentYearMonth, limaDateKey } from "@/lib/dates";
import { getAccountBalances, getCatalogs, getSettings } from "@/lib/data";
import { DEFAULT_AFP_RATES, type AfpRates } from "@/lib/finance";
import { formatMoney, formatPEN } from "@/lib/format";
import type { DefaultAccounts } from "@/lib/types";
import { saveAccount, saveCategory, saveManualFx, saveParameters, savePerson } from "./actions";

export const metadata: Metadata = { title: "Ajustes · FLIP" };

type PayItem = { day: number; share: number; month_offset?: number };

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  corriente: "Corriente", ahorros: "Ahorros", debito: "Débito", credito: "Crédito",
  billetera: "Billetera", activo: "Activo", empresa: "Empresa",
};

export default async function SettingsPage() {
  const { supabase, email } = await requireUser();
  const year = currentYearMonth().year;
  const [catalogs, settings, profileRes, fxRes] = await Promise.all([
    getCatalogs(supabase),
    getSettings(supabase),
    supabase.from("income_profile").select("employer, pay_schedule").is("end_date", null).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fx_rates").select("date, usd_pen, source").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const balances = await getAccountBalances(supabase, catalogs);
  const uitByYear = (settings.uit ?? {}) as Record<string, number>;
  const uit = uitByYear[year] ?? latestValue(uitByYear);
  const afp = { ...DEFAULT_AFP_RATES, ...((settings.afp_rates ?? {}) as Partial<AfpRates>) };
  const defaults = (settings.default_accounts ?? {}) as DefaultAccounts;
  const pay = ((profileRes.data?.pay_schedule ?? []) as PayItem[]).slice(0, 2);
  const fx = fxRes.data;
  const pct = (n: number) => String(Math.round(n * 10000) / 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Parámetros</CardTitle>
          <CardDescription>Se usan en los cálculos de sueldo, impuesto y presupuesto.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={saveParameters} submitLabel="Guardar parámetros">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`UIT ${year} (S/)`} name="uit" inputMode="decimal" defaultValue={uit ?? ""} />
              <Field label="Presupuesto de gasto mensual (S/)" name="monthly_budget" inputMode="decimal" defaultValue={String(settings.monthly_budget ?? 1500)} />
              <Field
                label="Preguntar si es compartido desde (S/)"
                name="shared_prompt_threshold"
                inputMode="decimal"
                defaultValue={String(settings.shared_prompt_threshold ?? 60)}
                hint="Comida, Delivery y Salidas (Fase 3)"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">AFP ({pct(afp.aporte + afp.seguro + afp.comision)}% en total)</legend>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Aporte %" name="afp_aporte" inputMode="decimal" defaultValue={pct(afp.aporte)} />
                <Field label="Seguro %" name="afp_seguro" inputMode="decimal" defaultValue={pct(afp.seguro)} />
                <Field label="Comisión %" name="afp_comision" inputMode="decimal" defaultValue={pct(afp.comision)} />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Días de pago{profileRes.data ? ` (${profileRes.data.employer})` : ""}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="1er pago: día" name="pay1_day" inputMode="numeric" defaultValue={pay[0]?.day ?? 20} />
                <Field label="% del sueldo" name="pay1_share" inputMode="decimal" defaultValue={pct(pay[0]?.share ?? 1)} />
                <Field label="2do pago: día" name="pay2_day" inputMode="numeric" defaultValue={pay[1]?.day ?? ""} />
                <Field label="% del sueldo" name="pay2_share" inputMode="decimal" defaultValue={pay[1] ? pct(pay[1].share) : ""} />
              </div>
              <p className="text-xs text-muted-foreground">
                Si el 2do pago tiene un día menor que el 1ro, es del mes siguiente. Para pago único, deja vacío el 2do.
              </p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Cuenta por defecto al registrar</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["gasto", "ingreso", "reembolso"] as const).map((kind) => (
                  <SelectField
                    key={kind}
                    name={`default_${kind}`}
                    label={kind === "gasto" ? "Gasto" : kind === "ingreso" ? "Ingreso" : "Me yapearon"}
                    defaultValue={defaults[kind]}
                  >
                    {catalogs.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </SelectField>
                ))}
              </div>
            </fieldset>
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de cambio</CardTitle>
          <CardDescription>
            {fx
              ? `Último: S/ ${Number(fx.usd_pen).toFixed(3)} por US$ del ${fx.date} (${fx.source === "bcrp" ? "BCRP" : "manual"}).`
              : "Aún no hay tipo de cambio guardado. Se toma del BCRP al registrar en dólares; si no responde, ingrésalo aquí."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm action={saveManualFx} submitLabel="Guardar tipo de cambio">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha" name="date" type="date" defaultValue={limaDateKey(new Date())} />
              <Field label="S/ por US$" name="usd_pen" inputMode="decimal" placeholder="3.450" />
            </div>
          </SettingsForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {catalogs.accounts.map((a) => (
            <Expandable
              key={a.id}
              summary={
                <>
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[a.type]} · {a.currency === "USD" ? "US$" : "S/"}
                    {balances.get(a.id) != null &&
                      ` · ${a.type === "credito" ? "usado " + formatPEN(-balances.get(a.id)!) : formatMoney(balances.get(a.id)!, a.currency)}`}
                  </span>
                </>
              }
            >
              <SettingsForm action={saveAccount}>
                <input type="hidden" name="id" value={a.id} />
                <Field label="Nombre" name="name" defaultValue={a.name} id={a.id} />
                <BalanceField accountId={a.id} isCredit={a.type === "credito"} currency={a.currency} balance={balances.get(a.id) ?? null} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Últimos 4 dígitos" name="last4" inputMode="numeric" maxLength={4} defaultValue={a.last4 ?? ""} id={a.id} />
                  <Field label="Tarjeta de débito asociada" name="card_last4" inputMode="numeric" maxLength={4} defaultValue={a.card_last4 ?? ""} id={a.id} />
                </div>
                {a.type === "credito" && (
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Línea (S/)" name="credit_limit" inputMode="decimal" defaultValue={a.credit_limit ?? ""} id={a.id} />
                    <Field label="Día de pago" name="payment_day" inputMode="numeric" defaultValue={a.payment_day ?? ""} id={a.id} />
                    <Field label="Día de cierre" name="closing_day" inputMode="numeric" defaultValue={a.closing_day ?? ""} id={a.id} />
                  </div>
                )}
                <Field label="Notas" name="notes" defaultValue={a.notes ?? ""} id={a.id} />
              </SettingsForm>
            </Expandable>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorías</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {(["gasto", "ingreso"] as const).map((kind) => (
            <section key={kind} className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground">{kind === "gasto" ? "Gastos" : "Ingresos"}</h3>
              <div className="divide-y">
                {catalogs.categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <Expandable
                      key={c.id}
                      summary={
                        <>
                          <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                          <span className="flex-1 truncate">{c.name}</span>
                        </>
                      }
                    >
                      <CategoryForm category={c} />
                    </Expandable>
                  ))}
              </div>
            </section>
          ))}
          <Expandable summary={<span className="flex-1 font-medium text-primary">+ Nueva categoría</span>}>
            <CategoryForm />
          </Expandable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personas</CardTitle>
          <CardDescription>Para &quot;Me yapearon&quot;, deudas y gastos compartidos. El alias sirve para reconocer &quot;PLIN-NOMBRE&quot;.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {catalogs.people.map((p) => (
            <Expandable key={p.id} summary={<span className="flex-1">{p.name}{p.alias && <span className="text-muted-foreground"> · {p.alias}</span>}</span>}>
              <SettingsForm action={savePerson}>
                <input type="hidden" name="id" value={p.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre" name="name" defaultValue={p.name} id={p.id} />
                  <Field label="Alias (Plin)" name="alias" defaultValue={p.alias ?? ""} id={p.id} />
                </div>
              </SettingsForm>
            </Expandable>
          ))}
          <Expandable summary={<span className="flex-1 font-medium text-primary">+ Nueva persona</span>}>
            <SettingsForm action={savePerson} submitLabel="Agregar">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre" name="name" id="nueva" />
                <Field label="Alias (Plin)" name="alias" id="nueva" />
              </div>
            </SettingsForm>
          </Expandable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesión</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="touch">
              <LogOut /> Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Expandable({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-1 pb-4">{children}</div>
    </details>
  );
}

function CategoryForm({ category }: { category?: { id: string; name: string; kind: string; icon: string | null; color: string | null } }) {
  const key = category?.id ?? "nueva";
  return (
    <SettingsForm action={saveCategory} submitLabel={category ? "Guardar" : "Crear categoría"}>
      {category && <input type="hidden" name="id" value={category.id} />}
      {category && <input type="hidden" name="kind" value={category.kind} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Nombre" name="name" defaultValue={category?.name ?? ""} id={key} className="col-span-2" />
        {!category && (
          <SelectField label="Tipo" name="kind" defaultValue="gasto">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </SelectField>
        )}
        <SelectField label="Icono" name="icon" defaultValue={category?.icon ?? "circle-ellipsis"}>
          {CATEGORY_ICON_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
        <Field label="Color" name="color" type="color" defaultValue={category?.color ?? "#3ecf8e"} id={key} className="[&_input]:p-1" />
      </div>
    </SettingsForm>
  );
}

function BalanceField({
  accountId,
  isCredit,
  currency,
  balance,
}: {
  accountId: string;
  isCredit: boolean;
  currency: "PEN" | "USD";
  balance: number | null;
}) {
  const shown = balance === null ? "" : String(isCredit ? -balance : balance);
  const symbol = currency === "USD" ? "US$" : "S/";
  return (
    <>
      <input type="hidden" name="balance_original" value={shown} />
      <input type="hidden" name="is_credit" value={isCredit ? "1" : "0"} />
      <Field
        label={isCredit ? `Usado hoy de la línea (${symbol})` : `Saldo hoy (${symbol})`}
        name="balance_now"
        inputMode="decimal"
        defaultValue={shown}
        id={accountId}
        hint="Lo que ves hoy en la app del banco. Si lo cambias, FLIP cuenta los movimientos desde ahora."
      />
    </>
  );
}

function latestValue(byYear: Record<string, number>): number | undefined {
  const years = Object.keys(byYear).sort();
  return years.length ? byYear[years.at(-1)!] : undefined;
}
