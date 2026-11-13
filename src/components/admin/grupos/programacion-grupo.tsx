"use client"

import { useId, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarCheck, ChevronDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { aplicarProgramacion } from "@/lib/grupos/acciones"
import { DIAS_LARGOS, rangoHora } from "@/lib/horarios/calendario"
import { comparaCarga, duracionLegible, horasAcademicas, programar, type CriterioDuracion, type FranjaProgramacion } from "@/lib/horarios/programacion"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

const fechaLarga = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const f = (iso: string) => fechaLarga.format(new Date(`${iso}T00:00:00Z`))

const CRITERIOS: { tipo: CriterioDuracion["tipo"]; etiqueta: string; unidad: string }[] = [
  { tipo: "semanas", etiqueta: "Número de semanas", unidad: "semanas" },
  { tipo: "sesiones", etiqueta: "Número de sesiones", unidad: "sesiones" },
  { tipo: "horas", etiqueta: "Horas reloj", unidad: "horas" },
]

/**
 * Programación automática del grupo: con los horarios ya definidos (día y
 * horas, pueden variar por día), la fecha de inicio y UN criterio de duración,
 * se calcula al instante el calendario. Al confirmar, el servidor lo recalcula
 * y actualiza solo las fechas del grupo (no se guardan sesiones: no se duplican).
 */
export function ProgramacionGrupo({
  grupoId,
  franjas,
  fechaInicio,
  fechaFin,
  estado,
  minutosHoraAcademica = null,
  horasDeclaradas = null,
}: {
  grupoId: string
  franjas: FranjaProgramacion[]
  fechaInicio: string
  fechaFin: string
  estado: string
  /** Equivalencia definida por la institución (minutos). null = no definida. */
  minutosHoraAcademica?: number | null
  /** Carga académica DECLARADA del curso (no se sobrescribe con lo programado). */
  horasDeclaradas?: number | null
}) {
  const id = useId()
  const router = useRouter()
  const [inicio, setInicio] = useState(fechaInicio.slice(0, 10))
  const [tipo, setTipo] = useState<CriterioDuracion["tipo"]>("semanas")
  // Valor inicial: las semanas que hoy abarca el grupo (así la vista previa parte de lo guardado).
  const [valor, setValor] = useState(() => {
    const dias = (Date.parse(`${fechaFin.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fechaInicio.slice(0, 10)}T00:00:00Z`)) / 86400000 + 1
    return String(Number.isFinite(dias) && dias > 0 ? Math.max(1, Math.ceil(dias / 7)) : 8)
  })
  const [minAcad, setMinAcad] = useState(minutosHoraAcademica ? String(minutosHoraAcademica) : "")
  const [verFechas, setVerFechas] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const bloqueado = estado === "cerrado" || estado === "cancelado"
  const inicioFijo = estado === "en_curso"

  const r = useMemo(() => programar(inicio, franjas, { tipo, valor: Number(valor.replace(",", ".")) } as CriterioDuracion), [inicio, franjas, tipo, valor])
  const acad = r.ok ? horasAcademicas(r.programacion.minutosReloj, Number(minAcad)) : null
  const diferencia = comparaCarga(horasDeclaradas, acad)
  const cambia = r.ok && (r.programacion.fechaInicio !== fechaInicio.slice(0, 10) || r.programacion.fechaFin !== fechaFin.slice(0, 10))

  async function aplicar() {
    if (!r.ok || enviando) return
    setEnviando(true)
    try {
      const res = await aplicarProgramacion(grupoId, { fechaInicio: inicio, criterio: { tipo, valor: Number(valor.replace(",", ".")) } })
      if (res.ok) {
        notificar.exito("Programación aplicada", { descripcion: `${res.sesiones} sesiones · ${res.horas} horas reloj · fin el ${f(r.programacion.fechaFin)}.` })
        router.refresh()
      } else (res.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo aplicar", { descripcion: res.mensaje })
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  const campo = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarCheck className="size-5 text-primary" aria-hidden />Programación automática</CardTitle>
        <CardDescription>
          Define el inicio y la duración: Academix calcula las fechas de clase con los horarios del grupo, en hora de Lima y sin descontar feriados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {franjas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Primero agrega los días y horas de clase en «Horarios».</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-i`}>Fecha de inicio
                <Input id={`${id}-i`} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={bloqueado || inicioFijo} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-t`}>Duración según
                <select id={`${id}-t`} className={campo} value={tipo} disabled={bloqueado} onChange={(e) => setTipo(e.target.value as CriterioDuracion["tipo"])}>
                  {CRITERIOS.map((c) => <option key={c.tipo} value={c.tipo}>{c.etiqueta}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-v`}>Cantidad ({CRITERIOS.find((c) => c.tipo === tipo)!.unidad})
                <Input id={`${id}-v`} inputMode="decimal" value={valor} disabled={bloqueado} onChange={(e) => setValor(e.target.value)} />
              </label>
            </div>
            {inicioFijo && <p className="text-xs text-muted-foreground">Las clases ya empezaron: solo puedes ajustar la duración.</p>}

            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Horario semanal">
              {[...franjas].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)).map((h, i) => (
                <li key={i} className="rounded-full border px-2.5 py-1">{DIAS_LARGOS[h.dia_semana - 1]} · {rangoHora(h.hora_inicio, h.hora_fin)}</li>
              ))}
            </ul>

            {r.ok ? (
              <div className="space-y-3 rounded-xl border bg-muted/30 p-3" aria-live="polite">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Sesiones</dt><dd className="font-semibold tabular-nums">{r.programacion.totalSesiones}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Horas reloj</dt><dd className="font-semibold tabular-nums">{duracionLegible(r.programacion.minutosReloj)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Semanas</dt><dd className="font-semibold tabular-nums">{r.programacion.semanas}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Fin estimado</dt><dd className="font-semibold">{f(r.programacion.fechaFin)}</dd></div>
                </dl>
                {r.programacion.excedenteMinutos > 0 && (
                  <p className="text-xs text-muted-foreground">La última sesión completa el objetivo con {duracionLegible(r.programacion.excedenteMinutos)} adicionales (no se corta una clase).</p>
                )}
                {acad !== null && (
                  <p className="text-sm"><span className="text-muted-foreground">Horas académicas programadas:</span> <strong className="tabular-nums">{acad}</strong> <span className="text-xs text-muted-foreground">({minAcad} min cada una)</span></p>
                )}
                {horasDeclaradas !== null && (
                  <p className={cn("text-xs", diferencia ? "rounded-lg border border-warning/40 bg-warning/10 p-2 text-foreground" : "text-muted-foreground")} role={diferencia ? "status" : undefined}>
                    Carga declarada del curso: <strong>{horasDeclaradas} horas académicas</strong>.
                    {diferencia === "menos" && " Este calendario programa MENOS horas que las declaradas: amplía la duración o revisa la carga del curso."}
                    {diferencia === "mas" && " Este calendario programa MÁS horas que las declaradas: revisa la duración o la carga del curso."}
                    {acad === null && " Define la hora académica de tu institución (Mi institución) para compararlas."}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <label htmlFor={`${id}-a`}>{minutosHoraAcademica ? "Hora académica de tu institución:" : "Horas académicas (sin configurar en tu institución): una hora académica dura"}</label>
                  <Input id={`${id}-a`} inputMode="numeric" placeholder="45" value={minAcad} onChange={(e) => setMinAcad(e.target.value)} className="h-7 w-16" />
                  <span>min</span>
                </div>
                <button type="button" onClick={() => setVerFechas((v) => !v)} aria-expanded={verFechas} className="flex items-center gap-1 text-xs font-medium text-primary">
                  <ChevronDown className={cn("size-3.5 transition-transform", verFechas && "rotate-180")} aria-hidden />
                  {verFechas ? "Ocultar" : "Ver"} las {r.programacion.totalSesiones} fechas de clase
                </button>
                {verFechas && (
                  <ol className="grid max-h-64 gap-1 overflow-y-auto text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {r.programacion.sesiones.map((s) => (
                      <li key={s.numero} className="tabular-nums"><span className="text-muted-foreground">{s.numero}.</span> {f(s.fecha)} · {s.hora_inicio}–{s.hora_fin}</li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <ul role="alert" className="space-y-1 text-sm text-destructive">{r.errores.map((e) => <li key={e}>{e}</li>)}</ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={aplicar} disabled={bloqueado || !r.ok || !cambia || enviando}>
                {enviando && <Loader2 className="animate-spin" aria-hidden />}
                Aplicar programación
              </Button>
              <span className="text-xs text-muted-foreground">
                {bloqueado ? "El grupo está cerrado o cancelado." : r.ok && !cambia ? "Las fechas del grupo ya coinciden con esta programación." : `Hoy: ${f(fechaInicio.slice(0, 10))} – ${f(fechaFin.slice(0, 10))}`}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
