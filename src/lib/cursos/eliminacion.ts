/**
 * Eliminación segura de cursos y grupos: reglas puras (sin Next.js ni Supabase).
 *
 * Configuración (se borra junto con el curso o grupo): condiciones, plan de
 * cuotas, configuración del certificado, portada, grupos sin historial,
 * horarios y enlaces, evaluaciones sin notas, materiales.
 * Historial (impide borrar; se ofrece Archivar o Cancelar/Cerrar): matrículas
 * (también anuladas), solicitudes, pagos, cuotas, calificaciones, resultados,
 * certificados y cualquier dependencia no prevista.
 * La BD (eliminacion_segura_v5) aplica las MISMAS reglas dentro de una transacción.
 */

import { rutaDeGrupo } from "@/lib/materiales/reglas"

export type Inesperada = { tabla: string; filas: number }

export type Diagnostico = {
  eliminable: boolean
  grupos: number
  horarios: number
  evaluaciones: number
  materiales: number
  plan_cuotas: number
  condiciones: number
  certificacion: number
  portada: number
  matriculas: number
  matriculas_anuladas: number
  solicitudes: number
  pagos: number
  cuotas: number
  calificaciones: number
  resultados: number
  certificados: number
  inesperadas: Inesperada[]
}

const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0)

/** Normaliza la respuesta de la BD (jsonb) y RECALCULA si es eliminable (no se confía en un booleano suelto). */
export function normalizarDiagnostico(json: unknown): Diagnostico {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>
  const d: Diagnostico = {
    eliminable: false,
    grupos: n(o.grupos),
    horarios: n(o.horarios),
    evaluaciones: n(o.evaluaciones),
    materiales: n(o.materiales),
    plan_cuotas: n(o.plan_cuotas),
    condiciones: n(o.condiciones),
    certificacion: n(o.certificacion),
    portada: n(o.portada),
    matriculas: n(o.matriculas),
    matriculas_anuladas: n(o.matriculas_anuladas),
    solicitudes: n(o.solicitudes),
    pagos: n(o.pagos),
    cuotas: n(o.cuotas),
    calificaciones: n(o.calificaciones),
    resultados: n(o.resultados),
    certificados: n(o.certificados),
    inesperadas: Array.isArray(o.inesperadas)
      ? (o.inesperadas as unknown[]).flatMap((x) => {
          const r = x as Record<string, unknown>
          return typeof r?.tabla === "string" ? [{ tabla: r.tabla, filas: n(r.filas) }] : []
        })
      : [],
  }
  return { ...d, eliminable: historialVacio(d) && o.eliminable !== false }
}

export function historialVacio(d: Omit<Diagnostico, "eliminable">): boolean {
  return (
    d.matriculas === 0 && d.solicitudes === 0 && d.pagos === 0 && d.cuotas === 0 &&
    d.calificaciones === 0 && d.resultados === 0 && d.certificados === 0 && d.inesperadas.length === 0
  )
}

const plural = (cantidad: number, uno: string, varios: string) => `${cantidad} ${cantidad === 1 ? uno : varios}`

/** Lo que se borrará (solo configuración). */
export function seEliminara(d: Diagnostico, objeto: "curso" | "grupo"): string[] {
  const l: string[] = objeto === "curso" ? ["1 curso"] : ["1 grupo"]
  if (objeto === "curso" && d.grupos) l.push(plural(d.grupos, "grupo sin estudiantes", "grupos sin estudiantes"))
  if (d.horarios) l.push(plural(d.horarios, "horario (con su enlace de clase)", "horarios (con sus enlaces de clase)"))
  if (d.evaluaciones) l.push(plural(d.evaluaciones, "evaluación sin notas", "evaluaciones sin notas"))
  if (d.materiales) l.push(plural(d.materiales, "material compartido", "materiales compartidos"))
  if (objeto === "curso") {
    if (d.condiciones) l.push("Condiciones de inscripción y precio")
    if (d.plan_cuotas) l.push(plural(d.plan_cuotas, "cuota del plan (sin cobros generados)", "cuotas del plan (sin cobros generados)"))
    if (d.certificacion) l.push("Configuración del certificado")
    if (d.portada) l.push("Portada")
  }
  return l
}

export type Bloqueo = { texto: string; href?: string; etiqueta?: string }

/**
 * Por qué no se puede eliminar, con enlaces a cada módulo. `grupoConHistorial`
 * es el id de un grupo con historial, para filtrar Matrículas y Solicitudes.
 */
export function bloqueos(d: Diagnostico, grupoConHistorial?: { matriculas?: string | null; solicitudes?: string | null }): Bloqueo[] {
  const b: Bloqueo[] = []
  const filtro = (id?: string | null) => (id ? `?grupo=${id}` : "")
  if (d.matriculas) {
    b.push({
      texto: `${plural(d.matriculas, "matrícula", "matrículas")}${d.matriculas_anuladas ? ` (${d.matriculas_anuladas} anulada${d.matriculas_anuladas === 1 ? "" : "s"})` : ""}`,
      href: `/admin/matriculas${filtro(grupoConHistorial?.matriculas)}`,
      etiqueta: "Ver matrículas",
    })
  }
  if (d.solicitudes) b.push({ texto: plural(d.solicitudes, "solicitud de inscripción", "solicitudes de inscripción"), href: `/admin/solicitudes${filtro(grupoConHistorial?.solicitudes)}`, etiqueta: "Ver solicitudes" })
  if (d.pagos) b.push({ texto: plural(d.pagos, "pago o comprobante", "pagos o comprobantes"), href: "/admin/pagos", etiqueta: "Ver pagos" })
  if (d.cuotas) b.push({ texto: plural(d.cuotas, "cuota generada", "cuotas generadas"), href: "/admin/pagos/cuotas", etiqueta: "Ver cuotas" })
  if (d.calificaciones) b.push({ texto: plural(d.calificaciones, "calificación registrada", "calificaciones registradas"), href: "/admin/evaluaciones", etiqueta: "Ver evaluaciones" })
  if (d.resultados) b.push({ texto: plural(d.resultados, "resultado académico", "resultados académicos"), href: "/admin/evaluaciones", etiqueta: "Ver evaluaciones" })
  if (d.certificados) b.push({ texto: plural(d.certificados, "certificado emitido", "certificados emitidos"), href: "/admin/certificados", etiqueta: "Ver certificados" })
  for (const i of d.inesperadas) b.push({ texto: `${plural(i.filas, "registro", "registros")} en «${i.tabla}» (dependencia no prevista)` })
  return b
}

/** Misma regla que la BD: el texto escrito, sin espacios a los extremos, debe ser idéntico. */
/**
 * Doble confirmación explícita de la ventana de eliminación (sin escribir el
 * nombre). Las dos ventanas NO son la protección: el servidor vuelve a leer el
 * curso/grupo con la sesión y la función de la BD comprueba permisos e historial.
 */
export type ConfirmacionDoble = { primera: true; segunda: true }
export const confirmacionDobleValida = (v: unknown): v is ConfirmacionDoble =>
  typeof v === "object" && v !== null && (v as Record<string, unknown>).primera === true && (v as Record<string, unknown>).segunda === true

export const TEXTO_PRIMERA_CONFIRMACION = {
  curso: "¿Seguro que quieres eliminar este curso? Se eliminarán también sus grupos vacíos y configuraciones asociadas.",
  grupo: "¿Seguro que quieres eliminar este grupo? Se eliminarán también sus horarios, enlaces y evaluaciones sin notas.",
} as const

export const TEXTO_SEGUNDA_CONFIRMACION = {
  curso: "ADVERTENCIA: ESTA ACCIÓN ES PERMANENTE E IRREVERSIBLE. El curso y su configuración no podrán recuperarse desde Academix. ¿Confirmas la eliminación definitiva?",
  grupo: "ADVERTENCIA: ESTA ACCIÓN ES PERMANENTE E IRREVERSIBLE. El grupo y su configuración no podrán recuperarse desde Academix. ¿Confirmas la eliminación definitiva?",
} as const

export function confirmacionCoincide(esperado: string, escrito: string): boolean {
  return esperado.trim().length > 0 && escrito.trim() === esperado.trim()
}

/**
 * Rutas de materiales que se pueden borrar del bucket tras eliminar: solo las
 * que están en la carpeta <institución>/<grupo eliminado>/ (nunca otras).
 */
export function archivosLimpiables(archivos: unknown, institucionId: string, gruposIds: unknown): string[] {
  if (!Array.isArray(archivos) || !Array.isArray(gruposIds)) return []
  const grupos = gruposIds.filter((g): g is string => typeof g === "string")
  return [...new Set(archivos.filter((a): a is string => typeof a === "string" && grupos.some((g) => rutaDeGrupo(a, institucionId, g))))]
}
