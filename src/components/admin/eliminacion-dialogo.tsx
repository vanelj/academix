"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { bloqueos, seEliminara, TEXTO_PRIMERA_CONFIRMACION, TEXTO_SEGUNDA_CONFIRMACION } from "@/lib/cursos/eliminacion"
import {
  diagnosticarEliminacionCurso,
  diagnosticarEliminacionGrupo,
  eliminarCursoDefinitivo,
  eliminarGrupoDefinitivo,
  type DiagnosticoEliminacion,
} from "@/lib/cursos/eliminacion-acciones"
import { notificar } from "@/lib/notificaciones"

export type Alternativa = { etiqueta: string; descripcion: string; ejecutar: () => Promise<boolean>; destructiva?: boolean }

/**
 * Ventana de eliminación de un curso o grupo. Al abrirse consulta el estado
 * REAL (diagnóstico de la BD) y muestra uno de dos casos:
 *  A. Se puede eliminar: qué se borrará y DOS confirmaciones (la segunda,
 *     más contundente, con «Sí, eliminar definitivamente»).
 *  B. Tiene historial: por qué, con enlaces a cada módulo, y la alternativa
 *     (Archivar el curso; Cancelar o Cerrar el grupo).
 * El servidor y la BD vuelven a comprobarlo todo al confirmar.
 */
export function DialogoEliminacion({
  objeto,
  id,
  abierto,
  onCerrar,
  onEliminado,
  alternativas,
}: {
  objeto: "curso" | "grupo"
  id: string
  abierto: boolean
  onCerrar: () => void
  onEliminado: () => void
  alternativas: Alternativa[]
}) {
  const [estado, setEstado] = useState<DiagnosticoEliminacion | null>(null)
  const [paso, setPaso] = useState<1 | 2>(1)
  const [enviando, setEnviando] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    void Promise.resolve().then(async () => {
      if (vigente) { setEstado(null); setPaso(1) }
      try {
        const r = objeto === "curso" ? await diagnosticarEliminacionCurso(id) : await diagnosticarEliminacionGrupo(id)
        if (vigente) setEstado(r)
      } catch {
        if (vigente) setEstado({ ok: false, mensaje: "No se pudo conectar. Inténtalo de nuevo." })
      }
    })
    return () => { vigente = false }
  }, [abierto, id, objeto])

  async function eliminar() {
    if (!estado?.ok || enviando || paso !== 2) return
    setEnviando("eliminar")
    const op = notificar.operacion(objeto === "curso" ? "Eliminando curso…" : "Eliminando grupo…")
    try {
      const r = objeto === "curso" ? await eliminarCursoDefinitivo(id, { primera: true, segunda: true }) : await eliminarGrupoDefinitivo(id, { primera: true, segunda: true })
      if (r.ok) {
        if (r.aviso) op.advertencia(objeto === "curso" ? "Curso eliminado" : "Grupo eliminado", { descripcion: r.aviso })
        else op.exito(objeto === "curso" ? "Curso eliminado" : "Grupo eliminado", { descripcion: `«${estado.nombre}» se eliminó definitivamente.` })
        onEliminado()
      } else {
        ;(r.gravedad === "advertencia" ? op.advertencia : op.error)("No se eliminó", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo conectar", { descripcion: "No se eliminó nada. Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(null)
    }
  }

  async function alternativa(a: Alternativa) {
    if (enviando) return
    setEnviando(a.etiqueta)
    const ok = await a.ejecutar().catch(() => false)
    setEnviando(null)
    if (ok) onCerrar()
  }

  const nombreObjeto = objeto === "curso" ? "curso" : "grupo"
  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a && !enviando) onCerrar() }}>
      <DialogContent className="sm:max-w-lg">
        {!estado ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
            Revisando qué tiene este {nombreObjeto}…
            <DialogTitle className="sr-only">Revisando el {nombreObjeto}</DialogTitle>
          </div>
        ) : !estado.ok ? (
          <>
            <DialogHeader>
              <DialogTitle>No se pudo revisar el {nombreObjeto}</DialogTitle>
              <DialogDescription>{estado.mensaje}</DialogDescription>
            </DialogHeader>
            <DialogFooter><Button variant="outline" onClick={onCerrar}>Cerrar</Button></DialogFooter>
          </>
        ) : estado.diagnostico.eliminable && paso === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden />Eliminar «{estado.nombre}»</DialogTitle>
              <DialogDescription>{TEXTO_PRIMERA_CONFIRMACION[objeto]}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">No tiene matrículas, solicitudes, pagos, notas ni certificados. Se borrará:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {seEliminara(estado.diagnostico, objeto).map((l) => <li key={l}>{l}</li>)}
            </ul>
            {estado.migracionPendiente && (estado.diagnostico.grupos > 0 || estado.diagnostico.plan_cuotas > 0 || estado.diagnostico.evaluaciones > 0) && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                Para borrarlo todo de una vez hace falta la actualización «eliminacion_segura_v5». Sin ella, el servidor rechazará la operación y no se borrará nada.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onCerrar} autoFocus>Cancelar</Button>
              <Button variant="destructive" onClick={() => setPaso(2)}>
                <Trash2 aria-hidden />
                Sí, continuar
              </Button>
            </DialogFooter>
          </>
        ) : estado.diagnostico.eliminable ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" aria-hidden />Eliminación definitiva</DialogTitle>
              <DialogDescription className="sr-only">Segunda confirmación</DialogDescription>
            </DialogHeader>
            <p role="alert" className="rounded-xl border-2 border-destructive/50 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {TEXTO_SEGUNDA_CONFIRMACION[objeto]}
            </p>
            <p className="text-sm">
              {objeto === "curso" ? "Curso" : "Grupo"}: <strong className="break-words">{estado.nombre}</strong>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onCerrar} disabled={enviando !== null} autoFocus>Cancelar</Button>
              <Button variant="destructive" onClick={eliminar} disabled={enviando !== null}>
                {enviando === "eliminar" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                Sí, eliminar definitivamente
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-warning" aria-hidden />No se puede eliminar</DialogTitle>
              <DialogDescription>Este {nombreObjeto} contiene registros que deben conservarse:</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {bloqueos(estado.diagnostico, estado.grupoConHistorial).map((b) => (
                <li key={b.texto} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span>{b.texto}</span>
                  {b.href && <Link href={b.href} className="text-xs font-medium text-primary underline underline-offset-2" onClick={onCerrar}>{b.etiqueta} →</Link>}
                </li>
              ))}
            </ul>
            {alternativas.length > 0 && (
              <div className="space-y-2">
                {alternativas.map((a) => (
                  <div key={a.etiqueta} className="rounded-xl border p-3">
                    <p className="text-sm text-muted-foreground">{a.descripcion}</p>
                    <Button className="mt-2" variant={a.destructiva ? "destructive" : "default"} disabled={enviando !== null} onClick={() => alternativa(a)}>
                      {enviando === a.etiqueta && <Loader2 className="animate-spin" aria-hidden />}
                      {a.etiqueta}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={onCerrar} disabled={enviando !== null}>Cerrar</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
