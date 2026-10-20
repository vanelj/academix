import { Badge } from "@/components/ui/badge"
import type { EstadoCurso, TipoCobro } from "@/lib/validations/curso"

/** Elementos de presentación compartidos por el listado, el detalle y el formulario de cursos. */

export const formatoSoles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
export const formatoFechaCurso = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" })

export const ETIQUETA_ESTADO: Record<EstadoCurso, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  desactivado: "Desactivado",
}

export const DESCRIPCION_ESTADO: Record<EstadoCurso, string> = {
  borrador: "En preparación: no aparece en el catálogo público.",
  publicado: "Visible en el catálogo público (si su categoría y la institución están activas).",
  desactivado: "Retirado de la oferta: no aparece en el catálogo público.",
}

export const ETIQUETA_COBRO: Record<TipoCobro, string> = {
  gratuito: "Gratuito",
  unico: "Pago único",
  cuotas: "En cuotas",
}

export function EstadoCursoBadge({ estado }: { estado: EstadoCurso }) {
  const variante = estado === "publicado" ? "success" : estado === "borrador" ? "warning" : "outline"
  return <Badge variant={variante}>{ETIQUETA_ESTADO[estado]}</Badge>
}

export function formatoHoras(horas: number) {
  if (horas % 24 === 0) {
    const dias = horas / 24
    return `${horas} h (${dias} ${dias === 1 ? "día" : "días"})`
  }
  return `${horas} h`
}
