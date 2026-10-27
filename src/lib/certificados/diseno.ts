import { z } from "zod"

/**
 * Diseño de un certificado como DATOS ESTRUCTURADOS (independiente de la imagen).
 *
 * - Página A4 horizontal: 842 × 595 pt. Cada campo es una caja en coordenadas
 *   RELATIVAS 0–1 (origen arriba a la izquierda): sirven para cualquier fondo y
 *   resolución, y una IA futura podrá proponer cajas con este mismo formato
 *   (el administrador las revisa y guarda; nada se aplica solo).
 * - Los textos usan marcadores {estudiante}, {curso}, ... Si un marcador no
 *   tiene valor (p. ej. horas no configuradas), el campo NO se dibuja: nunca se
 *   inventa un dato.
 * - Lo usan el editor (navegador) y el generador de PDF (servidor).
 */

export const ANCHO_PT = 842
export const ALTO_PT = 595

export const BASES = ["clasico", "ornamental", "moderno", "propia"] as const
export type BasePlantilla = (typeof BASES)[number]

export const ETIQUETA_BASE: Record<BasePlantilla, string> = {
  clasico: "Académico clásico (azul y dorado)",
  ornamental: "Ornamental de capacitación (verde)",
  moderno: "Institucional moderno (azul)",
  propia: "Diseño propio (fondo subido)",
}

export const TIPOS_CAMPO = ["texto", "logo", "firma", "qr", "linea"] as const
export type TipoCampo = (typeof TIPOS_CAMPO)[number]
export type Alineacion = "izquierda" | "centro" | "derecha"
export type Fuente = "serif" | "sans"

export type Campo = {
  id: string
  tipo: TipoCampo
  etiqueta: string
  /** Solo para tipo texto: admite marcadores {clave}. */
  texto: string
  x: number
  y: number
  w: number
  h: number
  /** Tamaño de letra en pt (texto) o grosor en pt (línea). */
  tamano: number
  color: string
  alineacion: Alineacion
  fuente: Fuente
  negrita: boolean
  cursiva: boolean
  mayusculas: boolean
  visible: boolean
}

export type Diseno = { version: 1; campos: Campo[] }

export const MARCADORES = {
  estudiante: "Nombre completo del estudiante",
  curso: "Curso aprobado",
  institucion: "Nombre de la institución",
  grupo: "Código del grupo",
  horas: "Horas académicas (si se configuraron)",
  fecha_inicio: "Inicio del grupo",
  fecha_fin: "Fin del grupo",
  fecha_emision: "Fecha de emisión",
  promedio: "Promedio final (si existe)",
  firmante: "Nombre del firmante autorizado",
  cargo: "Cargo del firmante",
  codigo: "Código de verificación",
  url_verificacion: "Enlace de verificación",
} as const
export type Marcador = keyof typeof MARCADORES
export type ValoresCertificado = Partial<Record<Marcador, string | null>>

/** Sustituye los marcadores; null si alguno referido no tiene valor (el campo no se dibuja). */
export function resolverTexto(texto: string, valores: ValoresCertificado): string | null {
  let faltante = false
  const salida = texto.replace(/\{([a-z_]+)\}/g, (_, clave: string) => {
    const v = valores[clave as Marcador]
    if (v === null || v === undefined || String(v).trim() === "") {
      faltante = true
      return ""
    }
    return String(v)
  })
  if (faltante) return null
  const limpio = salida.replace(/\s+/g, " ").trim()
  return limpio === "" ? null : limpio
}

/** Ajusta el texto a la caja: reduce el tamaño y, si hace falta, usa dos líneas. */
export function ajustarTexto(texto: string, ancho: (t: string, s: number) => number, tamano: number, maxAncho: number, maxAlto: number) {
  const minimo = tamano * 0.55
  let s = Math.min(tamano, maxAlto / 1.1)
  while (s > minimo && ancho(texto, s) > maxAncho) s -= 0.25
  if (ancho(texto, s) <= maxAncho) return { lineas: [texto], tamano: s }

  // Dos líneas: corte en el espacio que mejor equilibra ambas mitades.
  const palabras = texto.split(" ")
  let mejor: [string, string] = [texto, ""]
  let diferencia = Infinity
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(" "), b = palabras.slice(i).join(" ")
    const d = Math.abs(ancho(a, 1) - ancho(b, 1))
    if (d < diferencia) { diferencia = d; mejor = [a, b] }
  }
  let s2 = Math.min(tamano, maxAlto / 2.25)
  const masAncha = () => Math.max(ancho(mejor[0], s2), ancho(mejor[1], s2))
  while (s2 > 4 && masAncha() > maxAncho) s2 -= 0.25
  return { lineas: mejor[1] ? mejor : [mejor[0]], tamano: s2 }
}

/**
 * Propuesta externa de posiciones (p. ej. una IA futura que analice el fondo):
 * solo actualiza la caja, el tamaño y la alineación de campos EXISTENTES, y el
 * resultado debe pasar la validación. El administrador decide si la guarda.
 */
export function fusionarPropuesta(actual: Diseno, propuesta: Partial<Pick<Campo, "id" | "x" | "y" | "w" | "h" | "tamano" | "alineacion">>[]): Diseno | null {
  const porId = new Map(propuesta.filter((p) => p.id).map((p) => [p.id!, p]))
  const campos = actual.campos.map((c) => {
    const p = porId.get(c.id)
    if (!p) return c
    return {
      ...c,
      ...(p.x !== undefined && { x: p.x }), ...(p.y !== undefined && { y: p.y }),
      ...(p.w !== undefined && { w: p.w }), ...(p.h !== undefined && { h: p.h }),
      ...(p.tamano !== undefined && { tamano: p.tamano }), ...(p.alineacion !== undefined && { alineacion: p.alineacion }),
    }
  })
  const r = disenoSchema.safeParse({ version: 1, campos })
  return r.success ? r.data : null
}

// ---------------------------------------------------------------------------
// Validación (lo que se guarda en plantillas_certificado.diseno)
// ---------------------------------------------------------------------------

const rel = z.number().min(0).max(1)
const campoSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    tipo: z.enum(TIPOS_CAMPO),
    etiqueta: z.string().trim().min(1).max(60),
    texto: z.string().max(300),
    x: rel,
    y: rel,
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.005).max(1),
    tamano: z.number().min(0.5).max(96),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    alineacion: z.enum(["izquierda", "centro", "derecha"]),
    fuente: z.enum(["serif", "sans"]),
    negrita: z.boolean(),
    cursiva: z.boolean(),
    mayusculas: z.boolean(),
    visible: z.boolean(),
  })
  .refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, "El campo sale de la página.")

export const disenoSchema = z.object({
  version: z.literal(1),
  campos: z
    .array(campoSchema)
    .max(30, "Máximo 30 campos.")
    .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, "Hay campos repetidos.")
    .refine((cs) => cs.filter((c) => c.tipo === "qr").length <= 1, "Solo puede haber un código QR.")
    .refine((cs) => cs.some((c) => c.visible && c.tipo === "texto" && c.texto.includes("{estudiante}")), "El nombre del estudiante debe aparecer.")
    .refine((cs) => cs.some((c) => c.visible && (c.tipo === "qr" || (c.tipo === "texto" && c.texto.includes("{codigo}")))), "Debe aparecer el código de verificación o el QR."),
})

// ---------------------------------------------------------------------------
// Campos predeterminados por base
// ---------------------------------------------------------------------------

type Paleta = { principal: string; acento: string; texto: string }
const PALETA: Record<BasePlantilla, Paleta> = {
  clasico: { principal: "#1E3A5F", acento: "#A8841A", texto: "#475569" },
  ornamental: { principal: "#2F5D50", acento: "#2F5D50", texto: "#3F4F4A" },
  moderno: { principal: "#1E3A8A", acento: "#B8901F", texto: "#475569" },
  propia: { principal: "#1F2937", acento: "#1F2937", texto: "#374151" },
}

function campo(id: string, etiqueta: string, tipo: TipoCampo, caja: [number, number, number, number], extra: Partial<Campo> = {}): Campo {
  const [x, y, w, h] = caja
  return {
    id, etiqueta, tipo, texto: "", x, y, w, h,
    tamano: 12, color: "#1F2937", alineacion: "centro", fuente: "serif",
    negrita: false, cursiva: false, mayusculas: false, visible: true, ...extra,
  }
}

export function camposPredeterminados(base: BasePlantilla): Campo[] {
  const p = PALETA[base]
  // Área de contenido (x, ancho) según el fondo.
  const [ax, aw] = base === "clasico" ? [0.24, 0.68] : base === "ornamental" ? [0.12, 0.76] : [0.1, 0.8]
  const t = (id: string, etiqueta: string, texto: string, y: number, h: number, extra: Partial<Campo>) =>
    campo(id, etiqueta, "texto", [ax, y, aw, h], { texto, ...extra })

  const comunes: Campo[] = [
    t("titulo", "Título", "CERTIFICADO", base === "moderno" ? 0.16 : 0.13, 0.1, { tamano: 44, color: p.acento, negrita: true, mayusculas: true }),
    t("subtitulo", "Subtítulo", "DE APROBACIÓN", base === "moderno" ? 0.255 : 0.235, 0.045, { tamano: 14, color: p.principal, mayusculas: true }),
    t("otorgado", "Otorgado a", "Se otorga el presente certificado a", 0.33, 0.045, { tamano: 13, color: p.texto, cursiva: true }),
    t("estudiante", "Nombre del estudiante", "{estudiante}", 0.385, 0.085, { tamano: 32, color: p.principal, negrita: true }),
    t("detalle", "Detalle", "por haber aprobado satisfactoriamente el curso", 0.49, 0.04, { tamano: 13, color: p.texto }),
    t("curso", "Curso", "{curso}", 0.54, 0.065, { tamano: 20, color: p.principal, negrita: true }),
    t("horas", "Duración y fechas", "con una duración de {horas} horas académicas, del {fecha_inicio} al {fecha_fin}", 0.615, 0.04, { tamano: 11, color: p.texto }),
    t("emision", "Institución y fecha", "{institucion} · {fecha_emision}", 0.66, 0.04, { tamano: 11, color: p.texto, fuente: "sans" }),
  ]
  const firmaX = base === "clasico" ? 0.48 : 0.58
  const firmas: Campo[] = [
    campo("firma", "Firma", "firma", [firmaX, 0.705, 0.2, 0.1]),
    campo("linea_firma", "Línea de firma", "linea", [firmaX - 0.02, 0.81, 0.24, 0.01], { tamano: 0.8, color: p.texto }),
    campo("firmante", "Firmante", "texto", [firmaX - 0.04, 0.82, 0.28, 0.04], { texto: "{firmante}", tamano: 12, negrita: true, color: p.principal }),
    campo("cargo", "Cargo", "texto", [firmaX - 0.04, 0.86, 0.28, 0.035], { texto: "{cargo}", tamano: 10, color: p.texto, fuente: "sans" }),
  ]
  const verificacion: Campo[] =
    base === "ornamental" || base === "moderno"
      ? [
          campo("qr", "Código QR", "qr", [0.15, 0.72, 0.09, 0.13]),
          campo("codigo", "Código", "texto", [0.11, 0.86, 0.17, 0.03], { texto: "Código: {codigo}", tamano: 8, fuente: "sans", color: p.texto }),
          campo("url", "Enlace de verificación", "texto", [0.06, 0.89, 0.27, 0.025], { texto: "{url_verificacion}", tamano: 6.5, fuente: "sans", color: p.texto }),
        ]
      : [
          campo("qr", "Código QR", "qr", [0.835, 0.7, 0.09, 0.13]),
          campo("codigo", "Código", "texto", [0.76, 0.835, 0.17, 0.03], { texto: "Código: {codigo}", tamano: 8, fuente: "sans", color: p.texto, alineacion: "derecha" }),
          campo("url", "Enlace de verificación", "texto", [0.66, 0.865, 0.27, 0.025], { texto: "{url_verificacion}", tamano: 6.5, fuente: "sans", color: p.texto, alineacion: "derecha" }),
        ]
  const logo = campo("logo", "Logotipo", "logo", base === "clasico" ? [0.79, 0.07, 0.13, 0.11] : base === "moderno" ? [0.44, 0.06, 0.12, 0.12] : [0.44, 0.065, 0.12, 0.1])
  return [logo, ...comunes, ...firmas, ...verificacion]
}

/** Diseño guardado si es válido; si no, el predeterminado de la base. */
export function disenoEfectivo(base: BasePlantilla, guardado: unknown): Diseno {
  const r = disenoSchema.safeParse(guardado)
  return r.success ? r.data : { version: 1, campos: camposPredeterminados(base) }
}

/** Campo nuevo de texto libre para el editor. */
export function campoNuevo(existentes: Campo[]): Campo {
  let n = 1
  while (existentes.some((c) => c.id === `texto_${n}`)) n++
  return campo(`texto_${n}`, `Texto ${n}`, "texto", [0.35, 0.45, 0.3, 0.05], { texto: "Texto", tamano: 12 })
}

/** Datos ficticios SOLO para vistas previas en memoria (nunca se guardan). */
export const VALORES_DEMOSTRACION: ValoresCertificado = {
  estudiante: "María Fernanda Quispe Huamán de los Ángeles",
  curso: "Gestión de Proyectos con Metodologías Ágiles",
  institucion: "Instituto de Demostración",
  grupo: "DEMO-01",
  horas: "120",
  fecha_inicio: "2 de marzo de 2026",
  fecha_fin: "26 de junio de 2026",
  fecha_emision: "30 de junio de 2026",
  promedio: "17.50",
  firmante: "Nombre del firmante",
  cargo: "Cargo autorizado",
  codigo: "DEMOSTRACIÓN",
  url_verificacion: "Vista previa sin validez",
}

export const MARCA_DEMOSTRACION = "DEMOSTRACIÓN — SIN VALIDEZ"
