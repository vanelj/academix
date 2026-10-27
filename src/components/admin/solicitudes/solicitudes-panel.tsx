"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Eye, Inbox, Search, X } from "lucide-react"

import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_SOLICITUD,
  EstadoSolicitudBadge,
  estadoVisible,
  formatoFechaHoraSolicitud,
  formatoSolesSolicitud,
  type FiltroEstadoSolicitud,
} from "@/components/solicitudes/solicitud-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SolicitudAdmin } from "@/lib/solicitudes/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

const TODOS = "__todos__"
const POR_PAGINA = 20
const ESTADOS: ("todos" | FiltroEstadoSolicitud)[] = ["todos", "pendiente", "reservada", "reserva_vencida", "matriculada", "cancelada", "rechazada", "vencida"]
const etiquetaFiltro = (e: "todos" | FiltroEstadoSolicitud) =>
  e === "todos" ? "Todas" : e === "reserva_vencida" ? "Reserva vencida" : ETIQUETA_ESTADO_SOLICITUD[e]

export function SolicitudesPanel({ solicitudes, grupoInicial }: { solicitudes: SolicitudAdmin[]; grupoInicial: string | null }) {
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState<"todos" | FiltroEstadoSolicitud>("todos")
  const [curso, setCurso] = useState(TODOS)
  const [grupo, setGrupo] = useState(grupoInicial ?? TODOS)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [pagina, setPagina] = useState(1)

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>()
    const grupos = new Map<string, { label: string; cursoId: string | null }>()
    for (const s of solicitudes) {
      if (s.curso) cursos.set(s.curso.id, s.curso.nombre)
      if (s.grupo) grupos.set(s.grupo.id, { label: `${s.curso?.nombre ?? "Curso"} · ${s.grupo.codigo}`, cursoId: s.curso?.id ?? null })
    }
    const orden = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "es")
    return {
      cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden),
      grupos: [...grupos].map(([value, g]) => ({ value, label: g.label, cursoId: g.cursoId })).sort(orden),
    }
  }, [solicitudes])
  const gruposDelCurso = curso === TODOS ? opciones.grupos : opciones.grupos.filter((g) => g.cursoId === curso)

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    const d = desde ? new Date(`${desde}T00:00:00`).getTime() : null
    const h = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null
    return solicitudes.filter((s) => {
      const t = new Date(s.fecha_solicitud).getTime()
      return (
        (estado === "todos" || estadoVisible(s.estado, s.reservaVencida) === estado) &&
        (curso === TODOS || s.curso?.id === curso) &&
        (grupo === TODOS || s.grupo?.id === grupo) &&
        (d === null || t >= d) &&
        (h === null || t <= h) &&
        (clave === "" || claveNombre(s.estudiante.nombre ?? "").includes(clave))
      )
    })
  }, [solicitudes, busqueda, estado, curso, grupo, desde, hasta])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const enPagina = visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)
  const r = () => setPagina(1)
  const limpiar = () => { setBusqueda(""); setEstado("todos"); setCurso(TODOS); setGrupo(TODOS); setDesde(""); setHasta(""); r() }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); r() }} placeholder="Buscar por estudiante" aria-label="Buscar solicitudes por estudiante" className="pl-8" />
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {solicitudes.length === 1 ? "1 solicitud" : `${solicitudes.length} solicitudes`}
            {visibles.length !== solicitudes.length && ` · ${visibles.length} con los filtros`}
          </p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          {ESTADOS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setEstado(v); r() }}
              aria-pressed={estado === v}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                estado === v ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {etiquetaFiltro(v)}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {opciones.cursos.length > 0 && (
            <Select items={[{ value: TODOS, label: "Todos los cursos" }, ...opciones.cursos]} value={curso} onValueChange={(v) => { setCurso(v ? String(v) : TODOS); setGrupo(TODOS); r() }}>
              <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por curso"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los cursos</SelectItem>
                {opciones.cursos.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {gruposDelCurso.length > 0 && (
            <Select items={[{ value: TODOS, label: "Todos los grupos" }, ...gruposDelCurso]} value={gruposDelCurso.some((g) => g.value === grupo) ? grupo : TODOS} onValueChange={(v) => { setGrupo(v ? String(v) : TODOS); r() }}>
              <SelectTrigger className="w-full lg:w-64" aria-label="Filtrar por grupo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los grupos</SelectItem>
                {gruposDelCurso.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label className="grid gap-1 text-xs text-muted-foreground">
            Desde
            <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); r() }} className="lg:w-40" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Hasta
            <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); r() }} className="lg:w-40" />
          </label>
        </div>
      </div>

      {solicitudes.length === 0 ? (
        <Vacio titulo="Aún no hay solicitudes" texto="Aparecerán cuando los estudiantes se inscriban en grupos con inscripciones abiertas desde el catálogo." />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo="Ninguna solicitud coincide"
          texto="Prueba con otra búsqueda o cambia los filtros."
          accion={<Button variant="outline" onClick={limpiar}><X aria-hidden />Limpiar filtros</Button>}
        />
      ) : (
        <>
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48 pl-4">Estudiante</TableHead>
                  <TableHead className="min-w-56">Curso y grupo</TableHead>
                  <TableHead className="w-36">Tipo</TableHead>
                  <TableHead className="w-28 text-right">Importe</TableHead>
                  <TableHead className="w-40">Fecha</TableHead>
                  <TableHead className="w-40">Estado</TableHead>
                  <TableHead className="w-14 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enPagina.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="min-w-48 pl-4 whitespace-normal">
                      <Link href={`/admin/solicitudes/${s.id}`} className="font-medium hover:underline">{s.estudiante.nombre ?? "Estudiante"}</Link>
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal text-sm">
                      {s.curso?.nombre ?? "Curso"}
                      <span className="block text-xs text-muted-foreground">Grupo {s.grupo?.codigo ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm">{ETIQUETA_TIPO_SOLICITUD[s.tipo]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatoSolesSolicitud.format(s.importe_esperado)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatoFechaHoraSolicitud.format(new Date(s.fecha_solicitud))}</TableCell>
                    <TableCell><EstadoSolicitudBadge estado={s.estado} reservaVencida={s.reservaVencida} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/solicitudes/${s.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Ver solicitud">
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {enPagina.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/solicitudes/${s.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{s.estudiante.nombre ?? "Estudiante"}</p>
                        <EstadoSolicitudBadge estado={s.estado} reservaVencida={s.reservaVencida} />
                      </div>
                      <p className="text-xs text-muted-foreground">{s.curso?.nombre ?? "Curso"} · Grupo {s.grupo?.codigo ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {ETIQUETA_TIPO_SOLICITUD[s.tipo]} · {formatoSolesSolicitud.format(s.importe_esperado)} · {formatoFechaHoraSolicitud.format(new Date(s.fecha_solicitud))}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Button variant="outline" size="sm" onClick={() => setPagina(actual - 1)} disabled={actual <= 1}><ChevronLeft aria-hidden />Anterior</Button>
              <span className="tabular-nums text-muted-foreground">Página {actual} de {paginas}</span>
              <Button variant="outline" size="sm" onClick={() => setPagina(actual + 1)} disabled={actual >= paginas}>Siguiente<ChevronRight aria-hidden /></Button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>
        </div>
        {accion}
      </CardContent>
    </Card>
  )
}
