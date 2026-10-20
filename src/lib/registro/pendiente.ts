import { z } from "zod"

/**
 * Registro institucional pendiente de confirmación de correo.
 *
 * Con la confirmación de correo activa, signUp() no devuelve sesión y la RPC
 * registrar_institucion() no puede ejecutarse todavía. Los datos del formulario
 * se guardan en user_metadata de la cuenta de Supabase Auth y, cuando la persona
 * confirma su correo e inicia sesión, se envían a la RPC.
 *
 * Seguridad: user_metadata es editable por su propio dueño, por eso NO concede
 * ningún permiso. Solo contiene los mismos datos que la persona podría escribir
 * en el formulario. Quien decide es registrar_institucion(): exige sesión, que la
 * cuenta no tenga perfil (una sola institución por cuenta) y fija el rol admin.
 * Los datos se vuelven a validar con este esquema antes de llamarla.
 */

export const CLAVE_REGISTRO_PENDIENTE = "registro_institucion_pendiente"

const requerido = (mensaje: string) => z.string().trim().min(1, mensaje).max(200)
const opcional = z.string().trim().max(200)

export const datosRegistroSchema = z.object({
  institucion: z.object({
    nombre: requerido("Introduce el nombre de la institución."),
    ruc: opcional,
    correo: opcional.refine((v) => v === "" || z.email().safeParse(v).success, {
      message: "Introduce un correo electrónico válido.",
    }),
    telefono: opcional,
    direccion: opcional,
  }),
  administrador: z.object({
    nombres: requerido("Introduce los nombres del administrador."),
    apellidos: requerido("Introduce los apellidos del administrador."),
    dni: opcional,
  }),
})

export type DatosRegistro = z.infer<typeof datosRegistroSchema>

/** Lee y valida el registro pendiente guardado en user_metadata; null si no hay. */
export function leerRegistroPendiente(
  metadata: Record<string, unknown> | null | undefined
): DatosRegistro | null {
  const resultado = datosRegistroSchema.safeParse(metadata?.[CLAVE_REGISTRO_PENDIENTE])
  return resultado.success ? resultado.data : null
}

/** Parámetros reales de public.registrar_institucion() (V4, sin cambios en V5). */
export function parametrosRegistrarInstitucion(datos: DatosRegistro) {
  const vacioANull = (valor: string) => (valor === "" ? null : valor)
  return {
    p_nombre: datos.institucion.nombre,
    p_nombres: datos.administrador.nombres,
    p_apellidos: datos.administrador.apellidos,
    p_ruc: vacioANull(datos.institucion.ruc),
    p_correo: vacioANull(datos.institucion.correo),
    p_telefono: vacioANull(datos.institucion.telefono),
    p_direccion: vacioANull(datos.institucion.direccion),
    p_dni: vacioANull(datos.administrador.dni),
  }
}
