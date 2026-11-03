"use client";

import { MailWarning } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ignoreRawEmail } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { formatShortDate, formatTime } from "@/lib/format";

type Email = { id: string; subject: string | null; received_at: string | null; parse_status: string; error: string | null };

/** Correos que la app no entendió o no pudo guardar (SPEC 1: nunca se pierden ni se adivinan). */
export function UnparsedEmails({ emails }: { emails: Email[] }) {
  const [pending, startTransition] = useTransition();
  if (emails.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-sm font-medium">
        <MailWarning className="size-4 text-amber-400" /> Correos sin entender ({emails.length})
      </h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {emails.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.subject?.replace(/ - Servicio de Notificaciones BCP$/, "")}</p>
              <p className="text-xs text-muted-foreground">
                {e.received_at && `${formatShortDate(e.received_at)} · ${formatTime(e.received_at)} · `}
                {e.parse_status === "error" ? `No se pudo guardar: ${e.error}` : (e.error ?? "Formato no reconocido")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="touch"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await ignoreRawEmail(e.id);
                  if (r.ok) toast.success("Correo ignorado");
                })
              }
            >
              Ignorar
            </Button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-muted-foreground">
        Si es un movimiento, regístralo a mano con +. Si falta un tipo de cambio, ponlo en Ajustes y se reintenta solo.
      </p>
    </section>
  );
}
