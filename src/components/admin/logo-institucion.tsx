"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** Iniciales de la institución (máximo dos palabras significativas). */
function iniciales(nombre: string): string {
  const ignorar = new Set(["de", "del", "la", "las", "los", "el", "y", "e"])
  const palabras = nombre
    .split(/\s+/)
    .filter((p) => p && !ignorar.has(p.toLowerCase()))
  const letras = (palabras.length ? palabras : [nombre]).slice(0, 2).map((p) => p[0])
  return letras.join("").toLocaleUpperCase("es") || "?"
}

/** Solo URLs http(s): cualquier otro valor de logo_url se ignora. */
function urlSegura(url: string | null): string | null {
  if (!url) return null
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:" ? url : null
  } catch {
    return null
  }
}

/**
 * Logo de la institución (instituciones.logo_url). Si no existe o no carga,
 * muestra las iniciales. La subida se gestiona en LogoUploader (Supabase Storage).
 */
export function LogoInstitucion({
  nombre,
  logoUrl,
  className,
  compacto = false,
}: {
  nombre: string
  logoUrl: string | null
  className?: string
  /** Versión pequeña (p. ej. barra lateral): esquinas y texto reducidos. */
  compacto?: boolean
}) {
  const radio = compacto ? "rounded-lg" : "rounded-xl"
  const src = urlSegura(logoUrl)

  return (
    <Avatar className={cn("size-16", radio, compacto ? "after:rounded-lg" : "after:rounded-xl", className)}>
      {src && (
        <AvatarImage src={src} alt={`Logo de ${nombre}`} className={cn("bg-muted object-contain", radio)} />
      )}
      <AvatarFallback
        className={cn(
          "bg-primary/10 font-semibold text-primary dark:bg-primary/20",
          radio,
          compacto ? "text-xs" : "text-lg"
        )}
      >
        {iniciales(nombre)}
      </AvatarFallback>
    </Avatar>
  )
}
