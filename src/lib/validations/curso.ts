import { z } from "zod"

/**
 * Cursos (public.cursos, V4 sin cambios en V5):
 *   id, institucion_id, categoria_id (NOT NULL; FK compuesta a categorías de la
 *   MISMA institución), nombre (NOT NULL, no vacío), descripcion,
 *   precio numeric(10,2) >= 0 (precio que muestra el catálogo público),
 *   modalidad (enum con un único valor: 'virtual'),
 *   nota_aprobatoria numeric(4,2) entre 0 y 20 (default 11),
 *   estado ('borrador' | 'publicado' | 'desactivado', default 'borrador'),
 *   created_at.
 *
 * Condiciones (public.condiciones_curso, V5; una fila por curso, opcional):
 *   tipo_cobro ('gratuito' | 'unico' | 'cuotas'), matricula_importe,
 *   importe_curso, permite_reserva, reserva_importe, reserva_plazo_horas,
 *   reserva_descuenta_matricula, requisitos, condiciones_especiales,
 *   actualizado_en. CHECKs de la BD:
 *   - permite_reserva ⇒ reserva_importe > 0 y reserva_plazo_horas no nulo (> 0).
 *   - gratuito ⇒ importes en 0 y sin reserva.
 *
 * El formulario trabaja con cadenas para los importes (sin NaN ni redondeos del
 * navegador); la conversión a número se hace al guardar.
 */

export const ESTADOS_CURSO = ["borrador", "publicado", "desactivado"] as const
export type EstadoCurso = (typeof ESTADOS_CURSO)[number]

export const TIPOS_COBRO = ["gratuito", "unico", "cuotas"] as const
export type TipoCobro = (typeof TIPOS_COBRO)[number]

export const CURSO_NOMBRE_MAX = 150
export const CURSO_DESCRIPCION_MAX = 2000
export const REQUISITOS_MAX = 2000
export const CONDICIONES_ESPECIALES_MAX = 3000
/** Límite de la aplicación para el plazo de reserva (la BD solo exige > 0). */
export const RESERVA_PLAZO_MAX_HORAS = 8760 // 365 días

const PRECIO_MAX = 99_999_999.99 // numeric(10,2)
const IMPORTE_MAX = 9_999_999_999.99 // numeric(12,2)
const formatoMax = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 })

const DECIMAL = /^\d+(\.\d{1,2})?$/

const importe = (max: number) =>
  z
    .string()
    .trim()
    .regex(DECIMAL, "Introduce un importe válido, por ejemplo 150 o 150.50.")
    .refine((v) => Number(v) <= max, `El importe máximo es ${formatoMax(max)}.`)

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max.toLocaleString("es-PE")} caracteres.`)

export const condicionesSchema = z
  .object({
    tipo_cobro: z.enum(TIPOS_COBRO, { error: "Selecciona el tipo de cobro." }),
    matricula_importe: importe(IMPORTE_MAX),
    importe_curso: importe(IMPORTE_MAX),
    permite_reserva: z.boolean(),
    reserva_importe: importe(IMPORTE_MAX),
    reserva_plazo_horas: z.string().trim(),
    reserva_descuenta_matricula: z.boolean(),
    requisitos: texto(REQUISITOS_MAX),
    condiciones_especiales: texto(CONDICIONES_ESPECIALES_MAX),
  })
  .refine((c) => c.tipo_cobro === "gratuito" || !c.permite_reserva || Number(c.reserva_importe) > 0, {
    message: "La reserva debe tener un importe mayor que cero.",
    path: ["reserva_importe"],
    when: (p) => DECIMAL.test(String((p.value as Record<string, unknown>)?.reserva_importe ?? "")),
  })
  .refine(
    (c) => {
      if (c.tipo_cobro === "gratuito" || !c.permite_reserva) return true
      const horas = Number(c.reserva_plazo_horas)
      return /^\d+$/.test(c.reserva_plazo_horas) && horas >= 1 && horas <= RESERVA_PLAZO_MAX_HORAS
    },
    {
      message: `Indica el plazo de la reserva en horas (entre 1 y ${RESERVA_PLAZO_MAX_HORAS.toLocaleString("es-PE")}).`,
      path: ["reserva_plazo_horas"],
      when: () => true,
    }
  )
  .refine(
    (c) =>
      c.tipo_cobro === "gratuito" ||
      !c.permite_reserva ||
      Number(c.reserva_importe) <= Number(c.matricula_importe) + Number(c.importe_curso),
    {
      message: "El pago de la reserva no puede superar el importe total (matrícula + curso).",
      path: ["reserva_importe"],
      when: (p) => {
        const v = p.value as Record<string, unknown>
        return ["reserva_importe", "matricula_importe", "importe_curso"].every((k) => DECIMAL.test(String(v?.[k] ?? "")))
      },
    }
  )

export type CondicionesValues = z.infer<typeof condicionesSchema>

export const cursoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Introduce el nombre del curso.")
    .max(CURSO_NOMBRE_MAX, `Máximo ${CURSO_NOMBRE_MAX} caracteres.`),
  categoria_id: z.uuid({ error: "Selecciona una categoría válida." }),
  descripcion: texto(CURSO_DESCRIPCION_MAX),
  precio: importe(PRECIO_MAX),
  nota_aprobatoria: z
    .string()
    .trim()
    .regex(DECIMAL, "Introduce una nota válida, por ejemplo 11 o 10.5.")
    .refine((v) => Number(v) >= 0 && Number(v) <= 20, "La nota aprobatoria debe estar entre 0 y 20."),
  /** Si es false, no se guardan condiciones (solo al crear o si aún no existen). */
  configurarCondiciones: z.boolean(),
  condiciones: condicionesSchema,
})

export type CursoValues = z.infer<typeof cursoSchema>

export const idCursoSchema = z.uuid()

export const CONDICIONES_INICIALES: CondicionesValues = {
  tipo_cobro: "unico",
  matricula_importe: "0",
  importe_curso: "0",
  permite_reserva: false,
  reserva_importe: "0",
  reserva_plazo_horas: "",
  reserva_descuenta_matricula: true,
  requisitos: "",
  condiciones_especiales: "",
}

export const CURSO_INICIAL: CursoValues = {
  nombre: "",
  categoria_id: "",
  descripcion: "",
  precio: "0",
  nota_aprobatoria: "11",
  configurarCondiciones: false,
  condiciones: CONDICIONES_INICIALES,
}

/** Columnas de cursos que envía el formulario (estado e institución, nunca). */
export function cursoParaGuardar(v: CursoValues) {
  return {
    nombre: v.nombre.replace(/\s+/g, " ").trim(),
    categoria_id: v.categoria_id,
    descripcion: v.descripcion === "" ? null : v.descripcion,
    precio: Number(v.precio),
    nota_aprobatoria: Number(v.nota_aprobatoria),
  }
}

/**
 * Condiciones listas para la BD, coherentes con sus CHECK: un curso gratuito
 * guarda importes en 0 y sin reserva; sin reserva, sus campos vuelven al valor
 * por defecto.
 */
export function condicionesParaGuardar(c: CondicionesValues) {
  const gratuito = c.tipo_cobro === "gratuito"
  const reserva = !gratuito && c.permite_reserva
  return {
    tipo_cobro: c.tipo_cobro,
    matricula_importe: gratuito ? 0 : Number(c.matricula_importe),
    importe_curso: gratuito ? 0 : Number(c.importe_curso),
    permite_reserva: reserva,
    reserva_importe: reserva ? Number(c.reserva_importe) : 0,
    reserva_plazo_horas: reserva ? Number(c.reserva_plazo_horas) : null,
    reserva_descuenta_matricula: reserva ? c.reserva_descuenta_matricula : true,
    requisitos: c.requisitos === "" ? null : c.requisitos,
    condiciones_especiales: c.condiciones_especiales === "" ? null : c.condiciones_especiales,
  }
}

/**
 * Costo total del curso según sus condiciones: matrícula + importe del curso
 * (en "cuotas", el importe del curso se cobra después según el plan de cuotas).
 */
export function importeTotalCondiciones(c: { tipo_cobro: TipoCobro; matricula_importe: number; importe_curso: number }) {
  return c.tipo_cobro === "gratuito" ? 0 : c.matricula_importe + c.importe_curso
}
