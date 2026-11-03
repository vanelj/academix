"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, TriangleAlert, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  PORTADA_ACCEPT,
  PORTADA_ALTO,
  PORTADA_ANCHO,
  PORTADA_FORMATOS_TEXTO,
  PORTADA_MAX_BYTES,
  PORTADA_MIN_LADO,
  PORTADA_ORIGINAL_MAX_BYTES,
  validarArchivoPortada,
} from "@/lib/cursos/portada"
import { cn } from "@/lib/utils"

/**
 * Portada del curso: elegir o arrastrar, validar el contenido real, previsualizar
 * y ajustar el encuadre 16:9 (zoom y posición) con <canvas>, sin dependencias.
 * El resultado se recomprime a WebP (o JPEG si el navegador no admite WebP),
 * lo que además elimina los metadatos de la foto (EXIF/GPS).
 *
 * No sube nada por sí mismo: entrega la imagen recortada con `alCambiarPendiente`
 * y el asistente la sube al guardar el paso (el curso debe existir).
 */

type Encuadre = { zoom: number; x: number; y: number }
const ENCUADRE_INICIAL: Encuadre = { zoom: 1, x: 50, y: 50 }

export function PortadaCurso({
  portadaActual,
  disponible,
  deshabilitado,
  pendiente,
  alCambiarPendiente,
  alCambiarProcesando,
  alQuitarActual,
  quitando,
}: {
  portadaActual: string | null
  /** false = la migración de portadas aún no está aplicada. */
  disponible: boolean
  deshabilitado?: boolean
  pendiente: Blob | null
  alCambiarPendiente: (imagen: Blob | null) => void
  alCambiarProcesando?: (procesando: boolean) => void
  alQuitarActual?: () => void
  quitando?: boolean
}) {
  const idEntrada = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const urlImagen = useRef<string | null>(null)
  const solicitudImagen = useRef(0)
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null)
  const [encuadre, setEncuadre] = useState<Encuadre>(ENCUADRE_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [procesando, setProcesando] = useState(false)

  function cambiarProcesando(valor: boolean) {
    setProcesando(valor)
    alCambiarProcesando?.(valor)
  }

  useEffect(() => () => {
    solicitudImagen.current += 1
    if (urlImagen.current) URL.revokeObjectURL(urlImagen.current)
    urlImagen.current = null
  }, [])

  // Dibuja la vista previa con el mismo recorte que se exportará (lo que ves es lo que se sube).
  useEffect(() => {
    if (imagen && lienzo.current) dibujar(lienzo.current, imagen, encuadre, 640, 360)
  }, [imagen, encuadre])

  async function elegir(archivo: File | undefined) {
    const solicitud = ++solicitudImagen.current
    setError(null)
    setAviso(null)
    if (!archivo) {
      cambiarProcesando(false)
      return
    }
    cambiarProcesando(true)
    let v: Awaited<ReturnType<typeof validarArchivoPortada>>
    try {
      v = await validarArchivoPortada(archivo, PORTADA_ORIGINAL_MAX_BYTES)
    } catch {
      if (solicitud === solicitudImagen.current) {
        setError("No se pudo leer la imagen. Inténtalo con otro archivo.")
        cambiarProcesando(false)
      }
      return
    }
    if (solicitud !== solicitudImagen.current) return
    if (!v.ok) {
      setError(v.mensaje)
      cambiarProcesando(false)
      return
    }
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      if (solicitud !== solicitudImagen.current) {
        URL.revokeObjectURL(url)
        return
      }
      if (urlImagen.current) URL.revokeObjectURL(urlImagen.current)
      urlImagen.current = url
      if (Math.min(img.naturalWidth, img.naturalHeight) < PORTADA_MIN_LADO) {
        setAviso(`La imagen es pequeña (${img.naturalWidth}×${img.naturalHeight} px): podría verse borrosa. Recomendado: ${PORTADA_ANCHO}×${PORTADA_ALTO} px.`)
      }
      setImagen(img)
      setEncuadre(ENCUADRE_INICIAL)
      void exportar(img, ENCUADRE_INICIAL)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      if (solicitud === solicitudImagen.current) {
        cambiarProcesando(false)
        setError("No se pudo leer la imagen. Puede estar dañada.")
      }
    }
    img.src = url
  }

  async function exportar(img: HTMLImageElement, e: Encuadre) {
    cambiarProcesando(true)
    try {
      const blob = await recortar(img, e)
      if (!blob) {
        setError("No se pudo preparar la imagen en este navegador.")
        alCambiarPendiente(null)
      } else if (blob.size > PORTADA_MAX_BYTES) {
        setError("La portada recortada supera 3 MB. Prueba con otra imagen.")
        alCambiarPendiente(null)
      } else {
        alCambiarPendiente(blob)
      }
    } catch {
      setError("No se pudo preparar la imagen en este navegador.")
      alCambiarPendiente(null)
    } finally {
      cambiarProcesando(false)
    }
  }

  function cambiarEncuadre(parcial: Partial<Encuadre>) {
    const nuevo = { ...encuadre, ...parcial }
    setEncuadre(nuevo)
  }

  function descartar() {
    solicitudImagen.current += 1
    if (urlImagen.current) URL.revokeObjectURL(urlImagen.current)
    urlImagen.current = null
    cambiarProcesando(false)
    setImagen(null)
    setEncuadre(ENCUADRE_INICIAL)
    setAviso(null)
    setError(null)
    alCambiarPendiente(null)
    if (entrada.current) entrada.current.value = ""
  }

  if (!disponible) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <p className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          La portada se podrá cargar cuando se aplique la migración «portadas_cursos_v5» en la base de datos. Mientras
          tanto, el catálogo muestra la portada generada de la categoría.
        </p>
      </div>
    )
  }

  const bloqueado = deshabilitado || procesando || quitando

  return (
    <div className="space-y-3">
      {imagen ? (
        <div className="space-y-3">
          <canvas
            ref={lienzo}
            width={640}
            height={360}
            className="aspect-video w-full max-w-xl rounded-2xl bg-muted ring-1 ring-border"
            role="img"
            aria-label="Vista previa de la portada recortada"
          />
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <Deslizador etiqueta="Zoom" min={1} max={3} step={0.05} valor={encuadre.zoom} disabled={bloqueado}
              onCambio={(v) => cambiarEncuadre({ zoom: v })} onFin={() => imagen && exportar(imagen, encuadre)} />
            <Deslizador etiqueta="Horizontal" min={0} max={100} step={1} valor={encuadre.x} disabled={bloqueado}
              onCambio={(v) => cambiarEncuadre({ x: v })} onFin={() => imagen && exportar(imagen, encuadre)} />
            <Deslizador etiqueta="Vertical" min={0} max={100} step={1} valor={encuadre.y} disabled={bloqueado}
              onCambio={(v) => cambiarEncuadre({ y: v })} onFin={() => imagen && exportar(imagen, encuadre)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={bloqueado} onClick={() => entrada.current?.click()}>
              <ImagePlus aria-hidden />
              Elegir otra imagen
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={bloqueado} onClick={descartar}>
              Descartar
            </Button>
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {procesando ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden />Preparando…</span>
              ) : pendiente ? (
                `Lista para guardar · ${(pendiente.size / 1024).toFixed(0)} KB · ${PORTADA_ANCHO}×${PORTADA_ALTO} px máx.`
              ) : null}
            </p>
          </div>
        </div>
      ) : portadaActual ? (
        <div className="space-y-3">
          {/* La portada es una URL pública del bucket (dominio de Supabase): se muestra tal cual. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portadaActual} alt="Portada actual del curso" className="aspect-video w-full max-w-xl rounded-2xl object-cover ring-1 ring-border" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={bloqueado} onClick={() => entrada.current?.click()}>
              <Upload aria-hidden />
              Reemplazar portada
            </Button>
            {alQuitarActual && (
              <Button type="button" variant="destructive" size="sm" disabled={bloqueado} onClick={alQuitarActual}>
                {quitando ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                Quitar portada
              </Button>
            )}
          </div>
        </div>
      ) : (
        <label
          htmlFor={idEntrada}
          onDragOver={(e) => {
            e.preventDefault()
            if (!bloqueado) setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            if (!bloqueado) void elegir(e.dataTransfer.files?.[0])
          }}
          className={cn(
            "flex aspect-video w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
            arrastrando ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-muted/40",
            bloqueado && "pointer-events-none opacity-60"
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <ImagePlus className="size-6" aria-hidden />
          </span>
          <span className="font-medium">Arrastra una imagen o haz clic para elegirla</span>
          <span className="text-xs text-muted-foreground">
            {PORTADA_FORMATOS_TEXTO} · máx. {PORTADA_ORIGINAL_MAX_BYTES / 1024 / 1024} MB · se recorta a 16:9 ({PORTADA_ANCHO}×{PORTADA_ALTO} px)
          </span>
        </label>
      )}

      <input
        ref={entrada}
        id={idEntrada}
        type="file"
        accept={PORTADA_ACCEPT}
        className="sr-only"
        disabled={bloqueado}
        onChange={(e) => void elegir(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {aviso && !error && <p className="flex gap-2 text-xs text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />{aviso}</p>}
    </div>
  )
}

function Deslizador({
  etiqueta,
  min,
  max,
  step,
  valor,
  disabled,
  onCambio,
  onFin,
}: {
  etiqueta: string
  min: number
  max: number
  step: number
  valor: number
  disabled?: boolean
  onCambio: (v: number) => void
  onFin: () => void
}) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{etiqueta}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={valor}
        disabled={disabled}
        onChange={(e) => onCambio(Number(e.target.value))}
        onPointerUp={onFin}
        onKeyUp={onFin}
        className="accent-primary"
      />
    </div>
  )
}

/** Rectángulo de recorte 16:9 dentro de la imagen según zoom y posición (0–100 %). */
function rectangulo(img: HTMLImageElement, e: Encuadre) {
  const W = img.naturalWidth
  const H = img.naturalHeight
  const proporcion = PORTADA_ANCHO / PORTADA_ALTO
  let w = W
  let h = W / proporcion
  if (h > H) {
    h = H
    w = H * proporcion
  }
  w /= e.zoom
  h /= e.zoom
  const x = ((W - w) * e.x) / 100
  const y = ((H - h) * e.y) / 100
  return { x, y, w, h }
}

function dibujar(canvas: HTMLCanvasElement, img: HTMLImageElement, e: Encuadre, ancho: number, alto: number) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const r = rectangulo(img, e)
  ctx.imageSmoothingQuality = "high"
  ctx.clearRect(0, 0, ancho, alto)
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, ancho, alto)
}

/** Exporta el recorte (sin ampliar por encima del tamaño real) a WebP o JPEG. */
async function recortar(img: HTMLImageElement, e: Encuadre): Promise<Blob | null> {
  const r = rectangulo(img, e)
  const ancho = Math.round(Math.min(PORTADA_ANCHO, r.w))
  const alto = Math.round(ancho * (PORTADA_ALTO / PORTADA_ANCHO))
  const canvas = document.createElement("canvas")
  canvas.width = ancho
  canvas.height = alto
  dibujar(canvas, img, e, ancho, alto)
  const aBlob = (tipo: string, calidad: number) =>
    new Promise<Blob | null>((resolver) => canvas.toBlob((b) => resolver(b), tipo, calidad))
  let blob = await aBlob("image/webp", 0.86)
  // Algunos navegadores devuelven PNG si no admiten WebP: se usa JPEG en su lugar.
  if (!blob || blob.type !== "image/webp") blob = await aBlob("image/jpeg", 0.86)
  if (blob && blob.size > PORTADA_MAX_BYTES) blob = await aBlob(blob.type, 0.7)
  return blob
}
