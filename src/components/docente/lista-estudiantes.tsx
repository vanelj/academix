"use client"

import { useId, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BookCheck, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EstudianteDocente } from "@/lib/docente/datos"
import { ETIQUETA_CALCULO } from "@/lib/evaluaciones/calculo"

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

type GrupoOpcion = { grupoId: string; grupo: string; cursoId: string; curso: string; cancelado: boolean }

/**
 * Curso → Grupo → Estudiantes. Si el docente dicta varios cursos, los
 * estudiantes de cada grupo se ven por separado (nunca mezclados). El grupo
 * elegido queda en la URL (?grupo=…) para volver al mismo lugar.
 * Solo nombres y avance académico: sin DNI ni teléfono.
 */
export function ListaEstudiantesDocente({ estudiantes, grupoInicial }: { estudiantes: EstudianteDocente[]; grupoInicial: string }) {
  const id = useId()
  const router = useRouter()
  const ruta = usePathname()
  const grupos = useMemo(() => {
    const m = new Map<string, GrupoOpcion>()
    for (const e of estudiantes) for (const c of e.cursos) m.set(c.grupoId, { grupoId: c.grupoId, grupo: c.grupo, cursoId: c.cursoId, curso: c.curso, cancelado: c.estadoGrupo === "cancelado" })
    return [...m.values()].sort((a, b) => a.curso.localeCompare(b.curso, "es") || a.grupo.localeCompare(b.grupo, "es"))
  }, [estudiantes])
  const cursos = useMemo(() => [...new Map(grupos.map((g) => [g.cursoId, g.curso])).entries()], [grupos])

  const inicial = grupos.find((g) => g.grupoId === grupoInicial) ?? grupos[0]
  const [curso, setCurso] = useState(inicial?.cursoId ?? "")
  const [grupo, setGrupo] = useState(inicial?.grupoId ?? "")
  const [texto, setTexto] = useState("")

  const gruposDelCurso = grupos.filter((g) => g.cursoId === curso)
  const elegido = grupos.find((g) => g.grupoId === grupo)

  function elegirGrupo(nuevo: string) {
    setGrupo(nuevo)
    setTexto("")
    router.replace(`${ruta}?grupo=${nuevo}`, { scroll: false })
  }
  function elegirCurso(nuevo: string) {
    setCurso(nuevo)
    const primero = grupos.find((g) => g.cursoId === nuevo)
    if (primero) elegirGrupo(primero.grupoId)
  }

  const filas = estudiantes
    .flatMap((e) => e.cursos.filter((c) => c.grupoId === grupo).map((c) => ({ estudianteId: e.estudianteId, nombre: e.nombre, ...c })))
    .filter((f) => !texto.trim() || normalizar(f.nombre).includes(normalizar(texto.trim())))

  if (estudiantes.length === 0) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Tus grupos aún no tienen estudiantes con matrícula confirmada.</CardContent></Card>
  }

  const select = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-c`} className="text-xs font-medium text-muted-foreground">1. Curso</label>
          <select id={`${id}-c`} value={curso} onChange={(e) => elegirCurso(e.target.value)} className={select}>
            {cursos.map(([cid, nombre]) => <option key={cid} value={cid}>{nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-g`} className="text-xs font-medium text-muted-foreground">2. Grupo</label>
          <select id={`${id}-g`} value={grupo} onChange={(e) => elegirGrupo(e.target.value)} className={select}>
            {gruposDelCurso.map((g) => <option key={g.grupoId} value={g.grupoId}>Grupo {g.grupo}</option>)}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${id}-q`} className="text-xs font-medium text-muted-foreground">3. Buscar en el grupo</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${id}-q`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre del estudiante" className="pl-9" />
          </div>
        </div>
      </div>

      {elegido && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" aria-live="polite">
            <span className="font-medium">{elegido.curso} · Grupo {elegido.grupo}</span>
            <span className="text-muted-foreground"> — {filas.length} {filas.length === 1 ? "estudiante" : "estudiantes"}</span>
          </p>
          <div className="flex gap-2">
            <Link href={`/docente/grupos/${elegido.grupoId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Abrir grupo</Link>
            {!elegido.cancelado && (
              <Link href={`/docente/calificaciones/${elegido.grupoId}`} className={buttonVariants({ size: "sm" })}>
                <BookCheck aria-hidden />
                Registrar notas
              </Link>
            )}
          </div>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          {texto.trim() ? "Ningún estudiante del grupo coincide con la búsqueda." : "Este grupo no tiene estudiantes con matrícula activa."}
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {filas.map((f) => (
            <li key={f.estudianteId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{f.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_CALCULO[f.calculo.estado]}
                  {f.calculo.faltantes > 0 && f.calculo.estado !== "sin_evaluaciones" ? ` · faltan ${f.calculo.faltantes}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums">
                  {f.calculo.promedio !== null ? <>Promedio <strong>{f.calculo.promedio.toFixed(2)}</strong></>
                    : f.calculo.parcial !== null ? <span className="text-muted-foreground">Parcial {f.calculo.parcial.toFixed(2)}</span> : <span className="text-muted-foreground">Sin notas</span>}
                </span>
                {f.estadoFinal !== "en_curso" && <Badge variant={f.estadoFinal === "aprobado" ? "success" : "destructive"}>{f.estadoFinal === "aprobado" ? "Aprobado" : "Desaprobado"}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
