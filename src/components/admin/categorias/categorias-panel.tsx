"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react"

import { CategoriaFormDialog } from "@/components/admin/categorias/categoria-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cambiarEstadoCategoria, eliminarCategoria, type ResultadoCategoria } from "@/lib/categorias/acciones"
import type { Categoria } from "@/lib/categorias/datos"
import { notificar, type OperacionNotificada } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

type Filtro = "todas" | "activas" | "inactivas"
type Dialogo = { tipo: "crear" } | { tipo: "editar"; categoria: Categoria } | null
type Confirmacion = { tipo: "eliminar" | "desactivar"; categoria: Categoria } | null

const formatoFecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" })

export function CategoriasPanel({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion>(null)
  // Categoría con una operación en curso (evita acciones duplicadas sobre ella).
  const [enProceso, setEnProceso] = useState<string | null>(null)

  const conteo = useMemo(
    () => ({
      todas: categorias.length,
      activas: categorias.filter((c) => c.activo).length,
      inactivas: categorias.filter((c) => !c.activo).length,
    }),
    [categorias]
  )

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return categorias.filter(
      (c) =>
        (filtro === "todas" || (filtro === "activas") === c.activo) &&
        (clave === "" || claveNombre(c.nombre).includes(clave))
    )
  }, [categorias, busqueda, filtro])

  async function ejecutar(
    categoria: Categoria,
    procesando: string,
    accion: () => Promise<ResultadoCategoria>,
    alConfirmar: (operacion: OperacionNotificada) => void
  ) {
    if (enProceso) return
    setEnProceso(categoria.id)
    const operacion = notificar.operacion(procesando)
    try {
      const resultado = await accion()
      if (resultado.ok) {
        alConfirmar(operacion)
        router.refresh()
      } else {
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo completar la operación", { descripcion: resultado.mensaje })
      }
    } catch {
      operacion.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnProceso(null)
      setConfirmacion(null)
    }
  }

  function cambiarEstado(categoria: Categoria, activo: boolean) {
    return ejecutar(
      categoria,
      activo ? "Activando categoría…" : "Desactivando categoría…",
      () => cambiarEstadoCategoria(categoria.id, activo),
      (operacion) =>
        operacion.exito("Los cambios se guardaron correctamente", {
          descripcion: `«${categoria.nombre}» ahora está ${activo ? "activa" : "inactiva"}.`,
        })
    )
  }

  function solicitarCambioEstado(categoria: Categoria) {
    // Desactivar oculta del catálogo los cursos publicados de la categoría: se confirma.
    if (categoria.activo && (categoria.cursosPublicados ?? 0) > 0) {
      setConfirmacion({ tipo: "desactivar", categoria })
    } else {
      void cambiarEstado(categoria, !categoria.activo)
    }
  }

  function eliminar(categoria: Categoria) {
    return ejecutar(
      categoria,
      "Eliminando categoría…",
      () => eliminarCategoria(categoria.id),
      (operacion) => operacion.exito("Categoría eliminada", { descripcion: `«${categoria.nombre}»` })
    )
  }

  const acciones = {
    enProceso,
    onEditar: (categoria: Categoria) => setDialogo({ tipo: "editar", categoria }),
    onEstado: solicitarCambioEstado,
    onEliminar: (categoria: Categoria) => setConfirmacion({ tipo: "eliminar", categoria }),
  }

  return (
    <>
      {/* Barra de herramientas */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar categorías por nombre"
              className="pl-8"
            />
          </div>
          <div role="group" aria-label="Filtrar por estado" className="flex gap-1 rounded-lg bg-muted p-1">
            {(["todas", "activas", "inactivas"] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                  filtro === valor
                    ? "bg-background text-foreground shadow-sm dark:bg-input/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {valor} <span className="tabular-nums opacity-70">{conteo[valor]}</span>
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => setDialogo({ tipo: "crear" })} className="w-full sm:w-auto sm:self-start lg:self-auto">
          <Plus aria-hidden />
          Nueva categoría
        </Button>
      </div>

      {categorias.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay categorías"
          texto="Crea la primera categoría para empezar a organizar los cursos de tu institución."
          accion={
            <Button onClick={() => setDialogo({ tipo: "crear" })}>
              <Plus aria-hidden />
              Crear categoría
            </Button>
          }
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ninguna categoría coincide"
          texto={busqueda ? `No hay categorías ${filtro === "todas" ? "" : `${filtro} `}que coincidan con «${busqueda}».` : `No hay categorías ${filtro}.`}
          accion={
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda("")
                setFiltro("todas")
              }}
            >
              <X aria-hidden />
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          <p className="sr-only" role="status">
            {visibles.length === 1 ? "1 categoría" : `${visibles.length} categorías`}
          </p>

          {/* Escritorio: tabla */}
          <Card className="hidden py-0 md:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Categoría</TableHead>
                  <TableHead className="w-32">Cursos</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead className="w-32">Creada</TableHead>
                  <TableHead className="w-28 pr-4 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((categoria) => (
                  <TableRow key={categoria.id} aria-busy={enProceso === categoria.id}>
                    <TableCell className="max-w-0 pl-4 whitespace-normal">
                      <p className="truncate font-medium">{categoria.nombre}</p>
                      {categoria.descripcion && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{categoria.descripcion}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Cursos categoria={categoria} />
                    </TableCell>
                    <TableCell>
                      <Estado activo={categoria.activo} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatoFecha.format(new Date(categoria.created_at))}
                    </TableCell>
                    <TableCell className="pr-4">
                      <Acciones categoria={categoria} {...acciones} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {visibles.map((categoria) => (
              <li key={categoria.id}>
                <Card size="sm" aria-busy={enProceso === categoria.id}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">{categoria.nombre}</p>
                        {categoria.descripcion && (
                          <p className="line-clamp-3 text-xs text-muted-foreground">{categoria.descripcion}</p>
                        )}
                      </div>
                      <Acciones categoria={categoria} {...acciones} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Estado activo={categoria.activo} />
                      <Cursos categoria={categoria} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <CategoriaFormDialog
        abierto={dialogo !== null}
        onAbiertoChange={(abierto) => !abierto && setDialogo(null)}
        categoria={dialogo?.tipo === "editar" ? dialogo.categoria : null}
      />

      <Confirmar
        confirmacion={confirmacion}
        ocupado={enProceso !== null}
        onCancelar={() => setConfirmacion(null)}
        onConfirmar={(c) => (c.tipo === "eliminar" ? eliminar(c.categoria) : cambiarEstado(c.categoria, false))}
      />
    </>
  )
}

function Acciones({
  categoria,
  enProceso,
  onEditar,
  onEstado,
  onEliminar,
}: {
  categoria: Categoria
  enProceso: string | null
  onEditar: (c: Categoria) => void
  onEstado: (c: Categoria) => void
  onEliminar: (c: Categoria) => void
}) {
  const ocupada = enProceso === categoria.id
  const enUso = (categoria.cursos ?? 0) > 0
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onEditar(categoria)}
        disabled={enProceso !== null}
        aria-label={`Editar ${categoria.nombre}`}
      >
        <Pencil aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" disabled={enProceso !== null} />}
          aria-label={`Más acciones para ${categoria.nombre}`}
        >
          {ocupada ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onEstado(categoria)}>
            {categoria.activo ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {categoria.activo ? "Desactivar" : "Activar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={enUso} onClick={() => onEliminar(categoria)}>
            <Trash2 aria-hidden />
            <span className="flex flex-col">
              Eliminar
              {enUso && <span className="text-xs font-normal text-muted-foreground">En uso por cursos</span>}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Cursos({ categoria }: { categoria: Categoria }) {
  if (categoria.cursos === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground tabular-nums">{categoria.cursos}</span>{" "}
      {categoria.cursos === 1 ? "curso" : "cursos"}
      {(categoria.cursosPublicados ?? 0) > 0 && (
        <span className="block sm:inline md:block">
          {" "}
          {categoria.cursosPublicados} {categoria.cursosPublicados === 1 ? "publicado" : "publicados"}
        </span>
      )}
    </span>
  )
}

function Estado({ activo }: { activo: boolean }) {
  return activo ? <Badge variant="success">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>
}

function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Tags className="size-5 text-muted-foreground" aria-hidden />
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

function Confirmar({
  confirmacion,
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  confirmacion: Confirmacion
  ocupado: boolean
  onCancelar: () => void
  onConfirmar: (c: NonNullable<Confirmacion>) => void
}) {
  const c = confirmacion
  const publicados = c?.categoria.cursosPublicados ?? 0
  return (
    <Dialog open={c !== null} onOpenChange={(abierto) => !abierto && !ocupado && onCancelar()}>
      <DialogContent showCloseButton={false}>
        {c && (
          <>
            <DialogHeader>
              <DialogTitle>
                {c.tipo === "eliminar" ? "¿Eliminar la categoría?" : "¿Desactivar la categoría?"}
              </DialogTitle>
              <DialogDescription>
                {c.tipo === "eliminar"
                  ? `Se eliminará «${c.categoria.nombre}» de forma permanente. Esta acción no se puede deshacer.`
                  : `${publicados === 1 ? "El curso publicado" : `Los ${publicados} cursos publicados`} de «${c.categoria.nombre}» dejarán de mostrarse en el catálogo público mientras la categoría esté inactiva.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={ocupado} autoFocus />}>Cancelar</DialogClose>
              <Button variant="destructive" onClick={() => onConfirmar(c)} disabled={ocupado}>
                {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                {c.tipo === "eliminar" ? "Eliminar" : "Desactivar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
