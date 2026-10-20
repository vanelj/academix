import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * Logotipo PROVISIONAL de Academix: birrete sobre una "A" en un cuadrado azul.
 * SVG en línea (sin archivos ni dependencias); decorativo, el nombre va en texto.
 */
export function LogoAcademix({ className }: { className?: string }) {
  const id = useId()
  const degradado = `academix-${id}`
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={degradado} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill={`url(#${degradado})`} />
      {/* Birrete */}
      <path d="M20 6.5 7 12.5l13 6 13-6-13-6Z" fill="#fff" />
      <path d="M12 15.2v3.6c0 1.6 3.6 3.2 8 3.2s8-1.6 8-3.2v-3.6L20 19l-8-3.8Z" fill="#fff" fillOpacity=".75" />
      <path d="M31.5 13.3v6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      {/* "A" */}
      <path d="M14.5 34 20 24l5.5 10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.7 30.4h6.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export const NOMBRE_MARCA = "Academix"
