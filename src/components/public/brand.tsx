import Link from "next/link"

import { LogoAcademix, NOMBRE_MARCA } from "@/components/marca/logo-academix"
import { cn } from "@/lib/utils"

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <LogoAcademix />
      <span className="leading-tight">
        <span className="block text-sm font-semibold">{NOMBRE_MARCA}</span>
        <span className="block text-xs text-muted-foreground">Gestión académica</span>
      </span>
    </Link>
  )
}
