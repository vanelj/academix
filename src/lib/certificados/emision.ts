import type { ContenidoCertificado, Firmante, PlantillaCertificado } from "@/lib/certificados/datos"
import {
  BASES,
  disenoEfectivo,
  MARCA_DEMOSTRACION,
  VALORES_DEMOSTRACION,
  type BasePlantilla,
  type ValoresCertificado,
} from "@/lib/certificados/diseno"
import { generarPdfCertificado } from "@/lib/certificados/pdf"
import { cargarFirma, cargarFondo, cargarLogo, urlVerificacion, valoresDesdeContenido } from "@/lib/certificados/recursos"

/**
 * Armado del PDF (SOLO servidor).
 *
 * - Emitido: SIEMPRE desde certificados_contenido (copia fija tomada al emitir:
 *   datos, diseño, fondo y firma). Si la institución cambia luego su plantilla,
 *   el certificado emitido no cambia. Los archivos de fondo y firma son
 *   inmutables en Storage (sin UPDATE/DELETE).
 * - Vista previa: datos ficticios EN MEMORIA, marca «DEMOSTRACIÓN — SIN
 *   VALIDEZ» y QR sin enlace de verificación. No se guarda nada.
 */

const esBase = (b: string): b is BasePlantilla => (BASES as readonly string[]).includes(b)

export async function pdfEmitido(c: ContenidoCertificado): Promise<Uint8Array> {
  const base = esBase(c.plantilla_base) ? c.plantilla_base : "clasico"
  const valores = valoresDesdeContenido(c.datos)
  const codigo = valores.codigo ?? ""
  const [fondo, logo, firma] = await Promise.all([
    base === "propia" ? cargarFondo(c.fondo_path, c.fondo_tipo) : Promise.resolve(null),
    cargarLogo(typeof c.datos.logo_url === "string" ? c.datos.logo_url : null),
    cargarFirma(c.firma_path),
  ])
  if (base === "propia" && !fondo) throw new Error("No se pudo leer el fondo de la plantilla del certificado.")
  return generarPdfCertificado({
    base,
    diseno: disenoEfectivo(base, c.diseno),
    valores,
    fondo,
    logo,
    firma,
    qr: urlVerificacion(codigo),
    demostracion: false,
    titulo: `Certificado ${codigo} · ${valores.curso ?? ""}`,
  })
}

export async function pdfVistaPrevia(opciones: {
  base: BasePlantilla
  plantilla: PlantillaCertificado | null
  institucion: { nombre: string; logo_url: string | null }
  firmante: Firmante | null
}): Promise<Uint8Array> {
  const { plantilla, firmante } = opciones
  const base = plantilla ? plantilla.base : opciones.base
  const valores: ValoresCertificado = {
    ...VALORES_DEMOSTRACION,
    institucion: opciones.institucion.nombre,
    ...(firmante ? { firmante: firmante.nombre, cargo: firmante.cargo } : {}),
  }
  const [fondo, logo, firma] = await Promise.all([
    base === "propia" && plantilla ? cargarFondo(plantilla.fondo_path, plantilla.fondo_tipo) : Promise.resolve(null),
    cargarLogo(opciones.institucion.logo_url),
    firmante ? cargarFirma(firmante.firma_path) : Promise.resolve(null),
  ])
  return generarPdfCertificado({
    base,
    diseno: disenoEfectivo(base, plantilla?.diseno),
    valores,
    fondo,
    logo,
    firma,
    qr: MARCA_DEMOSTRACION,
    demostracion: true,
    titulo: `Vista previa — ${MARCA_DEMOSTRACION}`,
  })
}
