import type { CursoValues, TipoCobro } from "@/lib/validations/curso"

/**
 * Lógica pura del asistente de cursos (sin React ni Supabase): pasos, campos de
 * cada paso, qué se envía al guardar un paso y cuándo un paso está completo.
 */

export const PASOS = [
  { numero: 1, titulo: "Información básica", descripcion: "Nombre, categoría, descripción y portada." },
  { numero: 2, titulo: "Características", descripcion: "Modalidad, nota aprobatoria y requisitos." },
  { numero: 3, titulo: "Precios y condiciones", descripcion: "Cobro, matrícula, reserva y cuotas." },
  { numero: 4, titulo: "Grupos y docentes", descripcion: "Grupos, fechas, vacantes, horarios y docentes." },
  { numero: 5, titulo: "Certificación", descripcion: "Modalidad, costo, plantilla y requisitos." },
  { numero: 6, titulo: "Revisar y publicar", descripcion: "Resumen final y publicación." },
] as const

export type NumeroPaso = 1 | 2 | 3 | 4 | 5 | 6
export const TOTAL_PASOS = PASOS.length

/** Resultado de una operación pendiente coordinada por el botón del asistente. */
export type ResultadoGuardadoAsistente =
  | { ok: true; avisos?: string[]; guardado?: boolean }
  | { ok: false; mensaje: string }

export type GuardadorAsistente = () => Promise<ResultadoGuardadoAsistente>
export type RegistrarGuardadorAsistente = (
  clave: string,
  descripcion: string,
  guardar: GuardadorAsistente | null,
  pendiente?: boolean,
) => void

/** Campos del formulario que edita cada paso (los pasos 4–6 guardan por su cuenta). */
export const CAMPOS_PASO = {
  1: ["nombre", "categoria_id", "descripcion"],
  2: ["nota_aprobatoria", "condiciones.requisitos", "condiciones.condiciones_especiales"],
  3: [
    "precio",
    "condiciones.tipo_cobro",
    "condiciones.matricula_importe",
    "condiciones.importe_curso",
    "condiciones.permite_reserva",
    "condiciones.reserva_importe",
    "condiciones.reserva_plazo_horas",
    "condiciones.reserva_descuenta_matricula",
  ],
} as const satisfies Record<1 | 2 | 3, readonly string[]>

export type PasoFormulario = keyof typeof CAMPOS_PASO
export type CampoPaso = (typeof CAMPOS_PASO)[PasoFormulario][number]

/** Requisitos y condiciones particulares viven en condiciones_curso (se guardan con el paso 3). */
const CAMPOS_EN_CONDICIONES_DEL_PASO_2 = ["condiciones.requisitos", "condiciones.condiciones_especiales"] as const

export function obtener(valores: CursoValues, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], valores)
}

function asignar(valores: CursoValues, ruta: string, valor: unknown) {
  const partes = ruta.split(".")
  let o = valores as unknown as Record<string, unknown>
  for (const k of partes.slice(0, -1)) o = o[k] as Record<string, unknown>
  o[partes.at(-1)!] = valor
}

const copia = (v: CursoValues): CursoValues => ({ ...v, condiciones: { ...v.condiciones } })

/** Campos del paso que difieren de lo último guardado. */
export function camposModificados(paso: PasoFormulario, base: CursoValues, actuales: CursoValues): string[] {
  return CAMPOS_PASO[paso].filter((c) => obtener(base, c) !== obtener(actuales, c))
}

export function hayCambiosSinGuardar(base: CursoValues, actuales: CursoValues): boolean {
  return ([1, 2, 3] as const).some((p) => camposModificados(p, base, actuales).length > 0)
}

/**
 * Valores que se envían al guardar un paso: lo último guardado + los campos de
 * ESE paso. Así guardar un paso no arrastra cambios a medias de otros pasos.
 * - Paso 3 guarda la fila completa de condiciones (incluye los requisitos del paso 2).
 * - En los pasos 1–2, las condiciones se reenvían tal como están guardadas
 *   (o no se envían si el curso aún no las tiene).
 */
export function valoresParaGuardar(
  paso: PasoFormulario,
  base: CursoValues,
  actuales: CursoValues,
  tieneCondiciones: boolean
): CursoValues {
  const v = copia(base)
  const campos: readonly string[] = paso === 3 ? [...CAMPOS_PASO[3], ...CAMPOS_EN_CONDICIONES_DEL_PASO_2] : CAMPOS_PASO[paso]
  for (const c of campos) {
    // Paso 2 sin condiciones guardadas: requisitos y condiciones particulares esperan al paso 3.
    if (paso === 2 && !tieneCondiciones && (CAMPOS_EN_CONDICIONES_DEL_PASO_2 as readonly string[]).includes(c)) continue
    asignar(v, c, obtener(actuales, c))
  }
  v.configurarCondiciones = paso === 3 ? true : tieneCondiciones
  return v
}

/** Lo que queda guardado tras un guardado correcto del paso (nueva referencia). */
export function baseTrasGuardar(paso: PasoFormulario, enviados: CursoValues): CursoValues {
  return copia(enviados)
}

/** Suma exacta en céntimos (evita errores de coma flotante). */
export const centimos = (n: number) => Math.round(n * 100)

/** ¿El plan de cuotas cubre exactamente el importe del curso? */
export function estadoPlan(
  tipo: TipoCobro | undefined,
  importeCurso: number,
  plan: { importe: number }[] | null
): { aplica: boolean; ok: boolean; suma: number } {
  if (tipo !== "cuotas" || importeCurso <= 0) return { aplica: false, ok: true, suma: 0 }
  const suma = (plan ?? []).reduce((s, c) => s + centimos(c.importe), 0) / 100
  return { aplica: true, ok: (plan?.length ?? 0) > 0 && centimos(suma) === centimos(importeCurso), suma }
}

export type GrupoParaEstado = { estado: string; docente: { id: string } | null; horarios: unknown[] }

/** Un grupo puede recibir inscripciones cuando tiene docente, horarios y está vigente. */
export const grupoListo = (g: GrupoParaEstado) =>
  g.docente !== null && g.horarios.length > 0 && (g.estado === "programado" || g.estado === "abierto")

export type EntradaEstado = {
  cursoId: string | null
  base: CursoValues
  actuales: CursoValues
  tieneCondiciones: boolean
  categoriaActiva: boolean
  importeCursoGuardado: number
  tipoCobroGuardado: TipoCobro | undefined
  plan: { importe: number }[] | null
  grupos: GrupoParaEstado[]
  /** null = la certificación no está disponible (migración pendiente). */
  certificacionConfigurada: boolean | null
  estadoCurso: "borrador" | "publicado" | "desactivado" | null
}

export type EstadoPaso = { completo: boolean; pendientes: string[]; opcional?: boolean }

export function estadoPasos(e: EntradaEstado): {
  pasos: Record<NumeroPaso, EstadoPaso>
  bloqueosPublicacion: string[]
  avisosPublicacion: string[]
} {
  const existe = e.cursoId !== null
  const sin = (p: PasoFormulario) => camposModificados(p, e.base, e.actuales)
  const plan = estadoPlan(e.tipoCobroGuardado, e.importeCursoGuardado, e.plan)
  const listos = e.grupos.filter(grupoListo).length

  const p1: string[] = []
  if (!existe) p1.push("Guarda la información básica para crear el curso como borrador.")
  if (sin(1).length) p1.push("Hay cambios sin guardar en la información básica.")

  const p2: string[] = []
  if (!existe) p2.push("Primero crea el curso.")
  const pend2 = sin(2)
  if (pend2.includes("nota_aprobatoria")) p2.push("La nota aprobatoria tiene cambios sin guardar.")
  if (pend2.some((c) => c.startsWith("condiciones."))) {
    p2.push(e.tieneCondiciones ? "Los requisitos tienen cambios sin guardar." : "Los requisitos se guardarán junto con las condiciones (paso 3).")
  }

  const p3: string[] = []
  if (!e.tieneCondiciones) p3.push("Configura y guarda las condiciones de inscripción.")
  if (sin(3).length) p3.push("Hay cambios sin guardar en precios y condiciones.")
  if (plan.aplica && !plan.ok) {
    p3.push(
      (e.plan?.length ?? 0) === 0
        ? "El cobro es en cuotas: agrega el plan de cuotas."
        : `El plan de cuotas suma S/ ${plan.suma.toFixed(2)} y el importe del curso es S/ ${e.importeCursoGuardado.toFixed(2)}.`
    )
  }

  const p4: string[] = []
  if (e.grupos.length === 0) p4.push("Aún no hay grupos.")
  else if (listos === 0) p4.push("Ningún grupo tiene docente y horarios a la vez.")

  const p5: string[] = []
  if (e.certificacionConfigurada === false) p5.push("Elige si el curso entrega certificado.")

  const bloqueos: string[] = []
  if (!existe) bloqueos.push("El curso todavía no se ha creado.")
  if (!e.categoriaActiva) bloqueos.push("La categoría del curso está inactiva.")
  if (!e.tieneCondiciones) bloqueos.push("Faltan las condiciones de inscripción (paso 3).")
  if (plan.aplica && !plan.ok) bloqueos.push("El plan de cuotas no cuadra con el importe del curso (paso 3).")
  if (hayCambiosSinGuardar(e.base, e.actuales)) bloqueos.push("Hay cambios sin guardar.")

  const avisos: string[] = []
  if (listos === 0) avisos.push("Sin un grupo con docente y horarios, el curso se verá en el catálogo pero no recibirá inscripciones.")
  if (e.certificacionConfigurada === false) avisos.push("No has definido la certificación (por defecto, sin certificado).")

  return {
    pasos: {
      1: { completo: existe && p1.length === 0, pendientes: p1 },
      2: { completo: existe && p2.length === 0, pendientes: p2 },
      3: { completo: e.tieneCondiciones && p3.length === 0, pendientes: p3 },
      4: { completo: listos > 0, pendientes: p4, opcional: true },
      5: { completo: e.certificacionConfigurada !== false, pendientes: p5, opcional: true },
      6: { completo: e.estadoCurso === "publicado", pendientes: e.estadoCurso === "publicado" ? [] : ["El curso aún no está publicado."] },
    },
    bloqueosPublicacion: bloqueos,
    avisosPublicacion: avisos,
  }
}
