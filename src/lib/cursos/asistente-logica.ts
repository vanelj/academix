import { certCursoSchema, type CertificacionValues } from "@/lib/validations/certificacion-curso"
import { condicionesParaGuardar, cursoParaGuardar, cursoSchema, type CursoValues, type TipoCobro } from "@/lib/validations/curso"
import { grupoParaGuardar, grupoSchema, horaCorta, horarioSchema, seSolapan, type EstadoGrupo, type GrupoValues, type HorarioValues } from "@/lib/validations/grupo"
import { cuotaPlanSchema } from "@/lib/validations/plan-cuotas"

/**
 * Lógica pura del asistente de cursos (sin React ni Supabase).
 *
 * Principio: el asistente trabaja con una copia LOCAL de todo el curso (datos,
 * condiciones, plan de cuotas, grupos con horarios y certificación). «Siguiente»
 * solo valida; nada se escribe en Supabase hasta «Guardar como borrador» o
 * «Publicar curso» en el último paso. Entonces `planificarGuardado` calcula las
 * operaciones necesarias y `ejecutarGuardado` las aplica en orden con las
 * acciones existentes, anotando el progreso para que un reintento no repita
 * (ni duplique) lo que ya se confirmó.
 */

export const PASOS = [
  { numero: 1, titulo: "Curso", descripcion: "Nombre, categoría, descripción, portada y requisitos." },
  { numero: 2, titulo: "Precio", descripcion: "Gratuito o pago completo." },
  { numero: 3, titulo: "Grupos y horarios", descripcion: "Opcional: grupos, fechas, vacantes, horarios y docentes." },
  { numero: 4, titulo: "Certificado", descripcion: "Opcional: si entrega certificado y en qué condiciones." },
  { numero: 5, titulo: "Revisar y publicar", descripcion: "Resumen final, guardado y publicación." },
] as const

export type NumeroPaso = 1 | 2 | 3 | 4 | 5
export type PasoEditable = 1 | 2 | 3 | 4
export const TOTAL_PASOS = PASOS.length
/** Número de cada paso por su contenido (evita números sueltos en el código). */
export const PASO = { curso: 1, precio: 2, grupos: 3, certificado: 4, revision: 5 } as const
export const PASOS_EDITABLES = [1, 2, 3, 4] as const

/** Campos del formulario del curso que edita cada paso. */
export const CAMPOS_PASO = {
  1: ["nombre", "categoria_id", "descripcion", "nota_aprobatoria", "condiciones.requisitos", "condiciones.condiciones_especiales"],
  2: [
    "precio",
    "condiciones.tipo_cobro",
    "condiciones.matricula_importe",
    "condiciones.importe_curso",
    "condiciones.permite_reserva",
    "condiciones.reserva_importe",
    "condiciones.reserva_plazo_horas",
    "condiciones.reserva_descuenta_matricula",
  ],
} as const satisfies Record<1 | 2, readonly string[]>

/** Pasos con campos del formulario del curso (los demás tienen sus propios editores). */
export type PasoFormulario = keyof typeof CAMPOS_PASO
export const esPasoFormulario = (p: number): p is PasoFormulario => p === 1 || p === 2

// Tipos usados por los formularios de grupos, horarios y certificación cuando
// guardan por sí mismos (fuera del asistente).
export type ResultadoGuardadoAsistente =
  | { ok: true; avisos?: string[]; guardado?: boolean }
  | { ok: false; mensaje: string }
export type GuardadorAsistente = () => Promise<ResultadoGuardadoAsistente>
export type RegistrarGuardadorAsistente = (clave: string, descripcion: string, guardar: GuardadorAsistente | null, pendiente?: boolean) => void

// ---------------------------------------------------------------------------
// Modelo local
// ---------------------------------------------------------------------------

export type ValoresCuota = { numero: string; concepto: string; importe: string; dias_desde_inicio: string; descripcion_vencimiento: string }
export type DatosGrupo = Omit<GrupoValues, "curso_id">

/**
 * `clave` es el id del registro: el de Supabase si ya existe o uno generado aquí
 * para crearlo (las acciones lo reciben y un reintento no lo duplica).
 */
export type CuotaLocal = { clave: string; existente: boolean; valores: ValoresCuota; original: ValoresCuota | null; eliminada: boolean }
export type HorarioLocal = { clave: string; existente: boolean; valores: HorarioValues; original: HorarioValues | null; eliminado: boolean }
export type GrupoLocal = {
  clave: string
  existente: boolean
  estado: EstadoGrupo
  valores: DatosGrupo
  original: DatosGrupo | null
  /** true mientras el formulario del grupo está abierto y sin incorporar. */
  editando: boolean
  /** Valores antes de empezar a editar (para «Cancelar»); null en un grupo nuevo sin incorporar. */
  antesDeEditar: DatosGrupo | null
  horarios: HorarioLocal[]
}

/** Todo lo que el asistente guarda además del formulario del curso. */
export type Complementos = {
  plan: CuotaLocal[]
  grupos: GrupoLocal[]
  certificacion: CertificacionValues
  /** Configuración guardada; null = el curso aún no la tiene. */
  certificacionOriginal: CertificacionValues | null
}

export type Errores = Record<string, string>

// ---------------------------------------------------------------------------
// Conversión desde lo guardado
// ---------------------------------------------------------------------------

export const valoresCuota = (c: { numero: number; concepto: string; importe: number; dias_desde_inicio: number | null; descripcion_vencimiento: string | null }): ValoresCuota => ({
  numero: String(c.numero),
  concepto: c.concepto,
  importe: c.importe.toFixed(2),
  dias_desde_inicio: c.dias_desde_inicio == null ? "" : String(c.dias_desde_inicio),
  descripcion_vencimiento: c.descripcion_vencimiento ?? "",
})

export const valoresGrupo = (g: { codigo: string; vacantes: number; fecha_inicio: string; fecha_fin: string; docente: { id: string } | null }): DatosGrupo => ({
  codigo: g.codigo,
  vacantes: String(g.vacantes),
  fecha_inicio: g.fecha_inicio,
  fecha_fin: g.fecha_fin,
  docente_id: g.docente?.id ?? "",
})

export const valoresHorario = (h: { dia_semana: number; hora_inicio: string; hora_fin: string; enlace_clase: string | null }): HorarioValues => ({
  dia_semana: String(h.dia_semana),
  hora_inicio: horaCorta(h.hora_inicio),
  hora_fin: horaCorta(h.hora_fin),
  enlace_clase: h.enlace_clase ?? "",
})

export const GRUPO_VACIO: DatosGrupo = { codigo: "", vacantes: "20", fecha_inicio: "", fecha_fin: "", docente_id: "" }

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const

const unirDias = (dias: string[]) => (dias.length <= 1 ? dias.join("") : `${dias.slice(0, -1).join(", ")} y ${dias.at(-1)}`)

/**
 * Resumen semanal agrupando los días con la misma franja:
 * «Lun y Vie · 19:00–21:00; Mié · 08:00–10:00».
 */
export function resumenSemanal(horarios: Pick<HorarioValues, "dia_semana" | "hora_inicio" | "hora_fin">[]): string {
  if (horarios.length === 0) return "Sin horarios"
  const franjas = new Map<string, number[]>()
  for (const h of [...horarios].sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana) || a.hora_inicio.localeCompare(b.hora_inicio))) {
    const franja = `${horaCorta(h.hora_inicio)}–${horaCorta(h.hora_fin)}`
    const dias = franjas.get(franja) ?? []
    dias.push(Number(h.dia_semana))
    franjas.set(franja, dias)
  }
  return [...franjas]
    .sort((a, b) => a[1][0] - b[1][0] || a[0].localeCompare(b[0]))
    .map(([franja, dias]) => `${unirDias(dias.map((d) => DIAS_CORTOS[d - 1] ?? "?"))} · ${franja}`)
    .join("; ")
}

// ---------------------------------------------------------------------------
// Formas canónicas: comparan lo local con lo guardado sin depender del formato
// ("260" y "260.00" son el mismo importe). Las usa también el servidor para
// detectar cambios hechos desde otra sesión.
// ---------------------------------------------------------------------------

const textoONull = (v: string) => (v.trim() === "" ? null : v.trim())
const numeroONull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))

export function canonCurso(v: CursoValues, conCondiciones: boolean) {
  return { ...cursoParaGuardar(v), condiciones: conCondiciones ? condicionesParaGuardar(v.condiciones) : null }
}
export const canonCuota = (v: ValoresCuota) => ({
  numero: numeroONull(v.numero),
  concepto: v.concepto.replace(/\s+/g, " ").trim(),
  importe: numeroONull(v.importe),
  dias_desde_inicio: numeroONull(v.dias_desde_inicio),
  descripcion_vencimiento: textoONull(v.descripcion_vencimiento),
})
export const canonGrupo = (v: DatosGrupo) => ({ ...grupoParaGuardar({ ...v, curso_id: "" }), docente_id: v.docente_id || null })
export const canonHorario = (v: HorarioValues) => ({
  dia_semana: Number(v.dia_semana),
  hora_inicio: horaCorta(v.hora_inicio),
  hora_fin: horaCorta(v.hora_fin),
  enlace_clase: textoONull(v.enlace_clase),
})
export function canonCertificacion(v: CertificacionValues) {
  const sin = v.modalidad === "sin_certificado"
  return {
    modalidad: v.modalidad,
    importe: v.modalidad === "costo_adicional" ? Number(v.importe) : 0,
    nota_minima: sin ? null : numeroONull(v.nota_minima),
    horas_academicas: numeroONull(v.horas_academicas),
    requisitos_adicionales: sin ? null : textoONull(v.requisitos_adicionales),
    plantilla_id: sin ? null : v.plantilla_id || null,
    firmante_id: sin ? null : v.firmante_id || null,
  }
}

/** Igualdad estructural de valores simples (objetos planos, listas, números, textos, null). */
export function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  return ka.length === kb.length && ka.every((k) => iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

// ---------------------------------------------------------------------------
// Validaciones locales (mismos esquemas que las acciones del servidor)
// ---------------------------------------------------------------------------

function erroresDe(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Errores {
  const e: Errores = {}
  for (const i of issues) e[String(i.path[0] ?? "general")] ??= i.message
  return e
}

const CURSO_DE_PRUEBA = "00000000-0000-4000-8000-000000000000"
const codigoNormal = (c: string) => c.replace(/\s+/g, " ").trim()

export function validarCuota(v: ValoresCuota, plan: CuotaLocal[], clave: string | null): Errores {
  const r = cuotaPlanSchema.safeParse(v)
  const e = r.success ? {} : erroresDe(r.error.issues)
  if (!e.numero && plan.some((c) => c.clave !== clave && !c.eliminada && Number(c.valores.numero) === Number(v.numero))) {
    e.numero = "Ya hay una cuota con ese número."
  }
  return e
}

export function validarGrupo(v: DatosGrupo, grupos: GrupoLocal[], clave: string): Errores {
  const r = grupoSchema.safeParse({ ...v, curso_id: CURSO_DE_PRUEBA })
  const e = r.success ? {} : erroresDe(r.error.issues)
  if (!e.codigo && grupos.some((g) => g.clave !== clave && codigoNormal(g.valores.codigo) === codigoNormal(v.codigo))) {
    e.codigo = "Ya hay otro grupo con ese código en este curso."
  }
  return e
}

export function validarHorario(v: HorarioValues, horarios: HorarioLocal[], clave: string | null): Errores {
  const r = horarioSchema.safeParse(v)
  const e = r.success ? {} : erroresDe(r.error.issues)
  if (r.success) {
    const choca = horarios.some(
      (h) =>
        h.clave !== clave &&
        !h.eliminado &&
        h.valores.dia_semana === v.dia_semana &&
        seSolapan({ inicio: v.hora_inicio, fin: v.hora_fin }, { inicio: horaCorta(h.valores.hora_inicio), fin: horaCorta(h.valores.hora_fin) })
    )
    if (choca) e.hora_inicio = "Se cruza con otro horario de este grupo."
  }
  return e
}

export function validarCertificacion(v: CertificacionValues): Errores {
  const r = certCursoSchema.safeParse(v)
  return r.success ? {} : erroresDe(r.error.issues)
}

/** Errores del formulario del curso agrupados por paso (1–2), con las condiciones siempre incluidas. */
export function erroresCursoPorPaso(curso: CursoValues): Record<PasoFormulario, string[]> {
  const r = cursoSchema.safeParse({ ...curso, configurarCondiciones: true })
  const porPaso: Record<PasoFormulario, string[]> = { 1: [], 2: [] }
  if (!r.success) {
    for (const i of r.error.issues) {
      const ruta = i.path.map(String).join(".")
      const paso = ([1, 2] as const).find((p) => (CAMPOS_PASO[p] as readonly string[]).includes(ruta)) ?? 2
      if (!porPaso[paso].includes(i.message)) porPaso[paso].push(i.message)
    }
  }
  const precio = errorPrecio(curso)
  if (precio && !porPaso[2].includes(precio)) porPaso[2].push(precio)
  return porPaso
}

// ---------------------------------------------------------------------------
// Precio: pago completo (como Udemy) o gratuito
// ---------------------------------------------------------------------------

/**
 * Cobro configurado con el modelo anterior (cuotas o reserva de vacante). Se
 * respeta tal cual al editar; los cursos nuevos solo pueden ser gratuitos o de
 * pago completo.
 */
export const esCobroAnterior = (c: CursoValues["condiciones"]) => c.tipo_cobro === "cuotas" || (c.tipo_cobro !== "gratuito" && c.permite_reserva)

/** Precio total que paga el estudiante al inscribirse con pago único (matrícula + curso). */
export const totalPagoUnico = (c: CursoValues["condiciones"]) =>
  Math.round(((Number(c.matricula_importe) || 0) + (Number(c.importe_curso) || 0)) * 100) / 100

const importeTexto = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Valores del curso para el modelo simple: gratuito o pago completo por `precio`.
 * Se guarda como cobro «único» con todo en el importe del curso, sin matrícula
 * aparte ni reserva: la RPC de V5 cobra exactamente ese total al inscribirse.
 * Si el total ya coincide (p. ej. matrícula 30 + curso 150 = 180) no se toca.
 */
export function conPrecioSimple(curso: CursoValues, tipo: "gratuito" | "unico", precio: string): CursoValues {
  const c = curso.condiciones
  const sinReserva = { permite_reserva: false, reserva_importe: "0", reserva_plazo_horas: "", reserva_descuenta_matricula: true }
  if (tipo === "gratuito") {
    return { ...curso, precio: "0", condiciones: { ...c, ...sinReserva, tipo_cobro: "gratuito", matricula_importe: "0", importe_curso: "0" } }
  }
  const total = Number(precio)
  const mismoTotal = c.tipo_cobro === "unico" && Number.isFinite(total) && centimos(totalPagoUnico(c)) === centimos(total)
  return {
    ...curso,
    precio,
    condiciones: mismoTotal
      ? { ...c, ...sinReserva }
      : { ...c, ...sinReserva, tipo_cobro: "unico", matricula_importe: "0", importe_curso: Number.isFinite(total) ? importeTexto(total) : precio },
  }
}

/** Un curso de pago necesita un precio mayor que cero. */
export function errorPrecio(curso: CursoValues): string | null {
  if (curso.condiciones.tipo_cobro === "gratuito") return null
  const precio = Number(curso.precio)
  return /^\d+(\.\d{1,2})?$/.test(curso.precio.trim()) && precio <= 0 ? "Indica el precio del curso (mayor que S/ 0) o márcalo como gratuito." : null
}

// ---------------------------------------------------------------------------
// Estado de cada paso, publicación
// ---------------------------------------------------------------------------

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

export const planVigente = (plan: CuotaLocal[]) => plan.filter((c) => !c.eliminada)

export function estadoPlanLocal(curso: CursoValues, plan: CuotaLocal[]) {
  return estadoPlan(
    curso.condiciones.tipo_cobro,
    Number(curso.condiciones.importe_curso) || 0,
    planVigente(plan).map((c) => ({ importe: Number(c.valores.importe) || 0 }))
  )
}

export type GrupoParaEstado = { estado: string; docente: { id: string } | null; horarios: unknown[] }

/**
 * Un grupo está listo para recibir inscripciones con horarios y vigente
 * (programado o abierto). El docente es opcional para inscribir: se exige al
 * iniciar las clases (los estudiantes ven «Docente por asignar»).
 */
export const grupoListo = (g: GrupoParaEstado) =>
  g.horarios.length > 0 && (g.estado === "programado" || g.estado === "abierto")

export const grupoLocalListo = (g: GrupoLocal) =>
  grupoListo({ estado: g.estado, docente: g.valores.docente_id ? { id: g.valores.docente_id } : null, horarios: g.horarios.filter((h) => !h.eliminado) })

export type RevisionPaso = { valido: boolean; mensajes: string[]; avisos: string[]; opcional: boolean }

/** Código que el asistente propone a un grupo nuevo («Grupo 1», «Grupo 2»…). */
export const codigoSugerido = (grupos: { valores: { codigo: string } }[]) => {
  const usados = new Set(grupos.map((g) => codigoNormal(g.valores.codigo).toLowerCase()))
  let n = grupos.length + 1
  while (usados.has(`grupo ${n}`)) n++
  return `Grupo ${n}`
}

/**
 * Grupo nuevo abierto sin escribir nada (el código propuesto no cuenta):
 * sección opcional vacía, no bloquea «Siguiente».
 */
export const grupoNuevoVacio = (g: GrupoLocal) =>
  !g.existente && g.editando && g.horarios.length === 0 &&
  iguales({ ...g.valores, codigo: "" }, GRUPO_VACIO) && (g.valores.codigo.trim() === "" || /^Grupo \d+$/.test(codigoNormal(g.valores.codigo)))

export function revisarPasos(curso: CursoValues, c: Complementos, certificacionDisponible: boolean): Record<PasoEditable, RevisionPaso> {
  const porPaso = erroresCursoPorPaso(curso)
  const plan = estadoPlanLocal(curso, c.plan)
  const editando = c.grupos.filter((g) => g.editando && !grupoNuevoVacio(g))
  const certErrores = certificacionDisponible ? Object.values(validarCertificacion(c.certificacion)) : []
  const sinListo = c.grupos.length > 0 && !c.grupos.some(grupoLocalListo)

  const avisoPrecio: string[] = []
  if (plan.aplica && !plan.ok) {
    avisoPrecio.push(
      planVigente(c.plan).length === 0
        ? "El cobro es en cuotas: agrega el plan de cuotas antes de publicar."
        : `El plan de cuotas suma S/ ${plan.suma.toFixed(2)} y el importe del curso es S/ ${(Number(curso.condiciones.importe_curso) || 0).toFixed(2)}.`
    )
  }

  return {
    1: { valido: porPaso[1].length === 0, mensajes: porPaso[1], avisos: [], opcional: false },
    2: { valido: porPaso[2].length === 0, mensajes: porPaso[2], avisos: avisoPrecio, opcional: false },
    3: {
      valido: editando.length === 0,
      mensajes: editando.map((g) =>
        g.existente
          ? `Termina de editar el grupo «${codigoNormal(g.antesDeEditar?.codigo ?? g.valores.codigo)}»: aplica o cancela sus cambios.`
          : `Termina el grupo ${g.valores.codigo.trim() ? `«${codigoNormal(g.valores.codigo)}»` : "nuevo"}: incorpóralo o descártalo.`
      ),
      avisos: c.grupos.every(grupoNuevoVacio) ? ["Sin grupos: puedes guardarlo así y crearlos después."] : sinListo ? ["Ningún grupo tiene horarios todavía."] : [],
      opcional: true,
    },
    4: { valido: certErrores.length === 0, mensajes: certErrores, avisos: [], opcional: true },
  }
}

export function bloqueosPublicacion(
  curso: CursoValues,
  c: Complementos,
  revision: Record<PasoEditable, RevisionPaso>,
  categoriaActiva: boolean
): string[] {
  const b: string[] = []
  for (const p of PASOS_EDITABLES) if (!revision[p].valido) b.push(`El paso ${p} (${PASOS[p - 1].titulo}) tiene datos por corregir.`)
  if (!categoriaActiva) b.push("La categoría del curso está inactiva.")
  const plan = estadoPlanLocal(curso, c.plan)
  if (plan.aplica && !plan.ok) b.push("El plan de cuotas no cuadra con el importe del curso (paso 2).")
  return b
}

export function avisosPublicacion(c: Complementos): string[] {
  const a: string[] = []
  if (!c.grupos.some(grupoLocalListo)) a.push("Sin un grupo con horarios, el curso se verá en el catálogo pero no recibirá inscripciones.")
  if (c.grupos.some((g) => !g.editando && !g.valores.docente_id)) a.push("Hay grupos con «Docente por asignar»: pueden recibir inscripciones, pero necesitarán un docente antes de iniciar las clases.")
  return a
}

// ---------------------------------------------------------------------------
// Plan de guardado
// ---------------------------------------------------------------------------

/** Lo guardado en Supabase según el asistente (se actualiza tras cada operación confirmada). */
export type Base = {
  cursoExiste: boolean
  cursoInicial: CursoValues
  tieneCondiciones: boolean
}

export type Operacion =
  | { tipo: "curso"; clave: "curso"; crear: boolean; valores: CursoValues; configurarCondiciones: boolean; descripcion: string; paso: 1 }
  | { tipo: "portada"; clave: "portada"; accion: "subir" | "quitar"; descripcion: string; paso: 1 }
  | { tipo: "cuota-eliminar"; clave: string; cuota: string; descripcion: string; paso: 2 }
  | { tipo: "cuota"; clave: string; cuota: string; crear: boolean; valores: ValoresCuota; descripcion: string; paso: 2 }
  | { tipo: "grupo"; clave: string; grupo: string; crear: boolean; valores: DatosGrupo; descripcion: string; paso: 3 }
  | { tipo: "horario-eliminar"; clave: string; grupo: string; horario: string; descripcion: string; paso: 3 }
  | { tipo: "horario"; clave: string; grupo: string; horario: string; crear: boolean; valores: HorarioValues; descripcion: string; paso: 3 }
  | { tipo: "certificacion"; clave: "certificacion"; valores: CertificacionValues; descripcion: string; paso: 4 }
  | { tipo: "publicar"; clave: "publicar"; descripcion: string; paso: 5 }
  | { tipo: "abrir-grupo"; clave: string; grupo: string; descripcion: string; paso: 5 }

export type EntradaPlan = {
  base: Base
  curso: CursoValues
  /** Si se envían las condiciones (siempre en un curso nuevo o que ya las tiene). */
  configurarCondiciones: boolean
  portada: "subir" | "quitar" | null
  complementos: Complementos
  certificacionDisponible: boolean
  /** El usuario confirmó el paso del certificado (guardar «sin certificado» también es una decisión). */
  certificacionConfirmada: boolean
  publicar: boolean
  /** Con «Publicar»: abrir a inscripciones los grupos programados con horarios. */
  abrirInscripciones?: boolean
}

/** Operaciones que faltan para que Supabase quede como el asistente, en orden seguro. */
export function planificarGuardado(e: EntradaPlan): Operacion[] {
  const ops: Operacion[] = []
  const c = e.complementos
  const { base } = e

  const cursoCambia = !base.cursoExiste || !iguales(canonCurso(e.curso, e.configurarCondiciones), canonCurso(base.cursoInicial, base.tieneCondiciones))
  if (cursoCambia) {
    ops.push({
      tipo: "curso", clave: "curso", paso: 1, crear: !base.cursoExiste, valores: e.curso, configurarCondiciones: e.configurarCondiciones,
      descripcion: base.cursoExiste ? "Actualizar datos, precios y condiciones" : "Crear el curso como borrador",
    })
  }
  if (e.portada) ops.push({ tipo: "portada", clave: "portada", paso: 1, accion: e.portada, descripcion: e.portada === "subir" ? "Subir la portada" : "Quitar la portada" })

  // El plan solo se toca con cobro en cuotas (con otro cobro, V5 no lo usa y se conserva tal cual).
  if (e.curso.condiciones.tipo_cobro === "cuotas") {
    // Primero se quitan cuotas: así un número liberado puede reutilizarse.
    for (const q of c.plan) {
      if (q.eliminada && q.existente) ops.push({ tipo: "cuota-eliminar", clave: `cuota-eliminar:${q.clave}`, cuota: q.clave, paso: 2, descripcion: `Quitar la cuota ${q.original?.numero ?? q.valores.numero}` })
    }
    for (const q of planVigente(c.plan)) {
      if (q.existente && q.original && iguales(canonCuota(q.valores), canonCuota(q.original))) continue
      ops.push({ tipo: "cuota", clave: `cuota:${q.clave}`, cuota: q.clave, crear: !q.existente, valores: q.valores, paso: 2, descripcion: `${q.existente ? "Actualizar" : "Agregar"} la cuota ${q.valores.numero}` })
    }
  }

  for (const g of c.grupos) {
    if (g.editando && !g.existente) continue // grupo nuevo sin incorporar: no se guarda
    // Edición abierta y sin aplicar en un grupo existente: se conserva lo que tenía.
    const datos = g.editando && g.antesDeEditar ? g.antesDeEditar : g.valores
    const nombre = `«${codigoNormal(datos.codigo)}»`
    if (!g.existente || !g.original || !iguales(canonGrupo(datos), canonGrupo(g.original))) {
      ops.push({ tipo: "grupo", clave: `grupo:${g.clave}`, grupo: g.clave, crear: !g.existente, valores: datos, paso: 3, descripcion: `${g.existente ? "Actualizar" : "Crear"} el grupo ${nombre}` })
    }
    for (const h of g.horarios) {
      if (h.eliminado) {
        if (h.existente) ops.push({ tipo: "horario-eliminar", clave: `horario-eliminar:${h.clave}`, grupo: g.clave, horario: h.clave, paso: 3, descripcion: `Quitar un horario del grupo ${nombre}` })
        continue
      }
      if (h.existente && h.original && iguales(canonHorario(h.valores), canonHorario(h.original))) continue
      ops.push({ tipo: "horario", clave: `horario:${h.clave}`, grupo: g.clave, horario: h.clave, crear: !h.existente, valores: h.valores, paso: 3, descripcion: `${h.existente ? "Actualizar" : "Agregar"} un horario del grupo ${nombre}` })
    }
  }

  if (e.certificacionDisponible) {
    const cambia = c.certificacionOriginal
      ? !iguales(canonCertificacion(c.certificacion), canonCertificacion(c.certificacionOriginal))
      : e.certificacionConfirmada
    if (cambia) ops.push({ tipo: "certificacion", clave: "certificacion", valores: c.certificacion, paso: 4, descripcion: "Guardar la certificación" })
  }
  if (e.publicar) ops.push({ tipo: "publicar", clave: "publicar", paso: 5, descripcion: "Publicar el curso" })
  // Después de publicar (nunca antes): abrir los grupos listos. Las reglas reales
  // (curso publicado, condiciones, horario, fechas, vacantes) las vuelve a comprobar el servidor.
  if (e.publicar && e.abrirInscripciones) {
    for (const g of gruposParaAbrir(c)) {
      ops.push({ tipo: "abrir-grupo", clave: `abrir:${g.clave}`, grupo: g.clave, paso: 5, descripcion: `Abrir inscripciones del grupo «${codigoNormal(g.valores.codigo)}»` })
    }
  }
  return ops
}

/** Grupos que «Publicar y abrir inscripciones» abriría: programados, incorporados y con horarios. */
export const gruposParaAbrir = (c: Complementos) =>
  c.grupos.filter((g) => !g.editando && g.estado === "programado" && g.horarios.some((h) => !h.eliminado))

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

type Resultado = { ok: true; id?: string; aviso?: string; existente?: boolean } | { ok: false; mensaje: string }

/**
 * Acciones del servidor que usa el guardado (inyectadas: así se prueban sin red).
 * Las de creación reciben el id generado por el asistente: si un intento
 * anterior ya creó ese registro, no se crea otro.
 */
export type AccionesGuardado = {
  crearCurso: (datos: CursoValues, id: string) => Promise<Resultado>
  editarCurso: (id: string, datos: CursoValues) => Promise<Resultado>
  subirPortada: (cursoId: string) => Promise<Resultado>
  quitarPortada: (cursoId: string) => Promise<Resultado>
  guardarCuota: (cursoId: string, id: string, crear: boolean, valores: ValoresCuota) => Promise<Resultado>
  eliminarCuota: (cursoId: string, id: string) => Promise<Resultado>
  crearGrupo: (datos: GrupoValues, id: string) => Promise<Resultado>
  editarGrupo: (id: string, datos: GrupoValues) => Promise<Resultado>
  guardarHorario: (grupoId: string, id: string, crear: boolean, valores: HorarioValues) => Promise<Resultado>
  eliminarHorario: (grupoId: string, id: string) => Promise<Resultado>
  guardarCertificacion: (cursoId: string, valores: CertificacionValues) => Promise<Resultado>
  publicar: (cursoId: string) => Promise<Resultado>
  abrirGrupo: (grupoId: string) => Promise<Resultado>
}

export type ResultadoGuardado = {
  /** Operaciones confirmadas por Supabase en este intento, en orden. */
  hechas: Operacion[]
  avisos: string[]
  /** La operación que falló (las siguientes no se intentaron). */
  fallo: { op: Operacion; mensaje: string } | null
}

const SIN_CONEXION = "No se pudo conectar con el servidor. Revisa tu conexión: al reintentar no se duplicará nada de lo que ya se haya guardado."

export async function ejecutarGuardado(
  ops: Operacion[],
  cursoId: string,
  acciones: AccionesGuardado,
  alAvanzar?: (op: Operacion, estado: "en_curso" | "hecha") => void
): Promise<ResultadoGuardado> {
  const hechas: Operacion[] = []
  const avisos: string[] = []
  for (const op of ops) {
    alAvanzar?.(op, "en_curso")
    let r: Resultado
    try {
      r = await ejecutarUna(op, cursoId, acciones)
    } catch {
      r = { ok: false, mensaje: SIN_CONEXION }
    }
    if (!r.ok) return { hechas, avisos, fallo: { op, mensaje: r.mensaje } }
    if (r.aviso) avisos.push(r.aviso)
    hechas.push(op)
    alAvanzar?.(op, "hecha")
  }
  return { hechas, avisos, fallo: null }
}

async function ejecutarUna(op: Operacion, cursoId: string, a: AccionesGuardado): Promise<Resultado> {
  switch (op.tipo) {
    case "curso": {
      const datos = { ...op.valores, configurarCondiciones: op.configurarCondiciones }
      if (!op.crear) return a.editarCurso(cursoId, datos)
      const r = await a.crearCurso(datos, cursoId)
      // Ya existía (un intento anterior sí llegó a crearlo): se aplican los datos actuales.
      return r.ok && r.existente ? a.editarCurso(cursoId, datos) : r
    }
    case "portada":
      return op.accion === "subir" ? a.subirPortada(cursoId) : a.quitarPortada(cursoId)
    case "cuota-eliminar":
      return a.eliminarCuota(cursoId, op.cuota)
    case "cuota":
      return a.guardarCuota(cursoId, op.cuota, op.crear, op.valores)
    case "grupo": {
      const datos = { ...op.valores, curso_id: cursoId }
      if (!op.crear) return a.editarGrupo(op.grupo, datos)
      const r = await a.crearGrupo(datos, op.grupo)
      return r.ok && r.existente ? a.editarGrupo(op.grupo, datos) : r
    }
    case "horario-eliminar":
      return a.eliminarHorario(op.grupo, op.horario)
    case "horario":
      return a.guardarHorario(op.grupo, op.horario, op.crear, op.valores)
    case "certificacion":
      return a.guardarCertificacion(cursoId, op.valores)
    case "publicar":
      return a.publicar(cursoId)
    case "abrir-grupo":
      return a.abrirGrupo(op.grupo)
  }
}

/**
 * Actualiza la base y los complementos con lo que Supabase confirmó: lo creado
 * pasa a «existente» y su valor guardado se vuelve el nuevo original. Así un
 * reintento solo planifica lo que falta y la comprobación de cambios ajenos
 * compara con lo que este asistente escribió.
 */
export function rebasar(base: Base, c: Complementos, hechas: Operacion[]): { base: Base; complementos: Complementos } {
  let b = base
  let plan = c.plan
  let grupos = c.grupos
  let certificacionOriginal = c.certificacionOriginal
  for (const op of hechas) {
    switch (op.tipo) {
      case "curso":
        b = { cursoExiste: true, cursoInicial: { ...op.valores, configurarCondiciones: op.configurarCondiciones }, tieneCondiciones: b.tieneCondiciones || op.configurarCondiciones }
        break
      case "cuota-eliminar":
        plan = plan.filter((q) => q.clave !== op.cuota)
        break
      case "cuota":
        plan = plan.map((q) => (q.clave === op.cuota ? { ...q, existente: true, original: op.valores } : q))
        break
      case "grupo":
        grupos = grupos.map((g) => (g.clave === op.grupo ? { ...g, existente: true, original: op.valores } : g))
        break
      case "horario-eliminar":
        grupos = grupos.map((g) => (g.clave === op.grupo ? { ...g, horarios: g.horarios.filter((h) => h.clave !== op.horario) } : g))
        break
      case "horario":
        grupos = grupos.map((g) =>
          g.clave === op.grupo ? { ...g, horarios: g.horarios.map((h) => (h.clave === op.horario ? { ...h, existente: true, original: op.valores } : h)) } : g
        )
        break
      case "certificacion":
        certificacionOriginal = op.valores
        break
      case "abrir-grupo":
        grupos = grupos.map((g) => (g.clave === op.grupo ? { ...g, estado: "abierto" } : g))
        break
    }
  }
  // Lo quitado localmente que nunca existió en Supabase ya no hace falta recordarlo.
  plan = plan.filter((q) => !(q.eliminada && !q.existente))
  grupos = grupos.map((g) => ({ ...g, horarios: g.horarios.filter((h) => !(h.eliminado && !h.existente)) }))
  return { base: b, complementos: { ...c, plan, grupos, certificacionOriginal } }
}

// ---------------------------------------------------------------------------
// Comprobación de cambios ajenos (edición): qué se espera encontrar en Supabase
// ---------------------------------------------------------------------------

export type Esperado = {
  curso?: { valores: CursoValues; tieneCondiciones: boolean }
  cuotas?: { id: string; valores: ValoresCuota }[]
  grupos?: { id: string; valores: DatosGrupo }[]
  horarios?: { grupoId: string; id: string; valores: HorarioValues }[]
  /** null = se espera que el curso aún no tenga certificación. */
  certificacion?: CertificacionValues | null
}

/**
 * Para cada registro EXISTENTE que el guardado va a modificar o borrar, el valor
 * con el que el asistente lo conoce. El servidor lo compara con lo actual: si otra
 * sesión lo cambió, no se escribe nada (no se sobrescriben cambios más recientes).
 */
export function esperadoParaOperaciones(ops: Operacion[], base: Base, c: Complementos): Esperado {
  const esperado: Esperado = {}
  if (!base.cursoExiste) return esperado
  for (const op of ops) {
    if (op.tipo === "curso") esperado.curso = { valores: base.cursoInicial, tieneCondiciones: base.tieneCondiciones }
    if (op.tipo === "cuota-eliminar" || (op.tipo === "cuota" && !op.crear)) {
      const q = c.plan.find((x) => x.clave === op.cuota)
      if (q?.existente && q.original) (esperado.cuotas ??= []).push({ id: q.clave, valores: q.original })
    }
    if (op.tipo === "grupo" && !op.crear) {
      const g = c.grupos.find((x) => x.clave === op.grupo)
      if (g?.original) (esperado.grupos ??= []).push({ id: g.clave, valores: g.original })
    }
    if (op.tipo === "horario-eliminar" || (op.tipo === "horario" && !op.crear)) {
      const h = c.grupos.find((x) => x.clave === op.grupo)?.horarios.find((x) => x.clave === op.horario)
      if (h?.existente && h.original) (esperado.horarios ??= []).push({ grupoId: op.grupo, id: h.clave, valores: h.original })
    }
    if (op.tipo === "certificacion") esperado.certificacion = c.certificacionOriginal
  }
  return esperado
}

/** Campos económicos que cambian respecto a lo guardado (para confirmarlos en un curso publicado). */
export function cambiosEconomicos(curso: CursoValues, inicial: CursoValues, tieneCondiciones: boolean, plan: CuotaLocal[]): string[] {
  const a = canonCurso(curso, true)
  const b = canonCurso(inicial, tieneCondiciones)
  const cambios: string[] = []
  if (a.precio !== b.precio) cambios.push("Precio publicado")
  const ca = a.condiciones!
  const cb = b.condiciones
  if (!cb) cambios.push("Condiciones de inscripción (nuevas)")
  else {
    if (ca.tipo_cobro !== cb.tipo_cobro) cambios.push("Tipo de cobro")
    if (ca.matricula_importe !== cb.matricula_importe) cambios.push("Importe de matrícula")
    if (ca.importe_curso !== cb.importe_curso) cambios.push("Importe del curso")
    if (ca.permite_reserva !== cb.permite_reserva || ca.reserva_importe !== cb.reserva_importe || ca.reserva_plazo_horas !== cb.reserva_plazo_horas || ca.reserva_descuenta_matricula !== cb.reserva_descuenta_matricula) {
      cambios.push("Reserva de vacante")
    }
  }
  if (plan.some((q) => q.eliminada || !q.original || !iguales(canonCuota(q.valores), canonCuota(q.original)))) cambios.push("Plan de cuotas")
  return cambios
}
