import { Card } from "@/components/ui/card"

// Estado de carga del módulo mientras se ejecutan las comprobaciones en el servidor.
export default function CargandoVerificacion() {
  return (
    <div role="status" aria-label="Ejecutando la verificación" className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded-md bg-muted" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="h-8 w-full rounded-lg bg-muted sm:w-80" />
        <div className="h-8 w-full rounded-lg bg-muted sm:w-32" />
      </div>
      <Card className="gap-0 py-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-5 w-20 rounded-full bg-muted" />
          </div>
        ))}
      </Card>
    </div>
  )
}
