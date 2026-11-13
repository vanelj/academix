/**
 * Filtros de «Explorar cursos» del panel del estudiante (puro). Viven en la
 * URL (?q=&categoria=&institucion=&estado=) para conservarse al volver desde la
 * ficha de un curso; solo se aceptan valores válidos.
 */
import { ESTADOS_FILTRO, type EstadoFiltro } from "@/lib/oferta/disponibilidad"

export type FiltrosExplorar = { q: string; categoria: string; institucion: string; estado: EstadoFiltro }

const RE_ID = /^[0-9a-f-]{36}$/i

export function leerFiltrosExplorar(p: URLSearchParams | Record<string, string | string[] | undefined>): FiltrosExplorar {
  const get = (k: string) => {
    const v = p instanceof URLSearchParams ? p.get(k) : p[k]
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim()
  }
  const estado = get("estado")
  return {
    q: get("q").slice(0, 80),
    categoria: RE_ID.test(get("categoria")) ? get("categoria") : "",
    institucion: RE_ID.test(get("institucion")) ? get("institucion") : "",
    estado: (ESTADOS_FILTRO as readonly string[]).includes(estado) ? (estado as EstadoFiltro) : "todos",
  }
}

export function consultaFiltros(f: FiltrosExplorar): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.categoria) p.set("categoria", f.categoria)
  if (f.institucion) p.set("institucion", f.institucion)
  if (f.estado !== "todos") p.set("estado", f.estado)
  return p.toString()
}

/** Normaliza un ?volver= recibido (solo filtros válidos de Explorar). */
export const consultaExplorar = (p: URLSearchParams) => consultaFiltros(leerFiltrosExplorar(p))

/** Enlace a la ficha pública desde el panel, con regreso al mismo listado. */
export function enlaceFichaDesdePanel(cursoId: string, f: FiltrosExplorar): string {
  const q = consultaFiltros(f)
  return `/cursos/${cursoId}?desde=panel${q ? `&volver=${encodeURIComponent(q)}` : ""}`
}
