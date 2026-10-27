"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Award, Clock, Download, ExternalLink, Loader2, Wallet } from "lucide-react"

import { formatoSolesSolicitud as s } from "@/components/solicitudes/solicitud-ui"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ETIQUETA_MODALIDAD } from "@/lib/certificados/config"
import type { MiCertificado } from "@/lib/certificados/estudiante"
import { enlaceMiCertificado, solicitarCertificado } from "@/lib/certificados/estudiante-acciones"
import { notificar } from "@/lib/notificaciones"

const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" })

/** Certificados emitidos y pendientes del estudiante (de cualquier institución). */
export function MisCertificados({ certificados }: { certificados: MiCertificado[] }) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  const emitidos = certificados.filter((c) => c.certificado)
  const pendientes = certificados.filter((c) => !c.certificado && c.modalidad !== "sin_certificado")

  async function descargar(id: string) {
    if (procesando) return
    setProcesando(id)
    try {
      const r = await enlaceMiCertificado(id)
      if (r.ok && r.url) window.location.assign(r.url)
      else if (!r.ok) (r.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo descargar", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo descargar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  async function pagar(c: MiCertificado) {
    if (procesando) return
    if (c.solicitudId) return router.push(`/estudiante/pagos/pagar?certificado=${c.solicitudId}`)
    setProcesando(c.matriculaId)
    try {
      const r = await solicitarCertificado(c.matriculaId)
      if (r.ok && r.id) router.push(`/estudiante/pagos/pagar?certificado=${r.id}`)
      else if (!r.ok) (r.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo solicitar", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo solicitar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  if (emitidos.length === 0 && pendientes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Award className="size-5 text-muted-foreground" aria-hidden /></div>
          <p className="font-medium">Aún no tienes certificados</p>
          <p className="max-w-sm text-sm text-muted-foreground">Aparecerán aquí cuando apruebes un curso que entregue certificado.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {emitidos.length > 0 && (
        <section aria-labelledby="emitidos-titulo" className="space-y-3">
          <h2 id="emitidos-titulo" className="text-lg font-semibold">Emitidos</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {emitidos.map((c) => (
              <li key={c.matriculaId}>
                <Card size="sm" className="h-full">
                  <CardContent className="flex h-full flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{c.curso}</p>
                        <p className="text-sm text-muted-foreground">{c.institucion} · Grupo {c.grupo}</p>
                      </div>
                      {c.certificado!.tienePdf ? <Badge variant="success">Disponible</Badge> : <Badge variant="warning">PDF en preparación</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Emitido el {fecha.format(new Date(c.certificado!.fecha_emision))} · código <span className="font-mono text-foreground">{c.certificado!.codigo}</span>
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => descargar(c.certificado!.id)} disabled={procesando !== null || !c.certificado!.tienePdf}>
                        {procesando === c.certificado!.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                        {c.certificado!.tienePdf ? "Descargar PDF" : "PDF en preparación"}
                      </Button>
                      <Link href={`/verificar/${c.certificado!.codigo}`} target="_blank" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                        <ExternalLink aria-hidden />Verificación pública
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendientes.length > 0 && (
        <section aria-labelledby="pendientes-titulo" className="space-y-3">
          <h2 id="pendientes-titulo" className="text-lg font-semibold">Pendientes de emisión</h2>
          <ul className="space-y-3">
            {pendientes.map((c) => {
              const porPagar = c.modalidad === "costo_adicional" && c.solicitudEstado !== "pagada"
              return (
                <li key={c.matriculaId}>
                  <Card size="sm">
                    <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1 text-sm">
                        <p className="font-medium">{c.curso}</p>
                        <p className="text-muted-foreground">{c.institucion} · {ETIQUETA_MODALIDAD[c.modalidad]}</p>
                        {c.modalidad === "costo_adicional" ? (
                          c.solicitudEstado === "pagada" ? (
                            <p className="text-success">Pago verificado. La institución emitirá tu certificado.</p>
                          ) : c.pagoEnRevision ? (
                            <p className="flex items-center gap-1 text-warning"><Clock className="size-3.5" aria-hidden />Comprobante en revisión por la institución.</p>
                          ) : (
                            <p className="text-muted-foreground">Opcional: pagar {s.format(c.importe)} a la institución. Tu resultado aprobado no cambia si no lo pagas.</p>
                          )
                        ) : (
                          <p className="text-muted-foreground">Aprobaste el curso: la institución debe autorizar y emitir tu certificado.</p>
                        )}
                      </div>
                      {porPagar && !c.pagoEnRevision && (
                        <Button size="sm" onClick={() => pagar(c)} disabled={procesando !== null} className="shrink-0">
                          {procesando === c.matriculaId ? <Loader2 className="animate-spin" aria-hidden /> : <Wallet aria-hidden />}
                          Pagar certificado
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
