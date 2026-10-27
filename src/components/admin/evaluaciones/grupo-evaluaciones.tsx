"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlert, Info, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"

import { MatriculaBadge } from "@/components/admin/estudiantes/estudiante-ui"
import { fechaSimple } from "@/components/solicitudes/solicitud-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { eliminarEvaluacion, guardarEvaluacion, reabrirResultado, registrarResultado, registrarResultadosGrupo } from "@/lib/evaluaciones/acciones"
import { ETIQUETA_CALCULO } from "@/lib/evaluaciones/calculo"
import type { Evaluacion, EvaluacionesGrupo, FilaEstudianteGrupo } from "@/lib/evaluaciones/datos"
import { notificar } from "@/lib/notificaciones"
import { EVALUACION_DESCRIPCION_MAX, EVALUACION_NOMBRE_MAX, evaluacionSchema, type EvaluacionValues } from "@/lib/validations/evaluacion"
import { cn } from "@/lib/utils"

const nota = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function GrupoEvaluaciones({ datos }: { datos: EvaluacionesGrupo }) {
  const router = useRouter()
  const { grupo, evaluaciones, estudiantes, notaAprobatoria, gestionDisponible, grupoEditable, admiteResultados } = datos
  const [editando, setEditando] = useState<{ id: string | null; valores: EvaluacionValues } | null>(null)
  const [eliminar, setEliminar] = useState<Evaluacion | null>(null)
  const [reabrir, setReabrir] = useState<FilaEstudianteGrupo | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  const total = Math.round(evaluaciones.reduce((s, e) => s + e.peso * 100, 0)) / 100
  const conResultados = estudiantes.some((e) => e.estado === "activa" && e.estadoFinal !== "en_curso")
  const puedeEditar = gestionDisponible && grupoEditable && !conResultados
  const listos = estudiantes.filter((e) => e.estado === "activa" && e.estadoFinal === "en_curso" && e.calculo.estado === "completo")

  async function ejecutar(clave: string, accion: () => Promise<{ ok: boolean; mensaje?: string; gravedad?: string; resultado?: string; procesadas?: number; omitidas?: number }>, textos: { proceso: string; exito: string }) {
    if (procesando) return false
    setProcesando(clave)
    const op = notificar.operacion(textos.proceso)
    try {
      const r = await accion()
      if (r.ok) {
        op.exito(textos.exito, {
          descripcion: r.resultado ? `Resultado: ${r.resultado === "aprobado" ? "aprobado" : "desaprobado"}.` : r.procesadas !== undefined ? `${r.procesadas} registrados${r.omitidas ? `, ${r.omitidas} omitidos (incompletos)` : ""}.` : undefined,
        })
        router.refresh()
        return true
      }
      ;(r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo completar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo completar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
    return false
  }

  return (
    <div className="space-y-6">
      {!gestionDisponible && (
        <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Consulta en modo lectura. Para que el administrador configure evaluaciones y registre resultados falta aplicar la migración
          «evaluaciones_admin_v5». Hoy solo el docente del grupo puede crear evaluaciones.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Criterios de evaluación</CardTitle>
          <CardDescription>
            Ponderación del grupo. El promedio final es Σ(nota × peso) / 100 en escala de 0 a 20; aprueba con {nota(notaAprobatoria)} o más
            (nota aprobatoria del curso).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {evaluaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">El grupo aún no tiene evaluaciones.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Evaluación</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Peso</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {evaluaciones.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-2">
                        {e.nombre}
                        {e.descripcion && <span className="block text-xs text-muted-foreground">{e.descripcion}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.peso.toLocaleString("es-PE")} %</td>
                      <td className="px-3 py-2">{e.fecha ? fechaSimple(e.fecha) : "—"}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {puedeEditar && (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label={`Editar ${e.nombre}`} onClick={() => setEditando({ id: e.id, valores: { nombre: e.nombre, descripcion: e.descripcion ?? "", peso: String(e.peso), fecha: e.fecha ?? "" } })}>
                              <Pencil aria-hidden />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${e.nombre}`} onClick={() => setEliminar(e)}>
                              <Trash2 aria-hidden />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", Math.round(total * 100) !== 10000 && "text-warning")}>{total.toLocaleString("es-PE")} %</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {evaluaciones.length > 0 && Math.round(total * 100) !== 10000 && (
            <p className="flex gap-2 text-sm text-warning">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Los pesos suman {total.toLocaleString("es-PE")} %. Para calcular resultados finales deben sumar exactamente 100 %.
            </p>
          )}
          {conResultados && gestionDisponible && grupoEditable && (
            <p className="text-xs text-muted-foreground">Hay resultados finales registrados: para cambiar los criterios, primero reabre esos resultados.</p>
          )}
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => setEditando({ id: null, valores: { nombre: "", descripcion: "", peso: String(Math.max(0, Math.round((100 - total) * 100) / 100) || ""), fecha: "" } })}>
              <Plus aria-hidden />
              Añadir evaluación
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calificaciones y resultados</CardTitle>
          <CardDescription>
            Las notas las registra el docente del grupo. El resultado final lo calcula y registra la base de datos: el administrador no lo elige.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gestionDisponible && admiteResultados && listos.length > 0 && (
            <Button size="sm" onClick={() => ejecutar("todos", () => registrarResultadosGrupo(grupo.id), { proceso: "Registrando resultados…", exito: "Resultados registrados" })} disabled={procesando !== null}>
              {procesando === "todos" && <Loader2 className="animate-spin" aria-hidden />}
              Registrar resultados completos ({listos.length})
            </Button>
          )}
          {gestionDisponible && !admiteResultados && (
            <p className="text-xs text-muted-foreground">Los resultados finales se registran cuando el grupo está en curso o cerrado.</p>
          )}
          {estudiantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">El grupo no tiene matrículas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm" style={{ minWidth: `${560 + evaluaciones.length * 90}px` }}>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="sticky left-0 bg-muted/50 px-3 py-2 text-left font-medium">Estudiante</th>
                    {evaluaciones.map((e) => (
                      <th key={e.id} scope="col" className="px-2 py-2 text-right font-medium" title={e.nombre}>
                        <span className="block max-w-24 truncate">{e.nombre}</span>
                        <span className="font-normal">{e.peso.toLocaleString("es-PE")} %</span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right font-medium">Promedio</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Situación</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {estudiantes.map((s) => {
                    const activa = s.estado === "activa"
                    const promedio = s.calculo.promedio
                    return (
                      <tr key={s.matriculaId} className={cn("border-t", !activa && "text-muted-foreground")}>
                        <td className="sticky left-0 bg-card px-3 py-2">
                          <Link href={`/admin/matriculas/${s.matriculaId}`} className="font-medium hover:underline">{s.nombre ?? "Estudiante"}</Link>
                        </td>
                        {evaluaciones.map((e) => {
                          const n = s.notas[e.id]
                          return (
                            <td key={e.id} className={cn("px-2 py-2 text-right tabular-nums", n && n.nota < notaAprobatoria && "text-destructive")} title={n?.observacion ?? undefined}>
                              {n ? nota(n.nota) : <span className="text-muted-foreground">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {promedio !== null ? (
                            <span className={promedio < notaAprobatoria ? "text-destructive" : "text-success"}>{nota(promedio)}</span>
                          ) : s.calculo.parcial !== null ? (
                            <span className="font-normal text-muted-foreground" title="Promedio parcial con las notas registradas">≈ {nota(s.calculo.parcial)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap items-center gap-1">
                            <MatriculaBadge estado={s.estado} final={s.estadoFinal} />
                            {activa && s.estadoFinal === "en_curso" && <Badge variant="outline">{ETIQUETA_CALCULO[s.calculo.estado]}</Badge>}
                            {s.tieneCertificado && <Badge variant="success">Certificado</Badge>}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {gestionDisponible && activa && s.estadoFinal === "en_curso" && admiteResultados && s.calculo.estado === "completo" && (
                            <Button size="sm" variant="outline" disabled={procesando !== null}
                              onClick={() => ejecutar(s.matriculaId, () => registrarResultado(grupo.id, s.matriculaId), { proceso: "Registrando resultado…", exito: "Resultado registrado" })}>
                              {procesando === s.matriculaId && <Loader2 className="animate-spin" aria-hidden />}
                              Registrar ({s.resultadoPropuesto === "aprobado" ? "aprueba" : "desaprueba"})
                            </Button>
                          )}
                          {gestionDisponible && activa && s.estadoFinal !== "en_curso" && !s.tieneCertificado && (
                            <Button size="sm" variant="ghost" onClick={() => setReabrir(s)} disabled={procesando !== null}>
                              <RotateCcw aria-hidden />
                              Reabrir
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editando && (
        <FormularioEvaluacion
          key={editando.id ?? "nueva"}
          grupoId={grupo.id}
          id={editando.id}
          inicial={editando.valores}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); router.refresh() }}
        />
      )}

      <Dialog open={eliminar !== null} onOpenChange={(v) => !v && !procesando && setEliminar(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Eliminar «{eliminar?.nombre}»?</DialogTitle>
            <DialogDescription>Solo se puede eliminar una evaluación sin notas registradas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando !== null} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" disabled={procesando !== null}
              onClick={async () => { if (eliminar && (await ejecutar("eliminar", () => eliminarEvaluacion(grupo.id, eliminar.id), { proceso: "Eliminando…", exito: "Evaluación eliminada" }))) setEliminar(null) }}>
              {procesando === "eliminar" && <Loader2 className="animate-spin" aria-hidden />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reabrir && <DialogoReabrir fila={reabrir} grupoId={grupo.id} alCerrar={() => setReabrir(null)} alTerminar={() => { setReabrir(null); router.refresh() }} />}
    </div>
  )
}

function FormularioEvaluacion({ grupoId, id, inicial, alCerrar, alGuardar }: { grupoId: string; id: string | null; inicial: EvaluacionValues; alCerrar: () => void; alGuardar: () => void }) {
  const [v, setV] = useState(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const set = (k: keyof EvaluacionValues, valor: string) => { setV((x) => ({ ...x, [k]: valor })); setErrores((e) => ({ ...e, [k]: "" })) }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    const local = evaluacionSchema.safeParse(v)
    if (!local.success) {
      const campos: Record<string, string> = {}
      for (const i of local.error.issues) campos[String(i.path[0])] ??= i.message
      setErrores(campos)
      return
    }
    setEnviando(true)
    const op = notificar.operacion("Guardando evaluación…")
    try {
      const r = await guardarEvaluacion(grupoId, id, v)
      if (r.ok) { op.exito(id ? "Evaluación actualizada" : "Evaluación añadida"); alGuardar() }
      else { if (r.campos) setErrores(r.campos); (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo guardar", { descripcion: r.mensaje }) }
    } catch {
      op.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && !enviando && alCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{id ? "Editar evaluación" : "Nueva evaluación"}</DialogTitle>
          <DialogDescription>El docente registrará las notas (0 a 20) de cada estudiante.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Field data-invalid={!!errores.nombre || undefined}>
            <FieldLabel htmlFor="ev-nombre">Nombre</FieldLabel>
            <Input id="ev-nombre" value={v.nombre} onChange={(e) => set("nombre", e.target.value)} maxLength={EVALUACION_NOMBRE_MAX} disabled={enviando} placeholder="Ej.: Examen parcial" />
            {errores.nombre && <FieldError>{errores.nombre}</FieldError>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!errores.peso || undefined}>
              <FieldLabel htmlFor="ev-peso">Peso (%)</FieldLabel>
              <Input id="ev-peso" inputMode="decimal" value={v.peso} onChange={(e) => set("peso", e.target.value)} disabled={enviando} />
              {errores.peso && <FieldError>{errores.peso}</FieldError>}
            </Field>
            <Field data-invalid={!!errores.fecha || undefined}>
              <FieldLabel htmlFor="ev-fecha">Fecha (opcional)</FieldLabel>
              <Input id="ev-fecha" type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} disabled={enviando} />
              {errores.fecha && <FieldError>{errores.fecha}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={!!errores.descripcion || undefined}>
            <FieldLabel htmlFor="ev-desc">Criterio o descripción (opcional)</FieldLabel>
            <Textarea id="ev-desc" rows={3} value={v.descripcion} onChange={(e) => set("descripcion", e.target.value)} maxLength={EVALUACION_DESCRIPCION_MAX} disabled={enviando} />
            <FieldDescription>Qué se evalúa y cómo (rúbrica, entregables, etc.).</FieldDescription>
            {errores.descripcion && <FieldError>{errores.descripcion}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={enviando} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="animate-spin" aria-hidden />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoReabrir({ fila, grupoId, alCerrar, alTerminar }: { fila: FilaEstudianteGrupo; grupoId: string; alCerrar: () => void; alTerminar: () => void }) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState("")
  const [enviando, setEnviando] = useState(false)
  async function confirmar() {
    if (enviando) return
    if (motivo.trim().length < 10) return setError("Indica el motivo (mínimo 10 caracteres).")
    setEnviando(true)
    const op = notificar.operacion("Reabriendo resultado…")
    try {
      const r = await reabrirResultado(grupoId, fila.matriculaId, motivo)
      if (r.ok) { op.exito("Resultado reabierto", { descripcion: "La matrícula vuelve a «En curso»." }); alTerminar() }
      else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo reabrir", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo reabrir", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialog open onOpenChange={(a) => !a && !enviando && alCerrar()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>¿Reabrir el resultado de {fila.nombre ?? "este estudiante"}?</DialogTitle>
          <DialogDescription>La matrícula volverá a «En curso» y el motivo quedará registrado en el historial. No se puede reabrir si ya tiene certificado.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="motivo-reabrir">Motivo</FieldLabel>
          <Textarea id="motivo-reabrir" rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); setError("") }} maxLength={500} disabled={enviando} placeholder="Ej.: Corrección de nota del examen final solicitada por el docente." />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={enviando} autoFocus />}>Volver</DialogClose>
          <Button onClick={confirmar} disabled={enviando}>{enviando && <Loader2 className="animate-spin" aria-hidden />}Reabrir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
