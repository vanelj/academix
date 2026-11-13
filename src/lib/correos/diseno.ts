/**
 * Diseño común de TODOS los correos de Academix (puro, sin Next.js).
 *
 * Lo usan:
 *  - los correos transaccionales que envía la app con la API de Resend
 *    (lib/correos/plantillas.ts), y
 *  - las plantillas de Supabase Auth (invitación, recuperación…) que se
 *    sincronizan con `npm run correos:sincronizar` (Management API de Supabase).
 *
 * Compatibilidad con clientes de correo: tablas, estilos EN LÍNEA, sin CSS
 * externo y ancho máximo de 600 px que se adapta a móviles. Colores de
 * Academix Vibrant.
 *
 * Logotipo: el isotipo OFICIAL (src/app/icon.svg) como PNG de 96 px mostrado a
 * 36 px (nítido en pantallas de alta densidad), servido desde una URL HTTPS
 * pública y estable del dominio oficial (public/marca/academix-logo-correo.png).
 * Si el cliente bloquea imágenes se ve el texto alternativo sobre el color de
 * marca, y el nombre «Academix» sigue en texto al lado.
 *
 * Seguridad: las funciones reciben HTML YA ESCAPADO. Usa `escapar()` para todo
 * dato que venga de la base de datos; solo las plantillas de Supabase insertan
 * variables de su motor ({{ .ConfirmationURL }}…) sin escapar, a propósito.
 */

export const COLORES = {
  fondo: "#f4f2fb",
  superficie: "#ffffff",
  tinta: "#1b1446",
  texto: "#3d3566",
  suave: "#6b6490",
  linea: "#e5e5ee",
  violeta: "#6c3bf5",
  violetaSuave: "#eee7ff",
  banda: "#1b1446",
  bandaTexto: "#dcd6ff",
  menta: "#0f6446",
  mentaSuave: "#d7f5ec",
  coral: "#b23a2e",
  coralSuave: "#ffe2dd",
  ambar: "#7a5000",
  ambarSuave: "#fff0c7",
} as const

const FUENTE = "Segoe UI,Roboto,Helvetica,Arial,sans-serif"

/** Dominio oficial: las imágenes de los correos nunca apuntan a localhost ni a rutas privadas. */
export const ORIGEN_OFICIAL = "https://academix.mundosubs.net.pe"
export const RUTA_LOGO_CORREO = "/marca/academix-logo-correo.png"

/** URL pública del logotipo: el sitio configurado si es HTTPS y público; si no, el dominio oficial. */
export function urlLogoCorreo(sitio: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  try {
    const u = new URL(sitio ?? "")
    if (u.protocol === "https:" && !/^(localhost|127\.|\[::1\])/.test(u.hostname)) return `${u.origin}${RUTA_LOGO_CORREO}`
  } catch {
    /* sin sitio válido */
  }
  return `${ORIGEN_OFICIAL}${RUTA_LOGO_CORREO}`
}

export const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

export type Tono = "violeta" | "menta" | "coral" | "ambar"
const TONO: Record<Tono, { fondo: string; texto: string }> = {
  violeta: { fondo: COLORES.violetaSuave, texto: COLORES.violeta },
  menta: { fondo: COLORES.mentaSuave, texto: COLORES.menta },
  coral: { fondo: COLORES.coralSuave, texto: COLORES.coral },
  ambar: { fondo: COLORES.ambarSuave, texto: COLORES.ambar },
}

/** Párrafo (html ya escapado). */
export const parrafo = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${COLORES.texto}">${html}</p>`

/** Nota pequeña (html ya escapado). */
export const nota = (html: string) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${COLORES.suave}">${html}</p>`

/** Tabla de datos clave → valor (ambos ya escapados). */
export function detalles(filas: [string, string][]): string {
  if (filas.length === 0) return ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border:1px solid ${COLORES.linea};border-radius:12px;border-collapse:separate">${filas
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 14px;font-size:13px;color:${COLORES.suave};width:42%;${i ? `border-top:1px solid ${COLORES.linea};` : ""}">${k}</td><td style="padding:10px 14px;font-size:14px;color:${COLORES.tinta};font-weight:600;${i ? `border-top:1px solid ${COLORES.linea};` : ""}">${v}</td></tr>`
    )
    .join("")}</table>`
}

/** Lista con viñetas (elementos ya escapados). */
export const lista = (elementos: string[]) =>
  elementos.length ? `<ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.75;color:${COLORES.texto}">${elementos.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""

/** Caja destacada (título y cuerpo ya escapados). */
export function caja(titulo: string, cuerpo: string, tono: Tono = "violeta"): string {
  const t = TONO[tono]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="padding:14px 16px;background:${t.fondo};border-radius:12px"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${t.texto}">${titulo}</p><p style="margin:0;font-size:14px;line-height:1.6;color:${COLORES.texto};white-space:pre-line">${cuerpo}</p></td></tr></table>`
}

/** Botón principal (href y texto ya escapados) + enlace de respaldo en texto. */
export function boton(href: string, texto: string, conRespaldo = false): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:999px;background:${COLORES.violeta}"><a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${texto}</a></td></tr></table>${
    conRespaldo
      ? `<p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:${COLORES.suave}">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${href}" style="color:${COLORES.violeta};word-break:break-all">${href}</a></p>`
      : ""
  }`
}

export type Plantilla = {
  /** <title> y vista previa en la bandeja (ya escapados). */
  titulo: string
  preencabezado?: string
  /** Etiqueta superior (p. ej. «Invitación docente», «Pagos»), ya escapada. */
  etiqueta?: string
  tono?: Tono
  /** Encabezado grande (ya escapado). */
  encabezado: string
  /** Institución mostrada junto al logo (ya escapada), si aplica. */
  institucion?: string | null
  /** Cuerpo (HTML ya armado con los componentes). */
  cuerpo: string
  /** Pie (HTML ya escapado). */
  pie: string
}

/** Documento completo del correo. */
export function documento(p: Plantilla): string {
  const t = TONO[p.tono ?? "violeta"]
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${p.titulo}</title></head>
<body style="margin:0;padding:0;background:${COLORES.fondo};font-family:${FUENTE};-webkit-text-size-adjust:100%">
${p.preencabezado ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${p.preencabezado}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORES.fondo};padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 16px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;background:#2563eb;border-radius:10px;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#ffffff;font-family:${FUENTE}"><img src="${urlLogoCorreo()}" width="36" height="36" alt="Academix" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;border-radius:10px;color:#ffffff;font-size:11px"></td>
    <td style="padding-left:10px;font-size:19px;font-weight:800;color:${COLORES.tinta};font-family:${FUENTE}">Academix${p.institucion ? `<span style="font-weight:500;color:${COLORES.suave};font-size:14px"> &middot; ${p.institucion}</span>` : ""}</td>
  </tr></table>
</td></tr>
<tr><td style="background:${COLORES.superficie};border-radius:20px;border:1px solid ${COLORES.linea};overflow:hidden">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:6px;background:${COLORES.violeta};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:30px 32px 10px">
      ${p.etiqueta ? `<p style="margin:0 0 12px"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${t.fondo};color:${t.texto};font-size:12px;font-weight:700;letter-spacing:.02em">${p.etiqueta}</span></p>` : ""}
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:${COLORES.tinta};font-weight:800">${p.encabezado}</h1>
      ${p.cuerpo}
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:${COLORES.suave};text-align:center">${p.pie}</td></tr>
</table></td></tr></table></body></html>`
}
