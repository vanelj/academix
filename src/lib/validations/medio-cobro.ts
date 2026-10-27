import { z } from "zod"

/**
 * Medios de cobro de una institución (public.medios_cobro_institucion,
 * migración docs/migraciones/medios_cobro_v5.sql).
 *
 * Solo datos que la institución publica para RECIBIR pagos: titular, celular
 * de Yape/Plin, banco, número de cuenta, CCI e instrucciones. Nunca
 * contraseñas, claves ni credenciales. Las reglas replican los CHECK de la BD.
 */

export const TIPOS_MEDIO = ["yape", "plin", "transferencia", "deposito"] as const
export type TipoMedio = (typeof TIPOS_MEDIO)[number]

export const ETIQUETA_TIPO_MEDIO: Record<TipoMedio, string> = {
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia bancaria",
  deposito: "Depósito bancario",
}

export const esBilletera = (t: TipoMedio) => t === "yape" || t === "plin"

/** Sugerencias del campo banco (se puede escribir cualquier otro). */
export const BANCOS_SUGERIDOS = [
  "BCP",
  "BBVA",
  "Interbank",
  "Scotiabank",
  "Banco de la Nación",
  "BanBif",
  "Banco Pichincha",
  "Caja Arequipa",
  "Caja Huancayo",
  "Caja Piura",
]

export const INSTRUCCIONES_MAX = 1000

const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`)

export const medioCobroSchema = z
  .object({
    tipo: z.enum(TIPOS_MEDIO, { error: "Selecciona el medio de cobro." }),
    titular: z.string().trim().min(2, "Introduce el titular que verá el estudiante.").max(150, "Máximo 150 caracteres."),
    celular: z.string().trim().overwrite((s) => s.replace(/\s+/g, "")),
    banco: opcional(100),
    numero_cuenta: z.string().trim().overwrite((s) => s.replace(/\s+/g, "")),
    cci: z.string().trim().overwrite((s) => s.replace(/[\s-]+/g, "")),
    instrucciones: opcional(INSTRUCCIONES_MAX),
    activo: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const error = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
    if (esBilletera(v.tipo)) {
      if (!/^9\d{8}$/.test(v.celular)) error("celular", "Introduce un celular peruano de 9 dígitos que empiece con 9.")
    } else {
      if (v.banco.length < 2) error("banco", "Introduce el nombre del banco.")
      if (!/^\d[\d-]{4,28}\d$/.test(v.numero_cuenta)) error("numero_cuenta", "Introduce el número de cuenta (solo dígitos y guiones).")
      if (v.cci !== "" && !/^\d{20}$/.test(v.cci)) error("cci", "El CCI tiene 20 dígitos.")
    }
  })

export type MedioCobroValues = z.input<typeof medioCobroSchema>

/** Fila para guardar: los campos que no corresponden al tipo se guardan vacíos (NULL). */
export function medioParaGuardar(v: z.output<typeof medioCobroSchema>) {
  const nulo = (s: string) => (s === "" ? null : s)
  const billetera = esBilletera(v.tipo)
  return {
    tipo: v.tipo,
    titular: v.titular.replace(/\s+/g, " "),
    celular: billetera ? v.celular : null,
    banco: billetera ? null : v.banco.replace(/\s+/g, " "),
    numero_cuenta: billetera ? null : v.numero_cuenta,
    cci: billetera ? null : nulo(v.cci),
    instrucciones: nulo(v.instrucciones),
    activo: v.activo,
  }
}

export const MEDIO_VACIO: MedioCobroValues = {
  tipo: "yape",
  titular: "",
  celular: "",
  banco: "",
  numero_cuenta: "",
  cci: "",
  instrucciones: "",
  activo: true,
}
