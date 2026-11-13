"use client"

import { useEffect, useId, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Building2, CalendarClock, Clock, GraduationCap, Search, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { resumenSemanal } from "@/lib/cursos/asistente-logica"
import {
  ETIQUETA_ESTADO_ACADEMICO,
  filtrarCursos,
  ordenarTarjetas,
  type EstadoAcademico,
  type FiltroCursos,
  type TarjetaMiCurso,
} from "@/lib/estudiantes/tarjetas"
import { rangoHora } from "@/lib/horarios/calendario"
import { cn } from "@/lib/utils"

const fechaCorta = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const MODALIDAD: Record<string, string> = { virtual: "Virtual" }
const VARIANTE: Record<EstadoAcademico, "success" | "warning" | "outline" | "secondary" | "destructive"> = {
  en_curso: "success",
  por_iniciar: "secondary",
  finalizado: "outline",
  aprobado: "success",
  desaprobado: "destructive",
  cancelado: "warning",
  anulada: "outline",
}
const CLAVE_AGRUPAR = "academix:mis-cursos:agrupar"

/**
 * «Mis cursos»: todas las matrículas confirmadas del estudiante, de cualquier
 * institución, en una sola vista. Agrupar por institución es opcional y solo
 * ordena (nunca oculta cursos). La preferencia se recuerda en este navegador.
 */
export function MisCursosLista({ tarjetas, hoy }: { tarjetas: TarjetaMiCurso[]; hoy: string }) {
  const id = useId()
  const [filtro, setFiltro] = useState<FiltroCursos>({ texto: "", institucion: "", estado: "activos" })
  const [agrupar, setAgrupar] = useState(false)

  useEffect(() => {
    let guardado = false
    try {
      guardado = window.localStorage.getItem(CLAVE_AGRUPAR) === "1"
    } catch {
      /* almacenamiento no disponible */
    }
    if (guardado) {
      const t = window.setTimeout(() => setAgrupar(true), 0)
      return () => window.clearTimeout(t)
    }
  }, [])

  function cambiarAgrupar(v: boolean) {
    setAgrupar(v)
    try {
      window.localStorage.setItem(CLAVE_AGRUPAR, v ? "1" : "0")
    } catch {
      /* almacenamiento no disponible */
    }
  }

  const instituciones = useMemo(() => [...new Set(tarjetas.map((t) => t.institucion))].sort((a, b) => a.localeCompare(b, "es")), [tarjetas])
  const visibles = ordenarTarjetas(filtrarCursos(tarjetas, filtro))
  const activas = tarjetas.filter((t) => t.estado === "en_curso" || t.estado === "por_iniciar").length
  const grupos = agrupar
    ? instituciones.map((i) => ({ institucion: i as string | null, lista: visibles.filter((t) => t.institucion === i) })).filter((g) => g.lista.length)
    : [{ institucion: null, lista: visibles }]
  const select = "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={`${id}-q`} className="sr-only">Buscar curso</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id={`${id}-q`} value={filtro.texto} onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))} placeholder="Buscar por curso, institución o docente" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {instituciones.length > 1 && (
            <>
              <label htmlFor={`${id}-i`} className="sr-only">Institución</label>
              <select id={`${id}-i`} value={filtro.institucion} onChange={(e) => setFiltro((f) => ({ ...f, institucion: e.target.value }))} className={cn(select, "min-w-0 flex-1 sm:w-56 sm:flex-none")}>
                <option value="">Todas las instituciones</option>
                {instituciones.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </>
          )}
          <label htmlFor={`${id}-e`} className="sr-only">Estado</label>
          <select id={`${id}-e`} value={filtro.estado} onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value as FiltroCursos["estado"] }))} className={cn(select, "min-w-0 flex-1 sm:w-48 sm:flex-none")}>
            <option value="activos">En curso y por iniciar</option>
            <option value="">Todos</option>
            {(Object.keys(ETIQUETA_ESTADO_ACADEMICO) as EstadoAcademico[]).map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_ACADEMICO[e]}</option>)}
          </select>
          {instituciones.length > 1 && (
            <label className="flex items-center gap-2 rounded-lg border px-3 text-sm">
              <input type="checkbox" checked={agrupar} onChange={(e) => cambiarAgrupar(e.target.checked)} className="size-4 accent-primary" />
              Agrupar por institución
            </label>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visibles.length} {visibles.length === 1 ? "curso" : "cursos"}
        {filtro.estado === "activos" && tarjetas.length > activas && ` · ${tarjetas.length - activas} finalizados o anulados ocultos`}
      </p>

      {visibles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ningún curso coincide con la búsqueda o el filtro.{" "}
            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => setFiltro({ texto: "", institucion: "", estado: "" })}>
              Ver todos
            </button>
          </CardContent>
        </Card>
      ) : (
        grupos.map((g) => (
          <section key={g.institucion ?? "todos"} className="space-y-3" aria-label={g.institucion ?? "Mis cursos"}>
            {g.institucion && (
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-muted-foreground" aria-hidden />{g.institucion}</h3>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.lista.map((t) => <Tarjeta key={t.matriculaId} t={t} hoy={hoy} mostrarInstitucion={!agrupar} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function Tarjeta({ t, hoy, mostrarInstitucion }: { t: TarjetaMiCurso; hoy: string; mostrarInstitucion: boolean }) {
  const inactiva = t.estado === "anulada" || t.estado === "cancelado"
  return (
    <li>
      <Card className={cn("h-full gap-0 overflow-hidden py-0", inactiva && "opacity-75")}>
        <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-muted">
          {t.portadaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.portadaUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          ) : (
            <GraduationCap className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-primary/60" aria-hidden />
          )}
          <Badge variant={VARIANTE[t.estado]} className="absolute top-2 left-2 bg-background/90 backdrop-blur-none">{ETIQUETA_ESTADO_ACADEMICO[t.estado]}</Badge>
        </div>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1">
            <h4 className="text-base leading-snug font-semibold break-words">{t.curso}</h4>
            <p className="text-sm text-muted-foreground">
              {mostrarInstitucion && <>{t.institucion} · </>}
              {t.grupo ? <span className={cn(t.repetido && "font-medium text-foreground")}>Grupo {t.grupo}</span> : "Grupo no disponible"}
              {t.modalidad && MODALIDAD[t.modalidad] ? ` · ${MODALIDAD[t.modalidad]}` : ""}
            </p>
          </div>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {t.horarios.length > 0 && (
              <p className="flex items-start gap-1.5"><Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{resumenSemanal(t.horarios.map((h) => ({ dia_semana: String(h.dia_semana), hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })))}</p>
            )}
            <p className="flex items-center gap-1.5"><UserRound className="size-3.5 shrink-0" aria-hidden />{t.docente ?? "Docente por asignar"}</p>
            {t.proxima && (
              <p className={cn("flex items-start gap-1.5", t.proxima.enCurso ? "font-medium text-success" : "text-foreground")}>
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t.proxima.enCurso ? "Clase en curso ahora" : `Próxima clase: ${t.proxima.fecha === hoy ? "hoy" : fechaCorta.format(new Date(`${t.proxima.fecha}T00:00:00Z`))}, ${rangoHora(t.proxima.hora_inicio, t.proxima.hora_fin)}`}
              </p>
            )}
          </div>
          <div className="mt-auto pt-1">
            <Link href={`/estudiante/cursos/${t.matriculaId}`} className={cn(buttonVariants({ variant: inactiva ? "outline" : "default" }), "w-full")}>
              {inactiva ? "Ver detalle" : "Entrar al curso"}
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}
