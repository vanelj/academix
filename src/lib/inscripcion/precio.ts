import type { CondicionesOferta } from "@/lib/inscripcion/datos"

/**
 * Lo que paga el estudiante al inscribirse: el total con pago único (matrícula +
 * curso), 0 si es gratuito y, en cursos anteriores con cuotas, la matrícula.
 * Es el mismo cálculo que hace la RPC crear_solicitud_inscripcion de V5.
 */
export function importeAlInscribirse(c: Pick<CondicionesOferta, "tipo_cobro" | "matricula_importe" | "importe_curso">) {
  if (c.tipo_cobro === "gratuito") return 0
  return c.matricula_importe + (c.tipo_cobro === "unico" ? c.importe_curso : 0)
}
