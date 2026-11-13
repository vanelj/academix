"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Opcion } from "@/lib/oferta/cursos"
import { ETIQUETA_INSCRIPCION } from "@/lib/oferta/disponibilidad"
import { consultaFiltros, type FiltrosExplorar } from "@/lib/oferta/explorar"

const campo = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Filtros de «Explorar cursos»: viven en la URL (se conservan al volver desde
 * la ficha) y se aplican sin recargar el panel ni perder la sesión.
 */
export function FiltrosExplorarForm({ filtros, categorias, instituciones }: { filtros: FiltrosExplorar; categorias: Opcion[]; instituciones: Opcion[] }) {
  const router = useRouter()
  const ruta = usePathname()
  const [pendiente, iniciar] = useTransition()
  const [texto, setTexto] = useState(filtros.q)

  const aplicar = (cambio: Partial<FiltrosExplorar>) => {
    const q = consultaFiltros({ ...filtros, ...cambio })
    iniciar(() => router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false }))
  }

  // Búsqueda escrita: se aplica tras una pausa breve.
  useEffect(() => {
    if (texto.trim() === filtros.q) return
    const t = setTimeout(() => aplicar({ q: texto.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const activos = Boolean(filtros.q || filtros.categoria || filtros.institucion || filtros.estado !== "todos")

  return (
    <form role="search" aria-label="Filtrar cursos" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); aplicar({ q: texto.trim() }) }}>
      <div className="relative">
        <label htmlFor="explorar-q" className="sr-only">Buscar</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id="explorar-q" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por curso, tema o institución" className="pl-9" maxLength={80} />
      </div>
      <select aria-label="Categoría" className={campo} value={filtros.categoria} onChange={(e) => aplicar({ categoria: e.target.value })}>
        <option value="">Todas las categorías</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <select aria-label="Institución" className={campo} value={filtros.institucion} onChange={(e) => aplicar({ institucion: e.target.value })}>
        <option value="">Todas las instituciones</option>
        {instituciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <select aria-label="Estado" className={campo} value={filtros.estado} onChange={(e) => aplicar({ estado: e.target.value as FiltrosExplorar["estado"] })}>
        <option value="todos">Todos los estados</option>
        <option value="abiertas">{ETIQUETA_INSCRIPCION.abiertas}</option>
        <option value="proximamente">{ETIQUETA_INSCRIPCION.proximamente}</option>
        <option value="en_curso">{ETIQUETA_INSCRIPCION.en_curso}</option>
        <option value="sin_inscripciones">{ETIQUETA_INSCRIPCION.sin_inscripciones}</option>
      </select>
      <div className="flex items-center gap-2">
        {pendiente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Aplicando filtros" />}
        {activos && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setTexto(""); iniciar(() => router.replace(ruta, { scroll: false })) }}>
            <X aria-hidden />
            Limpiar
          </Button>
        )}
      </div>
    </form>
  )
}
