"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, ClipboardList, FileText, Loader2, MessageSquare, Paperclip, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { abrirDocumento } from "@/lib/abrir-documento"
import { fechaHoraLimaTexto } from "@/lib/fechas"
import { modoApertura, TIPOS_MATERIAL, tipoMaterial, type TipoMaterial } from "@/lib/materiales/reglas"
import { notificar } from "@/lib/notificaciones"
import { createClient } from "@/lib/supabase/client"
import { abrirArchivoEntrega, entregarTarea } from "@/lib/tareas/acciones"
import { ACEPTA_ENTREGA, BUCKET_ENTREGAS, ENTREGA_MAX_BYTES, estadoAlumno, ETIQUETA_ESTADO_ALUMNO, puedeEntregar, rutaEntrega, type EstadoAlumno, type Entrega, type Tarea } from "@/lib/tareas/reglas"

const VARIANTE: Record<EstadoAlumno, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  pendiente: "warning",
  entregada: "secondary",
  tardia: "secondary",
  vencida: "destructive",
  calificada: "success",
  devuelta: "warning",
  cerrada: "outline",
}

type Item = { tarea: Tarea; entrega: Entrega | null }

/** Tareas del estudiante: estado, instrucciones, entrega (texto o archivo), comentarios y calificación. */
export function TareasAlumno({ items, estudianteId }: { items: Item[]; estudianteId: string }) {
  const [abierta, setAbierta] = useState<Item | null>(null)
  const ahora = new Date()
  const orden: EstadoAlumno[] = ["devuelta", "pendiente", "entregada", "tardia", "calificada", "vencida", "cerrada"]
  const lista = [...items].sort((a, b) => orden.indexOf(estadoAlumno(a.tarea, a.entrega, ahora)) - orden.indexOf(estadoAlumno(b.tarea, b.entrega, ahora)) || a.tarea.fecha_limite.localeCompare(b.tarea.fecha_limite))

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted"><ClipboardList className="size-5 text-muted-foreground" aria-hidden /></div>
          <p className="text-sm text-muted-foreground">Tu docente aún no publicó tareas en este curso.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <ul className="space-y-2">
        {lista.map((it) => {
          const estado = estadoAlumno(it.tarea, it.entrega, ahora)
          return (
            <li key={it.tarea.id}>
              <button type="button" onClick={() => setAbierta(it)} className="flex w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block font-medium break-words">{it.tarea.titulo}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" aria-hidden />Entrega hasta el {fechaHoraLimaTexto(it.tarea.fecha_limite)}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {it.entrega?.estado === "calificada" && it.entrega.puntaje !== null && (
                    <span className="text-sm font-semibold tabular-nums">{it.entrega.puntaje} / {it.tarea.puntaje_max}</span>
                  )}
                  <Badge variant={VARIANTE[estado]}>{ETIQUETA_ESTADO_ALUMNO[estado]}</Badge>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Dialog open={abierta !== null} onOpenChange={(a) => { if (!a) setAbierta(null) }}>
        <DialogContent className="sm:max-w-lg">
          {abierta && <DetalleTarea item={abierta} estudianteId={estudianteId} onListo={() => setAbierta(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function DetalleTarea({ item, estudianteId, onListo }: { item: Item; estudianteId: string; onListo: () => void }) {
  const router = useRouter()
  const { tarea: t, entrega: e } = item
  const permiso = puedeEntregar(t, e)
  const [texto, setTexto] = useState(e?.texto ?? "")
  const [archivo, setArchivo] = useState<{ file: File; tipo: TipoMaterial } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  async function elegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (!f) return
    setError(null)
    if (f.size === 0 || f.size > ENTREGA_MAX_BYTES) { setArchivo(null); setError(f.size === 0 ? "El archivo está vacío." : "El archivo supera 20 MB."); return }
    const tipo = tipoMaterial(f.name, new Uint8Array(await f.slice(0, 16).arrayBuffer()))
    if (!tipo) { setArchivo(null); setError("Formato no admitido o archivo dañado. Usa PDF, Word, Excel, PowerPoint, texto o imagen."); return }
    setArchivo({ file: f, tipo })
  }

  async function enviar() {
    if (enviando || !permiso.ok) return
    if (!texto.trim() && !archivo && !e?.archivo_path) { setError("Escribe tu respuesta o adjunta un archivo."); return }
    setEnviando(true)
    const op = notificar.operacion("Enviando tu entrega…")
    try {
      let datosArchivo = null
      if (archivo) {
        const ruta = rutaEntrega(t.institucion_id, t.grupo_id, t.id, estudianteId, crypto.randomUUID(), TIPOS_MATERIAL[archivo.tipo].ext)
        const { error: subida } = await createClient().storage.from(BUCKET_ENTREGAS).upload(ruta, archivo.file, { contentType: archivo.tipo, upsert: false, cacheControl: "0" })
        if (subida) { op.error("No se pudo subir el archivo", { descripcion: /size|large/i.test(subida.message) ? "El archivo supera 20 MB." : "Revisa tu conexión e inténtalo de nuevo." }); return }
        datosArchivo = { ruta, nombre: archivo.file.name, tipo: archivo.tipo, bytes: archivo.file.size }
      }
      const r = await entregarTarea(t.id, { texto: texto.trim(), archivo: datosArchivo })
      if (r.ok) {
        op.exito(permiso.tardia ? "Entrega enviada con retraso" : "Entrega enviada", { descripcion: "Tu docente la verá en su lista de entregas." })
        onListo()
        router.refresh()
      } else op.advertencia("No se envió", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo conectar", { descripcion: "Tu respuesta sigue en pantalla. Inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  async function verArchivo() {
    if (!e) return
    const r = await abrirDocumento(modoApertura({ tipo: "archivo", archivo_tipo: e.archivo_tipo }), () => abrirArchivoEntrega(e.id))
    if (!r.ok) notificar.error("No se pudo abrir el archivo", { descripcion: r.mensaje })
  }

  const estado = estadoAlumno(t, e)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{t.titulo}</DialogTitle>
        <DialogDescription>
          Entrega hasta el {fechaHoraLimaTexto(t.fecha_limite)} (hora de Lima)
          {t.permite_tardias ? (t.tardias_hasta ? ` · Se aceptan entregas con retraso hasta el ${fechaHoraLimaTexto(t.tardias_hasta)}` : " · Se aceptan entregas con retraso") : " · No se aceptan entregas fuera de plazo"}
          {t.max_envios > 1 ? ` · Hasta ${t.max_envios} envíos` : " · Un solo envío"}
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
        <Badge variant={VARIANTE[estado]}>{ETIQUETA_ESTADO_ALUMNO[estado]}</Badge>
        {t.instrucciones && <p className="whitespace-pre-line">{t.instrucciones}</p>}
        {t.enlace && <a href={t.enlace} target="_blank" rel="noopener noreferrer" className="block break-all text-primary underline underline-offset-2">{t.enlace}</a>}
        {t.materiales.length > 0 && <p className="text-xs text-muted-foreground">Esta tarea usa {t.materiales.length === 1 ? "1 material" : `${t.materiales.length} materiales`} del curso: revisa la sección «Materiales».</p>}

        {e && (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
            <p className="font-medium">Tu entrega · {fechaHoraLimaTexto(e.entregada_en)}{e.tardia ? " (con retraso)" : ""}</p>
            {e.texto && <p className="whitespace-pre-line text-muted-foreground">{e.texto}</p>}
            {e.archivo_path && <Button variant="outline" size="sm" onClick={verArchivo}><FileText aria-hidden />{e.archivo_nombre ?? "Archivo entregado"}</Button>}
            {e.comentario && <p className="flex gap-1.5 pt-1"><MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span><strong>Comentario del docente:</strong> {e.comentario}</span></p>}
            {e.estado === "calificada" && e.puntaje !== null && <p className="font-semibold">Calificación: {e.puntaje} / {t.puntaje_max}</p>}
          </div>
        )}

        {permiso.ok ? (
          <div className="space-y-2">
            {permiso.tardia && <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">El plazo venció: tu entrega quedará marcada como enviada con retraso.</p>}
            <label htmlFor="entrega-texto" className="text-xs font-medium text-muted-foreground">{e ? "Nueva respuesta (reemplaza la anterior)" : "Tu respuesta"}</label>
            <Textarea id="entrega-texto" value={texto} onChange={(x) => setTexto(x.target.value)} maxLength={5000} rows={4} placeholder="Escribe aquí tu respuesta o comentarios para el docente." disabled={enviando} />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={entrada} type="file" accept={ACEPTA_ENTREGA} onChange={elegir} className="sr-only" id="entrega-archivo" disabled={enviando} />
              <Button type="button" variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={enviando}><Paperclip aria-hidden />{archivo ? "Cambiar archivo" : "Adjuntar archivo"}</Button>
              {archivo && <span className="text-xs break-all text-muted-foreground">{archivo.file.name}</span>}
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          estado !== "calificada" && <p className="text-xs text-muted-foreground">{permiso.motivo}</p>
        )}
      </div>
      {permiso.ok && (
        <DialogFooter>
          <Button variant="outline" onClick={onListo} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {e ? "Reenviar entrega" : "Enviar entrega"}
          </Button>
        </DialogFooter>
      )}
    </>
  )
}
