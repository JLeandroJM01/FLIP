"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { reprocessEmails } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

/**
 * "Volver a leer": relee con los lectores actuales los correos sin entender, con error,
 * ignorados sin lector, devoluciones y consumos de versiones anteriores. Siempre visible
 * (también cuando no hay nada por revisar: una mejora de un lector puede corregir correos ya leídos).
 */
export function ReprocessButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="touch"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await reprocessEmails();
          toast.success(r.message ?? "Listo");
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Leyendo…" : "Volver a leer correos"}
    </Button>
  );
}
