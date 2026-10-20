import { Card, CardContent, CardHeader } from "@/components/ui/card"

/** Esqueleto de carga de la ficha y del formulario de un curso. */
export function CargandoCurso() {
  return (
    <div role="status" aria-label="Cargando el curso" className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-72 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded-md bg-muted" />
      </div>
      <div className="max-w-4xl space-y-6">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-48 rounded bg-muted" />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="h-8 rounded-lg bg-muted" />
              <div className="h-8 rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
