import type { Metadata } from "next"

import { AvisoCertificados, MIGRACION_PENDIENTE } from "@/components/admin/certificados/certificado-ui"
import { ElegiblesPanel } from "@/components/admin/certificados/elegibles-panel"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerElegibles, obtenerRecursosCertificado, type Elegible, type Firmante, type PlantillaCertificado } from "@/lib/certificados/datos"

import { EncabezadoCertificados } from "../encabezado"

export const metadata: Metadata = {
  title: "Certificados por emitir · Academix",
}

type Datos = { elegibles: Elegible[]; plantillas: PlantillaCertificado[]; firmantes: Firmante[] }

async function leer(institucionId: string): Promise<"error" | "no_disponible" | Datos> {
  try {
    const [recursos, elegibles] = await Promise.all([obtenerRecursosCertificado(institucionId), obtenerElegibles(institucionId)])
    if (!recursos.disponible || !elegibles.disponible) return "no_disponible"
    return { elegibles: elegibles.elegibles, plantillas: recursos.plantillas, firmantes: recursos.firmantes }
  } catch {
    return "error"
  }
}

export default async function ElegiblesPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const r = institucionId ? await leer(institucionId) : null
  return (
    <>
      <EncabezadoCertificados actual="elegibles" />
      {r === null ? (
        <AvisoCertificados texto="No se encontró la institución asociada a tu cuenta." />
      ) : r === "no_disponible" ? (
        <AvisoCertificados texto={MIGRACION_PENDIENTE} />
      ) : r === "error" ? (
        <AvisoCertificados texto="No se pudieron cargar las matrículas por certificar. Recarga la página en unos minutos." />
      ) : (
        <ElegiblesPanel elegibles={r.elegibles} plantillas={r.plantillas} firmantes={r.firmantes} />
      )}
    </>
  )
}
