"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Building2, CalendarDays, ChevronLeft, ChevronRight, Clock, List, MapPin, MonitorPlay, UserRound, Video } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MallaSemanal } from "@/components/horarios/malla-semanal"
import {
  ahoraAcademico,
  clasesEnRango,
  colorCurso,
  DIAS_CORTOS,
  estadoClase,
  ETIQUETA_MODALIDAD,
  finMes,
  inicioMes,
  inicioSemana,
  nombreCortoCurso,
  puedeUnirseAhora,
  puntoCurso,
  rangoHora,
  semanasDelMes,
  sumarDias,
  sumarMeses,
  type Clase,
  type GrupoCalendario,
} from "@/lib/horarios/calendario"
import { cn } from "@/lib/utils"

type Vista = "semana" | "mes" | "lista"
type Ahora = { fecha: string; hora: string }

const fechaLarga = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
const fechaCorta = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" })
const mesAnio = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" })
const d = (f: string) => new Date(`${f}T00:00:00Z`)
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/** Clases que se escriben dentro de una celda del mes; el resto, «+N clases». */
const MAX_EN_CELDA = 2

/**
 * Calendario académico compartido (Estudiante y Docente). Semana (predeterminada),
 * Mes y Lista. Las clases salen de los horarios semanales reales, dentro del
 * periodo de cada grupo; no se crean sesiones. `ahoraInicial` lo calcula el
 * servidor en la zona académica para que la primera pintura coincida.
 */
export function CalendarioAcademico({
  grupos,
  ahoraInicial,
  mostrarInstitucion = false,
  mostrarDocente = false,
}: {
  grupos: GrupoCalendario[]
  ahoraInicial: Ahora
  mostrarInstitucion?: boolean
  mostrarDocente?: boolean
}) {
  const [vista, setVista] = useState<Vista>("semana")
  const [ancla, setAncla] = useState(ahoraInicial.fecha)
  const [diaElegido, setDiaElegido] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Clase | null>(null)
  const [ahora, setAhora] = useState<Ahora>(ahoraInicial)

  // Refresca «ahora» cada minuto (estado «En curso» y botón «Unirse a clase»).
  useEffect(() => {
    const t = window.setInterval(() => setAhora(ahoraAcademico()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const rango = useMemo(() => {
    if (vista === "semana") {
      const desde = inicioSemana(ancla)
      return { desde, hasta: sumarDias(desde, 6) }
    }
    const semanas = semanasDelMes(ancla)
    return { desde: semanas[0][0], hasta: semanas[semanas.length - 1][6] }
  }, [vista, ancla])

  const clases = useMemo(() => clasesEnRango(grupos, rango.desde, rango.hasta), [grupos, rango])
  const porFecha = useMemo(() => {
    const m = new Map<string, Clase[]>()
    for (const c of clases) m.set(c.fecha, [...(m.get(c.fecha) ?? []), c])
    return m
  }, [clases])

  const visibles = vista === "semana" ? clases : clases.filter((c) => c.fecha >= inicioMes(ancla) && c.fecha <= finMes(ancla))
  const hayCruces = visibles.some((c) => c.cruce)
  const cursosVisibles = [...new Map(visibles.map((c) => [c.grupo.clave, c])).values()]

  function mover(paso: -1 | 1) {
    setDiaElegido(null)
    setAncla((a) => (vista === "semana" ? sumarDias(a, 7 * paso) : sumarMeses(a, paso)))
  }

  const titulo =
    vista === "semana"
      ? `${fechaCorta.format(d(rango.desde))} – ${fechaCorta.format(d(rango.hasta))} ${rango.hasta.slice(0, 4)}`
      : capital(mesAnio.format(d(inicioMes(ancla))))

  const tarjeta = (c: Clase) => (
    <TarjetaClase key={c.id} clase={c} ahora={ahora} mostrarInstitucion={mostrarInstitucion} onAbrir={() => setSeleccion(c)} />
  )

  return (
    <section aria-label="Calendario académico" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Vista del calendario">
          {(
            [
              ["semana", "Semana", CalendarDays],
              ["mes", "Mes", CalendarDays],
              ["lista", "Lista", List],
            ] as const
          ).map(([valor, etiqueta, Icono]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={vista === valor}
              onClick={() => { setVista(valor); setDiaElegido(null) }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                vista === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icono className="size-4" aria-hidden />
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label={vista === "semana" ? "Semana anterior" : "Mes anterior"}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => { setAncla(ahora.fecha); setDiaElegido(null) }}>Hoy</Button>
          <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <h3 className="text-base font-semibold" aria-live="polite">{titulo}</h3>

      {hayCruces && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Hay clases que se cruzan en este periodo (marcadas con <AlertTriangle className="inline size-3.5 text-warning" aria-label="cruce" />).
        </p>
      )}

      {cursosVisibles.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Cursos">
          {cursosVisibles.map((c) => (
            <li key={c.grupo.clave} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", puntoCurso(c.indice))} aria-hidden />
              {c.grupo.curso} · {c.grupo.grupo}
            </li>
          ))}
        </ul>
      )}

      {vista === "semana" && (
        <>
          <MallaSemanal
            dias={Array.from({ length: 7 }, (_, k) => sumarDias(rango.desde, k))}
            clases={clases}
            ahora={ahora}
            mostrarInstitucion={mostrarInstitucion}
            mostrarDocente={mostrarDocente}
            onAbrir={setSeleccion}
          />
          {clases.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay clases programadas esta semana.</p>}
        </>
      )}

      {vista === "mes" && (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
            {DIAS_CORTOS.map((n) => <span key={n}>{n}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={titulo}>
            {semanasDelMes(ancla).flat().map((f) => {
              const delDia = porFecha.get(f) ?? []
              const delMes = f.slice(0, 7) === ancla.slice(0, 7)
              const hoy = f === ahora.fecha
              const elegido = diaElegido === f
              return (
                <button
                  key={f}
                  type="button"
                  role="gridcell"
                  aria-selected={elegido}
                  aria-label={`${capital(fechaLarga.format(d(f)))}: ${delDia.length ? delDia.map((c) => `${c.grupo.curso} a las ${c.hora_inicio}`).join(", ") : "sin clases"}`}
                  onClick={() => setDiaElegido(elegido ? null : f)}
                  className={cn(
                    "flex min-h-14 min-w-0 flex-col items-center gap-1 rounded-lg border p-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:items-stretch",
                    !delMes && "opacity-40",
                    delDia.length > 0 && "bg-primary/5 font-medium",
                    hoy && "border-primary text-primary",
                    elegido && "ring-2 ring-primary"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1 px-0.5">
                    <span className="tabular-nums">{Number(f.slice(8))}</span>
                    {delDia.some((c) => c.cruce) && <AlertTriangle className="size-3 text-warning" aria-label="Cruce de horario" />}
                  </span>
                  {/* Móvil: puntos (no caben nombres). Desde sm: «Python · 19:00» y «+N clases». */}
                  <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                    {delDia.slice(0, 4).map((c) => <span key={c.id} className={cn("size-1.5 rounded-full", puntoCurso(c.indice))} />)}
                    {delDia.length > 4 && <span className="text-[10px] leading-none">+{delDia.length - 4}</span>}
                  </span>
                  <span className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                    {delDia.slice(0, MAX_EN_CELDA).map((c) => (
                      <span key={c.id} className={cn("flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight font-normal", colorCurso(c.indice))}>
                        <span className={cn("size-1.5 shrink-0 rounded-full", puntoCurso(c.indice))} aria-hidden />
                        <span className="truncate text-foreground">{nombreCortoCurso(c.grupo.curso)} · {c.hora_inicio}</span>
                      </span>
                    ))}
                    {delDia.length > MAX_EN_CELDA && (
                      <span className="px-1 text-left text-[11px] font-medium text-primary">+{delDia.length - MAX_EN_CELDA} {delDia.length - MAX_EN_CELDA === 1 ? "clase" : "clases"}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {diaElegido ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{capital(fechaLarga.format(d(diaElegido)))}</p>
              {(porFecha.get(diaElegido) ?? []).length ? (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(porFecha.get(diaElegido) ?? []).map(tarjeta)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin clases este día.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Elige un día para ver sus clases.</p>
          )}
        </div>
      )}

      {vista === "lista" && (
        <ol className="space-y-4">
          {[...porFecha.entries()]
            .filter(([f]) => f >= inicioMes(ancla) && f <= finMes(ancla))
            .map(([f, delDia]) => (
              <li key={f}>
                <p className={cn("mb-2 text-sm font-medium", f === ahora.fecha && "text-primary")}>
                  {capital(fechaLarga.format(d(f)))}{f === ahora.fecha && " · Hoy"}
                </p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{delDia.map(tarjeta)}</ul>
              </li>
            ))}
          {visibles.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay clases programadas este mes.</li>}
        </ol>
      )}

      <Dialog open={seleccion !== null} onOpenChange={(abierto) => { if (!abierto) setSeleccion(null) }}>
        <DialogContent className="sm:max-w-md">
          {seleccion && <DetalleClase clase={seleccion} ahora={ahora} mostrarInstitucion={mostrarInstitucion} mostrarDocente={mostrarDocente} />}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function TarjetaClase({ clase: c, ahora, mostrarInstitucion, onAbrir }: { clase: Clase; ahora: Ahora; mostrarInstitucion: boolean; onAbrir: () => void }) {
  const estado = estadoClase(c, ahora)
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={cn(
          "w-full min-w-0 rounded-lg border border-l-4 p-2 text-left text-xs outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
          colorCurso(c.indice),
          estado === "terminada" && "opacity-60"
        )}
      >
        <span className="flex items-center justify-between gap-1 font-medium tabular-nums">
          <span>{rangoHora(c.hora_inicio, c.hora_fin)}</span>
          {c.cruce && <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label="Cruce de horario" />}
        </span>
        <span className="mt-0.5 block text-sm font-semibold break-words text-foreground">{c.grupo.curso}</span>
        <span className="block break-words text-muted-foreground">
          Grupo {c.grupo.grupo}
          {mostrarInstitucion && c.grupo.institucion ? ` · ${c.grupo.institucion}` : ""}
        </span>
        {estado === "en_curso" && <Badge variant="success" className="mt-1">En curso</Badge>}
      </button>
    </li>
  )
}

function DetalleClase({ clase: c, ahora, mostrarInstitucion, mostrarDocente }: { clase: Clase; ahora: Ahora; mostrarInstitucion: boolean; mostrarDocente: boolean }) {
  const unirse = puedeUnirseAhora(c, ahora)
  const estado = estadoClase(c, ahora)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{c.grupo.curso}</DialogTitle>
        <DialogDescription>Grupo {c.grupo.grupo}</DialogDescription>
      </DialogHeader>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{capital(fechaLarga.format(d(c.fecha)))}</li>
        <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{rangoHora(c.hora_inicio, c.hora_fin)}{estado === "en_curso" && <Badge variant="success">En curso</Badge>}</li>
        {mostrarInstitucion && c.grupo.institucion && <li className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{c.grupo.institucion}</li>}
        {mostrarDocente && <li className="flex items-start gap-2"><UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{c.grupo.docente ?? "Docente por asignar"}</li>}
        <li className="flex items-start gap-2">
          <MonitorPlay className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {c.enlace ? "Clase virtual" : <span className="text-muted-foreground">Clase virtual · Enlace pendiente</span>}
          {c.modalidad === "presencial" || c.modalidad === "virtual_presencial" ? ` (${ETIQUETA_MODALIDAD[c.modalidad]})` : ""}
        </li>
        {c.ubicacion && <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{c.ubicacion}</li>}
        {c.cruce && <li className="flex items-start gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Se cruza con otra clase a la misma hora.</li>}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {c.enlace && estado !== "terminada" && (
          <a href={c.enlace} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: unirse ? "default" : "outline" })}>
            <Video aria-hidden />
            {unirse ? "Unirse a clase" : "Enlace de la clase"}
          </a>
        )}
        {(c.grupo.accesos ?? []).map((a) => (
          <Link key={a.href} href={a.href} className={buttonVariants({ variant: "outline" })}>{a.etiqueta}</Link>
        ))}
      </div>
      {c.enlace && !unirse && estado === "proxima" && (
        <p className="text-xs text-muted-foreground">El botón «Unirse a clase» se activa 15 minutos antes del inicio.</p>
      )}
    </>
  )
}
