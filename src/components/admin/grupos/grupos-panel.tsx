"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarRange, Eye, Plus, Search, X } from "lucide-react"

import { DisponibilidadBadge, EstadoGrupoBadge, ETIQUETA_ESTADO_GRUPO, fechaCorta, resumenHorarios } from "@/components/admin/grupos/grupo-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GrupoResumen } from "@/lib/grupos/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"
import { ESTADOS_GRUPO, type EstadoGrupo } from "@/lib/validations/grupo"

const TODOS = "__todos__"
const SIN_DOCENTE = "__sin_docente__"

export function GruposPanel({
  grupos,
  cursoInicial,
  hayCursos,
}: {
  grupos: GrupoResumen[]
  /** Filtro inicial desde ?curso= (p. ej. al venir de la ficha de un curso). */
  cursoInicial: string | null
  hayCursos: boolean
}) {
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState<"todos" | EstadoGrupo>("todos")
  const [curso, setCurso] = useState(cursoInicial ?? TODOS)
  const [docente, setDocente] = useState(TODOS)

  const cursos = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const g of grupos) if (g.curso) mapa.set(g.curso.id, g.curso.nombre)
    return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [grupos])

  const docentes = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const g of grupos) if (g.docente) mapa.set(g.docente.id, g.docente.nombre)
    return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [grupos])

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return grupos.filter(
      (g) =>
        (estado === "todos" || g.estado === estado) &&
        (curso === TODOS || g.curso?.id === curso) &&
        (docente === TODOS || (docente === SIN_DOCENTE ? !g.docente : g.docente?.id === docente)) &&
        (clave === "" ||
          claveNombre(g.codigo).includes(clave) ||
          claveNombre(g.curso?.nombre ?? "").includes(clave) ||
          claveNombre(g.docente?.nombre ?? "").includes(clave))
    )
  }, [grupos, busqueda, estado, curso, docente])

  const nuevoHref = curso !== TODOS ? `/admin/grupos/nuevo?curso=${curso}` : "/admin/grupos/nuevo"
  const nuevo = hayCursos ? (
    <Link href={nuevoHref} className={cn(buttonVariants(), "w-full sm:w-auto")}>
      <Plus aria-hidden />
      Nuevo grupo
    </Link>
  ) : (
    <Link href="/admin/cursos" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
      Crea un curso primero
    </Link>
  )

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código, curso o docente" aria-label="Buscar grupos" className="pl-8" />
          </div>
          {nuevo}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="group" aria-label="Filtrar por estado" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex sm:w-fit sm:flex-wrap">
            {(["todos", ...ESTADOS_GRUPO] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setEstado(valor)}
                aria-pressed={estado === valor}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  estado === valor ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {valor === "todos" ? "Todos" : ETIQUETA_ESTADO_GRUPO[valor]}
              </button>
            ))}
          </div>
          {cursos.length > 0 && (
            <Select
              items={[{ value: TODOS, label: "Todos los cursos" }, ...cursos.map((c) => ({ value: c.id, label: c.nombre }))]}
              value={cursos.some((c) => c.id === curso) ? curso : TODOS}
              onValueChange={(v) => setCurso(v ? String(v) : TODOS)}
            >
              <SelectTrigger className="w-full lg:w-64" aria-label="Filtrar por curso">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los cursos</SelectItem>
                {cursos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {grupos.length > 0 && (
            <Select
              items={[{ value: TODOS, label: "Todos los docentes" }, { value: SIN_DOCENTE, label: "Sin docente asignado" }, ...docentes.map((d) => ({ value: d.id, label: d.nombre }))]}
              value={docente}
              onValueChange={(v) => setDocente(v ? String(v) : TODOS)}
            >
              <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por docente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los docentes</SelectItem>
                <SelectItem value={SIN_DOCENTE}>Sin docente asignado</SelectItem>
                {docentes.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {grupos.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay grupos"
          texto={hayCursos ? "Crea el primer grupo de un curso: fechas, vacantes, docente y horarios." : "Para abrir grupos necesitas al menos un curso que no esté desactivado."}
          accion={nuevo}
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ningún grupo coincide"
          texto="Prueba con otra búsqueda o cambia los filtros."
          accion={
            <Button variant="outline" onClick={() => { setBusqueda(""); setEstado("todos"); setCurso(TODOS); setDocente(TODOS) }}>
              <X aria-hidden />
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          <p className="sr-only" role="status">{visibles.length === 1 ? "1 grupo" : `${visibles.length} grupos`}</p>
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56 pl-4">Grupo</TableHead>
                  <TableHead>Docente</TableHead>
                  <TableHead className="w-44">Fechas</TableHead>
                  <TableHead className="w-28 text-center">Vacantes</TableHead>
                  <TableHead className="w-44">Estado</TableHead>
                  <TableHead className="w-14 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="min-w-56 pl-4 whitespace-normal">
                      <Link href={`/admin/grupos/${g.id}`} className="font-medium hover:underline">
                        {g.curso?.nombre ?? "Curso"} · {g.codigo}
                      </Link>
                      <p className="text-xs text-muted-foreground">{resumenHorarios(g.horarios)}</p>
                    </TableCell>
                    <TableCell className={cn(!g.docente && "text-muted-foreground")}>{g.docente?.nombre ?? "Sin asignar"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      <Vacantes grupo={g} />
                    </TableCell>
                    <TableCell><EstadoGrupoBadge estado={g.estado} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/grupos/${g.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Ver grupo ${g.codigo}`}>
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {visibles.map((g) => (
              <li key={g.id}>
                <Link href={`/admin/grupos/${g.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{g.curso?.nombre ?? "Curso"} · {g.codigo}</p>
                        <EstadoGrupoBadge estado={g.estado} />
                      </div>
                      <p className="text-xs text-muted-foreground">{g.docente?.nombre ?? "Sin docente asignado"}</p>
                      <p className="text-xs text-muted-foreground">{fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}</p>
                      <p className="text-xs text-muted-foreground">{resumenHorarios(g.horarios)}</p>
                      <p className="text-xs"><Vacantes grupo={g} /></p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** Total, ocupadas y libres (matrículas activas + reservas vigentes, cálculo de V5). */
function Vacantes({ grupo }: { grupo: GrupoResumen }) {
  if (grupo.vacantesDisponibles == null) return <span>{grupo.vacantes} vacantes</span>
  const ocupadas = grupo.vacantes - grupo.vacantesDisponibles
  return (
    <span className="inline-flex flex-col items-start gap-1 lg:items-center">
      <span>
        <span className="font-medium">{grupo.vacantesDisponibles}</span>
        <span className="text-muted-foreground"> libres de {grupo.vacantes}</span>
        <span className="block text-[11px] text-muted-foreground">{ocupadas} ocupadas</span>
      </span>
      <DisponibilidadBadge vacantes={grupo.vacantes} disponibles={grupo.vacantesDisponibles} />
    </span>
  )
}

function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarRange className="size-5 text-muted-foreground" aria-hidden />
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
