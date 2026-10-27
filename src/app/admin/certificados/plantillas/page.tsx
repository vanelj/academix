import type { Metadata } from "next"

import { AvisoCertificados } from "@/components/admin/certificados/certificado-ui"
import { PlantillasPanel } from "@/components/admin/certificados/plantillas-panel"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerRecursosCertificado, type PlantillaCertificado } from "@/lib/certificados/datos"
import { obtenerInstitucion } from "@/lib/institucion/datos"

import { EncabezadoCertificados } from "../encabezado"

export const metadata: Metadata = {
  title: "Plantillas de certificado · Academix",
}

export default async function PlantillasPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const pagina = (contenido: React.ReactNode) => (
    <>
      <EncabezadoCertificados actual="plantillas" />
      {contenido}
    </>
  )
  if (!institucionId) return pagina(<AvisoCertificados texto="No se encontró la institución asociada a tu cuenta." />)

  let disponible = false
  let plantillas: PlantillaCertificado[] = []
  let institucion: { nombre: string; logo_url: string | null } = { nombre: "Tu institución", logo_url: null }
  try {
    const [recursos, inst] = await Promise.all([obtenerRecursosCertificado(institucionId), obtenerInstitucion(institucionId)])
    if (recursos.disponible) {
      disponible = true
      plantillas = recursos.plantillas
    }
    if (inst) institucion = inst
  } catch {
    return pagina(<AvisoCertificados texto="No se pudieron cargar las plantillas. Recarga la página en unos minutos." />)
  }
  return pagina(
    <>
      {!disponible && (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          Modo demostración: la migración «certificados_v5» está pendiente. Puedes ver las plantillas y descargar PDF de muestra con datos ficticios;
          crear, guardar y emitir estará disponible al aplicarla.
        </p>
      )}
      <PlantillasPanel disponible={disponible} plantillas={plantillas} institucionId={institucionId} institucion={institucion.nombre} logoUrl={institucion.logo_url} />
    </>
  )
}
