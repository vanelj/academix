/**
 * Duración de un grupo a partir de sus fechas (inicio y fin incluidos): «12 semanas»,
 * «10 días»… Es lo que dura el curso para el estudiante; no hace falta otro dato.
 */
export function duracionGrupo(inicio: string, fin: string): string | null {
  const desde = Date.parse(`${inicio.slice(0, 10)}T00:00:00Z`)
  const hasta = Date.parse(`${fin.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(desde) || Number.isNaN(hasta) || hasta < desde) return null
  const dias = Math.round((hasta - desde) / 86_400_000) + 1
  if (dias < 14) return dias === 1 ? "1 día" : `${dias} días`
  const semanas = Math.round(dias / 7)
  return `${semanas} semanas`
}
