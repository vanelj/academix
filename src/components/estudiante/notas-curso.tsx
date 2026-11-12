import { CheckCircle2, Clock3, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { NotaCurso } from "@/lib/estudiantes/academico"
import { cn } from "@/lib/utils"

const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })
const f2 = (n: number) => n.toFixed(2).replace(/\.00$/, "")

/**
 * Evaluaciones y notas de UN curso (solo lectura). Una tarjeta por evaluación;
 * «Pendiente» nunca es cero. El promedio parcial es PROVISIONAL (solo con lo
 * calificado y publicado, respetando pesos); el resultado oficial es el que
 * registra la institución (matriculas.estado_final).
 */
export function NotasCurso({ datos: d }: { datos: NotaCurso }) {
  const r = d.resumen
  const { calculo } = r
  if (r.tarjetas.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">La institución aún no configuró las evaluaciones de este curso.</CardContent></Card>
  }
  const oficial = d.estadoFinal !== "en_curso"
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo={oficial || calculo.promedio !== null ? "Promedio final" : "Promedio parcial"}
          valor={calculo.promedio !== null ? f2(calculo.promedio) : calculo.parcial !== null ? f2(calculo.parcial) : "—"}
          nota={calculo.promedio !== null ? "Con todas las evaluaciones" : calculo.parcial !== null ? "Provisional: solo con lo ya calificado" : "Aún no hay notas"}
        />
        <Indicador
          titulo="Avance calificado"
          valor={`${f2(r.pesoCalificado)} %`}
          nota={`${calculo.registradas} de ${r.tarjetas.length} evaluaciones${d.publicacionActiva ? " publicadas" : ""}`}
        />
        <Indicador
          titulo="Resultado oficial"
          valor={d.estadoFinal === "aprobado" ? "Aprobado" : d.estadoFinal === "desaprobado" ? "Desaprobado" : "En curso"}
          nota={d.notaAprobatoria !== null ? `Nota aprobatoria: ${f2(d.notaAprobatoria)}` : "Lo registra la institución al cerrar el curso"}
          tono={d.estadoFinal === "aprobado" ? "success" : d.estadoFinal === "desaprobado" ? "destructive" : undefined}
        />
      </div>

      {calculo.estado === "pesos_incompletos" && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Los pesos de las evaluaciones suman {f2(calculo.pesoTotal)} %: el promedio final aparecerá cuando la institución complete el 100 %.</p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Evaluaciones">
        {r.tarjetas.map((t) => (
          <li key={t.id}>
            <Card className="h-full">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium break-words">{t.nombre}</p>
                  <Badge variant="outline" className="shrink-0">{f2(t.peso)} %</Badge>
                </div>
                {t.fecha && <p className="text-xs text-muted-foreground">{fecha.format(new Date(`${t.fecha}T00:00:00Z`))}</p>}
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  {t.nota !== null ? (
                    <p className="text-3xl font-semibold tabular-nums">{f2(t.nota)}<span className="text-base font-normal text-muted-foreground">/20</span></p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin nota aún</p>
                  )}
                  <span className={cn("flex items-center gap-1 text-xs font-medium", t.nota !== null ? "text-success" : "text-muted-foreground")}>
                    {t.nota !== null ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
                    {t.nota !== null ? "Calificado" : "Pendiente"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        {d.publicacionActiva
          ? "Verás cada nota en cuanto tu docente la publique. "
          : ""}
        El promedio parcial es una referencia: no cuenta las evaluaciones pendientes como cero y puede cambiar. Tu resultado oficial lo registra la institución al cerrar el curso.
      </p>
    </div>
  )
}

function Indicador({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota: string; tono?: "success" | "destructive" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", tono === "success" && "text-success", tono === "destructive" && "text-destructive")}>{valor}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}
