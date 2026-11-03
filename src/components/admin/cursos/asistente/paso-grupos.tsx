"use client"

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, CircleCheck, CircleAlert, ExternalLink, Pencil, Plus, RefreshCw, UserRound, Users, X } from "lucide-react"

import { DisponibilidadBadge, EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { GrupoAcciones } from "@/components/admin/grupos/grupo-acciones"
import { GrupoForm } from "@/components/admin/grupos/grupo-form"
import { HorariosGrupo } from "@/components/admin/grupos/horarios-grupo"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { grupoListo } from "@/lib/cursos/asistente-logica"
import type { GuardadorAsistente, RegistrarGuardadorAsistente, ResultadoGuardadoAsistente } from "@/lib/cursos/asistente-logica"
import type { GrupoDetalle, OpcionDocente } from "@/lib/grupos/datos"
import { cn } from "@/lib/utils"
import { GRUPO_INICIAL, type GrupoValues } from "@/lib/validations/grupo"

/**
 * Paso 4: grupos del curso como tarjetas editables, sin salir del asistente.
 * Reutiliza el formulario, los horarios y las acciones del módulo «Grupos y
 * horarios» (mismas validaciones y reglas de V5: código único por curso,
 * vacantes, fechas, docente habilitado de la institución, transiciones de estado).
 */
export type PasoGruposHandle = { guardarPendientes: () => Promise<ResultadoGuardadoAsistente> }

type Props = {
  curso: { id: string; nombre: string; estado: string }
  grupos: GrupoDetalle[]
  gruposError: boolean
  docentes: OpcionDocente[]
  onPendientesChange?: (pendiente: boolean) => void
}

export const PasoGrupos = forwardRef<PasoGruposHandle, Props>(function PasoGrupos({
  curso,
  grupos,
  gruposError,
  docentes,
  onPendientesChange,
}, ref) {
  const router = useRouter()
  const pendientes = useRef(new Map<string, { descripcion: string; guardar: GuardadorAsistente; pendiente: boolean }>())
  // "nuevo" | id del grupo en edición | null
  const [editando, setEditando] = useState<string | null>(grupos.length === 0 ? "nuevo" : null)
  const docentesHabilitados = docentes.filter((d) => d.habilitado)
  const cursos = [{ id: curso.id, nombre: curso.nombre, estado: curso.estado }]

  const registrarGuardador = useCallback<RegistrarGuardadorAsistente>((clave, descripcion, guardar, pendiente = false) => {
    if (guardar) pendientes.current.set(clave, { descripcion, guardar, pendiente })
    else pendientes.current.delete(clave)
    onPendientesChange?.([...pendientes.current.values()].some((accion) => accion.pendiente))
  }, [onPendientesChange])

  const guardarPendientes = useCallback(async (): Promise<ResultadoGuardadoAsistente> => {
    if (gruposError) {
      return { ok: false, mensaje: "No se pudieron cargar todos los grupos. Recarga la página antes de continuar para evitar duplicarlos." }
    }

    const tareas = [...pendientes.current.values()].filter((accion) => accion.pendiente)
    if (tareas.length === 0) return { ok: true, guardado: false }

    const guardados: string[] = []
    const avisos: string[] = []
    for (const pendiente of tareas) {
      const resultado = await pendiente.guardar()
      if (!resultado.ok) {
        const prefijo = guardados.length ? `Se guardó ${guardados.join(" y ")}, pero no se guardó ${pendiente.descripcion}. ` : `No se guardó ${pendiente.descripcion}. `
        return { ok: false, mensaje: `${prefijo}${resultado.mensaje}` }
      }
      if (resultado.guardado !== false) guardados.push(pendiente.descripcion)
      avisos.push(...(resultado.avisos ?? []))
    }
    return { ok: true, guardado: guardados.length > 0, avisos: avisos.length ? avisos : undefined }
  }, [gruposError])

  useImperativeHandle(ref, () => ({ guardarPendientes }), [guardarPendientes])

  const valoresDe = (g: GrupoDetalle): GrupoValues => ({
    curso_id: curso.id,
    codigo: g.codigo,
    vacantes: String(g.vacantes),
    fecha_inicio: g.fecha_inicio,
    fecha_fin: g.fecha_fin,
    docente_id: g.docente?.id ?? "",
  })

  return (
    <div className="space-y-5">
      {gruposError && (
        <p role="alert" className="rounded-xl border border-dashed border-destructive/40 p-4 text-sm text-destructive">
          No se pudieron cargar todos los grupos de este curso. Recarga la página antes de crear otro, para no duplicarlo.
        </p>
      )}

      {docentesHabilitados.length === 0 && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-2 text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Tu institución aún no tiene docentes habilitados. Puedes crear el grupo sin docente y asignarlo después.
              La creación de docentes envía una invitación por correo y se hace en «Docentes».
            </p>
            <div className="flex shrink-0 gap-2">
              <a href="/admin/docentes" target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink aria-hidden />
                Abrir Docentes
              </a>
              <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
                <RefreshCw aria-hidden />
                Actualizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {grupos.map((g) => {
        const listo = grupoListo(g)
        const eliminable = g.dependencias !== null && g.dependencias.matriculas + g.dependencias.solicitudes + g.dependencias.evaluaciones === 0
        return (
          <Card key={g.id} className={cn(listo && "ring-success/40")}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    Grupo {g.codigo}
                    <EstadoGrupoBadge estado={g.estado} />
                    <DisponibilidadBadge vacantes={g.vacantes} disponibles={g.vacantesDisponibles} />
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden />{g.vacantes} vacantes{g.vacantesDisponibles != null ? ` · ${g.vacantesDisponibles} libres` : ""}</span>
                    <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" aria-hidden />{g.docente ? g.docente.nombre : "Sin docente"}</span>
                  </CardDescription>
                </div>
                {editando !== g.id && (
                  <Button variant="outline" size="sm" onClick={() => setEditando(g.id)}>
                    <Pencil aria-hidden />
                    Editar datos
                  </Button>
                )}
              </div>
              <p className={cn("mt-2 flex items-center gap-1.5 text-xs", listo ? "text-success" : "text-muted-foreground")}>
                {listo ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5 text-warning" aria-hidden />}
                {listo
                  ? "Listo para recibir inscripciones cuando lo abras y el curso esté publicado."
                  : !g.docente
                    ? "Falta asignar un docente."
                    : g.horarios.length === 0
                      ? "Faltan los horarios."
                      : "El grupo no está vigente (cerrado, en curso o cancelado)."}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {editando === g.id && (
                <div className="rounded-2xl border border-dashed p-3">
                  <div className="mb-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>
                      <X aria-hidden />
                      Cerrar edición
                    </Button>
                  </div>
                  <GrupoForm
                    grupoId={g.id}
                    estado={g.estado}
                    valoresIniciales={valoresDe(g)}
                    cursos={cursos}
                    docentes={docentes}
                    bloquearCurso
                    onGuardado={() => setEditando(null)}
                    onRegistrarGuardado={registrarGuardador}
                  />
                </div>
              )}
              <HorariosGrupo grupoId={g.id} horarios={g.horarios} codigoGrupo={g.codigo} onRegistrarGuardado={registrarGuardador} />
              <div className="border-t pt-4">
                <GrupoAcciones grupoId={g.id} codigo={g.codigo} estado={g.estado} eliminable={eliminable} alEliminar={() => router.refresh()} />
              </div>
            </CardContent>
          </Card>
        )
      })}

      {editando === "nuevo" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{grupos.length === 0 ? "Primer grupo del curso" : "Nuevo grupo"}</CardTitle>
              {grupos.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setEditando(null)}>
                  <X aria-hidden />
                  Cancelar
                </Button>
              )}
            </div>
            <CardDescription>Por ejemplo, «A — Turno mañana» y «B — Turno noche». Después añades sus horarios.</CardDescription>
          </CardHeader>
          <CardContent>
            <GrupoForm
              valoresIniciales={{ ...GRUPO_INICIAL, curso_id: curso.id }}
              cursos={cursos}
              docentes={docentes}
              bloquearCurso
              onGuardado={() => setEditando(null)}
              onRegistrarGuardado={registrarGuardador}
            />
          </CardContent>
        </Card>
      ) : (
        curso.estado !== "desactivado" && (
          <Button variant="outline" onClick={() => setEditando("nuevo")} disabled={gruposError}>
            <Plus aria-hidden />
            Agregar otro grupo
          </Button>
        )
      )}
    </div>
  )
})
