/**
 * Equipo administrativo: permisos por MÓDULO dentro del único perfil
 * Administrador (puro, sin Next.js ni Supabase). Las mismas reglas las aplica
 * la base de datos (administracion_v5.sql); aquí se usan para el servidor y la
 * interfaz. Ocultar un menú nunca es la única protección.
 *
 * - Principal: acceso completo, gestiona el equipo. La institución nunca queda
 *   sin un principal activo.
 * - Secundario: acceso completo o módulos concretos. No puede cambiar sus
 *   propios permisos ni otorgar lo que no tiene (solo el principal otorga).
 */

export const MODULOS_ADMIN = ["cursos", "docentes", "estudiantes", "pagos", "evaluaciones", "certificados", "institucion"] as const
export type ModuloAdmin = (typeof MODULOS_ADMIN)[number]
/** «equipo» no es un módulo otorgable: es exclusivo del administrador principal. */
export type AreaAdmin = ModuloAdmin | "equipo"

export const ETIQUETA_MODULO: Record<ModuloAdmin, { titulo: string; descripcion: string }> = {
  cursos: { titulo: "Cursos y categorías", descripcion: "Oferta, condiciones, portadas y plan de cuotas." },
  docentes: { titulo: "Docentes y grupos", descripcion: "Docentes, grupos, horarios, enlaces y calendario." },
  estudiantes: { titulo: "Estudiantes y matrículas", descripcion: "Estudiantes, solicitudes y matrículas." },
  pagos: { titulo: "Pagos", descripcion: "Revisión de comprobantes, cuotas y medios de cobro." },
  evaluaciones: { titulo: "Evaluaciones", descripcion: "Criterios, publicación de notas y resultados finales." },
  certificados: { titulo: "Certificados", descripcion: "Plantillas, firmantes, emisión y pagos de certificados." },
  institucion: { titulo: "Configuración institucional", descripcion: "Datos de la institución y políticas." },
}

export type AccesoAdmin = {
  principal: boolean
  /** Acceso completo (todos los módulos). El principal siempre lo tiene. */
  total: boolean
  modulos: ModuloAdmin[]
  /** Sin la migración: todos los administradores conservan el acceso completo actual. */
  sinMigracion?: boolean
}

export const ACCESO_COMPLETO: AccesoAdmin = { principal: true, total: true, modulos: [...MODULOS_ADMIN] }

export const esModulo = (v: unknown): v is ModuloAdmin => typeof v === "string" && (MODULOS_ADMIN as readonly string[]).includes(v)

export function puede(acceso: AccesoAdmin | null | undefined, area: AreaAdmin): boolean {
  if (!acceso) return false
  if (area === "equipo") return acceso.principal
  return acceso.principal || acceso.total || acceso.modulos.includes(area)
}

const RUTAS: [string, AreaAdmin][] = [
  ["/admin/categorias", "cursos"],
  ["/admin/cursos", "cursos"],
  ["/admin/docentes", "docentes"],
  ["/admin/grupos", "docentes"],
  ["/admin/calendario", "docentes"],
  ["/admin/estudiantes", "estudiantes"],
  ["/admin/solicitudes", "estudiantes"],
  ["/admin/matriculas", "estudiantes"],
  ["/admin/pagos", "pagos"],
  ["/admin/evaluaciones", "evaluaciones"],
  ["/admin/certificados", "certificados"],
  ["/admin/institucion", "institucion"],
  ["/admin/politicas", "institucion"],
  ["/admin/equipo", "equipo"],
]

/** Área de una ruta del panel (null = libre para cualquier administrador, p. ej. Resumen y Perfil). */
export function areaDeRuta(ruta: string): AreaAdmin | null {
  const r = RUTAS.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`) || ruta.startsWith(`${prefijo}?`))
  return r ? r[1] : null
}

/** Normaliza una lista de módulos (sin repetidos, solo válidos, en orden fijo). */
export function normalizarModulos(lista: unknown): ModuloAdmin[] {
  if (!Array.isArray(lista)) return []
  const set = new Set(lista.filter(esModulo))
  return MODULOS_ADMIN.filter((m) => set.has(m))
}

export type CambioPermisos = { total: boolean; modulos: ModuloAdmin[] }

/**
 * ¿Puede `actor` cambiar los permisos de `objetivo`? Solo un principal, nunca
 * sobre sí mismo ni sobre otro principal (los principales no tienen límites que quitar).
 */
export function motivoNoPuedeGestionar(actor: { id: string; acceso: AccesoAdmin }, objetivo: { id: string; principal: boolean }): string | null {
  if (!actor.acceso.principal) return "Solo el administrador principal gestiona el equipo."
  if (actor.id === objetivo.id) return "No puedes cambiar tus propios permisos ni tu acceso."
  if (objetivo.principal) return "Un administrador principal tiene acceso completo: no se le asignan módulos."
  return null
}

/** ¿Desactivar a `objetivo` dejaría la institución sin principal activo? */
export function dejaSinPrincipal(equipo: { id: string; principal: boolean; activo: boolean }[], objetivoId: string): boolean {
  return equipo.filter((a) => a.principal && a.activo && a.id !== objetivoId).length === 0
}
