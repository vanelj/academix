"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MailX, Pencil, Send, UserCheck, UserX } from "lucide-react"

import { DocenteFormDialog } from "@/components/admin/docentes/docente-form-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  cambiarEstadoDocente,
  cancelarInvitacion,
  reenviarInvitacion,
  type ResultadoDocente,
} from "@/lib/docentes/acciones"
import type { DocenteDetalle } from "@/lib/docentes/datos"
import { notificar } from "@/lib/notificaciones"

type Accion = "deshabilitar" | "habilitar" | "reenviar" | "cancelar"

/** Acciones de la ficha del docente. El servidor vuelve a comprobar cada regla. */
export function DocenteAcciones({ docente, cuentasConfiguradas }: { docente: DocenteDetalle; cuentasConfiguradas: boolean }) {
  const router = useRouter()
  const [editar, setEditar] = useState(false)
  const [confirmar, setConfirmar] = useState<"deshabilitar" | "cancelar" | null>(null)
  const [procesando, setProcesando] = useState<Accion | null>(null)
  const nombre = `${docente.nombres} ${docente.apellidos}`
  const pendiente = docente.cuenta !== null && !docente.cuenta.activada
  const puedeCancelar = pendiente && docente.otrosRoles.length === 0 && (docente.grupos ?? 0) === 0

  async function ejecutar(accion: Accion) {
    if (procesando) return
    setProcesando(accion)
    const textos: Record<Accion, [string, string, string?]> = {
      deshabilitar: ["Deshabilitando docente…", "Docente deshabilitado", "Ya no puede trabajar con el rol docente."],
      habilitar: ["Habilitando docente…", "Docente habilitado", "Puede volver a trabajar con el rol docente."],
      reenviar: ["Reenviando invitación…", "Invitación reenviada", docente.cuenta?.correo ? `Se envió a ${docente.cuenta.correo}.` : undefined],
      cancelar: ["Cancelando invitación…", "Invitación cancelada", "Se eliminó la cuenta que no llegó a activarse."],
    }
    const [enCurso, exito, detalle] = textos[accion]
    const operacion = notificar.operacion(enCurso)
    try {
      let r: ResultadoDocente
      if (accion === "reenviar") r = await reenviarInvitacion(docente.id)
      else if (accion === "cancelar") r = await cancelarInvitacion(docente.id)
      else r = await cambiarEstadoDocente(docente.id, accion === "habilitar")
      if (r.ok) {
        operacion.exito(exito, { descripcion: detalle })
        if (accion === "cancelar") router.push("/admin/docentes")
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo completar la operación", { descripcion: r.mensaje })
      }
    } catch {
      operacion.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
      setConfirmar(null)
    }
  }

  const ocupado = procesando !== null
  const spinner = (a: Accion) => procesando === a && <Loader2 className="animate-spin" aria-hidden />

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditar(true)} disabled={ocupado}>
          <Pencil aria-hidden />
          Editar datos
        </Button>
        {docente.rolActivo ? (
          <Button variant="outline" onClick={() => setConfirmar("deshabilitar")} disabled={ocupado}>
            {spinner("deshabilitar") || <UserX aria-hidden />}
            Deshabilitar
          </Button>
        ) : (
          <Button onClick={() => ejecutar("habilitar")} disabled={ocupado}>
            {spinner("habilitar") || <UserCheck aria-hidden />}
            Habilitar
          </Button>
        )}
        {pendiente && cuentasConfiguradas && (
          <Button variant="outline" onClick={() => ejecutar("reenviar")} disabled={ocupado}>
            {spinner("reenviar") || <Send aria-hidden />}
            Reenviar invitación
          </Button>
        )}
        {puedeCancelar && cuentasConfiguradas && (
          <Button variant="destructive" onClick={() => setConfirmar("cancelar")} disabled={ocupado}>
            {spinner("cancelar") || <MailX aria-hidden />}
            Cancelar invitación
          </Button>
        )}
      </div>

      <DocenteFormDialog
        abierto={editar}
        onAbiertoChange={setEditar}
        docente={{ id: docente.id, nombres: docente.nombres, apellidos: docente.apellidos, dni: docente.dni, telefono: docente.telefono }}
      />

      <Dialog open={confirmar !== null} onOpenChange={(v) => !v && !ocupado && setConfirmar(null)}>
        <DialogContent showCloseButton={false}>
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>{confirmar === "deshabilitar" ? "¿Deshabilitar al docente?" : "¿Cancelar la invitación?"}</DialogTitle>
                <DialogDescription>
                  {confirmar === "deshabilitar"
                    ? `${nombre} no podrá trabajar con el rol docente hasta que lo habilites de nuevo.${(docente.gruposVigentes ?? 0) > 0 ? ` Tiene ${docente.gruposVigentes} ${docente.gruposVigentes === 1 ? "grupo vigente que conserva" : "grupos vigentes que conservan"} su asignación: revísalos en «Grupos y horarios».` : ""} No se borra ningún dato.`
                    : `Se eliminará la cuenta de ${nombre}, que nunca llegó a activarse (útil si el correo era incorrecto). El enlace de invitación dejará de funcionar.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={ocupado} autoFocus />}>Cancelar</DialogClose>
                <Button variant="destructive" onClick={() => ejecutar(confirmar)} disabled={ocupado}>
                  {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                  {confirmar === "deshabilitar" ? "Deshabilitar" : "Cancelar invitación"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
