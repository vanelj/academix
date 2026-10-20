import { Brand } from "@/components/public/brand"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { cn } from "@/lib/utils"

// Cabecera mínima de las pantallas de acceso (/login, /registro): marca y tema.
export function AuthHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "mx-auto flex h-16 w-full items-center justify-between px-4 sm:px-6",
        className
      )}
    >
      <Brand />
      <ThemeToggle />
    </header>
  )
}
