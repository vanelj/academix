import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"

import {
  ajustarTexto,
  ALTO_PT as H,
  ANCHO_PT as W,
  MARCA_DEMOSTRACION,
  resolverTexto,
  type BasePlantilla,
  type Campo,
  type Diseno,
  type ValoresCertificado,
} from "@/lib/certificados/diseno"
import { trazosFondo } from "@/lib/certificados/fondos"
import { trazoQr } from "@/lib/certificados/qr"

/**
 * Generación del certificado en PDF A4 horizontal (SOLO servidor).
 *
 * Entradas ya resueltas: diseño (campos), valores de los marcadores, bytes del
 * fondo propio (PNG/JPG normalizados o PDF), logotipo y firma (PNG). Fuentes
 * estándar PDF (Times y Helvetica): legibles, sin descargas y con tildes y ñ.
 *
 * - Textos largos (nombres): se reduce la letra hasta el 55 % y, si aún no
 *   caben, se reparten en dos líneas. Nunca se salen de su caja.
 * - QR vectorial: nítido a cualquier tamaño de impresión.
 * - Modo demostración: marca de agua «DEMOSTRACIÓN — SIN VALIDEZ» y QR sin
 *   enlace de verificación.
 */

export type EntradaPdf = {
  base: BasePlantilla
  diseno: Diseno
  valores: ValoresCertificado
  fondo?: { bytes: Uint8Array; tipo: "image/png" | "image/jpeg" | "application/pdf" } | null
  logo?: Uint8Array | null
  firma?: Uint8Array | null
  /** Contenido del QR: enlace de verificación (real) o texto de demostración. */
  qr: string
  demostracion: boolean
  titulo: string
}

type Fuentes = Record<"serif" | "sans", Record<"n" | "b" | "i" | "bi", PDFFont>>

const color = (hex: string) => {
  const v = parseInt(hex.slice(1), 16)
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)
}

/** Quita caracteres que la codificación de la fuente estándar no admite. */
function seguro(fuente: PDFFont, texto: string): string {
  try {
    fuente.encodeText(texto)
    return texto
  } catch {
    return [...texto]
      .filter((c) => {
        try {
          fuente.encodeText(c)
          return true
        } catch {
          return false
        }
      })
      .join("")
  }
}

function fuenteDe(f: Fuentes, c: Campo) {
  return f[c.fuente][c.negrita && c.cursiva ? "bi" : c.negrita ? "b" : c.cursiva ? "i" : "n"]
}

function dibujarTexto(page: PDFPage, f: Fuentes, c: Campo, valores: ValoresCertificado) {
  let texto = resolverTexto(c.texto, valores)
  if (!texto) return
  if (c.mayusculas) texto = texto.toLocaleUpperCase("es-PE")
  const fuente = fuenteDe(f, c)
  texto = seguro(fuente, texto)
  const bx = c.x * W, by = c.y * H, bw = c.w * W, bh = c.h * H
  const { lineas, tamano } = ajustarTexto(texto, (t, s) => fuente.widthOfTextAtSize(t, s), c.tamano, bw, bh)
  const alto = lineas.length * tamano * 1.15
  lineas.forEach((linea, i) => {
    const w = fuente.widthOfTextAtSize(linea, tamano)
    const x = c.alineacion === "izquierda" ? bx : c.alineacion === "derecha" ? bx + bw - w : bx + (bw - w) / 2
    const base = by + (bh - alto) / 2 + tamano * 0.88 + i * tamano * 1.15
    page.drawText(linea, { x, y: H - base, size: tamano, font: fuente, color: color(c.color) })
  })
}

function dibujarImagen(page: PDFPage, img: PDFImage, c: Campo) {
  const bw = c.w * W, bh = c.h * H
  const escala = Math.min(bw / img.width, bh / img.height)
  const w = img.width * escala, h = img.height * escala
  const x = c.x * W + (bw - w) / 2
  const yTop = c.y * H + (bh - h) / 2
  page.drawImage(img, { x, y: H - yTop - h, width: w, height: h })
}

function dibujarQr(page: PDFPage, contenido: string, c: Campo) {
  const lado = Math.min(c.w * W, c.h * H)
  const x = c.x * W + (c.w * W - lado) / 2
  const yTop = c.y * H + (c.h * H - lado) / 2
  const { d, tamano } = trazoQr(contenido)
  const modulo = lado / (tamano + 4)
  page.drawRectangle({ x, y: H - yTop - lado, width: lado, height: lado, color: rgb(1, 1, 1) })
  page.drawSvgPath(d, { x: x + modulo * 2, y: H - yTop - modulo * 2, scale: modulo, color: rgb(0, 0, 0) })
}

export async function generarPdfCertificado(e: EntradaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(e.titulo)
  doc.setCreator("Academix")
  doc.setProducer("Academix")
  if (e.demostracion) doc.setSubject(MARCA_DEMOSTRACION)
  const page = doc.addPage([W, H])

  const cargar = (n: StandardFonts) => doc.embedFont(n)
  const f: Fuentes = {
    serif: {
      n: await cargar(StandardFonts.TimesRoman), b: await cargar(StandardFonts.TimesRomanBold),
      i: await cargar(StandardFonts.TimesRomanItalic), bi: await cargar(StandardFonts.TimesRomanBoldItalic),
    },
    sans: {
      n: await cargar(StandardFonts.Helvetica), b: await cargar(StandardFonts.HelveticaBold),
      i: await cargar(StandardFonts.HelveticaOblique), bi: await cargar(StandardFonts.HelveticaBoldOblique),
    },
  }

  // 1. Fondo: plantilla de Academix (vectorial) o archivo propio.
  if (e.base === "propia" && e.fondo) {
    if (e.fondo.tipo === "application/pdf") {
      const [pagina] = await doc.embedPdf(e.fondo.bytes, [0])
      page.drawPage(pagina, { x: 0, y: 0, width: W, height: H })
    } else {
      const img = e.fondo.tipo === "image/png" ? await doc.embedPng(e.fondo.bytes) : await doc.embedJpg(e.fondo.bytes)
      page.drawImage(img, { x: 0, y: 0, width: W, height: H })
    }
  } else {
    for (const t of trazosFondo(e.base)) {
      page.drawSvgPath(t.d, {
        x: 0,
        y: H,
        ...(t.relleno ? { color: color(t.relleno), opacity: t.opacidad ?? 1 } : {}),
        ...(t.borde ? { borderColor: color(t.borde), borderWidth: t.grosor ?? 1, borderOpacity: t.opacidad ?? 1 } : {}),
      })
    }
  }

  // 2. Campos.
  const logo = e.logo ? await doc.embedPng(e.logo).catch(() => null) : null
  const firma = e.firma ? await doc.embedPng(e.firma).catch(() => null) : null
  for (const c of e.diseno.campos) {
    if (!c.visible) continue
    if (c.tipo === "texto") dibujarTexto(page, f, c, e.valores)
    else if (c.tipo === "logo" && logo) dibujarImagen(page, logo, c)
    else if (c.tipo === "firma" && firma) dibujarImagen(page, firma, c)
    else if (c.tipo === "qr") dibujarQr(page, e.qr, c)
    else if (c.tipo === "linea") {
      const y = H - (c.y + c.h / 2) * H
      page.drawLine({ start: { x: c.x * W, y }, end: { x: (c.x + c.w) * W, y }, thickness: c.tamano, color: color(c.color) })
    }
  }

  // 3. Marca de demostración.
  if (e.demostracion) {
    const fuente = f.sans.b
    const tamano = 50
    const ancho = fuente.widthOfTextAtSize(MARCA_DEMOSTRACION, tamano)
    const angulo = 24
    const rad = (angulo * Math.PI) / 180
    page.drawText(MARCA_DEMOSTRACION, {
      x: W / 2 - (ancho / 2) * Math.cos(rad),
      y: H / 2 - (ancho / 2) * Math.sin(rad),
      size: tamano, font: fuente, color: rgb(0.8, 0.1, 0.1), opacity: 0.2, rotate: degrees(angulo),
    })
    const aviso = "Vista previa con datos ficticios. No es un certificado y no puede verificarse."
    page.drawRectangle({ x: 0, y: H - 16, width: W, height: 16, color: rgb(0.8, 0.1, 0.1), opacity: 0.85 })
    page.drawText(aviso, { x: (W - f.sans.n.widthOfTextAtSize(aviso, 8)) / 2, y: H - 11, size: 8, font: f.sans.n, color: rgb(1, 1, 1) })
  }

  return doc.save()
}
