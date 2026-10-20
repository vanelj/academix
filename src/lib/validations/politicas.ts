import { z } from "zod"

/**
 * Políticas generales de la institución: public.politicas_institucion (V5).
 * Columnas editables: texto_matricula, texto_reservas, texto_pagos,
 * texto_devoluciones y texto_morosidad (text, opcionales).
 * institucion_id NO forma parte del formulario: lo pone el servidor desde la
 * sesión. actualizado_en también lo pone el servidor.
 *
 * Son textos libres de la institución: la plataforma no impone importes,
 * plazos, vencimientos ni penalidades.
 */
export const POLITICA_MAX = 5000

const texto = z.string().trim().max(POLITICA_MAX, `Máximo ${POLITICA_MAX.toLocaleString("es-PE")} caracteres.`)

export const politicasSchema = z.object({
  texto_matricula: texto,
  texto_reservas: texto,
  texto_pagos: texto,
  texto_devoluciones: texto,
  texto_morosidad: texto,
})

export type PoliticasValues = z.infer<typeof politicasSchema>
export type CampoPolitica = keyof PoliticasValues

export const CAMPOS_POLITICA = [
  "texto_matricula",
  "texto_reservas",
  "texto_pagos",
  "texto_devoluciones",
  "texto_morosidad",
] as const satisfies readonly CampoPolitica[]

export const COLUMNAS_POLITICAS = `${CAMPOS_POLITICA.join(", ")}, actualizado_en`

export const POLITICAS_VACIAS: PoliticasValues = {
  texto_matricula: "",
  texto_reservas: "",
  texto_pagos: "",
  texto_devoluciones: "",
  texto_morosidad: "",
}

/** Textos de la BD (pueden ser null) → valores del formulario. */
export function politicasDesdeFila(fila: Partial<Record<CampoPolitica, string | null>>): PoliticasValues {
  return {
    texto_matricula: fila.texto_matricula ?? "",
    texto_reservas: fila.texto_reservas ?? "",
    texto_pagos: fila.texto_pagos ?? "",
    texto_devoluciones: fila.texto_devoluciones ?? "",
    texto_morosidad: fila.texto_morosidad ?? "",
  }
}

/** Campos vacíos → NULL en la BD. */
export function politicasParaGuardar(valores: PoliticasValues): Record<CampoPolitica, string | null> {
  const vacioANull = (valor: string) => (valor === "" ? null : valor)
  return {
    texto_matricula: vacioANull(valores.texto_matricula),
    texto_reservas: vacioANull(valores.texto_reservas),
    texto_pagos: vacioANull(valores.texto_pagos),
    texto_devoluciones: vacioANull(valores.texto_devoluciones),
    texto_morosidad: vacioANull(valores.texto_morosidad),
  }
}

export function politicasEstanVacias(valores: PoliticasValues): boolean {
  return CAMPOS_POLITICA.every((campo) => valores[campo] === "")
}
