"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { applyTheme, getDocumentTheme, type Theme } from "@/lib/theme"

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}

export function ThemeToggle() {
  // En el servidor el tema es desconocido (null); el icono se resuelve con CSS
  // (clase `dark`) para que sea correcto desde el primer pintado.
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    getDocumentTheme,
    () => null
  )

  const label =
    theme === null
      ? "Cambiar tema"
      : theme === "dark"
        ? "Activar modo claro"
        : "Activar modo oscuro"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={() =>
              applyTheme(getDocumentTheme() === "dark" ? "light" : "dark")
            }
          />
        }
      >
        <Moon className="dark:hidden" aria-hidden />
        <Sun className="hidden dark:block" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
