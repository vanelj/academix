import { z } from "zod"

/**
 * Docentes. En V5 un docente es un perfil de la institución (public.perfiles)
 * con el rol 'docente' en public.usuario_roles. Columnas editables del perfil
 * (GRANT UPDATE): nombres, apellidos, dni, telefono (y activo).
 * - nombres y apellidos: NOT NULL y no vacíos (CHECK).
 * - dni: opcional; UNIQUE (institucion_id, dni).
 * El correo vive en Supabase Auth y solo se indica al crear la cuenta.
 */

const nombre = (mensaje: string) => z.string().trim().min(1, mensaje).max(100, "Máximo 100 caracteres.")

export const datosDocenteSchema = z.object({
  nombres: nombre("Introduce los nombres del docente."),
  apellidos: nombre("Introduce los apellidos del docente."),
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

export const nuevoDocenteSchema = datosDocenteSchema.extend({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Introduce el correo del docente.")
    .max(254, "Máximo 254 caracteres.")
    .pipe(z.email("Introduce un correo electrónico válido.")),
})

export type DatosDocenteValues = z.infer<typeof datosDocenteSchema>
export type NuevoDocenteValues = z.infer<typeof nuevoDocenteSchema>

export const idPerfilSchema = z.uuid()

export const DOCENTE_INICIAL: NuevoDocenteValues = { nombres: "", apellidos: "", dni: "", telefono: "", correo: "" }

/** Columnas del perfil listas para la BD (vacío → NULL; DNI en mayúsculas). */
export function perfilParaGuardar(v: DatosDocenteValues) {
  return {
    nombres: v.nombres.replace(/\s+/g, " "),
    apellidos: v.apellidos.replace(/\s+/g, " "),
    dni: v.dni === "" ? null : v.dni.toUpperCase(),
    telefono: v.telefono === "" ? null : v.telefono,
  }
}
