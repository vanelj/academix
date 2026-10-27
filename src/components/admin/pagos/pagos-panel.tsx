"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Eye, Paperclip, Receipt, Search, X } from "lucide-react"

import { ETIQUETA_DESTINO_PAGO, EstadoPagoBadge, Indicador } from "@/components/admin/pagos/pago-ui"
import { formatoFechaHoraSolicitud, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DestinoPago, EstadoPago, PagoAdmin } from "@/lib/pagos/datos"
import { cn } from "@/lib/utils"
import { claveNombre } from "@/lib/validations/categoria"

const TODOS = "__todos__"
const POR_PAGINA = 20
type FiltroEstado = "todos" | EstadoPago
const ESTADOS: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "pendiente", etiqueta: "En revisión" },
  { valor: "pagado", etiqueta: "Aprobados" },
  { valor: "rechazado", etiqueta: "Rechazados" },
]
const DESTINOS = [
  { value: TODOS, label: "Cualquier concepto" },
  { value: "solicitud", label: "Solicitudes de inscripción" },
  { value: "cuota", label: "Cuotas" },
  { value: "matricula", label: "Matrícula (versión anterior)" },
] satisfies { value: string; label: string }[]

export function PagosPanel({ pagos, estadoInicial }: { pagos: PagoAdmin[]; estadoInicial: FiltroEstado }) {
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState<FiltroEstado>(estadoInicial)
  const [destino, setDestino] = useState<string>(TODOS)
  const [curso, setCurso] = useState(TODOS)
  const [grupo, setGrupo] = useState(TODOS)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [pagina, setPagina] = useState(1)

  const resumen = useMemo(() => {
    const r = { pendiente: { n: 0, total: 0 }, pagado: { n: 0, total: 0 }, rechazado: { n: 0, total: 0 } }
    for (const p of pagos) { r[p.estado].n++; r[p.estado].total += p.monto }
    return r
  }, [pagos])

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>()
    const grupos = new Map<string, { label: string; cursoId: string | null }>()
    for (const p of pagos) {
      if (p.curso) cursos.set(p.curso.id, p.curso.nombre)
      if (p.grupo) grupos.set(p.grupo.id, { label: `${p.curso?.nombre ?? "Curso"} · ${p.grupo.codigo}`, cursoId: p.curso?.id ?? null })
    }
    const orden = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "es")
    return {
      cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden),
      grupos: [...grupos].map(([value, g]) => ({ value, label: g.label, cursoId: g.cursoId })).sort(orden),
    }
  }, [pagos])
  const gruposDelCurso = curso === TODOS ? opciones.grupos : opciones.grupos.filter((g) => g.cursoId === curso)

  const visibles = useMemo(() => {
    const clave = claveNombre(busqueda)
    const d = desde ? new Date(`${desde}T00:00:00`).getTime() : null
    const h = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null
    return pagos.filter((p) => {
      const t = new Date(p.fecha_pago).getTime()
      return (
        (estado === "todos" || p.estado === estado) &&
        (destino === TODOS || p.destino === (destino as DestinoPago)) &&
        (curso === TODOS || p.curso?.id === curso) &&
        (grupo === TODOS || p.grupo?.id === grupo) &&
        (d === null || t >= d) &&
        (h === null || t <= h) &&
        (clave === "" || claveNombre(`${p.estudiante.nombre ?? ""} ${p.referencia_operacion ?? ""}`).includes(clave))
      )
    })
  }, [pagos, busqueda, estado, destino, curso, grupo, desde, hasta])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const enPagina = visibles.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)
  const r = () => setPagina(1)
  const limpiar = () => { setBusqueda(""); setEstado("todos"); setDestino(TODOS); setCurso(TODOS); setGrupo(TODOS); setDesde(""); setHasta(""); r() }
  const s = formatoSolesSolicitud

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="En revisión" valor={String(resumen.pendiente.n)} detalle={s.format(resumen.pendiente.total)} tono={resumen.pendiente.n > 0 ? "warning" : undefined} />
        <Indicador etiqueta="Aprobados" valor={String(resumen.pagado.n)} detalle={s.format(resumen.pagado.total)} />
        <Indicador etiqueta="Rechazados" valor={String(resumen.rechazado.n)} detalle={s.format(resumen.rechazado.total)} />
        <Indicador etiqueta="Total registrados" valor={String(pagos.length)} detalle="Importes en soles (PEN)" />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); r() }} placeholder="Estudiante o número de operación" aria-label="Buscar pagos por estudiante o número de operación" className="pl-8" />
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {visibles.length === pagos.length ? `${pagos.length} ${pagos.length === 1 ? "pago" : "pagos"}` : `${visibles.length} de ${pagos.length} pagos con los filtros`}
          </p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => { setEstado(e.valor); r() }}
              aria-pressed={estado === e.valor}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                estado === e.valor ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {e.etiqueta}
              {e.valor === "pendiente" && resumen.pendiente.n > 0 && <span className="ml-1 tabular-nums text-warning">({resumen.pendiente.n})</span>}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <Select items={DESTINOS} value={destino} onValueChange={(v) => { setDestino(v ? String(v) : TODOS); r() }}>
            <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por concepto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DESTINOS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
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

      {pagos.length === 0 ? (
        <Vacio titulo="Aún no hay pagos" texto="Aparecerán cuando los estudiantes presenten comprobantes de sus solicitudes o cuotas." />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo="Ningún pago coincide"
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
                  <TableHead className="min-w-56">Concepto</TableHead>
                  <TableHead className="w-28 text-right">Monto</TableHead>
                  <TableHead className="w-40">Fecha</TableHead>
                  <TableHead className="w-40">Método y operación</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                  <TableHead className="w-14 pr-4"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enPagina.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="min-w-44 pl-4 whitespace-normal">
                      <Link href={`/admin/pagos/${p.id}`} className="font-medium hover:underline">{p.estudiante.nombre ?? "Estudiante"}</Link>
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal text-sm">
                      {p.concepto}
                      <span className="block text-xs text-muted-foreground">{p.curso?.nombre ?? "Curso"} · Grupo {p.grupo?.codigo ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.format(p.monto)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}</TableCell>
                    <TableCell className="text-sm break-all whitespace-normal">
                      <span className="inline-flex items-center gap-1">
                        {p.tieneComprobante && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Con comprobante" />}
                        {p.referencia_operacion ?? "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">{p.metodo}</span>
                    </TableCell>
                    <TableCell><EstadoPagoBadge estado={p.estado} /></TableCell>
                    <TableCell className="pr-4">
                      <Link href={`/admin/pagos/${p.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Ver pago">
                        <Eye aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {enPagina.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/pagos/${p.id}`} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium break-words">{p.estudiante.nombre ?? "Estudiante"}</p>
                        <EstadoPagoBadge estado={p.estado} />
                      </div>
                      <p className="text-sm">{p.concepto} · <span className="tabular-nums">{s.format(p.monto)}</span></p>
                      <p className="text-xs text-muted-foreground">{p.curso?.nombre ?? "Curso"} · Grupo {p.grupo?.codigo ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}
                        {` · ${p.metodo}`}
                        {p.referencia_operacion && ` · Op. ${p.referencia_operacion}`}
                        {` · ${ETIQUETA_DESTINO_PAGO[p.destino]}`}
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
          <Receipt className="size-5 text-muted-foreground" aria-hidden />
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
