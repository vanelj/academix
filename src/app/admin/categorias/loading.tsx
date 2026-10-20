import { Card } from "@/components/ui/card"

// Estado de carga del módulo mientras se leen las categorías en el servidor.
export default function CargandoCategorias() {
  return (
    <div role="status" aria-label="Cargando las categorías" className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full rounded-md bg-muted" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="h-8 w-full rounded-lg bg-muted sm:w-72" />
        <div className="h-8 w-full rounded-lg bg-muted sm:w-40" />
      </div>
      <Card className="gap-0 py-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
            <div className="h-5 w-16 rounded-full bg-muted" />
          </div>
        ))}
      </Card>
    </div>
  )
}
