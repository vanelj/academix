import Link from "next/link"

import { DENOMINACION, LogoAcademix, NOMBRE_MARCA } from "@/components/marca/logo-academix"
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
        <span className="block font-heading text-base font-extrabold">{NOMBRE_MARCA}</span>
        <span className="block max-w-[15rem] text-[11px] leading-tight text-muted-foreground">{DENOMINACION}</span>
      </span>
    </Link>
  )
}
