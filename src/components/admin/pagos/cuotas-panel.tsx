"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react"

import { EstadoCuotaBadge, Indicador, situacionCuota, type SituacionCuota } from "@/components/admin/pagos/pago-ui"
import { fechaSimple, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CuotaAdmin } from "@/lib/pagos/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

const TODOS = "__todos__"
const POR_PAGINA = 20
type Filtro = "todas" | SituacionCuota
const SITUACIONES: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "parcial", etiqueta: "Parciales" },
  { valor: "vencida", etiqueta: "Vencidas" },
  { valor: "pagada", etiqueta: "Pagadas" },
  { valor: "anulada", etiqueta: "Anuladas" },
]

export function CuotasPanel({ cuotas }: { cuotas: CuotaAdmin[] }) {
  const [busqueda, setBusqueda] = useState("")
  const [situacion, setSituacion] = useState<Filtro>("todas")
  const [soloRevision, setSoloRevision] = useState(false)
  const [curso, setCurso] = useState(TODOS)
  const [grupo, setGrupo] = useState(TODOS)
  const [pagina, setPagina] = useState(1)

  const resumen = useMemo(() => {
    // Por cobrar: saldo de cuotas pendientes o parciales de matrículas activas.
    const exigibles = cuotas.filter((c) => (c.estado === "pendiente" || c.estado === "parcial") && c.matricula?.estado === "activa")
    const vencidas = exigibles.filter((c) => c.vencida)
    return {
      porCobrar: exigibles.reduce((t, c) => t + c.saldo, 0),
      exigibles: exigibles.length,
      vencidas: vencidas.length,
      saldoVencido: vencidas.reduce((t, c) => t + c.saldo, 0),
      enRevision: cuotas.filter((c) => c.enRevision > 0).length,
      montoRevision: cuotas.reduce((t, c) => t + c.enRevision, 0),
      cobrado: cuotas.reduce((t, c) => t + c.aplicado, 0),
    }
  }, [cuotas])

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>()
    const grupos = new Map<string, { label: string; cursoId: string | null }>()
    for (const c of cuotas) {
      if (c.curso) cursos.set(c.curso.id, c.curso.nombre)
      if (c.grupo) grupos.set(c.grupo.id, { label: `${c.curso?.nombre ?? "Curso"} · ${c.grupo.codigo}`, cursoId: c.curso?.id ?? null })
    }
    const orden = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "es")
    return {
      cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden),
      grupos: [...grupos].map(([value, g]) => ({ value, label: g.label, cursoId: g.cursoId })).sort(orden),
    }
  }, [cuotas])
  const gruposDelCurso = curso === TODOS ? opciones.grupos : opciones.grupos.filter((g) => g.cursoId === curso)

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    return cuotas.filter(
      (c) =>
        (situacion === "todas" || situacionCuota(c) === situacion) &&
        (!soloRevision || c.enRevision > 0) &&
        (curso === TODOS || c.curso?.id === curso) &&
        (grupo === TODOS || c.grupo?.id === grupo) &&
        (clave === "" || claveNombre(c.estudiante.nombre ?? "").includes(clave))
    )
  }, [cuotas, busqueda, situacion, soloRevision, curso, grupo])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const enPagina = visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)
  const r = () => setPagina(1)
  const limpiar = () => { setBusqueda(""); setSituacion("todas"); setSoloRevision(false); setCurso(TODOS); setGrupo(TODOS); r() }
  const s = formatoSolesSolicitud

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Saldo por cobrar" valor={s.format(resumen.porCobrar)} detalle={`${resumen.exigibles} ${resumen.exigibles === 1 ? "cuota" : "cuotas"} de matrículas activas`} />
        <Indicador etiqueta="Vencidas" valor={String(resumen.vencidas)} detalle={s.format(resumen.saldoVencido)} tono={resumen.vencidas > 0 ? "destructive" : undefined} />
        <Indicador etiqueta="Con comprobante en revisión" valor={String(resumen.enRevision)} detalle={s.format(resumen.montoRevision)} tono={resumen.enRevision > 0 ? "warning" : undefined} />
        <Indicador etiqueta="Pagos aprobados en cuotas" valor={s.format(resumen.cobrado)} />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); r() }} placeholder="Buscar por estudiante" aria-label="Buscar cuotas por estudiante" className="pl-8" />
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {visibles.length === cuotas.length ? `${cuotas.length} ${cuotas.length === 1 ? "cuota" : "cuotas"}` : `${visibles.length} de ${cuotas.length} cuotas con los filtros`}
          </p>
        </div>
        <div role="group" aria-label="Filtrar por situación" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          {SITUACIONES.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => { setSituacion(e.valor); r() }}
              aria-pressed={situacion === e.valor}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                situacion === e.valor ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {e.etiqueta}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloRevision} onChange={(e) => { setSoloRevision(e.target.checked); r() }} className="size-4 accent-primary" />
            Solo con comprobante en revisión
          </label>
        </div>
      </div>

      {cuotas.length === 0 ? (
        <Vacio
          titulo="Aún no hay cuotas"
          texto="Las cuotas se generan al confirmar la matrícula en cursos cobrados en cuotas, según el plan de cuotas configurado en las condiciones de cada curso."
        />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo="Ninguna cuota coincide"
          texto="Prueba con otra búsqueda o cambia los filtros."
          accion={<Button variant="outline" onClick={limpiar}><X aria-hidden />Limpiar filtros</Button>}
        />
      ) : (
        <>
          <Card className="hidden py-0 lg:flex">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44 pl-4">Estudiante</TableHead>
                  <TableHead className="min-w-52">Cuota</TableHead>
                  <TableHead className="w-32">Vencimiento</TableHead>
                  <TableHead className="w-28 text-right">Importe</TableHead>
                  <TableHead className="w-28 text-right">Pagado</TableHead>
                  <TableHead className="w-28 text-right">Saldo</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                  <TableHead className="w-14 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enPagina.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="min-w-44 pl-4 whitespace-normal">
                      <Link href={`/admin/pagos/cuotas/${c.id}`} className="font-medium hover:underline">{c.estudiante.nombre ?? "Estudiante"}</Link>
                      {c.matricula?.estado === "anulada" && <span className="block text-xs text-muted-foreground">Matrícula anulada</span>}
                    </TableCell>
                    <TableCell className="min-w-52 whitespace-normal text-sm">
                      Cuota {c.numero} · {c.concepto}
                      <span className="block text-xs text-muted-foreground">{c.curso?.nombre ?? "Curso"} · Grupo {c.grupo?.codigo ?? "—"}</span>
                    </TableCell>
                    <TableCell className={cn("text-sm", c.vencida ? "text-destructive" : "text-muted-foreground")}>{fechaSimple(c.vencimiento)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.format(c.importe)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{s.format(c.aplicado)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {s.format(c.saldo)}
                      {c.enRevision > 0 && <span className="block text-xs font-normal text-warning">{s.format(c.enRevision)} en revisión</span>}
                    </TableCell>
                    <TableCell><EstadoCuotaBadge cuota={c} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/pagos/cuotas/${c.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Ver cuota">
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {enPagina.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/pagos/cuotas/${c.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{c.estudiante.nombre ?? "Estudiante"}</p>
                        <EstadoCuotaBadge cuota={c} />
                      </div>
                      <p className="text-sm">Cuota {c.numero} · {c.concepto}</p>
                      <p className="text-xs text-muted-foreground">{c.curso?.nombre ?? "Curso"} · Grupo {c.grupo?.codigo ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence el {fechaSimple(c.vencimiento)} · Saldo <span className="tabular-nums">{s.format(c.saldo)}</span> de {s.format(c.importe)}
                        {c.enRevision > 0 && ` · ${s.format(c.enRevision)} en revisión`}
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
          <CalendarClock className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>
        </div>
        {accion}
      </CardContent>
    </Card>
  )
}
