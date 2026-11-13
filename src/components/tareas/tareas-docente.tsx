"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, CheckCircle2, ClipboardList, FileText, Loader2, Lock, MoreHorizontal, Pencil, Plus, Send, Undo2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { abrirDocumento } from "@/lib/abrir-documento"
import { fechaHoraLimaTexto, horaLimaParaInput } from "@/lib/fechas"
import { modoApertura } from "@/lib/materiales/reglas"
import { notificar } from "@/lib/notificaciones"
import { abrirArchivoEntrega, calificarEntrega, cambiarEstadoTarea, guardarTarea } from "@/lib/tareas/acciones"
import { notaDesdePuntaje, type Entrega, type Tarea } from "@/lib/tareas/reglas"
import { cn } from "@/lib/utils"

type Opcion = { id: string; nombre: string }

const campo = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const ESTADO: Record<Tarea["estado"], { texto: string; variante: "outline" | "success" | "secondary" }> = {
  borrador: { texto: "Borrador", variante: "outline" },
  publicada: { texto: "Publicada", variante: "success" },
  cerrada: { texto: "Cerrada", variante: "secondary" },
}

/**
 * Tareas del grupo para el docente (o el administrador): crear, publicar,
 * cerrar, ver entregas y calificarlas. Una tarea calificable se vincula a UNA
 * evaluación del grupo: su puntaje se registra como la nota de esa evaluación.
 */
export function TareasDocente({
  grupoId,
  tareas,
  entregas,
  evaluaciones,
  materiales,
  estudiantes,
  editable,
}: {
  grupoId: string
  tareas: Tarea[]
  entregas: Entrega[]
  evaluaciones: Opcion[]
  materiales: Opcion[]
  /** matrícula → nombre del estudiante */
  estudiantes: Record<string, string>
  editable: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<Tarea | "nueva" | null>(null)
  const [revisando, setRevisando] = useState<Tarea | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const total = Object.keys(estudiantes).length

  async function estado(t: Tarea, nuevo: Tarea["estado"]) {
    if (ocupado) return
    setOcupado(t.id)
    const op = notificar.operacion(nuevo === "publicada" ? "Publicando tarea…" : nuevo === "cerrada" ? "Cerrando tarea…" : "Actualizando…")
    try {
      const r = await cambiarEstadoTarea(grupoId, t.id, nuevo)
      if (r.ok) {
        op.exito(nuevo === "publicada" ? "Tarea publicada" : nuevo === "cerrada" ? "Tarea cerrada" : "Tarea en borrador", {
          descripcion: nuevo === "publicada" ? "Tus estudiantes ya la ven y reciben un aviso." : nuevo === "cerrada" ? "Ya no recibe entregas; puedes seguir calificando." : undefined,
        })
        router.refresh()
      } else op.advertencia("No se pudo", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo conectar", { descripcion: "Inténtalo de nuevo." })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Las tareas piden una entrega con plazo. Para compartir recursos de estudio usa «Materiales».</p>
        {editable && <Button onClick={() => setEditando("nueva")}><Plus aria-hidden />Nueva tarea</Button>}
      </div>
      {tareas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted"><ClipboardList className="size-5 text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground">Aún no hay tareas en este grupo.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {tareas.map((t) => {
            const propias = entregas.filter((e) => e.tarea_id === t.id)
            const porCalificar = propias.filter((e) => e.estado === "entregada").length
            const evaluacion = evaluaciones.find((e) => e.id === t.evaluacion_id)
            return (
              <li key={t.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-words">{t.titulo}</span>
                    <Badge variant={ESTADO[t.estado].variante}>{ESTADO[t.estado].texto}</Badge>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" aria-hidden />Hasta el {fechaHoraLimaTexto(t.fecha_limite)}{t.permite_tardias ? " · admite entregas con retraso" : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {evaluacion ? `Calificable: nota de «${evaluacion.nombre}» (puntaje sobre ${t.puntaje_max})` : "Sin nota en el registro"} · {propias.length} de {total} entregas{porCalificar ? ` · ${porCalificar} por revisar` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setRevisando(t)} disabled={t.estado === "borrador"}>Entregas ({propias.length})</Button>
                  {editable && t.estado === "borrador" && (
                    <Button size="sm" onClick={() => estado(t, "publicada")} disabled={ocupado !== null}>
                      {ocupado === t.id ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}Publicar
                    </Button>
                  )}
                  {editable && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Más acciones para ${t.titulo}`}>
                        <MoreHorizontal aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setEditando(t)}><Pencil aria-hidden />Editar</DropdownMenuItem>
                        {t.estado === "publicada" && <DropdownMenuItem onClick={() => estado(t, "cerrada")}><Lock aria-hidden />Cerrar entregas</DropdownMenuItem>}
                        {t.estado === "cerrada" && <DropdownMenuItem onClick={() => estado(t, "publicada")}><Send aria-hidden />Reabrir entregas</DropdownMenuItem>}
                        {t.estado === "publicada" && propias.length === 0 && <DropdownMenuItem onClick={() => estado(t, "borrador")}><Undo2 aria-hidden />Volver a borrador</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editando !== null} onOpenChange={(a) => { if (!a) setEditando(null) }}>
        <DialogContent className="sm:max-w-lg">
          {editando !== null && (
            <FormularioTarea grupoId={grupoId} tarea={editando === "nueva" ? null : editando} evaluaciones={evaluaciones} materiales={materiales}
              ocupadas={new Set(tareas.filter((t) => t.evaluacion_id && (editando === "nueva" || t.id !== editando.id)).map((t) => t.evaluacion_id!))}
              onListo={() => { setEditando(null); router.refresh() }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revisando !== null} onOpenChange={(a) => { if (!a) setRevisando(null) }}>
        <DialogContent className="sm:max-w-2xl">
          {revisando && <Entregas grupoId={grupoId} tarea={revisando} entregas={entregas.filter((e) => e.tarea_id === revisando.id)} estudiantes={estudiantes} editable={editable} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormularioTarea({ grupoId, tarea, evaluaciones, materiales, ocupadas, onListo }: {
  grupoId: string; tarea: Tarea | null; evaluaciones: Opcion[]; materiales: Opcion[]; ocupadas: Set<string>; onListo: () => void
}) {
  const [v, setV] = useState({
    titulo: tarea?.titulo ?? "",
    instrucciones: tarea?.instrucciones ?? "",
    fechaLimite: tarea ? horaLimaParaInput(tarea.fecha_limite) : "",
    permiteTardias: tarea?.permite_tardias ?? false,
    tardiasHasta: tarea?.tardias_hasta ? horaLimaParaInput(tarea.tardias_hasta) : "",
    maxEnvios: String(tarea?.max_envios ?? 1),
    puntajeMax: String(tarea?.puntaje_max ?? 20),
    evaluacionId: tarea?.evaluacion_id ?? "",
    materiales: tarea?.materiales ?? [],
    enlace: tarea?.enlace ?? "",
  })
  const [enviando, setEnviando] = useState(false)
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      const r = await guardarTarea(grupoId, tarea?.id ?? null, v)
      if (r.ok) { notificar.exito(tarea ? "Tarea actualizada" : "Tarea creada como borrador", { descripcion: tarea ? undefined : "Publícala cuando esté lista." }); onListo() }
      else notificar.advertencia("No se guardó", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      <DialogHeader>
        <DialogTitle>{tarea ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        <DialogDescription>Fechas en hora de Lima. Se crea como borrador: tus estudiantes la verán al publicarla.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        <label className="block space-y-1 text-xs font-medium text-muted-foreground">Título
          <Input value={v.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={160} required />
        </label>
        <label className="block space-y-1 text-xs font-medium text-muted-foreground">Instrucciones
          <Textarea value={v.instrucciones} onChange={(e) => set("instrucciones", e.target.value)} maxLength={5000} rows={4} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Fecha y hora límite
            <Input type="datetime-local" value={v.fechaLimite} onChange={(e) => set("fechaLimite", e.target.value)} required />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Envíos permitidos
            <Input inputMode="numeric" value={v.maxEnvios} onChange={(e) => set("maxEnvios", e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.permiteTardias} onChange={(e) => set("permiteTardias", e.target.checked)} className="accent-primary" />
          Aceptar entregas con retraso (quedan marcadas)
        </label>
        {v.permiteTardias && (
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">Hasta (opcional; vacío = sin límite)
            <Input type="datetime-local" value={v.tardiasHasta} onChange={(e) => set("tardiasHasta", e.target.value)} />
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Nota en el registro
            <select className={campo} value={v.evaluacionId} onChange={(e) => set("evaluacionId", e.target.value)}>
              <option value="">No calificable (sin nota)</option>
              {evaluaciones.map((e) => <option key={e.id} value={e.id} disabled={ocupadas.has(e.id)}>{e.nombre}{ocupadas.has(e.id) ? " (ya usada)" : ""}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Puntaje máximo
            <Input inputMode="decimal" value={v.puntajeMax} onChange={(e) => set("puntajeMax", e.target.value)} />
          </label>
        </div>
        {v.evaluacionId && <p className="text-xs text-muted-foreground">El puntaje se convierte a la escala 0–20 y se registra como la nota de esa evaluación (con su peso). No se crea otro promedio.</p>}
        {materiales.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-muted-foreground">Materiales de apoyo (opcional)</legend>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">
              {materiales.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary" checked={v.materiales.includes(m.id)}
                    onChange={(e) => set("materiales", e.target.checked ? [...v.materiales, m.id].slice(0, 10) : v.materiales.filter((x) => x !== m.id))} />
                  <span className="break-words">{m.nombre}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="block space-y-1 text-xs font-medium text-muted-foreground">Enlace (opcional)
          <Input value={v.enlace} onChange={(e) => set("enlace", e.target.value)} placeholder="https://" maxLength={1000} />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onListo} disabled={enviando}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="animate-spin" aria-hidden />}Guardar</Button>
      </DialogFooter>
    </form>
  )
}

function Entregas({ grupoId, tarea, entregas, estudiantes, editable }: { grupoId: string; tarea: Tarea; entregas: Entrega[]; estudiantes: Record<string, string>; editable: boolean }) {
  const router = useRouter()
  const [actual, setActual] = useState<Entrega | null>(null)
  const [puntaje, setPuntaje] = useState("")
  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState(false)
  const sinEntrega = Object.entries(estudiantes).filter(([m]) => !entregas.some((e) => e.matricula_id === m))

  function elegir(e: Entrega) {
    setActual(e)
    setPuntaje(e.puntaje === null ? "" : String(e.puntaje))
    setComentario(e.comentario ?? "")
  }

  async function revisar(devolver: boolean) {
    if (!actual || enviando) return
    setEnviando(true)
    try {
      const r = await calificarEntrega(grupoId, actual.id, { puntaje: devolver ? null : puntaje.replace(",", "."), comentario, devolver })
      if (r.ok) {
        notificar.exito(devolver ? "Entrega devuelta para corregir" : "Entrega calificada", {
          descripcion: devolver ? "El estudiante podrá reenviarla." : tarea.evaluacion_id ? "La nota se registró en su evaluación y el estudiante ya la ve." : undefined,
        })
        setActual(null)
        router.refresh()
      } else notificar.advertencia("No se guardó", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  async function verArchivo(e: Entrega) {
    const r = await abrirDocumento(modoApertura({ tipo: "archivo", archivo_tipo: e.archivo_tipo }), () => abrirArchivoEntrega(e.id))
    if (!r.ok) notificar.error("No se pudo abrir el archivo", { descripcion: r.mensaje })
  }

  const n = Number(puntaje.replace(",", "."))
  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">Entregas · {tarea.titulo}</DialogTitle>
        <DialogDescription>{entregas.length} recibidas · {sinEntrega.length} sin entregar · plazo: {fechaHoraLimaTexto(tarea.fecha_limite)}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto text-sm">
        {entregas.length === 0 && <p className="text-muted-foreground">Aún no hay entregas.</p>}
        <ul className="space-y-2">
          {entregas.map((e) => (
            <li key={e.id} className={cn("rounded-lg border p-3", actual?.id === e.id && "border-primary")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{estudiantes[e.matricula_id] ?? "Estudiante"}</p>
                <span className="flex flex-wrap items-center gap-1.5">
                  {e.tardia && <Badge variant="warning">Con retraso</Badge>}
                  <Badge variant={e.estado === "calificada" ? "success" : e.estado === "devuelta" ? "warning" : "secondary"}>
                    {e.estado === "calificada" ? `Calificada · ${e.puntaje} / ${tarea.puntaje_max}` : e.estado === "devuelta" ? "Devuelta" : "Por revisar"}
                  </Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{fechaHoraLimaTexto(e.entregada_en)} · envío {e.envios} de {tarea.max_envios}</p>
              {e.texto && <p className="mt-1 whitespace-pre-line">{e.texto}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.archivo_path && <Button variant="outline" size="sm" onClick={() => verArchivo(e)}><FileText aria-hidden />{e.archivo_nombre ?? "Archivo"}</Button>}
                {editable && actual?.id !== e.id && <Button size="sm" variant="ghost" onClick={() => elegir(e)}><CheckCircle2 aria-hidden />{e.estado === "calificada" ? "Corregir calificación" : "Revisar"}</Button>}
              </div>
              {actual?.id === e.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">Puntaje (0 a {tarea.puntaje_max})
                      <Input inputMode="decimal" value={puntaje} onChange={(x) => setPuntaje(x.target.value)} className="w-28" />
                    </label>
                    {tarea.evaluacion_id && puntaje && Number.isFinite(n) && <span className="pb-2 text-xs text-muted-foreground">= {notaDesdePuntaje(n, tarea.puntaje_max)} / 20 en el registro</span>}
                  </div>
                  <Textarea value={comentario} onChange={(x) => setComentario(x.target.value)} maxLength={2000} rows={3} placeholder="Comentario para el estudiante (obligatorio si la devuelves para corregir)." />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => revisar(false)} disabled={enviando || puntaje.trim() === ""}>{enviando && <Loader2 className="animate-spin" aria-hidden />}Guardar calificación</Button>
                    {e.estado !== "calificada" && <Button size="sm" variant="outline" onClick={() => revisar(true)} disabled={enviando || comentario.trim().length < 5}>Devolver para corregir</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setActual(null)} disabled={enviando}>Cancelar</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {sinEntrega.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Sin entregar ({sinEntrega.length})</summary>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">{sinEntrega.map(([m, nombre]) => <li key={m}>{nombre}</li>)}</ul>
          </details>
        )}
      </div>
    </>
  )
}
