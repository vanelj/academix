import Link from "next/link"
import { ArrowRight, BookCheck, CalendarDays, Clock, UsersRound } from "lucide-react"

import { EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { resumenSemanal } from "@/lib/cursos/asistente-logica"
import { duracionGrupo } from "@/lib/cursos/duracion"
import type { GrupoDocente } from "@/lib/docente/datos"
import { cn } from "@/lib/utils"

/** Avance del registro de notas de un grupo, en texto y barra accesible. */
export function AvanceNotas({ grupo: g }: { grupo: GrupoDocente }) {
  if (g.evaluaciones.length === 0) return <p className="text-xs text-muted-foreground">La institución aún no configuró evaluaciones.</p>
  if (g.estudiantes === 0) return <p className="text-xs text-muted-foreground">{g.evaluaciones.length} evaluaciones · sin estudiantes matriculados todavía.</p>
  const pct = g.notasEsperadas ? Math.round((g.notasRegistradas / g.notasEsperadas) * 100) : 0
  const faltan = g.notasEsperadas - g.notasRegistradas
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Notas registradas</span>
        <span className="font-medium tabular-nums">{g.notasRegistradas} de {g.notasEsperadas}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de notas">
        <div className={cn("h-full rounded-full", faltan === 0 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {faltan > 0 ? <p className="text-xs text-warning">Faltan {faltan} {faltan === 1 ? "nota" : "notas"}.</p> : <p className="text-xs text-success">Notas completas.</p>}
      {g.publicacionActiva && (
        <p className="text-xs text-muted-foreground">
          {g.evaluaciones.filter((e) => e.publicada_en).length} de {g.evaluaciones.length} evaluaciones publicadas
        </p>
      )}
      {g.pesoTotal !== 100 && <p className="text-xs text-muted-foreground">Los pesos suman {g.pesoTotal} % (la institución debe completar 100 %).</p>}
    </div>
  )
}

export function TarjetaGrupoDocente({ grupo: g, institucion, conCurso = true }: { grupo: GrupoDocente; institucion: string | null; conCurso?: boolean }) {
  const duracion = duracionGrupo(g.fecha_inicio, g.fecha_fin)
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="break-words">{conCurso ? (g.curso?.nombre ?? "Curso") : `Grupo ${g.codigo}`}</CardTitle>
          <EstadoGrupoBadge estado={g.estado} />
        </div>
        <CardDescription>{conCurso ? `Grupo ${g.codigo}` : (g.curso?.nombre ?? "Curso")}{institucion ? ` · ${institucion}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5 text-muted-foreground">
          <p className="flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0" aria-hidden />{duracion ? `${duracion} · ` : ""}{fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}</p>
          <p className="flex items-start gap-1.5"><Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />{g.horarios.length ? resumenSemanal(g.horarios.map((h) => ({ ...h, dia_semana: String(h.dia_semana) }))) : "Sin horarios registrados"}</p>
          <p className="flex items-center gap-1.5"><UsersRound className="size-3.5 shrink-0" aria-hidden />{g.estudiantes} {g.estudiantes === 1 ? "estudiante matriculado" : "estudiantes matriculados"}</p>
        </div>
        <AvanceNotas grupo={g} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/docente/grupos/${g.id}`} className={buttonVariants({ size: "sm" })}>
            Abrir grupo
            <ArrowRight aria-hidden />
          </Link>
          {g.estado !== "cancelado" && (
            <Link href={`/docente/calificaciones/${g.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <BookCheck aria-hidden />
              Registrar notas
            </Link>
          )}
          <Link href={`/docente/estudiantes?grupo=${g.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Ver estudiantes</Link>
        </div>
      </CardContent>
    </Card>
  )
}

export function ErrorCarga({ texto }: { texto: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent>
    </Card>
  )
}

export function SinGrupos() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Aún no tienes grupos asignados. Cuando el administrador de tu institución te asigne uno, aparecerá aquí.
      </CardContent>
    </Card>
  )
}
