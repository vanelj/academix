import { z } from "zod"

import { PASSWORD_MIN_LENGTH } from "@/lib/validations/registro"

export const recuperarSchema = z.object({
  correo: z
    .string()
    .trim()
    .min(1, "Introduce tu correo electrónico.")
    .pipe(z.email("Introduce un correo electrónico válido.")),
})

export type RecuperarValues = z.infer<typeof recuperarSchema>

const camposContrasena = z.object({
  password: z
    .string()
    .min(1, "Introduce una contraseña nueva.")
    .min(
      PASSWORD_MIN_LENGTH,
      `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
    ),
  confirmarPassword: z.string().min(1, "Confirma la contraseña nueva."),
})

// Misma política que el registro: mínimo de Supabase Auth y confirmación coincidente.
export const restablecerSchema = camposContrasena.refine(
  (datos) => datos.password === datos.confirmarPassword,
  {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
    when: (payload) => camposContrasena.safeParse(payload.value).success,
  }
)

export type RestablecerValues = z.infer<typeof restablecerSchema>
