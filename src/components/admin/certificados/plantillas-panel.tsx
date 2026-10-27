"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileDown, Loader2, Pencil, Star, Trash2, Upload } from "lucide-react"

import { LienzoCertificado } from "@/components/certificados/lienzo-certificado"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { actualizarPlantilla, crearPlantilla, eliminarPlantilla, registrarPlantillaPropia } from "@/lib/certificados/acciones"
import { BUCKET_RECURSOS, TAMANO_MAX_FONDO } from "@/lib/certificados/config"
import type { PlantillaCertificado } from "@/lib/certificados/datos"
import { camposPredeterminados, disenoEfectivo, ETIQUETA_BASE, VALORES_DEMOSTRACION, type BasePlantilla } from "@/lib/certificados/diseno"
import { notificar } from "@/lib/notificaciones"
import { TIPOS_COMPROBANTE, tipoPorFirma } from "@/lib/pagos/config"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const BASES_ACADEMIX: Exclude<BasePlantilla, "propia">[] = ["clasico", "ornamental", "moderno"]

type Props = {
  disponible: boolean
  plantillas: PlantillaCertificado[]
  institucionId: string
  institucion: string
  logoUrl: string | null
}

export function PlantillasPanel({ disponible, plantillas, institucionId, institucion, logoUrl }: Props) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [eliminar, setEliminar] = useState<PlantillaCertificado | null>(null)
  const [nombre, setNombre] = useState("")
  const archivo = useRef<HTMLInputElement>(null)
  const valores = { ...VALORES_DEMOSTRACION, institucion }

  async function correr(clave: string, accion: () => Promise<{ ok: boolean; id?: string; mensaje?: string; gravedad?: string }>, textos: { proceso: string; exito: string }, despues?: (id?: string) => void) {
    if (procesando) return
    setProcesando(clave)
    const op = notificar.operacion(textos.proceso)
    try {
      const r = await accion()
      if (r.ok) {
        op.exito(textos.exito)
        if (despues) despues(r.id)
        else router.refresh()
      }
      else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo completar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo completar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  async function subirFondo(f: File | undefined) {
    if (!f || procesando) return
    if (archivo.current) archivo.current.value = ""
    const titulo = nombre.trim() || f.name.replace(/\.[^.]+$/, "").slice(0, 100) || "Plantilla propia"
    if (f.size > TAMANO_MAX_FONDO) return notificar.advertencia("Archivo demasiado grande", { descripcion: "El fondo admite hasta 5 MB." })
    const tipo = tipoPorFirma(new Uint8Array(await f.slice(0, 8).arrayBuffer()))
    if (!tipo) return notificar.advertencia("Formato no admitido", { descripcion: "Sube una imagen PNG o JPG, o un PDF." })
    const ruta = `${institucionId}/fondos/${crypto.randomUUID()}.${TIPOS_COMPROBANTE[tipo]}`
    setProcesando("subir")
    const op = notificar.operacion("Subiendo fondo…")
    try {
      const { error } = await createClient().storage.from(BUCKET_RECURSOS).upload(ruta, f, { contentType: tipo, upsert: false, cacheControl: "0" })
      if (error) { op.error("No se pudo subir el fondo", { descripcion: /bucket|not found/i.test(error.message) ? "El almacenamiento de certificados aún no está creado (migración certificados_v5)." : "Revisa tu conexión e inténtalo de nuevo." }); return }
      const r = await registrarPlantillaPropia({ nombre: titulo, ruta })
      if (r.ok) { op.exito("Plantilla creada", { descripcion: "Ahora ubica los campos sobre tu diseño." }); setNombre(""); router.push(`/admin/certificados/plantillas/${r.id}`) }
      else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo crear la plantilla", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo subir el fondo", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Plantillas de Academix</CardTitle>
          <CardDescription>Diseños originales. Úsalos como base y personaliza la posición, el tamaño y el color de cada campo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-4 md:grid-cols-3">
            {BASES_ACADEMIX.map((b) => (
              <li key={b} className="space-y-2">
                <LienzoCertificado fondo={{ tipo: "base", base: b }} campos={camposPredeterminados(b)} valores={valores} logoUrl={logoUrl} demostracion className="h-auto w-full rounded-md border bg-white" />
                <p className="text-sm font-medium">{ETIQUETA_BASE[b]}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!disponible || procesando !== null}
                    onClick={() => correr(`crear-${b}`, () => crearPlantilla({ nombre: ETIQUETA_BASE[b].split(" (")[0], base: b }), { proceso: "Creando plantilla…", exito: "Plantilla creada" }, (id) => router.push(`/admin/certificados/plantillas/${id}`))}>
                    {procesando === `crear-${b}` && <Loader2 className="animate-spin" aria-hidden />}
                    Usar esta plantilla
                  </Button>
                  <a href={`/admin/certificados/vista-previa?base=${b}`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <FileDown aria-hidden />
                    PDF de muestra
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subir un diseño propio</CardTitle>
          <CardDescription>
            PNG, JPG o PDF en A4 horizontal (máx. 5 MB). Usa un fondo LIMPIO, sin nombres ni fechas impresos: Academix superpone los datos y no puede
            editar textos de la imagen. Solo sube sellos, logotipos o firmas que tu institución esté autorizada a usar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} placeholder="Nombre de la plantilla" aria-label="Nombre de la plantilla" className="sm:max-w-xs" disabled={!disponible} />
          <input ref={archivo} type="file" accept="image/png,image/jpeg,application/pdf" className="sr-only" id="fondo-propio" onChange={(e) => subirFondo(e.target.files?.[0])} disabled={!disponible || procesando !== null} />
          <label htmlFor="fondo-propio" className={cn(buttonVariants({ variant: "outline" }), (!disponible || procesando !== null) && "pointer-events-none opacity-50")}>
            {procesando === "subir" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            Elegir archivo
          </label>
        </CardContent>
      </Card>

      {disponible && (
        <Card>
          <CardHeader>
            <CardTitle>Plantillas de tu institución</CardTitle>
            <CardDescription>La predeterminada se usa cuando un curso no tiene una plantilla asignada.</CardDescription>
          </CardHeader>
          <CardContent>
            {plantillas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no tienes plantillas. Elige una de Academix o sube tu diseño.</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plantillas.map((p) => (
                  <li key={p.id} className={cn("space-y-2 rounded-lg border p-3", !p.activo && "opacity-60")}>
                    <LienzoCertificado
                      fondo={p.base === "propia" ? { tipo: "sin_fondo" } : { tipo: "base", base: p.base }}
                      campos={disenoEfectivo(p.base, p.diseno).campos}
                      valores={valores}
                      logoUrl={logoUrl}
                      demostracion
                      className="h-auto w-full rounded-md border bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="mr-auto text-sm font-medium break-words">{p.nombre}</p>
                      {p.predeterminada && <Badge variant="success">Predeterminada</Badge>}
                      {!p.activo && <Badge variant="outline">Inactiva</Badge>}
                      {p.base === "propia" && <Badge variant="outline">Fondo propio</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/admin/certificados/plantillas/${p.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}><Pencil aria-hidden />Editar</Link>
                      {!p.predeterminada && (
                        <Button size="sm" variant="ghost" disabled={procesando !== null} onClick={() => correr(p.id, () => actualizarPlantilla(p.id, { predeterminada: true }), { proceso: "Actualizando…", exito: "Plantilla predeterminada" })}>
                          <Star aria-hidden />Predeterminar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={procesando !== null} onClick={() => correr(p.id, () => actualizarPlantilla(p.id, { activo: !p.activo }), { proceso: "Actualizando…", exito: p.activo ? "Plantilla desactivada" : "Plantilla activada" })}>
                        {p.activo ? "Desactivar" : "Activar"}
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${p.nombre}`} disabled={procesando !== null} onClick={() => setEliminar(p)}><Trash2 aria-hidden /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={eliminar !== null} onOpenChange={(v) => !v && !procesando && setEliminar(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Eliminar «{eliminar?.nombre}»?</DialogTitle>
            <DialogDescription>Los certificados ya emitidos con ella no cambian (guardan su propia copia del diseño). Los cursos que la usaban pasarán a la predeterminada.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando !== null} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" disabled={procesando !== null}
              onClick={() => eliminar && correr("eliminar", () => eliminarPlantilla(eliminar.id), { proceso: "Eliminando…", exito: "Plantilla eliminada" }, () => { setEliminar(null); router.refresh() })}>
              {procesando === "eliminar" && <Loader2 className="animate-spin" aria-hidden />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
