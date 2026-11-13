/**
 * Geometría de la malla semanal (pura). Rango de horas visible y reparto en
 * carriles de las clases simultáneas de un mismo día (para que no se tapen).
 */

type Bloque = { id: string; hora_inicio: string; hora_fin: string }

const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/** Horas enteras [desde, hasta) que cubren todas las clases; por defecto 8:00–20:00. */
export function rangoHorasMalla(clases: Bloque[], porDefecto = { desde: 8, hasta: 20 }): { desde: number; hasta: number } {
  if (clases.length === 0) return porDefecto
  const desde = Math.min(porDefecto.desde, ...clases.map((c) => Math.floor(min(c.hora_inicio) / 60)))
  const hasta = Math.max(porDefecto.hasta, ...clases.map((c) => Math.ceil(min(c.hora_fin) / 60)))
  return { desde: Math.max(0, desde), hasta: Math.min(24, Math.max(hasta, desde + 1)) }
}

/**
 * Carril de cada clase del día: cada grupo de clases que se solapan (directa o
 * encadenadamente) se reparte en tantos carriles como solapes simultáneos haya.
 */
export function carrilesDelDia(clases: Bloque[]): Map<string, { carril: number; total: number }> {
  const orden = [...clases].sort((a, b) => min(a.hora_inicio) - min(b.hora_inicio) || min(a.hora_fin) - min(b.hora_fin))
  const salida = new Map<string, { carril: number; total: number }>()
  let grupo: { id: string; carril: number }[] = []
  let finGrupo = -1
  let finCarriles: number[] = []
  const cerrar = () => {
    const total = Math.max(1, finCarriles.length)
    for (const g of grupo) salida.set(g.id, { carril: g.carril, total })
    grupo = []
    finCarriles = []
  }
  for (const c of orden) {
    const ini = min(c.hora_inicio)
    const fin = min(c.hora_fin)
    if (ini >= finGrupo) cerrar()
    let carril = finCarriles.findIndex((f) => f <= ini)
    if (carril === -1) {
      carril = finCarriles.length
      finCarriles.push(fin)
    } else finCarriles[carril] = fin
    grupo.push({ id: c.id, carril })
    finGrupo = Math.max(finGrupo, fin)
  }
  cerrar()
  return salida
}
