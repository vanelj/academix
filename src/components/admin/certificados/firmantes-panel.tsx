"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus, Signature } from "lucide-react"

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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cambiarEstadoFirmante, guardarFirmante } from "@/lib/certificados/acciones"
import { BUCKET_RECURSOS, TAMANO_MAX_FIRMA } from "@/lib/certificados/config"
import type { Firmante } from "@/lib/certificados/datos"
import { notificar } from "@/lib/notificaciones"
import { TIPOS_COMPROBANTE, tipoPorFirma } from "@/lib/pagos/config"
import { createClient } from "@/lib/supabase/client"

type FirmanteVista = Firmante & { firmaUrl: string | null }

/** Personas que la institución declara autorizadas a firmar sus certificados. */
export function FirmantesPanel({ firmantes, institucionId }: { firmantes: FirmanteVista[]; institucionId: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState<FirmanteVista | "nuevo" | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  async function alternar(f: FirmanteVista) {
    if (procesando) return
    setProcesando(f.id)
    try {
      const r = await cambiarEstadoFirmante(f.id, !f.activo)
      if (r.ok) { notificar.exito(f.activo ? "Firmante desactivado" : "Firmante activado"); router.refresh() }
      else (r.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo actualizar", { descripcion: r.mensaje })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Registra solo personas de tu institución que hayan autorizado el uso de su nombre, cargo y firma. Las firmas se guardan en un almacenamiento
          privado y solo se usan al generar los certificados.
        </p>
        <Button onClick={() => setEditando("nuevo")}><Plus aria-hidden />Añadir firmante</Button>
      </div>
      {firmantes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Aún no registraste firmantes. Los certificados pueden emitirse sin firma.</CardContent></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {firmantes.map((f) => (
            <li key={f.id}>
              <Card size="sm" className={f.activo ? "" : "opacity-60"}>
                <CardContent className="space-y-2">
                  <div className="flex h-16 items-center justify-center rounded-md border bg-white">
                    {f.firmaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal de un archivo privado
                      <img src={f.firmaUrl} alt={`Firma de ${f.nombre}`} className="max-h-14 max-w-full object-contain" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Signature className="size-4" aria-hidden />Sin firma</span>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{f.nombre}</p>
                      <p className="text-sm text-muted-foreground break-words">{f.cargo}</p>
                    </div>
                    {!f.activo && <Badge variant="outline">Inactivo</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditando(f)}><Pencil aria-hidden />Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => alternar(f)} disabled={procesando !== null}>
                      {procesando === f.id && <Loader2 className="animate-spin" aria-hidden />}
                      {f.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <FormularioFirmante
          key={editando === "nuevo" ? "nuevo" : editando.id}
          firmante={editando === "nuevo" ? null : editando}
          institucionId={institucionId}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); router.refresh() }}
        />
      )}
    </>
  )
}

function FormularioFirmante({ firmante, institucionId, alCerrar, alGuardar }: { firmante: FirmanteVista | null; institucionId: string; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(firmante?.nombre ?? "")
  const [cargo, setCargo] = useState(firmante?.cargo ?? "")
  const [archivo, setArchivo] = useState<{ file: File; tipo: "image/png" | "image/jpeg" } | null>(null)
  const [declaracion, setDeclaracion] = useState(false)
  const [error, setError] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function elegir(f: File | undefined) {
    setError("")
    if (!f) return
    if (f.size > TAMANO_MAX_FIRMA) return setError("La firma admite hasta 2 MB.")
    const tipo = tipoPorFirma(new Uint8Array(await f.slice(0, 8).arrayBuffer()))
    if (tipo !== "image/png" && tipo !== "image/jpeg") return setError("Sube una imagen PNG (ideal con fondo transparente) o JPG.")
    setArchivo({ file: f, tipo })
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (nombre.trim().length < 3 || cargo.trim().length < 2) return setError("Completa el nombre y el cargo.")
    if (!declaracion) return setError("Debes declarar que la persona autorizó el uso de su nombre y firma.")
    setEnviando(true)
    const op = notificar.operacion("Guardando firmante…")
    try {
      let ruta: string | null = null
      if (archivo) {
        ruta = `${institucionId}/firmas/${crypto.randomUUID()}.${TIPOS_COMPROBANTE[archivo.tipo]}`
        const { error: subida } = await createClient().storage.from(BUCKET_RECURSOS).upload(ruta, archivo.file, { contentType: archivo.tipo, upsert: false, cacheControl: "0" })
        if (subida) { op.error("No se pudo subir la firma", { descripcion: "Revisa tu conexión e inténtalo de nuevo." }); return }
      }
      const r = await guardarFirmante(firmante?.id ?? null, { nombre, cargo, ruta, declaracion: true })
      if (r.ok) { op.exito(firmante ? "Firmante actualizado" : "Firmante añadido"); alGuardar() }
      else { setError(r.mensaje); (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo guardar", { descripcion: r.mensaje }) }
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
          <DialogTitle>{firmante ? "Editar firmante" : "Nuevo firmante"}</DialogTitle>
          <DialogDescription>Los certificados ya emitidos conservan el nombre y la firma que tenían al emitirse.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Field>
            <FieldLabel htmlFor="f-nombre">Nombre completo</FieldLabel>
            <Input id="f-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} disabled={enviando} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-cargo">Cargo</FieldLabel>
            <Input id="f-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={150} disabled={enviando} placeholder="Ej.: Director académico" />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-firma">{firmante?.firma_path ? "Reemplazar firma (opcional)" : "Firma (opcional)"}</FieldLabel>
            <Input id="f-firma" type="file" accept="image/png,image/jpeg" onChange={(e) => elegir(e.target.files?.[0])} disabled={enviando} />
            <FieldDescription>PNG con fondo transparente, hasta 2 MB. Se guarda de forma privada.</FieldDescription>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={declaracion} onChange={(e) => setDeclaracion(e.target.checked)} disabled={enviando} />
            Declaro que esta persona pertenece a la institución y autorizó el uso de su nombre, cargo y firma en los certificados.
          </label>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={enviando} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="animate-spin" aria-hidden />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
