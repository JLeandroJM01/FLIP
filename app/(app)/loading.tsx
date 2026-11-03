// Se muestra al instante al tocar una sección, mientras el servidor arma la pantalla.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-7 w-44 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}
