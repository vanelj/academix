import { z } from "zod"

/**
 * Grupos (public.grupos, V4/V5): cada apertura de un curso.
 *   curso_id (FK compuesta a cursos de la MISMA institución), docente_id
 *   (opcional; FK compuesta a perfiles de la misma institución + disparador que
 *   exige perfil activo y rol docente habilitado), codigo (UNIQUE por curso),
 *   vacantes (> 0), fecha_inicio, fecha_fin (>= inicio),
 *   estado ('programado' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado').
 *
 * Horarios (public.horarios): dia_semana (1 = lunes … 7 = domingo),
 *   hora_inicio, hora_fin (> inicio), enlace_clase (privado: solo admin,
 *   docente del grupo y matriculados). Se borran en cascada con su grupo.
 */

export const ESTADOS_GRUPO = ["programado", "abierto", "en_curso", "cerrado", "cancelado"] as const
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number]

/** Cambios de estado permitidos por la aplicación (la BD no los restringe). */
export const TRANSICIONES: Record<EstadoGrupo, EstadoGrupo[]> = {
  programado: ["abierto", "cancelado"],
  abierto: ["programado", "en_curso", "cancelado"],
  en_curso: ["cerrado", "cancelado"],
  cerrado: [],
  cancelado: ["programado"],
}

export const VACANTES_MAX = 10000
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const fecha = (mensaje: string) =>
  z
    .string()
    .regex(FECHA, mensaje)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), mensaje)

export const grupoSchema = z
  .object({
    curso_id: z.uuid({ error: "Selecciona un curso." }),
    codigo: z
      .string()
      .trim()
      .min(1, "Introduce el código del grupo.")
      .max(30, "Máximo 30 caracteres.")
      .regex(/^[\p{L}\p{N} _.-]+$/u, "Usa letras, números, espacios, guiones o puntos."),
    vacantes: z
      .string()
      .trim()
      .regex(/^\d+$/, "Introduce un número entero.")
      .refine((v) => Number(v) >= 1 && Number(v) <= VACANTES_MAX, `Entre 1 y ${VACANTES_MAX.toLocaleString("es-PE")} vacantes.`),
    fecha_inicio: fecha("Introduce la fecha de inicio."),
    fecha_fin: fecha("Introduce la fecha de fin."),
    /** "" = sin docente asignado. */
    docente_id: z.union([z.literal(""), z.uuid({ error: "Selecciona un docente válido." })]),
  })
  .refine((g) => g.fecha_fin >= g.fecha_inicio, {
    message: "La fecha de fin no puede ser anterior a la de inicio.",
    path: ["fecha_fin"],
    when: (p) => {
      const v = p.value as Record<string, unknown>
      return FECHA.test(String(v?.fecha_inicio ?? "")) && FECHA.test(String(v?.fecha_fin ?? ""))
    },
  })

export type GrupoValues = z.infer<typeof grupoSchema>

export const GRUPO_INICIAL: GrupoValues = {
  curso_id: "",
  codigo: "",
  vacantes: "20",
  fecha_inicio: "",
  fecha_fin: "",
  docente_id: "",
}

export const horarioSchema = z
  .object({
    dia_semana: z.string().regex(/^[1-7]$/, "Selecciona el día."),
    hora_inicio: z.string().regex(HORA, "Hora no válida."),
    hora_fin: z.string().regex(HORA, "Hora no válida."),
    enlace_clase: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres.")
      .refine((v) => {
        if (v === "") return true
        try {
          return new URL(v).protocol === "https:"
        } catch {
          return false
        }
      }, "Introduce un enlace válido que empiece por https://"),
  })
  .refine((h) => h.hora_fin > h.hora_inicio, {
    message: "La hora de fin debe ser posterior a la de inicio.",
    path: ["hora_fin"],
    when: (p) => {
      const v = p.value as Record<string, unknown>
      return HORA.test(String(v?.hora_inicio ?? "")) && HORA.test(String(v?.hora_fin ?? ""))
    },
  })

export type HorarioValues = z.infer<typeof horarioSchema>

export const HORARIO_INICIAL: HorarioValues = { dia_semana: "1", hora_inicio: "19:00", hora_fin: "21:00", enlace_clase: "" }

export const idSchema = z.uuid()

export function grupoParaGuardar(v: GrupoValues) {
  return {
    codigo: v.codigo.replace(/\s+/g, " ").trim(),
    vacantes: Number(v.vacantes),
    fecha_inicio: v.fecha_inicio,
    fecha_fin: v.fecha_fin,
  }
}

export function horarioParaGuardar(v: HorarioValues) {
  return {
    dia_semana: Number(v.dia_semana),
    hora_inicio: v.hora_inicio,
    hora_fin: v.hora_fin,
    enlace_clase: v.enlace_clase === "" ? null : v.enlace_clase,
  }
}

/** "19:00:00" → "19:00" */
export const horaCorta = (h: string) => h.slice(0, 5)

/** ¿Se solapan dos franjas del mismo día? */
export function seSolapan(a: { inicio: string; fin: string }, b: { inicio: string; fin: string }) {
  return a.inicio < b.fin && b.inicio < a.fin
}
