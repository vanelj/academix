import { z } from "zod"

/**
 * Registro de estudiante (RPC V5 public.registrar_estudiante):
 *   p_nombres, p_apellidos (obligatorios), p_dni, p_telefono (opcionales).
 * La RPC crea un perfil GLOBAL (institucion_id NULL) con el rol estudiante: el
 * estudiante puede matricularse en cursos de distintas instituciones.
 */
const nombre = (mensaje: string) => z.string().trim().min(1, mensaje).max(100, "Máximo 100 caracteres.")

export const estudianteSchema = z.object({
  nombres: nombre("Introduce tus nombres."),
  apellidos: nombre("Introduce tus apellidos."),
  dni: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9]{6,15}$/.test(v), {
      message: "Introduce un documento válido (de 6 a 15 letras o números, sin espacios).",
    }),
  telefono: z
    .string()
    .trim()
    .max(30, "Máximo 30 caracteres.")
    .refine((v) => v === "" || /^[0-9+()\s-]{6,30}$/.test(v), { message: "Introduce un teléfono válido." }),
})

export type EstudianteValues = z.infer<typeof estudianteSchema>
