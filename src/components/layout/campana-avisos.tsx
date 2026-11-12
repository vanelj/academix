"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { Bell, CheckCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { leerAvisos, marcarAvisosLeidos, type BandejaAvisos } from "@/lib/avisos/acciones"
import { enlaceInterno, haceCuanto, textoContador, type Aviso } from "@/lib/avisos/formato"
import { cn } from "@/lib/utils"

const INTERVALO_MS = 60_000

/**
 * Campana de notificaciones del panel. Consulta la bandeja al cargar, cada
 * minuto mientras la pestaña está visible y al volver a ella (sin
 * infraestructura de tiempo real). Si la migración no está aplicada, no se muestra.
 */
export function CampanaAvisos() {
  const id = useId()
  const [bandeja, setBandeja] = useState<BandejaAvisos | null>(null)
  const [error, setError] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [marcando, setMarcando] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const ocupado = useRef(false)

  const cargar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      setBandeja(await leerAvisos())
      setError(false)
    } catch {
      setError(true)
    } finally {
      ocupado.current = false
    }
  }, [])

  useEffect(() => {
    // Primera lectura en un callback (no dentro del cuerpo del efecto).
    const inicial = window.setTimeout(() => void cargar(), 0)
    const temporizador = window.setInterval(() => { if (document.visibilityState === "visible") void cargar() }, INTERVALO_MS)
    const alVolver = () => { if (document.visibilityState === "visible") void cargar() }
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      window.clearTimeout(inicial)
      window.clearInterval(temporizador)
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [cargar])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!contenedor.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus() } }
    document.addEventListener("pointerdown", fuera)
    document.addEventListener("keydown", tecla)
    return () => {
      document.removeEventListener("pointerdown", fuera)
      document.removeEventListener("keydown", tecla)
    }
  }, [abierto])

  if (!bandeja || !bandeja.disponible) return null
  const { avisos, noLeidas } = bandeja

  function marcarLocal(ids: string[] | null) {
    setBandeja((b) => {
      if (!b || !b.disponible) return b
      const ahora = new Date().toISOString()
      const avisos = b.avisos.map((a) => (!a.leida_en && (!ids || ids.includes(a.id)) ? { ...a, leida_en: ahora } : a))
      const marcadas = b.avisos.filter((a) => !a.leida_en && (!ids || ids.includes(a.id))).length
      return { ...b, avisos, noLeidas: ids ? Math.max(0, b.noLeidas - marcadas) : 0 }
    })
  }

  async function marcarTodas() {
    if (marcando) return
    setMarcando(true)
    marcarLocal(null)
    const r = await marcarAvisosLeidos().catch(() => ({ ok: false }))
    if (!r.ok) void cargar()
    setMarcando(false)
  }

  function abrirAviso(a: Aviso) {
    setAbierto(false)
    if (!a.leida_en) {
      marcarLocal([a.id])
      void marcarAvisosLeidos([a.id]).catch(() => undefined)
    }
  }

  return (
    <div ref={contenedor} className="relative">
      <Button
        ref={boton}
        variant="ghost"
        size="icon"
        onClick={() => { setAbierto((v) => !v); if (!abierto) void cargar() }}
        aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : "Notificaciones"}
        aria-expanded={abierto}
        aria-controls={`${id}-panel`}
        className="relative"
      >
        <Bell aria-hidden />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white" aria-hidden>
            {textoContador(noLeidas)}
          </span>
        )}
      </Button>
      {abierto && (
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-label="Notificaciones"
          className="fixed inset-x-4 top-16 z-50 rounded-2xl border bg-popover text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            <Button variant="ghost" size="sm" onClick={marcarTodas} disabled={noLeidas === 0 || marcando}>
              {marcando ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
              Marcar todas como leídas
            </Button>
          </div>
          {error && <p className="px-4 pt-3 text-xs text-destructive">No se pudo actualizar. Se reintentará en un momento.</p>}
          {avisos.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No tienes notificaciones.</p>
          ) : (
            <ul className="max-h-[min(70vh,28rem)] divide-y overflow-y-auto">
              {avisos.map((a) => {
                const destino = enlaceInterno(a.enlace)
                const contenido = (
                  <>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.leida_en ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm break-words", !a.leida_en && "font-semibold")}>{a.titulo}</span>
                      {a.cuerpo && <span className="block text-xs break-words text-muted-foreground">{a.cuerpo}</span>}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {haceCuanto(a.creada_en)}{!a.leida_en && <span className="sr-only"> · sin leer</span>}
                      </span>
                    </span>
                  </>
                )
                return (
                  <li key={a.id}>
                    {destino ? (
                      <Link href={destino} onClick={() => abrirAviso(a)} className="flex gap-3 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted">
                        {contenido}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => abrirAviso(a)} className="flex w-full gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted">
                        {contenido}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
