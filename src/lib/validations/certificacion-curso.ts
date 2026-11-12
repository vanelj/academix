import { z } from "zod"

import { MODALIDADES, type Modalidad } from "@/lib/certificados/config"

/**
 * Condiciones de certificación de un curso (public.certificacion_curso, V5).
 * Compartido por la acción del servidor y el asistente de cursos, que valida
 * localmente con las mismas reglas antes de guardar.
 */

const uuid = z.uuid()

export const certCursoSchema = z
  .object({
    modalidad: z.enum(MODALIDADES),
    importe: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Importe no válido.").or(z.literal("")),
    nota_minima: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Nota no válida.").or(z.literal("")),
    horas_academicas: z.string().trim().regex(/^\d{1,5}$/, "Introduce un número entero de horas.").or(z.literal("")),
    requisitos_adicionales: z.string().trim().max(2000, "Máximo 2000 caracteres."),
    plantilla_id: uuid.nullable(),
    firmante_id: uuid.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.modalidad === "costo_adicional" && !(Number(v.importe) > 0)) ctx.addIssue({ code: "custom", path: ["importe"], message: "Indica el importe del certificado." })
    if (v.nota_minima !== "" && Number(v.nota_minima) > 20) ctx.addIssue({ code: "custom", path: ["nota_minima"], message: "La nota máxima es 20." })
    if (v.horas_academicas !== "" && (Number(v.horas_academicas) < 1 || Number(v.horas_academicas) > 10000)) ctx.addIssue({ code: "custom", path: ["horas_academicas"], message: "Entre 1 y 10 000 horas." })
  })

export type CertificacionValues = z.input<typeof certCursoSchema>

export const CERTIFICACION_INICIAL: CertificacionValues = {
  modalidad: "sin_certificado",
  importe: "",
  nota_minima: "",
  horas_academicas: "",
  requisitos_adicionales: "",
  plantilla_id: null,
  firmante_id: null,
}

/** Valores del formulario a partir de la configuración guardada (null = sin configurar). */
export function valoresCertificacion(config: {
  modalidad: Modalidad
  importe: number
  nota_minima: number | null
  horas_academicas: number | null
  requisitos_adicionales: string | null
  plantilla_id: string | null
  firmante_id: string | null
} | null): CertificacionValues {
  if (!config) return CERTIFICACION_INICIAL
  return {
    modalidad: config.modalidad,
    importe: config.importe > 0 ? config.importe.toFixed(2) : "",
    nota_minima: config.nota_minima == null ? "" : String(config.nota_minima),
    horas_academicas: config.horas_academicas ? String(config.horas_academicas) : "",
    requisitos_adicionales: config.requisitos_adicionales ?? "",
    plantilla_id: config.plantilla_id,
    firmante_id: config.firmante_id,
  }
}
