/** Buckets privados de la migración certificados_v5 (rutas <institucion>/...). */
export const BUCKET_RECURSOS = "certificados-recursos"
export const BUCKET_EMITIDOS = "certificados-emitidos"

/** Vigencia de los enlaces firmados de descarga, en segundos. */
export const VIGENCIA_ENLACE_CERTIFICADO = 120

/** Fondos propios: PNG, JPG o PDF de hasta 5 MB. Firmas: PNG o JPG de hasta 2 MB. */
export const TAMANO_MAX_FONDO = 5 * 1024 * 1024
export const TAMANO_MAX_FIRMA = 2 * 1024 * 1024

export const MODALIDADES = ["sin_certificado", "gratuito", "incluido", "costo_adicional"] as const
export type Modalidad = (typeof MODALIDADES)[number]

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  sin_certificado: "Sin certificado",
  gratuito: "Certificado gratuito",
  incluido: "Incluido en el precio del curso",
  costo_adicional: "Con costo adicional",
}

export const DESCRIPCION_MODALIDAD: Record<Modalidad, string> = {
  sin_certificado: "El curso no entrega certificado.",
  gratuito: "Quien aprueba recibe el certificado sin pagar nada más.",
  incluido: "El costo del certificado ya forma parte del precio del curso.",
  costo_adicional: "El certificado es opcional y se paga aparte. Aprobar el curso no obliga a pagarlo.",
}
