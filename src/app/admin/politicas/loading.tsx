import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Estado de carga del módulo mientras se leen las políticas en el servidor.
export default function CargandoPoliticas() {
  return (
    <div role="status" aria-label="Cargando las políticas institucionales" className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-64 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded-md bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <CardHeader className="flex gap-3">
                <div className="size-9 shrink-0 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-5/6 rounded bg-muted" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-36 rounded-lg bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="hidden h-64 rounded-xl bg-muted lg:block" />
      </div>
    </div>
  )
}
