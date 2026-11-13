/**
 * Materiales del curso: reglas puras (sin Next.js ni Supabase).
 *
 * Bucket PRIVADO «materiales-curso» (aula_academica_v5). Ruta obligatoria:
 *   <institución>/<grupo>/<uuid>.<ext>
 * Las políticas de Storage solo dejan subir/borrar al docente del grupo o al
 * administrador, y leer además a los estudiantes con matrícula activa. Los
 * archivos se abren con URL firmada de corta duración (nunca enlaces públicos).
 * No se admiten vídeos: los vídeos se comparten como enlace externo.
 */

export const BUCKET_MATERIALES = "materiales-curso"
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
export const SEGUNDOS_URL_FIRMADA = 300

export const TIPOS_MATERIAL = {
  "application/pdf": { ext: "pdf", etiqueta: "PDF" },
  "application/msword": { ext: "doc", etiqueta: "Word" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", etiqueta: "Word" },
  "application/vnd.ms-excel": { ext: "xls", etiqueta: "Excel" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", etiqueta: "Excel" },
  "application/vnd.ms-powerpoint": { ext: "ppt", etiqueta: "PowerPoint" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", etiqueta: "PowerPoint" },
  "text/plain": { ext: "txt", etiqueta: "Texto" },
  "image/png": { ext: "png", etiqueta: "Imagen" },
  "image/jpeg": { ext: "jpg", etiqueta: "Imagen" },
  "image/webp": { ext: "webp", etiqueta: "Imagen" },
} as const

export type TipoMaterial = keyof typeof TIPOS_MATERIAL

/**
 * Tipos que el navegador muestra por sí mismo (PDF, imágenes y texto). Word,
 * Excel y PowerPoint NO: abrirlos «en una pestaña» deja una vista vacía o una
 * descarga silenciosa, así que se ofrecen como descarga con su nombre original.
 */
const VISUALIZABLES = new Set<string>(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"])
export const visualizableEnNavegador = (mime: string | null | undefined) => Boolean(mime && VISUALIZABLES.has(mime))

/** Cómo se abre un material: enlace externo, vista en pestaña nueva o descarga. */
export function modoApertura(m: { tipo: "archivo" | "enlace"; archivo_tipo: string | null }, pideDescarga = false): "enlace" | "vista" | "descarga" {
  if (m.tipo === "enlace") return "enlace"
  return pideDescarga || !visualizableEnNavegador(m.archivo_tipo) ? "descarga" : "vista"
}

export const ACEPTA_MATERIAL = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp"

const POR_EXTENSION: Record<string, TipoMaterial> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

const empieza = (b: Uint8Array, firma: number[]) => firma.every((v, i) => b[i] === v)

/**
 * Tipo del archivo según su EXTENSIÓN, confirmado por su FIRMA binaria (los
 * primeros bytes). Un .pdf que no empieza por «%PDF-» se rechaza.
 */
export function tipoMaterial(nombre: string, inicio: Uint8Array): TipoMaterial | null {
  const ext = nombre.toLowerCase().split(".").pop() ?? ""
  const tipo = POR_EXTENSION[ext]
  if (!tipo) return null
  const zip = empieza(inicio, [0x50, 0x4b, 0x03, 0x04])
  const ole = empieza(inicio, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  switch (tipo) {
    case "application/pdf":
      return empieza(inicio, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? tipo : null
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return zip ? tipo : null
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return ole ? tipo : null
    case "image/png":
      return empieza(inicio, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? tipo : null
    case "image/jpeg":
      return empieza(inicio, [0xff, 0xd8, 0xff]) ? tipo : null
    case "image/webp":
      return empieza(inicio, [0x52, 0x49, 0x46, 0x46]) && empieza(inicio.slice(8), [0x57, 0x45, 0x42, 0x50]) ? tipo : null
    case "text/plain":
      // Texto: sin bytes nulos en el inicio (no es un binario renombrado).
      return inicio.every((b) => b !== 0) ? tipo : null
  }
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ruta del objeto en el bucket (nombre aleatorio; el nombre original se guarda aparte). */
export function rutaMaterial(institucionId: string, grupoId: string, archivoId: string, tipo: TipoMaterial): string {
  return `${institucionId}/${grupoId}/${archivoId}.${TIPOS_MATERIAL[tipo].ext}`
}

/** true si la ruta pertenece exactamente a la carpeta <institución>/<grupo>/ y tiene un nombre válido. */
export function rutaDeGrupo(ruta: string, institucionId: string, grupoId: string): boolean {
  const partes = ruta.split("/")
  if (partes.length !== 3 || partes[0] !== institucionId || partes[1] !== grupoId) return false
  const [id, ext] = partes[2].split(".")
  return RE_UUID.test(id) && Object.values(TIPOS_MATERIAL).some((t) => t.ext === ext)
}

/** Nombre de archivo presentable (sin rutas ni caracteres de control), máx. 200. */
export function nombreArchivoSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "archivo"
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "archivo"
}

/** Enlace externo autorizado: https, sin credenciales en la URL. */
export function enlaceMaterialValido(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== "https:" || u.username || u.password || url.length > 1000) return null
    return u.toString()
  } catch {
    return null
  }
}

export type MaterialBasico = { id: string; tema: string | null; titulo: string; creado_en: string }

/** Agrupa por tema o semana (orden natural: «Semana 2» antes que «Semana 10»); lo sin tema, al final. */
export function agruparPorTema<T extends MaterialBasico>(materiales: T[]): { tema: string | null; materiales: T[] }[] {
  const grupos = new Map<string | null, T[]>()
  for (const m of materiales) {
    const clave = m.tema?.trim() || null
    grupos.set(clave, [...(grupos.get(clave) ?? []), m])
  }
  const col = new Intl.Collator("es", { numeric: true, sensitivity: "base" })
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : col.compare(a, b)))
    .map(([tema, lista]) => ({ tema, materiales: lista.sort((x, y) => x.creado_en.localeCompare(y.creado_en) || col.compare(x.titulo, y.titulo)) }))
}

export const tamanoLegible = (bytes: number | null | undefined) =>
  !bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
