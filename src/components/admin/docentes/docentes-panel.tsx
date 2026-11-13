"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Eye, Loader2, Presentation, Search, UserPlus, X } from "lucide-react"

import { DocenteFormDialog } from "@/components/admin/docentes/docente-form-dialog"
import { EstadoCuenta, EstadoRol } from "@/components/admin/docentes/docente-ui"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { roleConfig } from "@/config/navigation"
import { asignarRolDocente } from "@/lib/docentes/acciones"
import type { DocenteResumen, MiembroInstitucion } from "@/lib/docentes/datos"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

type Filtro = "todos" | "habilitados" | "deshabilitados" | "pendientes"
const ETIQUETA_FILTRO: Record<Filtro, string> = {
  todos: "Todos",
  habilitados: "Habilitados",
  deshabilitados: "Deshabilitados",
  pendientes: "Invitación pendiente",
}
const POR_PAGINA = 20
const SIN_GRUPOS = "__sin_grupos__"

export function DocentesPanel({
  docentes,
  miembros,
  cuentasConfiguradas,
}: {
  docentes: DocenteResumen[]
  miembros: MiembroInstitucion[]
  cuentasConfiguradas: boolean
}) {
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [curso, setCurso] = useState("")
  const [pagina, setPagina] = useState(0)
  const cursos = useMemo(
    () => [...new Map(docentes.flatMap((d) => d.cursosAsignados.map((c) => [c.id, c.nombre] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
    [docentes]
  )
  const [registrar, setRegistrar] = useState(false)
  const [asignar, setAsignar] = useState(false)

  const conteo = useMemo<Record<Filtro, number>>(
    () => ({
      todos: docentes.length,
      habilitados: docentes.filter((d) => d.rolActivo && d.perfilActivo).length,
      deshabilitados: docentes.filter((d) => !d.rolActivo || !d.perfilActivo).length,
      pendientes: docentes.filter((d) => d.cuenta && !d.cuenta.activada).length,
    }),
    [docentes]
  )

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return docentes.filter((d) => {
      const coincide =
        clave === "" ||
        claveNombre(`${d.nombres} ${d.apellidos}`).includes(clave) ||
        (d.dni ?? "").toLowerCase().includes(clave) ||
        (d.cuenta?.correo ?? "").toLowerCase().includes(clave)
      const estado =
        filtro === "todos" ||
        (filtro === "habilitados" && d.rolActivo && d.perfilActivo) ||
        (filtro === "deshabilitados" && (!d.rolActivo || !d.perfilActivo)) ||
        (filtro === "pendientes" && d.cuenta !== null && !d.cuenta.activada)
      const porCurso =
        curso === "" || (curso === SIN_GRUPOS ? (d.grupos ?? 0) === 0 : d.cursosAsignados.some((c) => c.id === curso))
      return coincide && estado && porCurso
    })
  }, [docentes, busqueda, filtro, curso])
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas - 1)
  const enPagina = visibles.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)

  const filtros: Filtro[] = cuentasConfiguradas ? ["todos", "habilitados", "deshabilitados", "pendientes"] : ["todos", "habilitados", "deshabilitados"]

  return (
    <>
      {!cuentasConfiguradas && (
        <div role="note" className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm dark:bg-warning/10">
          <p className="font-medium">El registro de cuentas nuevas aún no está configurado</p>
          <p className="mt-1 text-muted-foreground">
            Para crear cuentas e invitar docentes, el servidor necesita la variable{" "}
            <code className="font-mono text-xs">SUPABASE_SECRET_KEY</code>. Mientras tanto puedes asignar el rol
            docente a personas que ya pertenecen a tu institución y gestionar los docentes existentes.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(0) }}
              placeholder="Buscar por nombre, documento o correo"
              aria-label="Buscar docentes"
              className="pl-8"
            />
          </div>
          {/* Una sola entrada: el diálogo ofrece «persona nueva» o «ya está en mi institución» solo si aplica. */}
          <Button onClick={() => (cuentasConfiguradas ? setRegistrar(true) : setAsignar(true))} disabled={!cuentasConfiguradas && miembros.length === 0}>
            <UserPlus aria-hidden />
            Agregar docente
          </Button>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex sm:w-fit">
          {filtros.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => { setFiltro(valor); setPagina(0) }}
              aria-pressed={filtro === valor}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filtro === valor ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {ETIQUETA_FILTRO[valor]} <span className="tabular-nums opacity-70">{conteo[valor]}</span>
            </button>
          ))}
        </div>
        {cursos.length > 0 && (
          <div className="sm:w-80">
            <label htmlFor="docentes-curso" className="sr-only">Filtrar por curso asignado</label>
            <select
              id="docentes-curso"
              value={curso}
              onChange={(e) => { setCurso(e.target.value); setPagina(0) }}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Todos los cursos</option>
              <option value={SIN_GRUPOS}>Sin grupos asignados</option>
              {cursos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {docentes.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay docentes"
          texto="Registra a tu personal docente. No necesitan tener cursos asignados: los grupos se asignan después."
          accion={
            cuentasConfiguradas ? (
              <Button onClick={() => setRegistrar(true)}>
                <UserPlus aria-hidden />
                Agregar docente
              </Button>
            ) : undefined
          }
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ningún docente coincide"
          texto="Prueba con otro nombre o cambia el filtro."
          accion={
            <Button variant="outline" onClick={() => { setBusqueda(""); setFiltro("todos"); setCurso(""); setPagina(0) }}>
              <X aria-hidden />
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          <p className="sr-only" role="status">{visibles.length === 1 ? "1 docente" : `${visibles.length} docentes`}</p>
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56 pl-4">Docente</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead className="w-36">Cuenta</TableHead>
                  <TableHead className="w-24 text-center">Grupos</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                  <TableHead className="w-16 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enPagina.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="min-w-56 pl-4 whitespace-normal">
                      <Link href={`/admin/docentes/${d.id}`} className="font-medium hover:underline">{d.apellidos}, {d.nombres}</Link>
                      <p className="text-xs text-muted-foreground">
                        {d.dni ? `Doc. ${d.dni}` : "Sin documento"}
                        {d.otrosRoles.length > 0 && ` · también ${d.otrosRoles.map((r) => roleConfig[r].label.toLowerCase()).join(", ")}`}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{d.cuenta?.correo ?? "—"}</TableCell>
                    <TableCell><EstadoCuenta cuenta={d.cuenta} /></TableCell>
                    <TableCell className="text-center tabular-nums" title={d.cursosAsignados.map((c) => c.nombre).join(", ") || undefined}>
                      {d.grupos ?? "—"}
                      {(d.gruposVigentes ?? 0) > 0 && <span className="block text-xs text-muted-foreground">{d.gruposVigentes} vigentes</span>}
                    </TableCell>
                    <TableCell><EstadoRol docente={d} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/docentes/${d.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Ver ${d.nombres} ${d.apellidos}`}>
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {enPagina.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/docentes/${d.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{d.apellidos}, {d.nombres}</p>
                        <EstadoRol docente={d} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{d.cuenta?.correo ?? (d.dni ? `Doc. ${d.dni}` : "Sin datos de contacto")}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <EstadoCuenta cuenta={d.cuenta} />
                        <span>{d.grupos == null ? "—" : `${d.grupos} ${d.grupos === 1 ? "grupo" : "grupos"}`}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Páginas de docentes" className="mt-4 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {actual * POR_PAGINA + 1}–{Math.min((actual + 1) * POR_PAGINA, visibles.length)} de {visibles.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" disabled={actual === 0} onClick={() => setPagina(actual - 1)} aria-label="Página anterior"><ChevronLeft aria-hidden /></Button>
                <Button variant="outline" size="icon-sm" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)} aria-label="Página siguiente"><ChevronRight aria-hidden /></Button>
              </div>
            </nav>
          )}
        </>
      )}

      <DocenteFormDialog
        abierto={registrar}
        onAbiertoChange={setRegistrar}
        docente={null}
        miembroExistente={{ disponibles: miembros.length, elegir: () => { setRegistrar(false); setAsignar(true) } }}
      />
      <AsignarMiembroDialog abierto={asignar} onAbiertoChange={setAsignar} miembros={miembros} />
    </>
  )
}

function AsignarMiembroDialog({
  abierto,
  onAbiertoChange,
  miembros,
}: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  miembros: MiembroInstitucion[]
}) {
  const router = useRouter()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function asignar() {
    if (!seleccion || guardando) return
    setGuardando(true)
    const operacion = notificar.operacion("Asignando rol docente…")
    try {
      const resultado = await asignarRolDocente(seleccion)
      if (resultado.ok) {
        operacion.exito("Rol docente asignado correctamente")
        onAbiertoChange(false)
        setSeleccion(null)
        router.refresh()
      } else {
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo asignar el rol", { descripcion: resultado.mensaje })
      }
    } catch {
      operacion.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setGuardando(false)
    }
  }

  const etiqueta = (m: MiembroInstitucion) =>
    `${m.apellidos}, ${m.nombres}${m.roles.length ? ` (${m.roles.map((r) => roleConfig[r].label.toLowerCase()).join(", ")})` : ""}`

  return (
    <Dialog open={abierto} onOpenChange={(v) => !guardando && onAbiertoChange(v)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>Asignar el rol docente</DialogTitle>
          <DialogDescription>
            Para personas que ya tienen cuenta en tu institución (por ejemplo, un administrador que también
            dicta clases). Conservan su correo, su contraseña y sus otros roles.
          </DialogDescription>
        </DialogHeader>
        <Select
          items={miembros.map((m) => ({ value: m.id, label: etiqueta(m) }))}
          value={seleccion}
          onValueChange={(v) => setSeleccion(v ? String(v) : null)}
          disabled={guardando}
        >
          <SelectTrigger className="w-full" aria-label="Persona de la institución">
            <SelectValue placeholder="Selecciona una persona" />
          </SelectTrigger>
          <SelectContent>
            {miembros.map((m) => (
              <SelectItem key={m.id} value={m.id}>{etiqueta(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={guardando} />}>Cancelar</DialogClose>
          <Button onClick={asignar} disabled={!seleccion || guardando}>
            {guardando && <Loader2 className="animate-spin" aria-hidden />}
            Asignar rol docente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Presentation className="size-5 text-muted-foreground" aria-hidden />
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
