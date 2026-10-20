"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FiltrosCatalogo, Opcion } from "@/lib/oferta/cursos"

const TODAS = "todas"
const ESPERA_BUSQUEDA_MS = 350

type FiltrosCursosProps = {
  filtros: FiltrosCatalogo
  instituciones: Opcion[]
  categorias: Opcion[]
  /** Sin cursos publicados no hay nada que buscar: los controles se muestran inactivos. */
  deshabilitado: boolean
}

export function FiltrosCursos({
  filtros,
  instituciones,
  categorias,
  deshabilitado,
}: FiltrosCursosProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [pendiente, startTransition] = useTransition()
  const [texto, setTexto] = useState(filtros.q)
  // Última búsqueda enviada a la URL y última búsqueda recibida de ella.
  const [qAplicado, setQAplicado] = useState(filtros.q)
  const [qRecibido, setQRecibido] = useState(filtros.q)

  // Si la URL cambia desde fuera (p. ej. el enlace "Ver todos los cursos"),
  // el campo de búsqueda se sincroniza con ella.
  if (filtros.q !== qRecibido) {
    setQRecibido(filtros.q)
    if (filtros.q !== qAplicado) {
      setTexto(filtros.q)
      setQAplicado(filtros.q)
    }
  }

  function aplicar(cambios: Partial<FiltrosCatalogo>) {
    const siguiente = { ...filtros, q: texto.trim(), ...cambios }
    setQAplicado(siguiente.q)
    const params = new URLSearchParams()
    if (siguiente.q) params.set("q", siguiente.q)
    if (siguiente.institucion) params.set("institucion", siguiente.institucion)
    if (siguiente.categoria) params.set("categoria", siguiente.categoria)
    const query = params.toString()
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  // Búsqueda mientras se escribe, con una pequeña espera entre pulsaciones.
  useEffect(() => {
    const q = texto.trim()
    if (q === qAplicado) return
    const id = setTimeout(() => aplicar({ q }), ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(id)
    // `aplicar` depende de los filtros actuales; solo debe reaccionar al texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const hayFiltros = Boolean(filtros.q || filtros.institucion || filtros.categoria)

  return (
    <form
      role="search"
      action={pathname}
      method="get"
      onSubmit={(e) => {
        e.preventDefault()
        aplicar({ q: texto.trim() })
      }}
      className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
      aria-busy={pendiente}
    >
      <div className="grid gap-2">
        <label htmlFor="filtro-q" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Buscar
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="filtro-q"
            name="q"
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar cursos..."
            autoComplete="off"
            disabled={deshabilitado}
            className="h-9 pl-8"
          />
        </div>
      </div>

      <FiltroSelect
        id="filtro-institucion"
        name="institucion"
        etiqueta="Institución"
        todas="Todas las instituciones"
        opciones={instituciones}
        valor={filtros.institucion}
        deshabilitado={deshabilitado || instituciones.length === 0}
        onCambio={(institucion) => aplicar({ institucion })}
      />

      <FiltroSelect
        id="filtro-categoria"
        name="categoria"
        etiqueta="Categoría"
        todas="Todas las categorías"
        opciones={categorias}
        valor={filtros.categoria}
        deshabilitado={deshabilitado || categorias.length === 0}
        onCambio={(categoria) => aplicar({ categoria })}
      />

      <div className="flex h-9 items-center justify-end gap-2 md:justify-start">
        {pendiente && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando resultados" />
        )}
        {hayFiltros && (
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setTexto("")
              aplicar({ q: "", institucion: "", categoria: "" })
            }}
          >
            <X aria-hidden />
            Limpiar
          </Button>
        )}
      </div>
    </form>
  )
}

function FiltroSelect({
  id,
  name,
  etiqueta,
  todas,
  opciones,
  valor,
  deshabilitado,
  onCambio,
}: {
  id: string
  name: string
  etiqueta: string
  todas: string
  opciones: Opcion[]
  valor: string
  deshabilitado: boolean
  onCambio: (valor: string) => void
}) {
  const items = [
    { value: TODAS, label: todas },
    ...opciones.map((o) => ({ value: o.id, label: o.nombre })),
  ]
  // Un id que no está entre las opciones (p. ej. enlace antiguo) se muestra como "Todas".
  const seleccionado = opciones.some((o) => o.id === valor) ? valor : TODAS

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </label>
      <Select
        name={name}
        items={items}
        value={seleccionado}
        disabled={deshabilitado}
        onValueChange={(v) => onCambio(v && v !== TODAS ? String(v) : "")}
      >
        <SelectTrigger id={id} className="h-9 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
