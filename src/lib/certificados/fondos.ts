import { ALTO_PT as H, ANCHO_PT as W, type BasePlantilla } from "@/lib/certificados/diseno"

/**
 * Fondos ORIGINALES de Academix, dibujados como trazados vectoriales (sintaxis
 * de SVG path, origen arriba a la izquierda, en puntos A4 horizontal). Los usan
 * el editor (SVG) y el PDF (pdf-lib drawSvgPath), así ambos se ven igual.
 * Inspirados en tres líneas visuales (académico azul y dorado, ornamental de
 * capacitación, institucional moderno), sin nombres, sellos ni firmas reales.
 */

export type Trazo = { d: string; relleno?: string; borde?: string; grosor?: number; opacidad?: number }

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`
const circulo = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
const n = (v: number) => Math.round(v * 100) / 100

function estrella(cx: number, cy: number, r1: number, r2: number, puntas: number) {
  const p: string[] = []
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2
    const a = (Math.PI / puntas) * i - Math.PI / 2
    p.push(`${i === 0 ? "M" : "L"}${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`)
  }
  return p.join("") + "Z"
}

/** Ondas finas tipo guilloché (anti-copia visual, decorativas). */
function ondas(y0: number, y1: number, paso: number, amplitud: number) {
  const partes: string[] = []
  for (let y = y0; y <= y1; y += paso) {
    let d = `M0 ${y}`
    for (let x = 0; x < W; x += 120) d += `C${x + 40} ${n(y - amplitud)} ${x + 80} ${n(y + amplitud)} ${x + 120} ${y}`
    partes.push(d)
  }
  return partes.join("")
}

function clasico(): Trazo[] {
  return [
    { d: rect(0, 0, W, H), relleno: "#FBF8F1" },
    { d: ondas(40, H - 40, 9, 5), borde: "#E8DCC0", grosor: 0.4 },
    { d: rect(12, 12, W - 24, H - 24), borde: "#C9A227", grosor: 7 },
    { d: rect(26, 26, W - 52, H - 52), borde: "#C9A227", grosor: 1.2 },
    { d: rect(70, 26, 72, H - 52), relleno: "#1E3A5F" },
    { d: rect(74, 26, 64, H - 52), borde: "#C9A227", grosor: 0.8 },
    // Cintas y sello genérico (sin texto ni escudos).
    { d: `M92 205L80 330L98 312L110 334L114 205Z`, relleno: "#A8841A" },
    { d: `M118 205L122 334L134 312L152 330L140 205Z`, relleno: "#8C6D12" },
    { d: estrella(106, 170, 56, 50, 24), relleno: "#C9A227" },
    { d: circulo(106, 170, 43), borde: "#FFF4C7", grosor: 1.4 },
    { d: circulo(106, 170, 36), borde: "#FFF4C7", grosor: 0.6 },
    { d: estrella(106, 170, 16, 7, 5), relleno: "#FFF4C7" },
    // Detalles en las esquinas.
    ...[[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]].map(([x, y]) => ({
      d: `M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z`, relleno: "#C9A227",
    })),
  ]
}

function ornamental(): Trazo[] {
  const verde = "#2F5D50"
  // Cenefa: círculos y rombos repetidos entre los dos marcos exteriores.
  let cenefa = ""
  for (let x = 30; x <= W - 30; x += 12) cenefa += circulo(x, 30, 3) + circulo(x, H - 30, 3)
  for (let y = 42; y <= H - 42; y += 12) cenefa += circulo(30, y, 3) + circulo(W - 30, y, 3)
  let rombos = ""
  for (let x = 36; x <= W - 36; x += 12) rombos += `M${x} 27L${x + 3} 30L${x} 33L${x - 3} 30Z` + `M${x} ${H - 33}L${x + 3} ${H - 30}L${x} ${H - 27}L${x - 3} ${H - 30}Z`
  // Hojas tenues en el centro (marca de agua decorativa).
  let hojas = ""
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12
    const x = 421 + Math.cos(a) * 120, y = 290 + Math.sin(a) * 80
    hojas += `M421 290Q${n((421 + x) / 2 + Math.sin(a) * 30)} ${n((290 + y) / 2 - Math.cos(a) * 30)} ${n(x)} ${n(y)}Q${n((421 + x) / 2 - Math.sin(a) * 30)} ${n((290 + y) / 2 + Math.cos(a) * 30)} 421 290Z`
  }
  const sello = 421, selloY = 515
  return [
    { d: rect(0, 0, W, H), relleno: "#FDFDFB" },
    { d: ondas(60, H - 60, 11, 4), borde: "#E3ECE8", grosor: 0.35 },
    { d: rect(14, 14, W - 28, H - 28), borde: verde, grosor: 2 },
    { d: rect(20, 20, W - 40, H - 40), borde: verde, grosor: 0.7 },
    { d: cenefa, borde: verde, grosor: 0.6 },
    { d: rombos, relleno: verde, opacidad: 0.8 },
    { d: rect(40, 40, W - 80, H - 80), borde: verde, grosor: 0.7 },
    { d: rect(46, 46, W - 92, H - 92), borde: verde, grosor: 1.6 },
    ...[[46, 46, 1, 1], [W - 46, 46, -1, 1], [46, H - 46, 1, -1], [W - 46, H - 46, -1, -1]].map(([x, y, sx, sy]) => ({
      d: `M${x} ${y + sy * 40}Q${x} ${y} ${x + sx * 40} ${y}M${x + sx * 8} ${y + sy * 30}Q${x + sx * 8} ${y + sy * 8} ${x + sx * 30} ${y + sy * 8}`,
      borde: verde, grosor: 0.9,
    })),
    { d: hojas, relleno: verde, opacidad: 0.05 },
    { d: estrella(sello, selloY, 38, 33, 28), relleno: "#B4232A" },
    { d: circulo(sello, selloY, 26), borde: "#F3B8B8", grosor: 1.2 },
    { d: estrella(sello, selloY, 12, 5, 8), relleno: "#F3B8B8" },
  ]
}

function moderno(): Trazo[] {
  const azul = "#1E3A8A", oro = "#C9A227"
  return [
    { d: rect(0, 0, W, H), relleno: "#FFFFFF" },
    { d: `M0 0H300C220 34 120 70 0 170Z`, relleno: azul },
    { d: `M0 186C130 82 236 46 330 0`, borde: oro, grosor: 5 },
    { d: `M${W} ${H}H420C600 560 740 520 ${W} 410Z`, relleno: azul },
    { d: `M400 ${H}C590 548 744 506 ${W} 392`, borde: oro, grosor: 5 },
    { d: `M${W} 0V120C${W - 50} 70 ${W - 110} 30 ${W - 190} 0Z`, relleno: oro, opacidad: 0.18 },
    { d: rect(28, 28, W - 56, H - 56), borde: "#E2E8F0", grosor: 1 },
    { d: `M${W / 2 - 60} 189H${W / 2 + 60}`, borde: oro, grosor: 1.5 },
  ]
}

export function trazosFondo(base: BasePlantilla): Trazo[] {
  if (base === "clasico") return clasico()
  if (base === "ornamental") return ornamental()
  if (base === "moderno") return moderno()
  return [{ d: rect(0, 0, W, H), relleno: "#FFFFFF" }]
}
