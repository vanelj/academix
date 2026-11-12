import { Building2, Clock, ExternalLink, MonitorPlay, UserRound } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { agruparPorDia, enlaceSeguro, hayCruce, type Sesion } from "@/lib/horarios/semana"
import { cn } from "@/lib/utils"

const fecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" })
const f = (iso: string) => fecha.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

/**
 * Vista semanal compartida por Docente y Estudiante. En móvil, una lista por
 * día; en pantallas anchas, columnas por día (solo los días con clases).
 * Señala los cruces de horario entre cursos.
 */
export function HorarioSemanal({ sesiones, mostrarInstitucion = false, mostrarDocente = false }: { sesiones: Sesion[]; mostrarInstitucion?: boolean; mostrarDocente?: boolean }) {
  const dias = agruparPorDia(sesiones)
  return (
    <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Horario semanal">
      {dias.map((d) => (
        <li key={d.dia}>
          <Card className="h-full">
            <CardContent className="space-y-3">
              <h3 className="font-semibold">{d.nombre}</h3>
              <ul className="space-y-2">
                {d.sesiones.map((s, i) => {
                  const enlace = enlaceSeguro(s.enlace)
                  const cruce = d.sesiones.some((o, j) => j !== i && hayCruce(s, o))
                  return (
                    <li key={`${s.grupo}-${s.hora_inicio}-${i}`} className={cn("rounded-xl border p-3 text-sm", cruce && "border-warning")}>
                      <p className="flex items-center gap-1.5 font-medium tabular-nums">
                        <Clock className="size-3.5 text-primary" aria-hidden />
                        {s.hora_inicio} – {s.hora_fin}
                      </p>
                      <p className="mt-1 font-medium break-words">{s.curso}</p>
                      <p className="text-xs text-muted-foreground">
                        Grupo {s.grupo} · {s.modalidad ?? "Virtual"}
                        {s.desde && s.hasta ? ` · del ${f(s.desde)} al ${f(s.hasta)}` : ""}
                      </p>
                      {mostrarInstitucion && s.institucion && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3" aria-hidden />{s.institucion}</p>
                      )}
                      {mostrarDocente && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="size-3" aria-hidden />{s.docente ?? "Docente por asignar"}</p>
                      )}
                      {cruce && <p className="mt-1 text-xs font-medium text-warning">Se cruza con otra clase de este día.</p>}
                      {enlace ? (
                        <a href={enlace} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2">
                          <MonitorPlay className="size-3.5" aria-hidden />
                          Entrar a la clase
                          <ExternalLink className="size-3" aria-hidden />
                          <span className="sr-only">(se abre en otra pestaña)</span>
                        </a>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">Enlace de clase aún no publicado.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}
