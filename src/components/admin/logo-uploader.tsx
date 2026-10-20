"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CircleAlert, CircleCheck, ImageUp, Loader2, Trash2, X } from "lucide-react"

import { LogoInstitucion } from "@/components/admin/logo-institucion"
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
import { eliminarLogo, subirLogo } from "@/lib/institucion/acciones"
import { notificar } from "@/lib/notificaciones"
import { LOGO_ACCEPT, LOGO_FORMATOS_TEXTO, validarArchivoLogo } from "@/lib/institucion/logo"
import { cn } from "@/lib/utils"

type Mensaje = { tipo: "exito" | "error"; texto: string } | null
type Operacion = "subiendo" | "eliminando" | null

/**
 * Gestión del logotipo: elegir archivo → vista previa → guardar; cambiar o
 * eliminar. El archivo se valida aquí (rápido, para el usuario) y de nuevo en el
 * servidor, que es quien decide.
 */
export function LogoUploader({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [operacion, setOperacion] = useState<Operacion>(null)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)

  // Libera la URL temporal de la vista previa.
  useEffect(() => {
    if (!vistaPrevia) return
    return () => URL.revokeObjectURL(vistaPrevia)
  }, [vistaPrevia])

  const ocupado = operacion !== null

  async function alElegir(event: React.ChangeEvent<HTMLInputElement>) {
    const elegido = event.target.files?.[0]
    event.target.value = "" // permite volver a elegir el mismo archivo
    if (!elegido) return

    const validacion = await validarArchivoLogo(elegido)
    if (!validacion.ok) {
      setMensaje({ tipo: "error", texto: validacion.mensaje })
      return
    }
    setMensaje(null)
    setArchivo(elegido)
    setVistaPrevia(URL.createObjectURL(elegido))
  }

  function cancelar() {
    setArchivo(null)
    setVistaPrevia(null)
  }

  async function guardar() {
    if (!archivo || ocupado) return
    setOperacion("subiendo")
    setMensaje(null)
    const aviso = notificar.operacion("Subiendo logotipo…")
    try {
      const datos = new FormData()
      datos.append("logo", archivo)
      const resultado = await subirLogo(datos)
      if (resultado.ok) {
        cancelar()
        setMensaje({ tipo: "exito", texto: "El logotipo se guardó correctamente." })
        aviso.exito("Logotipo guardado correctamente")
        router.refresh()
      } else {
        setMensaje({ tipo: "error", texto: resultado.mensaje })
        aviso.error("No se pudo guardar el logotipo", { descripcion: resultado.mensaje })
      }
    } catch {
      const texto = "No se pudo subir el logotipo. Revisa tu conexión e inténtalo de nuevo."
      setMensaje({ tipo: "error", texto })
      aviso.error("No se pudo subir el logotipo", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOperacion(null)
    }
  }

  async function eliminar() {
    if (ocupado) return
    setOperacion("eliminando")
    setMensaje(null)
    const aviso = notificar.operacion("Eliminando logotipo…")
    try {
      const resultado = await eliminarLogo()
      setConfirmarEliminar(false)
      if (resultado.ok) {
        setMensaje({ tipo: "exito", texto: "El logotipo se eliminó." })
        aviso.exito("Logotipo eliminado", { descripcion: "Se mostrarán las iniciales de la institución." })
        router.refresh()
      } else {
        setMensaje({ tipo: "error", texto: resultado.mensaje })
        aviso.error("No se pudo eliminar el logotipo", { descripcion: resultado.mensaje })
      }
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo eliminar el logotipo. Inténtalo de nuevo." })
      aviso.error("No se pudo eliminar el logotipo", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOperacion(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logotipo</CardTitle>
        <CardDescription>
          {LOGO_FORMATOS_TEXTO}, máximo 2 MB. Se recomienda una imagen cuadrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {vistaPrevia ? (
            // Vista previa local (blob:) antes de subir; no pasa por next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vistaPrevia}
              alt="Vista previa del nuevo logotipo"
              className="size-20 shrink-0 rounded-xl bg-muted object-contain ring-2 ring-primary/40"
            />
          ) : (
            <LogoInstitucion nombre={nombre} logoUrl={logoUrl} className="size-20" />
          )}
          <p className="min-w-0 text-sm text-muted-foreground">
            {vistaPrevia
              ? "Vista previa. Guarda para aplicar el nuevo logotipo."
              : logoUrl
                ? "Logotipo actual de la institución."
                : "Sin logotipo: se muestran las iniciales de la institución."}
          </p>
        </div>

        <input
          ref={entrada}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={alElegir}
        />

        {operacion === "subiendo" && (
          <div role="status" className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
            </div>
            <p className="text-xs text-muted-foreground">Subiendo logotipo…</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {archivo ? (
            <>
              <Button type="button" onClick={guardar} disabled={ocupado}>
                {operacion === "subiendo" ? <Loader2 className="animate-spin" aria-hidden /> : <ImageUp aria-hidden />}
                {operacion === "subiendo" ? "Guardando…" : "Guardar logotipo"}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelar} disabled={ocupado}>
                <X aria-hidden />
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => entrada.current?.click()} disabled={ocupado}>
                <ImageUp aria-hidden />
                {logoUrl ? "Cambiar logotipo" : "Subir logotipo"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmarEliminar(true)}
                  disabled={ocupado}
                >
                  <Trash2 aria-hidden />
                  Eliminar logotipo
                </Button>
              )}
            </>
          )}
        </div>

        {mensaje && (
          <div
            role={mensaje.tipo === "error" ? "alert" : "status"}
            className={cn(
              "flex gap-2 rounded-lg border p-3 text-sm",
              mensaje.tipo === "error"
                ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10"
                : "border-success/30 bg-success/5 dark:bg-success/10"
            )}
          >
            {mensaje.tipo === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            )}
            <p>{mensaje.texto}</p>
          </div>
        )}
      </CardContent>

      <Dialog open={confirmarEliminar} onOpenChange={(abierto) => !ocupado && setConfirmarEliminar(abierto)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Eliminar el logotipo?</DialogTitle>
            <DialogDescription>
              Dejará de mostrarse en el panel y en el catálogo público. En su lugar se
              mostrarán las iniciales de la institución.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={ocupado} />}>Cancelar</DialogClose>
            <Button variant="destructive" onClick={eliminar} disabled={ocupado}>
              {operacion === "eliminando" && <Loader2 className="animate-spin" aria-hidden />}
              {operacion === "eliminando" ? "Eliminando…" : "Eliminar logotipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
