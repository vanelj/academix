"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { BookOpen, CircleCheck, CircleDashed, Eye, Pencil, Plus, Search, X } from "lucide-react"

import {
  EstadoCursoBadge,
  ETIQUETA_ESTADO,
  formatoFechaCurso,
  formatoSoles,
} from "@/components/admin/cursos/curso-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CursoResumen } from "@/lib/cursos/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"
import { ESTADOS_CURSO, type EstadoCurso } from "@/lib/validations/curso"

type FiltroEstado = "todos" | EstadoCurso
const TODAS = "__todas__"

export function CursosPanel({ cursos, hayCategoriasActivas }: { cursos: CursoResumen[]; hayCategoriasActivas: boolean }) {
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState<FiltroEstado>("todos")
  const [categoria, setCategoria] = useState(TODAS)

  const categorias = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of cursos) if (c.categoria) mapa.set(c.categoria.id, c.categoria.nombre)
    return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [cursos])

  const conteo = useMemo(() => {
    const base: Record<FiltroEstado, number> = { todos: cursos.length, borrador: 0, publicado: 0, desactivado: 0 }
    for (const c of cursos) base[c.estado]++
    return base
  }, [cursos])

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return cursos.filter(
      (c) =>
        (estado === "todos" || c.estado === estado) &&
        (categoria === TODAS || c.categoria?.id === categoria) &&
        (clave === "" || claveNombre(c.nombre).includes(clave))
    )
  }, [cursos, busqueda, estado, categoria])

  const nuevo = hayCategoriasActivas ? (
    <Link href="/admin/cursos/nuevo" className={cn(buttonVariants(), "w-full sm:w-auto")}>
      <Plus aria-hidden />
      Nuevo curso
    </Link>
  ) : (
    <Link href="/admin/categorias" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
      Crear una categoría primero
    </Link>
  )

  const filtrando = busqueda !== "" || estado !== "todos" || categoria !== TODAS

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar cursos por nombre"
              className="pl-8"
            />
          </div>
          {nuevo}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div role="group" aria-label="Filtrar por estado" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex">
            {(["todos", ...ESTADOS_CURSO] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setEstado(valor)}
                aria-pressed={estado === valor}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                  estado === valor
                    ? "bg-background text-foreground shadow-sm dark:bg-input/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {valor === "todos" ? "Todos" : ETIQUETA_ESTADO[valor]}{" "}
                <span className="tabular-nums opacity-70">{conteo[valor]}</span>
              </button>
            ))}
          </div>
          {categorias.length > 0 && (
            <Select
              items={[{ value: TODAS, label: "Todas las categorías" }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))]}
              value={categoria}
              onValueChange={(v) => setCategoria(v ? String(v) : TODAS)}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por categoría">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas las categorías</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {cursos.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay cursos"
          texto={
            hayCategoriasActivas
              ? "Crea el primer curso de tu institución. Se guardará como borrador hasta que decidas publicarlo."
              : "Para crear cursos necesitas al menos una categoría activa."
          }
          accion={nuevo}
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ningún curso coincide"
          texto="Prueba con otro nombre o cambia los filtros."
          accion={
            filtrando && (
              <Button
                variant="outline"
                onClick={() => {
                  setBusqueda("")
                  setEstado("todos")
                  setCategoria(TODAS)
                }}
              >
                <X aria-hidden />
                Limpiar filtros
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="sr-only" role="status">
            {visibles.length === 1 ? "1 curso" : `${visibles.length} cursos`}
          </p>

          {/* Escritorio: tabla */}
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64 pl-4">Curso</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-28 text-right">Precio</TableHead>
                  <TableHead className="w-20 text-center">Grupos</TableHead>
                  <TableHead className="w-32">Condiciones</TableHead>
                  <TableHead className="w-28">Creado</TableHead>
                  <TableHead className="w-24 pr-4 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((curso) => (
                  <TableRow key={curso.id}>
                    <TableCell className="min-w-64 pl-4 whitespace-normal">
                      <Link href={`/admin/cursos/${curso.id}`} className="block font-medium break-words hover:underline">
                        {curso.nombre}
                      </Link>
                      <Categoria curso={curso} />
                      {curso.descripcion && <p className="line-clamp-1 text-xs text-muted-foreground">{curso.descripcion}</p>}
                    </TableCell>
                    <TableCell>
                      <EstadoCursoBadge estado={curso.estado} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatoSoles.format(curso.precio)}</TableCell>
                    <TableCell className="text-center tabular-nums">{curso.grupos ?? "—"}</TableCell>
                    <TableCell>
                      <Condiciones valor={curso.tieneCondiciones} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatoFechaCurso.format(new Date(curso.created_at))}</TableCell>
                    <TableCell className="pr-4">
                      <Acciones curso={curso} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Móvil y tableta: tarjetas */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {visibles.map((curso) => (
              <li key={curso.id}>
                <Card size="sm" className="h-full">
                  <CardContent className="flex h-full flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/cursos/${curso.id}`} className="font-medium break-words hover:underline">
                          {curso.nombre}
                        </Link>
                        <Categoria curso={curso} />
                      </div>
                      <EstadoCursoBadge estado={curso.estado} />
                    </div>
                    {curso.descripcion && <p className="line-clamp-2 text-xs text-muted-foreground">{curso.descripcion}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">{formatoSoles.format(curso.precio)}</span>
                      <span>{curso.grupos == null ? "—" : `${curso.grupos} ${curso.grupos === 1 ? "grupo" : "grupos"}`}</span>
                      <Condiciones valor={curso.tieneCondiciones} />
                    </div>
                    <div className="flex justify-end border-t pt-2">
                      <Acciones curso={curso} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Categoria({ curso }: { curso: CursoResumen }) {
  if (!curso.categoria) return <p className="text-xs text-muted-foreground">Sin categoría</p>
  return (
    <p className="truncate text-xs text-muted-foreground">
      {curso.categoria.nombre}
      {!curso.categoria.activo && <span className="text-warning"> · categoría inactiva</span>}
    </p>
  )
}

function Condiciones({ valor }: { valor: boolean | null }) {
  if (valor === null) return <span className="text-xs text-muted-foreground">—</span>
  return valor ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <CircleCheck className="size-3.5" aria-hidden />
      Configuradas
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleDashed className="size-3.5" aria-hidden />
      Pendientes
    </span>
  )
}

function Acciones({ curso }: { curso: CursoResumen }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/admin/cursos/${curso.id}`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label={`Consultar ${curso.nombre}`}
      >
        <Eye aria-hidden />
      </Link>
      <Link
        href={`/admin/cursos/${curso.id}/editar`}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label={`Editar ${curso.nombre}`}
      >
        <Pencil aria-hidden />
      </Link>
    </div>
  )
}

function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <BookOpen className="size-5 text-muted-foreground" aria-hidden />
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
