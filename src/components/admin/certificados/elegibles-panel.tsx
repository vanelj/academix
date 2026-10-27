"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Award, CircleAlert, CircleCheck, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { emitirCertificado } from "@/lib/certificados/acciones"
import { ETIQUETA_MODALIDAD } from "@/lib/certificados/config"
import type { Elegible, Firmante, PlantillaCertificado } from "@/lib/certificados/datos"
import { notificar } from "@/lib/notificaciones"

/** Matrículas aprobadas sin certificado: requisitos verificables y emisión autorizada por el administrador. */
export function ElegiblesPanel({ elegibles, plantillas, firmantes }: { elegibles: Elegible[]; plantillas: PlantillaCertificado[]; firmantes: Firmante[] }) {
  const router = useRouter()
  const [emitir, setEmitir] = useState<Elegible | null>(null)
  const [plantilla, setPlantilla] = useState("")
  const [firmante, setFirmante] = useState("")
  const [confirmo, setConfirmo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const activas = plantillas.filter((p) => p.activo)
  const firmantesActivos = firmantes.filter((f) => f.activo)

  function abrir(e: Elegible) {
    setEmitir(e)
    setPlantilla(e.certificacion?.plantilla_id ?? "")
    setFirmante(e.certificacion?.firmante_id ?? "")
    setConfirmo(false)
  }

  async function confirmar() {
    if (!emitir || enviando || !confirmo) return
    setEnviando(true)
    const op = notificar.operacion("Emitiendo certificado…")
    try {
      const r = await emitirCertificado({ matriculaId: emitir.matricula.id, plantillaId: plantilla || null, firmanteId: firmante || null, confirmado: true })
      if (r.ok) {
        if (r.aviso) op.advertencia("Certificado emitido sin PDF", { descripcion: r.aviso })
        else op.exito("Certificado emitido", { descripcion: `Código ${r.codigo}. Ya está disponible para el estudiante.` })
        setEmitir(null)
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo emitir", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo emitir", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  if (elegibles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Award className="size-5 text-muted-foreground" aria-hidden /></div>
          <p className="max-w-md text-sm text-muted-foreground">No hay matrículas aprobadas pendientes de certificado. Aparecen aquí cuando su resultado final se registra como aprobado.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {elegibles.map((e) => (
          <li key={e.matricula.id}>
            <Card size="sm">
              <CardContent className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium">{e.matricula.estudiante.nombre ?? "Estudiante"}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.matricula.curso?.nombre ?? "Curso"} · Grupo {e.matricula.grupo?.codigo ?? "—"}
                    {e.promedio !== null && ` · promedio ${e.promedio.toFixed(2)}`}
                  </p>
                  <Badge variant="outline">{e.certificacion ? ETIQUETA_MODALIDAD[e.certificacion.modalidad] : "Certificación sin configurar"}</Badge>
                  <ul className="space-y-0.5 pt-1">
                    {e.requisitos.map((r) => (
                      <li key={r.clave} className="flex items-start gap-1.5 text-sm">
                        {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Cumplido" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Pendiente" />}
                        <span className={r.ok ? "" : "text-muted-foreground"}>{r.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button size="sm" onClick={() => abrir(e)} disabled={!e.puedeEmitir} className="shrink-0">
                  <Award aria-hidden />
                  Emitir certificado
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={emitir !== null} onOpenChange={(v) => !v && !enviando && setEmitir(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Emitir el certificado de {emitir?.matricula.estudiante.nombre ?? "este estudiante"}?</DialogTitle>
            <DialogDescription>
              La emisión es definitiva: el certificado recibe un código único verificable y su contenido queda fijo, aunque después cambies la plantilla.
              La base de datos vuelve a comprobar los requisitos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="font-medium">Plantilla</span>
              <select className="h-8 w-full rounded-lg border bg-background px-2" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} disabled={enviando}>
                <option value="">Predeterminada de la institución</option>
                {activas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Firmante</span>
              <select className="h-8 w-full rounded-lg border bg-background px-2" value={firmante} onChange={(e) => setFirmante(e.target.value)} disabled={enviando}>
                <option value="">Sin firmante</option>
                {firmantesActivos.map((f) => <option key={f.id} value={f.id}>{f.nombre} — {f.cargo}</option>)}
              </select>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} disabled={enviando} />
              Verifiqué los requisitos y autorizo la emisión en nombre de la institución.
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={enviando} autoFocus />}>Volver</DialogClose>
            <Button onClick={confirmar} disabled={enviando || !confirmo}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Emitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
