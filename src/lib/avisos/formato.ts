/** Reglas puras del centro de notificaciones (navegador y servidor). */

export type Aviso = {
  id: string
  tipo: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  creada_en: string
  leida_en: string | null
}

/** Solo rutas internas de Academix ("/algo"); nunca "//dominio" ni URLs externas. */
export function enlaceInterno(enlace: string | null | undefined): string | null {
  if (!enlace || !enlace.startsWith("/") || enlace.startsWith("//") || enlace.includes("\\")) return null
  return /^\/[A-Za-z0-9/_?=&.-]*$/.test(enlace) ? enlace : null
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" })

/** «hace 5 minutos», «ayer», «hace 3 días»… */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const seg = Math.round((Date.parse(iso) - ahora) / 1000)
  if (Number.isNaN(seg)) return ""
  const abs = Math.abs(seg)
  if (abs < 60) return "hace un momento"
  if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), "hour")
  if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), "day")
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(iso))
}

/** Texto del contador de la campana (accesible y compacto). */
export const textoContador = (n: number) => (n > 99 ? "99+" : String(n))
