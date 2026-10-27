import QRCode from "qrcode"

/**
 * Código QR como trazado vectorial (un cuadrado por módulo, unidades = módulos).
 * Sin imágenes: se escala sin pérdida en el editor (SVG) y en el PDF. Quien lo
 * dibuja añade la zona de silencio (2 módulos) alrededor.
 */
export function trazoQr(texto: string): { d: string; tamano: number } {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" })
  const { size, data } = qr.modules
  let d = ""
  for (let fila = 0; fila < size; fila++) {
    for (let col = 0; col < size; col++) {
      if (data[fila * size + col]) d += `M${col} ${fila}h1v1h-1z`
    }
  }
  return { d, tamano: size }
}
