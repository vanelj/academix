import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { EditorPlantilla } from "@/components/admin/certificados/editor-plantilla"
import type { FondoLienzo } from "@/components/certificados/lienzo-certificado"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { BUCKET_RECURSOS } from "@/lib/certificados/config"
import { obtenerPlantilla } from "@/lib/certificados/datos"
import { disenoEfectivo, ETIQUETA_BASE, VALORES_DEMOSTRACION } from "@/lib/certificados/diseno"
import { obtenerInstitucion } from "@/lib/institucion/datos"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Editor de plantilla · Academix",
}

export default async function EditorPlantillaPage({ params }: PageProps<"/admin/certificados/plantillas/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  const [plantilla, institucion] = await Promise.all([obtenerPlantilla(institucionId, id), obtenerInstitucion(institucionId).catch(() => null)])
  // Una plantilla de otra institución se trata como inexistente.
  if (!plantilla) notFound()

  // Fondo propio: enlace firmado de 10 min solo para mostrarlo en el editor (archivo privado).
  let fondo: FondoLienzo = { tipo: "base", base: plantilla.base }
  if (plantilla.base === "propia") {
    if (plantilla.fondo_tipo === "application/pdf" || !plantilla.fondo_path) fondo = { tipo: "pdf" }
    else {
      const supabase = await createClient()
      const { data } = await supabase.storage.from(BUCKET_RECURSOS).createSignedUrl(plantilla.fondo_path, 600)
      fondo = data?.signedUrl ? { tipo: "imagen", url: data.signedUrl } : { tipo: "sin_fondo" }
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <Link href="/admin/certificados/plantillas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a plantillas
        </Link>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight break-words">{plantilla.nombre}</h2>
          <p className="text-sm text-muted-foreground">
            {ETIQUETA_BASE[plantilla.base]}
            {plantilla.predeterminada ? " · predeterminada" : ""}
            {!plantilla.activo ? " · inactiva" : ""}
          </p>
        </div>
      </div>
      <EditorPlantilla
        plantillaId={plantilla.id}
        base={plantilla.base}
        inicial={disenoEfectivo(plantilla.base, plantilla.diseno).campos}
        fondo={fondo}
        logoUrl={institucion?.logo_url ?? null}
        valores={{ ...VALORES_DEMOSTRACION, institucion: institucion?.nombre ?? VALORES_DEMOSTRACION.institucion }}
      />
    </>
  )
}
