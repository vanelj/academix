"use client"

import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserNav } from "@/components/layout/user-nav"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { extraPageTitles, getActiveNavItem, roleConfig } from "@/config/navigation"
import type { ShellUser } from "@/config/demo-user"

type AppHeaderProps = {
  user: ShellUser
  isDemo?: boolean
  menuOpen: boolean
  onMenuClick: () => void
}

export function AppHeader({ user, isDemo, menuOpen, onMenuClick }: AppHeaderProps) {
  const pathname = usePathname()
  const current = getActiveNavItem(user.role, pathname)
  const title =
    current?.title ?? extraPageTitles[pathname.split("/").pop() ?? ""] ?? "Inicio"
  // Admin y docente trabajan en una institución; el estudiante puede estudiar en varias.
  const contexto =
    user.role === "estudiante"
      ? roleConfig[user.role].label
      : `${roleConfig[user.role].label} · ${user.institution}`

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground" title={contexto}>
          {contexto}
        </p>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {isDemo && (
            <Badge variant="outline" className="hidden text-muted-foreground sm:inline-flex">
              Modo demostración
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
        <UserNav user={user} />
      </div>
    </header>
  )
}
