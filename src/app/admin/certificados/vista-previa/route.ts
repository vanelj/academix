import { institucionDelAdmin } from "@/lib/auth/contexto"
import { obtenerPlantilla, type Firmante } from "@/lib/certificados/datos"
import { BASES, type BasePlantilla } from "@/lib/certificados/diseno"
import { pdfVistaPrevia } from "@/lib/certificados/emision"
import { obtenerInstitucion } from "@/lib/institucion/datos"
import { createClient } from "@/lib/supabase/server"

/**
 * PDF de DEMOSTRACIÓN (datos ficticios en memoria, marca «SIN VALIDEZ», QR sin
 * enlace). Solo para el administrador; no registra nada ni genera códigos.
 *   ?base=clasico|ornamental|moderno   plantilla de Academix
 *   ?plantilla=<uuid>                  plantilla de la institución (diseño guardado)
 *   &firmante=<uuid>                   opcional: nombre, cargo y firma del firmante
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function GET(request: Request) {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return new Response("No autorizado", { status: 401 })
  const q = new URL(request.url).searchParams
  const plantillaId = q.get("plantilla")
  const baseQ = q.get("base") ?? "clasico"
  const firmanteId = q.get("firmante")

  try {
    const plantilla = plantillaId && UUID.test(plantillaId) ? await obtenerPlantilla(institucionId, plantillaId) : null
    if (plantillaId && !plantilla) return new Response("Plantilla no encontrada", { status: 404 })
    const base: BasePlantilla = (BASES as readonly string[]).includes(baseQ) && baseQ !== "propia" ? (baseQ as BasePlantilla) : "clasico"
    let firmante: Firmante | null = null
    if (firmanteId && UUID.test(firmanteId)) {
      const supabase = await createClient()
      const { data } = await supabase.from("firmantes_certificado").select("id, nombre, cargo, firma_path, activo, actualizado_en")
        .eq("institucion_id", institucionId).eq("id", firmanteId).maybeSingle()
      firmante = (data as Firmante | null) ?? null
    }
    const inst = await obtenerInstitucion(institucionId).catch(() => null)
    const bytes = await pdfVistaPrevia({ base, plantilla, institucion: { nombre: inst?.nombre ?? "Tu institución", logo_url: inst?.logo_url ?? null }, firmante })
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="vista-previa-sin-validez.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    })
  } catch (e) {
    console.error("[certificados] vista previa", e instanceof Error ? e.message : e)
    return new Response("No se pudo generar la vista previa", { status: 500 })
  }
}
