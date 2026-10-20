import { z } from "zod"

// Login único para administrador, docente y estudiante (Supabase Auth: correo + contraseña).
export const loginSchema = z.object({
  correo: z
    .string()
    .trim()
    .min(1, "Introduce tu correo electrónico.")
    .pipe(z.email("Introduce un correo electrónico válido.")),
  password: z.string().min(1, "Introduce tu contraseña."),
})

export type LoginValues = z.infer<typeof loginSchema>

export const loginDefaultValues: LoginValues = {
  correo: "",
  password: "",
}
