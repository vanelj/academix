"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { confirmarMatriculaSinSaldo, crearSolicitud } from "@/lib/inscripcion/acciones"
import type { CondicionesOferta, PoliticasOferta } from "@/lib/inscripcion/datos"
import type { EstadoEnGrupo } from "@/lib/inscripcion/estado-estudiante"
import { importeAlInscribirse } from "@/lib/inscripcion/precio"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

export type EstadoSesionInscripcion = "sin_sesion" | "sin_perfil" | "no_estudiante" | "estudiante"

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })

/**
 * Compra de un curso (como en una tienda de cursos): pago completo, sin reserva
 * de vacante. El servidor (RPC crear_solicitud_inscripcion) decide todo:
 * estudiante (sesión), institución (del grupo), importe y vacantes.
 * - De pago: «Comprar ahora» → resumen y condiciones → página de pago (método de
 *   la institución y comprobante). La institución verifica el pago y entonces la
 *   matrícula aparece en «Mis cursos». Subir el comprobante NO lo aprueba.
 * - Gratuito: «Inscribirme gratis» → matrícula inmediata (sin saldo).
 * Con sesión de estudiante muestra su situación real: «Ir a mi curso», «Completar
 * pago» o «Pago en verificación».
 */
export function InscripcionGrupo({
  grupoId,
  grupoCodigo,
  cursoId,
  cursoNombre,
  duracion = null,
  sinVacantes,
  condiciones,
  politicas,
  sesion,
  estado = null,
  matriculadoEnCurso = false,
}: {
  grupoId: string
  grupoCodigo: string
  cursoId: string
  cursoNombre: string
  /** Duración del grupo (p. ej. «12 semanas»), para el resumen de compra. */
  duracion?: string | null
  sinVacantes: boolean
  condiciones: CondicionesOferta | null
  politicas: PoliticasOferta | null
  sesion: EstadoSesionInscripcion
  estado?: EstadoEnGrupo | null
  matriculadoEnCurso?: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Evita doble envío; además la BD rechaza una segunda solicitud vigente del mismo tipo.
  const bloqueo = useRef(false)

  if (!condiciones) return <p className="text-xs text-muted-foreground">La institución aún no configuró las condiciones de inscripción.</p>

  if (sesion === "estudiante" && matriculadoEnCurso) {
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <p className="text-xs font-medium text-success">{estado?.tipo === "matriculado" ? "Estás matriculado en este grupo" : "Ya estás matriculado en este curso"}</p>
        <Link href="/estudiante/cursos" className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-auto")}>Ir a mi curso</Link>
      </div>
    )
  }
  if (sesion === "estudiante" && estado?.tipo === "solicitud" && estado.estado === "pendiente") {
    if (estado.pagoEnRevision) {
      return (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-xs text-muted-foreground">Recibimos tu comprobante. La institución está verificando el pago.</p>
          <Link href="/estudiante/pagos" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full sm:w-auto")}>Pago en verificación</Link>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <p className="text-xs text-muted-foreground">Tu compra está pendiente de pago.</p>
        <Link href={estado.importe > 0 ? `/estudiante/pagos/pagar?solicitud=${estado.id}` : "/estudiante/solicitudes"} className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-auto")}>
          {estado.importe > 0 ? `Completar pago · ${soles.format(estado.importe)}` : "Continuar inscripción"}
        </Link>
      </div>
    )
  }
  // Reservas hechas antes del pago completo: se respetan (la vacante es suya aunque no queden libres).
  const reservaVigente = sesion === "estudiante" && estado?.tipo === "solicitud" && estado.estado === "reservada"
  if (sinVacantes && !reservaVigente) return <p className="text-xs font-medium text-muted-foreground">Sin vacantes disponibles</p>

  const gratuito = condiciones.tipo_cobro === "gratuito"
  const importe = importeAlInscribirse(condiciones)

  if (sesion !== "estudiante") {
    const guia = {
      // Tras iniciar sesión vuelve a este curso (ruta validada en el servidor).
      sin_sesion: { texto: gratuito ? "Inicia sesión para inscribirte" : "Inicia sesión para comprar", href: `/login?siguiente=${encodeURIComponent(`/cursos/${cursoId}`)}` },
      sin_perfil: { texto: "Completa tu registro de estudiante", href: "/completar-registro" },
      no_estudiante: { texto: "Cambia a tu rol de estudiante", href: "/seleccionar-rol" },
    }[sesion]
    return (
      <Link href={guia.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto")}>
        {guia.texto}
      </Link>
    )
  }

  const textos = [
    ["Requisitos del curso", condiciones.requisitos],
    ["Condiciones particulares", condiciones.condiciones_especiales],
    ["Política de matrícula", politicas?.texto_matricula],
    ["Política de pagos", politicas?.texto_pagos],
    ["Cancelaciones y devoluciones", politicas?.texto_devoluciones],
  ].filter((t): t is [string, string] => Boolean(t[1]?.trim()))

  async function confirmar() {
    if (bloqueo.current || !acepta) return
    bloqueo.current = true
    setEnviando(true)
    const op = notificar.operacion(gratuito ? "Inscribiéndote…" : "Preparando tu compra…")
    try {
      const r = await crearSolicitud({ grupoId, tipo: "matricula", acepta: true })
      if (!r.ok) {
        ;(r.gravedad === "advertencia" ? op.advertencia : op.error)(gratuito ? "No se pudo completar la inscripción" : "No se pudo iniciar la compra", { descripcion: r.mensaje })
        return
      }
      if (gratuito || reservaVigente) {
        // Sin saldo (gratuito o cubierto por la reserva): se confirma la matrícula de inmediato.
        const c = r.id ? await confirmarMatriculaSinSaldo(r.id) : null
        if (c?.ok) {
          op.exito("¡Listo! Ya estás matriculado", { descripcion: "El curso está en «Mis cursos»." })
          router.push("/estudiante/cursos")
          return
        }
        if (gratuito) {
          op.advertencia("Tu inscripción quedó registrada", { descripcion: c && !c.ok ? c.mensaje : "Puedes seguirla en «Mis solicitudes»." })
          router.push("/estudiante/solicitudes")
          return
        }
      }
      op.exito("Compra iniciada", { descripcion: "Ahora paga a la institución y sube tu comprobante." })
      router.push(r.id ? `/estudiante/pagos/pagar?solicitud=${r.id}` : "/estudiante/solicitudes")
    } catch {
      op.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setEnviando(false)
    }
  }

  const textoBoton = reservaVigente ? "Completar matrícula" : gratuito ? "Inscribirme gratis" : `Comprar ahora · ${soles.format(importe)}`

  return (
    <>
      {reservaVigente && <p className="mb-2 text-xs text-success sm:text-right">Tienes una reserva vigente en este grupo.</p>}
      <Button size="sm" onClick={() => { setAbierto(true); setAcepta(false) }} className="w-full sm:w-auto">
        {textoBoton}
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !enviando && setAbierto(v)}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!enviando}>
          <DialogHeader>
            <DialogTitle>{gratuito ? "Inscripción gratuita" : "Resumen de tu compra"}</DialogTitle>
            <DialogDescription>{gratuito ? "Confirma para matricularte de inmediato." : "Revisa el pedido y acepta las condiciones para continuar al pago."}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border p-3 text-sm">
              <p className="font-semibold">{cursoNombre}</p>
              <p className="text-muted-foreground">Grupo {grupoCodigo}{duracion ? ` · Duración: ${duracion}` : ""}</p>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3">
                <span className="text-muted-foreground">{gratuito ? "Precio" : condiciones.tipo_cobro === "cuotas" ? "A pagar al inscribirte" : "Total (pago único)"}</span>
                <span className="text-xl font-bold tabular-nums">{gratuito ? "Gratis" : soles.format(importe)}</span>
              </div>
              {condiciones.tipo_cobro === "cuotas" && <p className="mt-1 text-xs text-muted-foreground">El resto del curso se paga en cuotas, según el plan de la institución.</p>}
              {reservaVigente && <p className="mt-1 text-xs text-muted-foreground">Tu reserva se descuenta según las condiciones del curso; el sistema calcula el importe final.</p>}
            </div>

            {!gratuito && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Pagas directamente a la institución (Yape, Plin, transferencia o depósito) y subes tu comprobante en el siguiente paso.
                Tu matrícula se confirma cuando la institución verifica el pago.
              </p>
            )}

            {textos.length > 0 && (
              <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border p-3 text-sm">
                {textos.map(([titulo, texto]) => (
                  <div key={titulo}>
                    <p className="text-xs font-semibold">{titulo}</p>
                    <p className="whitespace-pre-line text-muted-foreground">{texto}</p>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              He leído y acepto las condiciones y políticas de la institución para este curso.
            </label>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={enviando} />}>Cancelar</DialogClose>
            <Button onClick={confirmar} disabled={!acepta || enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {enviando ? "Procesando…" : gratuito ? "Confirmar inscripción" : reservaVigente ? "Continuar" : "Continuar al pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
