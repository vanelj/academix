"use client"

import { useEffect, useOptimistic, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"

/**
 * Filtros de un catálogo público guardados en la URL (Cursos e Instituciones).
 *
 * Historial del navegador:
 * - Cada cambio confirmado (categoría, institución, área, orden, limpiar) crea una
 *   entrada (push), así que «Atrás» los recorre uno a uno.
 * - La búsqueda escrita ya llega con espera (debounce) desde la vista; la primera
 *   actualización de una búsqueda crea una entrada y las siguientes, mientras se
 *   sigue escribiendo, la reemplazan (replace). No hay una entrada por carácter.
 *   Vaciar la búsqueda vuelve a crear una entrada.
 *
 * Mientras el servidor responde, los filtros elegidos se muestran al instante
 * (useOptimistic) y `pendiente` permite mostrar el estado de carga.
 */
export function useFiltrosEnUrl<F extends { q: string }>(
  ruta: string,
  filtros: F,
  aParametros: (f: F) => URLSearchParams
) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [filtrosVisibles, aplicarFiltros] = useOptimistic(filtros)
  // true mientras la última navegación fue una búsqueda escrita.
  const escribiendo = useRef(false)

  // Al moverse por el historial, la siguiente búsqueda empieza una entrada nueva.
  useEffect(() => {
    const reiniciar = () => {
      escribiendo.current = false
    }
    window.addEventListener("popstate", reiniciar)
    return () => window.removeEventListener("popstate", reiniciar)
  }, [])

  function cambiarFiltros(siguientes: F) {
    const soloBusqueda =
      siguientes.q !== filtrosVisibles.q &&
      JSON.stringify({ ...siguientes, q: "" }) === JSON.stringify({ ...filtrosVisibles, q: "" })
    // Vaciar la búsqueda (p. ej. con la «×» del chip) es un cambio confirmado: nueva entrada.
    const sigueEscribiendo = soloBusqueda && siguientes.q.trim() !== ""
    const reemplazar = sigueEscribiendo && escribiendo.current
    escribiendo.current = sigueEscribiendo

    const qs = aParametros(siguientes).toString()
    const url = qs ? `${ruta}?${qs}` : ruta
    iniciar(() => {
      aplicarFiltros(siguientes)
      if (reemplazar) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    })
  }

  const recargar = () => iniciar(() => router.refresh())

  return { filtros: filtrosVisibles, cambiarFiltros, recargar, pendiente }
}
