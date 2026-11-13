/**
 * Firmante del certificado (puro).
 *
 * «Sin firmante» = el certificado se emite solo a nombre de la institución,
 * sin nombre, cargo ni firma de una autoridad. Es válido y verificable por QR.
 * Pero si el CURSO tiene un firmante configurado (su certificado exige firma),
 * no se permite emitir sin él ni con un firmante incompleto.
 */
export type FirmanteBasico = { id: string; nombre: string; activo: boolean; firma_path: string | null }

export function problemaFirmante(opciones: {
  /** firmante_id de las condiciones de certificación del curso (null = la firma es opcional). */
  requerido: string | null
  elegido: string | null
  firmantes: FirmanteBasico[]
}): string | null {
  const { requerido, elegido, firmantes } = opciones
  const exigido = requerido ? firmantes.find((f) => f.id === requerido) : null
  if (requerido && !elegido) {
    return exigido
      ? `Este curso exige la firma de ${exigido.nombre}: elígelo como firmante.`
      : "Este curso exige un firmante que ya no está disponible: configura otro en las condiciones de certificación del curso."
  }
  if (!elegido) return null
  const f = firmantes.find((x) => x.id === elegido)
  if (!f) return "El firmante elegido no existe en tu institución."
  if (!f.activo) return `${f.nombre} está desactivado como firmante.`
  if (!f.firma_path) return `${f.nombre} no tiene firma cargada: súbela en «Firmantes» o elige otro firmante para no emitir un documento incompleto.`
  return null
}
