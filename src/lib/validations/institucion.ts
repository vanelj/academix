import { z } from "zod"

import { rucEsValido, rucTieneOnceDigitos } from "@/lib/validations/ruc"

/**
 * Datos editables de public.instituciones (V4/V5). Solo las columnas con
 * GRANT UPDATE para authenticated: nombre, ruc, correo, telefono, direccion
 * (logo_url se gestiona aparte, con la subida del logotipo).
 * id, activo y created_at no se envían nunca.
 *
 * Reglas: nombre obligatorio y no vacío (check de la BD); RUC opcional, pero si
 * se escribe debe ser un RUC peruano válido (11 dígitos y dígito verificador).
 * El resto es opcional.
 */
const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`)

export const institucionSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Introduce el nombre de la institución.")
    .max(200, "Máximo 200 caracteres."),
  // Opcional (configuración inicial). Si se escribe: 11 dígitos y dígito verificador
  // correcto. La unicidad la sigue garantizando la restricción UNIQUE de la BD.
  ruc: z
    .string()
    .trim()
    .refine((v) => v === "" || rucTieneOnceDigitos(v), {
      message: "El RUC debe tener exactamente 11 dígitos.",
    })
    .refine((v) => v === "" || !rucTieneOnceDigitos(v) || rucEsValido(v), {
      message: "El RUC no es válido: revisa los dígitos (el dígito verificador no coincide).",
    }),
  correo: opcional(254).refine((v) => v === "" || z.email().safeParse(v).success, {
    message: "Introduce un correo electrónico válido.",
  }),
  telefono: opcional(30),
  direccion: opcional(300),
})

export type InstitucionValues = z.infer<typeof institucionSchema>

/** Campos vacíos → NULL en la BD (columnas opcionales). */
export function institucionParaGuardar(valores: InstitucionValues) {
  const vacioANull = (valor: string) => (valor === "" ? null : valor)
  return {
    nombre: valores.nombre,
    ruc: vacioANull(valores.ruc),
    correo: vacioANull(valores.correo),
    telefono: vacioANull(valores.telefono),
    direccion: vacioANull(valores.direccion),
  }
}
