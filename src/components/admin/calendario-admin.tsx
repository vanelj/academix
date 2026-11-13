"use client"

import { useId, useMemo, useState } from "react"

import { CalendarioAcademico } from "@/components/horarios/calendario-academico"
import { crucesSemanales, DIAS_LARGOS, type GrupoCalendario } from "@/lib/horarios/calendario"

export type GrupoCalendarioAdmin = GrupoCalendario & { cursoId: string; docenteId: string | null }

const ESTADOS: Record<string, string> = { programado: "Programado", abierto: "Inscripciones abiertas", en_curso: "En curso", cerrado: "Cerrado" }

/**
 * Malla académica de la institución con filtros (curso, grupo, docente,
 * estado). Los datos llegan ya limitados a la institución del administrador.
 */
export function CalendarioAdmin({ grupos, ahoraInicial }: { grupos: GrupoCalendarioAdmin[]; ahoraInicial: { fecha: string; hora: string } }) {
  const id = useId()
  const [curso, setCurso] = useState("")
  const [grupo, setGrupo] = useState("")
  const [docente, setDocente] = useState("")
  const [estado, setEstado] = useState("vigentes")

  const cursos = useMemo(() => [...new Map(grupos.map((g) => [g.cursoId, g.curso])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [grupos])
  const docentes = useMemo(
    () => [...new Map(grupos.filter((g) => g.docenteId).map((g) => [g.docenteId!, g.docente ?? "Docente"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
    [grupos]
  )
  const gruposDelCurso = grupos.filter((g) => !curso || g.cursoId === curso)
  const visibles = grupos.filter(
    (g) =>
      (!curso || g.cursoId === curso) &&
      (!grupo || g.clave === grupo) &&
      (!docente || (docente === "__sin__" ? !g.docenteId : g.docenteId === docente)) &&
      (estado === "" || (estado === "vigentes" ? g.estado !== "cerrado" : g.estado === estado))
  )
  // Cruces del MISMO docente entre sus grupos.
  const cruces = crucesSemanales(visibles.filter((g) => g.docenteId)).filter((c) => (c.a as GrupoCalendarioAdmin).docenteId === (c.b as GrupoCalendarioAdmin).docenteId)
  const select = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-c`}>Curso
          <select id={`${id}-c`} className={select} value={curso} onChange={(e) => { setCurso(e.target.value); setGrupo("") }}>
            <option value="">Todos los cursos</option>
            {cursos.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-g`}>Grupo
          <select id={`${id}-g`} className={select} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos los grupos</option>
            {gruposDelCurso.map((g) => <option key={g.clave} value={g.clave}>{g.curso} · {g.grupo}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-d`}>Docente
          <select id={`${id}-d`} className={select} value={docente} onChange={(e) => setDocente(e.target.value)}>
            <option value="">Todos</option>
            <option value="__sin__">Sin docente asignado</option>
            {docentes.map(([d, n]) => <option key={d} value={d}>{n}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor={`${id}-e`}>Estado
          <select id={`${id}-e`} className={select} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="vigentes">Vigentes</option>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
      </div>
      {cruces.length > 0 && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Docentes con cruce de horario: {cruces.map((c) => `${c.a.docente}: ${c.a.curso} (${c.a.grupo}) y ${c.b.curso} (${c.b.grupo}) el ${DIAS_LARGOS[c.dia - 1].toLowerCase()}`).join("; ")}.
        </p>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">{visibles.length} {visibles.length === 1 ? "grupo" : "grupos"} en el calendario</p>
      <CalendarioAcademico grupos={visibles} ahoraInicial={ahoraInicial} mostrarDocente />
    </div>
  )
}
