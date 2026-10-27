"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Eye, Search, Users, X } from "lucide-react"

import {
  ETIQUETA_SITUACION,
  SituacionBadge,
  cursosRelacionados,
  nombreEstudiante,
  situacion,
  type Situacion,
} from "@/components/admin/estudiantes/estudiante-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { EstudianteResumen } from "@/lib/estudiantes/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

const TODOS = "__todos__"
const POR_PAGINA = 20

/** Cursos y grupos (de esta institución) en los que el estudiante tiene matrícula o solicitud. */
function relaciones(e: EstudianteResumen) {
  const grupos = new Map<string, { codigo: string; cursoId: string | null; curso: string }>()
  for (const r of [...e.matriculas, ...e.solicitudes]) {
    if (r.grupo) grupos.set(r.grupo.id, { codigo: r.grupo.codigo, cursoId: r.grupo.curso?.id ?? null, curso: r.grupo.curso?.nombre ?? "Curso" })
  }
  return grupos
}

export function EstudiantesPanel({ estudiantes }: { estudiantes: EstudianteResumen[] }) {
  const [busqueda, setBusqueda] = useState("")
  const [curso, setCurso] = useState(TODOS)
  const [grupo, setGrupo] = useState(TODOS)
  const [estado, setEstado] = useState<"todos" | Situacion>("todos")
  const [pagina, setPagina] = useState(1)

  const datos = useMemo(
    () => estudiantes.map((e) => ({ e, situacion: situacion(e), grupos: relaciones(e) })),
    [estudiantes]
  )

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>()
    const grupos = new Map<string, { label: string; cursoId: string | null }>()
    for (const d of datos)
      for (const [id, g] of d.grupos) {
        if (g.cursoId) cursos.set(g.cursoId, g.curso)
        grupos.set(id, { label: `${g.curso} · ${g.codigo}`, cursoId: g.cursoId })
      }
    const orden = <T extends { label: string }>(a: T, b: T) => a.label.localeCompare(b.label, "es")
    return {
      cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden),
      grupos: [...grupos].map(([value, g]) => ({ value, label: g.label, cursoId: g.cursoId })).sort(orden),
    }
  }, [datos])

  const gruposDelCurso = curso === TODOS ? opciones.grupos : opciones.grupos.filter((g) => g.cursoId === curso)

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return datos.filter(({ e, situacion: s, grupos }) => {
      const textos = [e.nombres ?? "", e.apellidos ?? ""]
      return (
        (estado === "todos" || s === estado) &&
        (curso === TODOS || [...grupos.values()].some((g) => g.cursoId === curso)) &&
        (grupo === TODOS || grupos.has(grupo)) &&
        (clave === "" || textos.some((t) => claveNombre(t).includes(clave)))
      )
    })
  }, [datos, busqueda, estado, curso, grupo])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const pagina_ = visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)
  const reiniciar = () => setPagina(1)

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); reiniciar() }} placeholder="Buscar por nombre o apellido" aria-label="Buscar estudiantes" className="pl-8" />
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {estudiantes.length === 1 ? "1 estudiante" : `${estudiantes.length} estudiantes`}
            {visibles.length !== estudiantes.length && ` · ${visibles.length} con los filtros`}
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="group" aria-label="Filtrar por situación" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex sm:w-fit">
            {(["todos", "matriculado", "en_proceso", "historial"] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => { setEstado(valor); reiniciar() }}
                aria-pressed={estado === valor}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  estado === valor ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {valor === "todos" ? "Todos" : ETIQUETA_SITUACION[valor]}
              </button>
            ))}
          </div>
          {opciones.cursos.length > 0 && (
            <Select items={[{ value: TODOS, label: "Todos los cursos" }, ...opciones.cursos]} value={curso} onValueChange={(v) => { setCurso(v ? String(v) : TODOS); setGrupo(TODOS); reiniciar() }}>
              <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por curso"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los cursos</SelectItem>
                {opciones.cursos.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {gruposDelCurso.length > 0 && (
            <Select items={[{ value: TODOS, label: "Todos los grupos" }, ...gruposDelCurso]} value={gruposDelCurso.some((g) => g.value === grupo) ? grupo : TODOS} onValueChange={(v) => { setGrupo(v ? String(v) : TODOS); reiniciar() }}>
              <SelectTrigger className="w-full lg:w-64" aria-label="Filtrar por grupo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los grupos</SelectItem>
                {gruposDelCurso.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {estudiantes.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay estudiantes"
          texto="Aparecerán aquí cuando soliciten inscribirse o se matriculen en algún grupo de tu institución."
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ningún estudiante coincide"
          texto="Prueba con otra búsqueda o cambia los filtros."
          accion={
            <Button variant="outline" onClick={() => { setBusqueda(""); setEstado("todos"); setCurso(TODOS); setGrupo(TODOS); reiniciar() }}>
              <X aria-hidden />
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56 pl-4">Estudiante</TableHead>
                  <TableHead>Cursos y grupos</TableHead>
                  <TableHead className="w-20 text-center">Cursos</TableHead>
                  <TableHead className="w-24 text-center">Matrículas</TableHead>
                  <TableHead className="w-24 text-center">Solicitudes</TableHead>
                  <TableHead className="w-44">Situación</TableHead>
                  <TableHead className="w-14 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagina_.map(({ e, situacion: s, grupos }) => (
                  <TableRow key={e.id}>
                    <TableCell className="min-w-56 pl-4 whitespace-normal">
                      <Link href={`/admin/estudiantes/${e.id}`} className={cn("font-medium hover:underline", !e.datosVisibles && "text-muted-foreground italic")}>
                        {nombreEstudiante(e)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-xs text-muted-foreground">
                      {[...grupos.values()].map((g) => `${g.curso} · ${g.codigo}`).join(" — ") || "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{cursosRelacionados(e)}</TableCell>
                    <TableCell className="text-center tabular-nums">{e.matriculas.length}</TableCell>
                    <TableCell className="text-center tabular-nums">{e.solicitudes.length}</TableCell>
                    <TableCell><SituacionBadge valor={s} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/estudiantes/${e.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Ver ficha del estudiante">
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {pagina_.map(({ e, situacion: s, grupos }) => (
              <li key={e.id}>
                <Link href={`/admin/estudiantes/${e.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("min-w-0 font-medium break-words", !e.datosVisibles && "text-muted-foreground italic")}>{nombreEstudiante(e)}</p>
                        <SituacionBadge valor={s} />
                      </div>
                      <p className="text-xs text-muted-foreground">{[...grupos.values()].map((g) => `${g.curso} · ${g.codigo}`).join(" — ") || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {cursosRelacionados(e)} {cursosRelacionados(e) === 1 ? "curso" : "cursos"} · {e.matriculas.length} {e.matriculas.length === 1 ? "matrícula" : "matrículas"} · {e.solicitudes.length} {e.solicitudes.length === 1 ? "solicitud" : "solicitudes"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Button variant="outline" size="sm" onClick={() => setPagina(actual - 1)} disabled={actual <= 1}>
                <ChevronLeft aria-hidden />
                Anterior
              </Button>
              <span className="tabular-nums text-muted-foreground">Página {actual} de {paginas}</span>
              <Button variant="outline" size="sm" onClick={() => setPagina(actual + 1)} disabled={actual >= paginas}>
                Siguiente
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Users className="size-5 text-muted-foreground" aria-hidden />
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
