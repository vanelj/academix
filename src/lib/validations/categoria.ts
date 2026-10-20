import { z } from "zod"

/**
 * Categorías (public.categorias, V4 sin cambios en V5). Pertenecen a UNA
 * institución: id, institucion_id (NOT NULL), nombre (NOT NULL, no vacío),
 * descripcion, activo (default true), created_at.
 * UNIQUE (institucion_id, nombre): el nombre no se repite dentro de la institución.
 *
 * Editables desde el formulario: nombre y descripcion. activo se cambia con su
 * propia acción. id, institucion_id y created_at nunca se envían.
 */
export const CATEGORIA_NOMBRE_MAX = 100
export const CATEGORIA_DESCRIPCION_MAX = 500

export const categoriaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Introduce el nombre de la categoría.")
    .max(CATEGORIA_NOMBRE_MAX, `Máximo ${CATEGORIA_NOMBRE_MAX} caracteres.`),
  descripcion: z
    .string()
    .trim()
    .max(CATEGORIA_DESCRIPCION_MAX, `Máximo ${CATEGORIA_DESCRIPCION_MAX} caracteres.`),
})

export type CategoriaValues = z.infer<typeof categoriaSchema>

export const idCategoriaSchema = z.uuid()

/** Nombre tal como se guarda: sin espacios repetidos ni en los extremos. */
export function normalizarNombre(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim()
}

/**
 * Clave para detectar nombres equivalentes ("Programación" = "programacion").
 * La BD solo impide nombres idénticos; esta comparación evita duplicados
 * que solo difieren en mayúsculas, tildes o espacios.
 */
export function claveNombre(nombre: string): string {
  return normalizarNombre(nombre)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
}

/** Valores listos para la BD: nombre normalizado y descripción vacía → NULL. */
export function categoriaParaGuardar(valores: CategoriaValues) {
  return {
    nombre: normalizarNombre(valores.nombre),
    descripcion: valores.descripcion === "" ? null : valores.descripcion,
  }
}
