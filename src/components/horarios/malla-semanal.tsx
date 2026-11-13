"use client"

import { useState } from "react"
import { AlertTriangle, Video } from "lucide-react"

import { colorCurso, DIAS_CORTOS, DIAS_LARGOS, diaSemana, estadoClase, puedeUnirseAhora, rangoHora, type Clase } from "@/lib/horarios/calendario"
import { carrilesDelDia, rangoHorasMalla } from "@/lib/horarios/malla"
import { cn } from "@/lib/utils"

const ALTO_HORA = 56 // px por hora

/**
 * Malla semanal tipo calendario universitario: columnas = días, filas = horas,
 * cada clase es un bloque ubicado por hora de inicio y duración con el nombre
 * del curso visible. Clases simultáneas se reparten en carriles (sin taparse).
 * En móvil, agenda del día elegido (sin desplazamiento horizontal).
 */
export function MallaSemanal({
  dias,
  clases,
  ahora,
  mostrarInstitucion,
  mostrarDocente,
  onAbrir,
}: {
  dias: string[]
  clases: Clase[]
  ahora: { fecha: string; hora: string }
  mostrarInstitucion: boolean
  mostrarDocente: boolean
  onAbrir: (c: Clase) => void
}) {
  const { desde, hasta } = rangoHorasMalla(clases)
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i)
  const inicial = dias.includes(ahora.fecha) ? ahora.fecha : (dias.find((d) => clases.some((c) => c.fecha === d)) ?? dias[0])
  const [diaMovil, setDiaMovil] = useState(inicial)
  const diaActivo = dias.includes(diaMovil) ? diaMovil : inicial
  const delDia = (f: string) => clases.filter((c) => c.fecha === f)
  const lineaAhora = dias.includes(ahora.fecha) ? (Number(ahora.hora.slice(0, 2)) * 60 + Number(ahora.hora.slice(3, 5)) - desde * 60) / 60 : null

  return (
    <>
      {/* Escritorio y tableta: malla completa */}
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-xs font-medium">
          <span />
          {dias.map((f) => (
            <span key={f} className={cn("border-l px-2 py-2 text-center", f === ahora.fecha && "bg-primary/10 text-primary")}>
              {DIAS_CORTOS[diaSemana(f) - 1]} {Number(f.slice(8))}
            </span>
          ))}
        </div>
        <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: horas.length * ALTO_HORA }}>
          <div className="relative">
            {horas.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: i * ALTO_HORA }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {dias.map((f) => {
            const lista = delDia(f)
            const carriles = carrilesDelDia(lista)
            return (
              <div key={f} className={cn("relative border-l", f === ahora.fecha && "bg-primary/[0.03]")} aria-label={DIAS_LARGOS[diaSemana(f) - 1]}>
                {horas.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * ALTO_HORA }} aria-hidden />)}
                {f === ahora.fecha && lineaAhora !== null && lineaAhora >= 0 && lineaAhora <= horas.length && (
                  <div className="absolute inset-x-0 z-20 h-0.5 bg-destructive" style={{ top: lineaAhora * ALTO_HORA }} aria-hidden />
                )}
                {lista.map((c) => {
                  const ini = (minutos(c.hora_inicio) - desde * 60) / 60
                  const dur = (minutos(c.hora_fin) - minutos(c.hora_inicio)) / 60
                  const { carril, total } = carriles.get(c.id) ?? { carril: 0, total: 1 }
                  const alto = dur * ALTO_HORA
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onAbrir(c)}
                      title={`${c.grupo.curso} · ${rangoHora(c.hora_inicio, c.hora_fin)}`}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded-md border border-l-4 p-1.5 text-left text-[11px] leading-tight outline-none hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring",
                        colorCurso(c.indice),
                        "bg-card",
                        estadoClase(c, ahora) === "terminada" && "opacity-60"
                      )}
                      style={{ top: ini * ALTO_HORA + 1, height: Math.max(alto - 2, 22), left: `calc(${(carril / total) * 100}% + 2px)`, width: `calc(${100 / total}% - 4px)` }}
                    >
                      <span className={cn("absolute inset-0 -z-10", colorCurso(c.indice))} aria-hidden />
                      <span className="flex items-start justify-between gap-1">
                        <span className="line-clamp-2 font-semibold text-foreground">{c.grupo.curso}</span>
                        {c.cruce && <AlertTriangle className="size-3 shrink-0 text-warning" aria-label="Cruce de horario" />}
                      </span>
                      {alto >= 44 && <span className="block text-muted-foreground">Gr. {c.grupo.grupo} · {c.hora_inicio}–{c.hora_fin}</span>}
                      {alto >= 64 && mostrarInstitucion && c.grupo.institucion && <span className="block truncate text-muted-foreground">{c.grupo.institucion}</span>}
                      {alto >= 64 && mostrarDocente && <span className="block truncate text-muted-foreground">{c.grupo.docente ?? "Docente por asignar"}</span>}
                      {alto >= 80 && <EstadoAcceso clase={c} ahora={ahora} />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Móvil: agenda del día */}
      <div className="space-y-3 md:hidden">
        <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Día">
          {dias.map((f) => {
            const n = delDia(f).length
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={f === diaActivo}
                onClick={() => setDiaMovil(f)}
                className={cn(
                  "flex flex-col items-center rounded-lg border py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  f === diaActivo ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
                  f === ahora.fecha && f !== diaActivo && "border-primary/50"
                )}
              >
                <span>{DIAS_CORTOS[diaSemana(f) - 1]}</span>
                <span className="text-sm tabular-nums">{Number(f.slice(8))}</span>
                <span className={cn("mt-0.5 size-1.5 rounded-full", n ? "bg-primary" : "bg-transparent")} aria-hidden />
              </button>
            )
          })}
        </div>
        <p className="text-sm font-medium">{DIAS_LARGOS[diaSemana(diaActivo) - 1]} {Number(diaActivo.slice(8))}{diaActivo === ahora.fecha ? " · Hoy" : ""}</p>
        {delDia(diaActivo).length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Sin clases este día.</p>
        ) : (
          <ul className="space-y-2">
            {delDia(diaActivo).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onAbrir(c)} className={cn("w-full rounded-xl border border-l-4 p-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", colorCurso(c.indice))}>
                  <span className="flex items-center justify-between gap-2 text-xs font-medium tabular-nums">
                    {rangoHora(c.hora_inicio, c.hora_fin)}
                    {c.cruce && <AlertTriangle className="size-3.5 text-warning" aria-label="Cruce de horario" />}
                  </span>
                  <span className="mt-0.5 block font-semibold break-words">{c.grupo.curso}</span>
                  <span className="block text-xs text-muted-foreground">
                    Grupo {c.grupo.grupo}
                    {mostrarInstitucion && c.grupo.institucion ? ` · ${c.grupo.institucion}` : ""}
                  </span>
                  {mostrarDocente && <span className="block text-xs text-muted-foreground">{c.grupo.docente ?? "Docente por asignar"}</span>}
                  <span className="mt-1 block"><EstadoAcceso clase={c} ahora={ahora} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/** Estado de la sesión y acceso virtual, en una sola línea discreta. */
function EstadoAcceso({ clase: c, ahora }: { clase: Clase; ahora: { fecha: string; hora: string } }) {
  const estado = estadoClase(c, ahora)
  const unirse = puedeUnirseAhora(c, ahora)
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      {estado === "en_curso" ? <span className="font-semibold text-success">En curso</span> : estado === "terminada" ? <span>Terminada</span> : null}
      {c.enlace ? (
        <span className={cn("inline-flex items-center gap-0.5", unirse && "font-semibold text-primary")}>
          <Video className="size-3" aria-hidden />
          {unirse ? "Unirse" : "Virtual"}
        </span>
      ) : (
        <span>Enlace pendiente</span>
      )}
    </span>
  )
}

function minutos(h: string) {
  return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
}
