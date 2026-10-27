"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, Search } from "lucide-react"

import { EstadoGrupoBadge } from "@/components/admin/grupos/grupo-ui"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ResumenGrupo } from "@/lib/evaluaciones/datos"
import { cn } from "@/lib/utils"

const TODOS = "todos"
type Config = "sin_evaluaciones" | "pesos_incompletos" | "notas_pendientes" | "notas_completas" | "con_resultados"

const ETIQUETA_CONFIG: Record<Config, string> = {
  sin_evaluaciones: "Sin evaluaciones",
  pesos_incompletos: "Pesos distintos de 100 %",
  notas_pendientes: "Notas pendientes",
  notas_completas: "Notas completas",
  con_resultados: "Con resultados registrados",
}

function configDe(r: ResumenGrupo): Config {
  if (r.evaluaciones.length === 0) return "sin_evaluaciones"
  if (Math.round(r.pesoTotal * 100) !== 10000) return "pesos_incompletos"
  if (r.resultados.aprobado + r.resultados.desaprobado > 0) return "con_resultados"
  return r.notasRegistradas < r.notasEsperadas ? "notas_pendientes" : "notas_completas"
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/** Supervisión de evaluaciones por grupo: configuración, avance de notas y resultados. */
export function EvaluacionesPanel({ resumen }: { resumen: ResumenGrupo[] }) {
  const [busqueda, setBusqueda] = useState("")
  const [curso, setCurso] = useState(TODOS)
  const [docente, setDocente] = useState(TODOS)
  const [estado, setEstado] = useState(TODOS)

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>(), docentes = new Map<string, string>()
    for (const r of resumen) {
      if (r.grupo.curso) cursos.set(r.grupo.curso.id, r.grupo.curso.nombre)
      if (r.grupo.docente) docentes.set(r.grupo.docente.id, r.grupo.docente.nombre)
    }
    const orden = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "es")
    return {
      cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden),
      docentes: [...docentes].map(([value, label]) => ({ value, label })).sort(orden),
    }
  }, [resumen])

  const filtrados = useMemo(() => {
    const clave = normalizar(busqueda.trim())
    return resumen.filter(
      (r) =>
        (curso === TODOS || r.grupo.curso?.id === curso) &&
        (docente === TODOS || (docente === "sin" ? !r.grupo.docente : r.grupo.docente?.id === docente)) &&
        (estado === TODOS || configDe(r) === estado) &&
        (clave === "" || normalizar(`${r.grupo.codigo} ${r.grupo.curso?.nombre ?? ""} ${r.grupo.docente?.nombre ?? ""}`).includes(clave))
    )
  }, [resumen, busqueda, curso, docente, estado])

  const itemsCurso = [{ value: TODOS, label: "Todos los cursos" }, ...opciones.cursos]
  const itemsDocente = [{ value: TODOS, label: "Todos los docentes" }, { value: "sin", label: "Sin docente" }, ...opciones.docentes]
  const itemsEstado = [{ value: TODOS, label: "Cualquier estado" }, ...(Object.keys(ETIQUETA_CONFIG) as Config[]).map((v) => ({ value: v, label: ETIQUETA_CONFIG[v] }))]

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar grupo, curso o docente" aria-label="Buscar" className="pl-8" />
        </div>
        <Select items={itemsCurso} value={curso} onValueChange={(v) => setCurso(v ? String(v) : TODOS)}>
          <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por curso"><SelectValue /></SelectTrigger>
          <SelectContent>{itemsCurso.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select items={itemsDocente} value={docente} onValueChange={(v) => setDocente(v ? String(v) : TODOS)}>
          <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por docente"><SelectValue /></SelectTrigger>
          <SelectContent>{itemsDocente.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select items={itemsEstado} value={estado} onValueChange={(v) => setEstado(v ? String(v) : TODOS)}>
          <SelectTrigger className="w-full lg:w-60" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
          <SelectContent>{itemsEstado.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">{resumen.length === 0 ? "Aún no hay grupos en tu institución." : "Ningún grupo coincide con los filtros."}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((r) => {
            const config = configDe(r)
            const avance = r.notasEsperadas > 0 ? Math.round((r.notasRegistradas / r.notasEsperadas) * 100) : 0
            return (
              <li key={r.grupo.id}>
                <Card size="sm" className="h-full">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{r.grupo.curso?.nombre ?? "Curso"}</p>
                        <p className="text-xs text-muted-foreground">Grupo {r.grupo.codigo} · {r.grupo.docente?.nombre ?? "Sin docente"}</p>
                      </div>
                      <EstadoGrupoBadge estado={r.grupo.estado} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={config === "pesos_incompletos" || config === "sin_evaluaciones" ? "warning" : config === "con_resultados" ? "success" : "outline"}>
                        {ETIQUETA_CONFIG[config]}
                      </Badge>
                      <Badge variant="outline">{r.evaluaciones.length} evaluaciones · {r.pesoTotal.toLocaleString("es-PE")} %</Badge>
                    </div>
                    {r.notasEsperadas > 0 && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Notas registradas</span>
                          <span className="tabular-nums">{r.notasRegistradas}/{r.notasEsperadas}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de notas">
                          <div className={cn("h-full rounded-full", avance === 100 ? "bg-success" : "bg-primary")} style={{ width: `${avance}%` }} />
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {r.estudiantes} estudiantes · <span className="text-success">{r.resultados.aprobado} aprobados</span> ·{" "}
                      <span className="text-destructive">{r.resultados.desaprobado} desaprobados</span> · {r.resultados.en_curso} en curso
                    </p>
                    <Link href={`/admin/evaluaciones/${r.grupo.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-auto w-fit")}>
                      Ver evaluaciones y notas
                    </Link>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
