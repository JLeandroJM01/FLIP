import { Target } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Metas · FLIP" };

export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Metas y proyección</h1>
      </header>
      <Card className="border-dashed bg-transparent">
        <CardHeader>
          <Target className="size-8 text-primary" />
          <CardTitle>Llega en la Fase 3</CardTitle>
          <CardDescription>
            Aquí verás la meta del depa con escenarios, la inicial acumulada, la fecha estimada y la cuota estimada
            frente a tu ingreso neto.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mientras tanto, registra tus gastos: la proyección usará tus datos reales.
        </CardContent>
      </Card>
    </div>
  );
}
