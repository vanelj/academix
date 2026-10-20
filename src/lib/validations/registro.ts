import { z } from "zod"

/**
 * Validación del registro de institución y su administrador.
 *
 * Los campos coinciden con lo que acepta la RPC public.registrar_institucion()
 * de la base de datos V4 (docs/base_datos_plataforma_cursos.sql):
 *   - institucion   → p_nombre, p_ruc, p_correo, p_telefono, p_direccion
 *   - administrador → p_nombres, p_apellidos, p_dni
 *                     + Supabase Auth (correo, password)
 * La RPC no recibe el teléfono del administrador, por eso no se pide aquí.
 *
 * Obligatorios solo los que son `not null` en la base de datos, más el correo
 * y la contraseña que exige Supabase Auth.
 */

// Mínimo por defecto de Supabase Auth.
export const PASSWORD_MIN_LENGTH = 6

const requerido = (mensaje: string) => z.string().trim().min(1, mensaje)

const opcional = z.string().trim()

const correoOpcional = z
  .string()
  .trim()
  .refine((valor) => valor === "" || z.email().safeParse(valor).success, {
    message: "Introduce un correo electrónico válido.",
  })

const passwordFields = z.object({
  password: z
    .string()
    .min(1, "Introduce una contraseña.")
    .min(
      PASSWORD_MIN_LENGTH,
      `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
    ),
  confirmarPassword: z.string().min(1, "Confirma la contraseña."),
})

export const registroSchema = z.object({
  institucion: z.object({
    nombre: requerido("Introduce el nombre de la institución."),
    ruc: opcional,
    correo: correoOpcional,
    telefono: opcional,
    direccion: opcional,
  }),
  administrador: z
    .object({
      nombres: requerido("Introduce los nombres del administrador."),
      apellidos: requerido("Introduce los apellidos del administrador."),
      dni: opcional,
      correo: z
        .string()
        .trim()
        .min(1, "Introduce el correo electrónico del administrador.")
        .pipe(z.email("Introduce un correo electrónico válido.")),
      ...passwordFields.shape,
    })
    .refine((datos) => datos.password === datos.confirmarPassword, {
      message: "Las contraseñas no coinciden.",
      path: ["confirmarPassword"],
      // Comprueba la coincidencia aunque otros campos del administrador sean inválidos.
      when: (payload) => passwordFields.safeParse(payload.value).success,
    }),
})

export type RegistroValues = z.infer<typeof registroSchema>

export const registroDefaultValues: RegistroValues = {
  institucion: {
    nombre: "",
    ruc: "",
    correo: "",
    telefono: "",
    direccion: "",
  },
  administrador: {
    nombres: "",
    apellidos: "",
    dni: "",
    correo: "",
    password: "",
    confirmarPassword: "",
  },
}
