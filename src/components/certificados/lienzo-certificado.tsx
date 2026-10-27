"use client"

import { useMemo, useRef } from "react"

import {
  ajustarTexto,
  ALTO_PT as H,
  ANCHO_PT as W,
  MARCA_DEMOSTRACION,
  resolverTexto,
  type BasePlantilla,
  type Campo,
  type ValoresCertificado,
} from "@/lib/certificados/diseno"
import { trazosFondo } from "@/lib/certificados/fondos"
import { trazoQr } from "@/lib/certificados/qr"

/**
 * Vista del certificado en SVG (coordenadas en pt, A4 horizontal). Usa los mismos
 * trazos de fondo y la misma regla de ajuste de texto que el PDF, por eso lo que
 * se ve aquí coincide con el documento (salvo diferencias mínimas de fuente del
 * navegador; la «Vista previa PDF» es la referencia exacta).
 */

const FAMILIA = { serif: "'Times New Roman', Times, serif", sans: "Helvetica, Arial, sans-serif" } as const

let lienzoMedida: CanvasRenderingContext2D | null = null
function medir(texto: string, tamano: number, c: Campo) {
  if (typeof document === "undefined") return texto.length * tamano * 0.5
  lienzoMedida ??= document.createElement("canvas").getContext("2d")
  if (!lienzoMedida) return texto.length * tamano * 0.5
  lienzoMedida.font = `${c.cursiva ? "italic " : ""}${c.negrita ? "bold " : ""}${tamano}px ${FAMILIA[c.fuente]}`
  return lienzoMedida.measureText(texto).width
}

export type FondoLienzo = { tipo: "base"; base: BasePlantilla } | { tipo: "imagen"; url: string } | { tipo: "pdf" } | { tipo: "sin_fondo" }

type Props = {
  fondo: FondoLienzo
  campos: Campo[]
  valores: ValoresCertificado
  logoUrl?: string | null
  firmaUrl?: string | null
  demostracion?: boolean
  /** Edición: selección y arrastre. */
  seleccionado?: string | null
  alSeleccionar?: (id: string | null) => void
  alMover?: (id: string, caja: Pick<Campo, "x" | "y" | "w" | "h">) => void
  className?: string
}

export function LienzoCertificado({ fondo, campos, valores, logoUrl, firmaUrl, demostracion, seleccionado, alSeleccionar, alMover, className }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const arrastre = useRef<{ id: string; modo: "mover" | "tamano"; inicio: { x: number; y: number }; caja: Pick<Campo, "x" | "y" | "w" | "h"> } | null>(null)
  const editable = !!alMover
  const trazos = useMemo(() => (fondo.tipo === "base" ? trazosFondo(fondo.base) : []), [fondo])
  const qr = useMemo(() => trazoQr(demostracion ? MARCA_DEMOSTRACION : (valores.url_verificacion ?? MARCA_DEMOSTRACION)), [demostracion, valores.url_verificacion])

  function punto(e: React.PointerEvent) {
    const m = svg.current?.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x / W, y: p.y / H }
  }

  function empezar(e: React.PointerEvent, c: Campo, modo: "mover" | "tamano") {
    if (!editable) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    alSeleccionar?.(c.id)
    arrastre.current = { id: c.id, modo, inicio: punto(e), caja: { x: c.x, y: c.y, w: c.w, h: c.h } }
  }

  function mover(e: React.PointerEvent) {
    const a = arrastre.current
    if (!a || !alMover) return
    const p = punto(e)
    const dx = p.x - a.inicio.x, dy = p.y - a.inicio.y
    const r = (v: number) => Math.round(v * 1000) / 1000
    if (a.modo === "mover") {
      alMover(a.id, { ...a.caja, x: r(Math.min(Math.max(0, a.caja.x + dx), 1 - a.caja.w)), y: r(Math.min(Math.max(0, a.caja.y + dy), 1 - a.caja.h)) })
    } else {
      alMover(a.id, { ...a.caja, w: r(Math.min(Math.max(0.02, a.caja.w + dx), 1 - a.caja.x)), h: r(Math.min(Math.max(0.01, a.caja.h + dy), 1 - a.caja.y)) })
    }
  }

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={demostracion ? `Vista previa del certificado. ${MARCA_DEMOSTRACION}` : "Certificado"}
      onPointerMove={mover}
      onPointerUp={() => (arrastre.current = null)}
      onPointerDown={() => editable && alSeleccionar?.(null)}
      style={{ touchAction: editable ? "none" : undefined, userSelect: "none" }}
    >
      {fondo.tipo === "base" && trazos.map((t, i) => (
        <path key={i} d={t.d} fill={t.relleno ?? "none"} stroke={t.borde ?? "none"} strokeWidth={t.grosor ?? 1} opacity={t.opacidad ?? 1} />
      ))}
      {fondo.tipo === "imagen" && <image href={fondo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
      {(fondo.tipo === "pdf" || fondo.tipo === "sin_fondo") && (
        <>
          <rect width={W} height={H} fill="#FFFFFF" stroke="#CBD5E1" strokeDasharray="6 6" />
          <text x={W / 2} y={H - 22} textAnchor="middle" fontSize={11} fill="#94A3B8" fontFamily={FAMILIA.sans}>
            {fondo.tipo === "pdf" ? "Fondo PDF: se muestra en la «Vista previa PDF». Aquí solo se ubican los campos." : "Sin fondo"}
          </text>
        </>
      )}

      {campos.filter((c) => c.visible).map((c) => {
        const bx = c.x * W, by = c.y * H, bw = c.w * W, bh = c.h * H
        let contenido: React.ReactNode = null
        if (c.tipo === "texto") {
          let texto = resolverTexto(c.texto, valores)
          if (texto && c.mayusculas) texto = texto.toLocaleUpperCase("es-PE")
          if (texto) {
            const { lineas, tamano } = ajustarTexto(texto, (t, s) => medir(t, s, c), c.tamano, bw, bh)
            const alto = lineas.length * tamano * 1.15
            const anchor = c.alineacion === "izquierda" ? "start" : c.alineacion === "derecha" ? "end" : "middle"
            const x = c.alineacion === "izquierda" ? bx : c.alineacion === "derecha" ? bx + bw : bx + bw / 2
            contenido = lineas.map((l, i) => (
              <text key={i} x={x} y={by + (bh - alto) / 2 + tamano * 0.88 + i * tamano * 1.15} textAnchor={anchor} fontSize={tamano} fill={c.color}
                fontFamily={FAMILIA[c.fuente]} fontWeight={c.negrita ? 700 : 400} fontStyle={c.cursiva ? "italic" : "normal"}>
                {l}
              </text>
            ))
          } else if (editable) {
            contenido = <text x={bx + bw / 2} y={by + bh / 2 + 4} textAnchor="middle" fontSize={9} fill="#94A3B8" fontFamily={FAMILIA.sans}>{c.etiqueta} (sin dato)</text>
          }
        } else if (c.tipo === "logo" || c.tipo === "firma") {
          const url = c.tipo === "logo" ? logoUrl : firmaUrl
          contenido = url ? (
            <image href={url} x={bx} y={by} width={bw} height={bh} preserveAspectRatio="xMidYMid meet" />
          ) : editable ? (
            <>
              <rect x={bx} y={by} width={bw} height={bh} fill="#F1F5F9" opacity={0.7} />
              <text x={bx + bw / 2} y={by + bh / 2 + 4} textAnchor="middle" fontSize={10} fill="#64748B" fontFamily={FAMILIA.sans}>{c.tipo === "logo" ? "Logotipo" : "Firma"}</text>
            </>
          ) : null
        } else if (c.tipo === "qr") {
          const lado = Math.min(bw, bh)
          const modulo = lado / (qr.tamano + 4)
          contenido = (
            <g transform={`translate(${bx + (bw - lado) / 2} ${by + (bh - lado) / 2})`}>
              <rect width={lado} height={lado} fill="#FFFFFF" />
              <path d={qr.d} transform={`translate(${modulo * 2} ${modulo * 2}) scale(${modulo})`} fill="#000000" />
            </g>
          )
        } else if (c.tipo === "linea") {
          contenido = <line x1={bx} x2={bx + bw} y1={by + bh / 2} y2={by + bh / 2} stroke={c.color} strokeWidth={c.tamano} />
        }
        const activo = seleccionado === c.id
        return (
          <g key={c.id}>
            {contenido}
            {editable && (
              <>
                <rect
                  x={bx} y={by} width={bw} height={Math.max(bh, 6)}
                  fill="transparent"
                  stroke={activo ? "#2563EB" : "#94A3B8"}
                  strokeOpacity={activo ? 1 : 0.35}
                  strokeDasharray={activo ? "4 3" : "2 3"}
                  strokeWidth={activo ? 1.2 : 0.6}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => empezar(e, c, "mover")}
                >
                  <title>{c.etiqueta}</title>
                </rect>
                {activo && (
                  <rect x={bx + bw - 5} y={by + Math.max(bh, 6) - 5} width={10} height={10} fill="#2563EB" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => empezar(e, c, "tamano")} />
                )}
              </>
            )}
          </g>
        )
      })}

      {demostracion && (
        <>
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={50} fontWeight={700} fill="#CC1A1A" opacity={0.18} fontFamily={FAMILIA.sans}
            transform={`rotate(-24 ${W / 2} ${H / 2})`} style={{ pointerEvents: "none" }}>
            {MARCA_DEMOSTRACION}
          </text>
          <rect x={0} y={0} width={W} height={16} fill="#CC1A1A" opacity={0.85} style={{ pointerEvents: "none" }} />
          <text x={W / 2} y={11} textAnchor="middle" fontSize={8} fill="#FFFFFF" fontFamily={FAMILIA.sans} style={{ pointerEvents: "none" }}>
            Vista previa con datos ficticios. No es un certificado y no puede verificarse.
          </text>
        </>
      )}
    </svg>
  )
}
