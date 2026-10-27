"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleCheck, Loader2 } from "lucide-react"

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
import { crearSolicitud } from "@/lib/inscripcion/acciones"
import type { CondicionesOferta, PoliticasOferta } from "@/lib/inscripcion/datos"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

export type EstadoSesionInscripcion = "sin_sesion" | "sin_perfil" | "no_estudiante" | "estudiante"

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })

/**
 * Inscripción en un grupo abierto. El servidor (RPC crear_solicitud_inscripcion)
 * decide todo: estudiante (sesión), institución (del grupo), importe y
 * vigencia. Aquí solo se elige el tipo y se aceptan las condiciones.
 */
export function InscripcionGrupo({
  grupoId,
  grupoCodigo,
  sinVacantes,
  condiciones,
  politicas,
  sesion,
}: {
  grupoId: string
  grupoCodigo: string
  sinVacantes: boolean
  condiciones: CondicionesOferta | null
  politicas: PoliticasOferta | null
  sesion: EstadoSesionInscripcion
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<"matricula" | "reserva">("matricula")
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [creada, setCreada] = useState(false)
  // Evita doble envío; además la BD rechaza una segunda solicitud vigente del mismo tipo.
  const bloqueo = useRef(false)

  if (!condiciones) return <p className="text-xs text-muted-foreground">La institución aún no configuró las condiciones de inscripción.</p>
  if (sinVacantes) return <p className="text-xs font-medium text-muted-foreground">Sin vacantes disponibles</p>

  if (sesion !== "estudiante") {
    const guia = {
      sin_sesion: { texto: "Inicia sesión para inscribirte", href: "/login" },
      sin_perfil: { texto: "Completa tu registro de estudiante", href: "/completar-registro" },
      no_estudiante: { texto: "Cambia a tu rol de estudiante", href: "/seleccionar-rol" },
    }[sesion]
    return (
      <Link href={guia.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto")}>
        {guia.texto}
      </Link>
    )
  }

  const gratuito = condiciones.tipo_cobro === "gratuito"
  const importeMatricula = gratuito ? 0 : condiciones.matricula_importe + (condiciones.tipo_cobro === "unico" ? condiciones.importe_curso : 0)
  const importe = tipo === "reserva" ? condiciones.reserva_importe : importeMatricula
  const textos = [
    ["Requisitos del curso", condiciones.requisitos],
    ["Condiciones particulares", condiciones.condiciones_especiales],
    ["Política de matrícula", politicas?.texto_matricula],
    ["Política de reservas", politicas?.texto_reservas],
    ["Política de pagos", politicas?.texto_pagos],
    ["Cancelaciones y devoluciones", politicas?.texto_devoluciones],
  ].filter((t): t is [string, string] => Boolean(t[1]?.trim()))

  async function enviar() {
    if (bloqueo.current || !acepta) return
    bloqueo.current = true
    setEnviando(true)
    const op = notificar.operacion("Enviando tu solicitud…")
    try {
      const r = await crearSolicitud({ grupoId, tipo, acepta: true })
      if (r.ok) {
        op.exito(tipo === "reserva" ? "Solicitud de reserva registrada" : "Solicitud de matrícula registrada", {
          descripcion: "Puedes seguirla en «Mis solicitudes».",
        })
        setCreada(true)
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar("No se pudo registrar la solicitud", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo registrar la solicitud", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setEnviando(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => { setAbierto(true); setCreada(false); setAcepta(false) }} className="w-full sm:w-auto">
        Inscribirme
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !enviando && setAbierto(v)}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!enviando}>
          <DialogHeader>
            <DialogTitle>{creada ? "Solicitud registrada" : `Inscripción · Grupo ${grupoCodigo}`}</DialogTitle>
            <DialogDescription>
              {creada
                ? "La institución revisará tu solicitud. Si requiere pago, verás las instrucciones en «Mis solicitudes»."
                : "Revisa las condiciones antes de enviar tu solicitud."}
            </DialogDescription>
          </DialogHeader>

          {creada ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CircleCheck className="size-10 text-success" aria-hidden />
              <Link href="/estudiante/solicitudes" className={buttonVariants()}>Ver mis solicitudes</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {condiciones.permite_reserva && !gratuito && (
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="mb-1 text-sm font-medium">¿Qué deseas solicitar?</legend>
                  {(["matricula", "reserva"] as const).map((t) => (
                    <label key={t} className={cn("flex cursor-pointer gap-2 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", tipo === t ? "border-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50")}>
                      <input type="radio" name={`tipo-${grupoId}`} value={t} checked={tipo === t} onChange={() => setTipo(t)} className="mt-0.5 size-4 accent-primary" />
                      <span>
                        <span className="font-medium">{t === "matricula" ? "Matrícula" : "Reserva de vacante"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t === "matricula"
                            ? soles.format(importeMatricula)
                            : `${soles.format(condiciones.reserva_importe)} · plazo ${condiciones.reserva_plazo_horas ?? "—"} h`}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                Importe a pagar al inscribirte: <span className="font-semibold">{soles.format(importe)}</span>
                {condiciones.tipo_cobro === "cuotas" && tipo === "matricula" && " (el curso se paga después en cuotas)"}.
                <span className="block text-xs text-muted-foreground">El sistema calcula el importe final; si tienes una reserva confirmada puede descontarse.</span>
              </p>

              {textos.length > 0 && (
                <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3 text-sm">
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
          )}

          {!creada && (
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={enviando} />}>Cancelar</DialogClose>
              <Button onClick={enviar} disabled={!acepta || enviando}>
                {enviando && <Loader2 className="animate-spin" aria-hidden />}
                {enviando ? "Enviando…" : "Enviar solicitud"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
