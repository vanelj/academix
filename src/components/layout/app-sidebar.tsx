"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"

import { LogoInstitucion } from "@/components/admin/logo-institucion"
import { LogoAcademix, NOMBRE_MARCA } from "@/components/marca/logo-academix"
import { useNavegacionProtegida } from "@/components/layout/proteccion-cambios"
import { Button } from "@/components/ui/button"
import { isNavItemActive, roleConfig, type Role } from "@/config/navigation"
import { cn } from "@/lib/utils"

type AppSidebarProps = {
  role: Role
  institution: string
  institutionLogo?: string | null
  open: boolean
  onClose: () => void
}

export function AppSidebar({ role, institution, institutionLogo, open, onClose }: AppSidebarProps) {
  const pathname = usePathname()
  const proteger = useNavegacionProtegida()
  const { sections, label } = roleConfig[role]

  return (
    <aside
      id="app-sidebar"
      aria-label="Menú principal"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out lg:w-64 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <LogoAcademix />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{NOMBRE_MARCA}</p>
          <p className="truncate text-xs text-muted-foreground">
            Gestión académica
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onClose}
          aria-label="Cerrar menú"
        >
          <X />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="mb-5 last:mb-0">
            {section.title && (
              <p className="mb-1.5 px-3 text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname, role)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      onNavigate={proteger(item.href)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-primary/25 shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active
                            ? "text-sidebar-primary"
                            : "text-muted-foreground group-hover:text-sidebar-foreground"
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-5 py-4">
        {role !== "estudiante" && (
          <LogoInstitucion nombre={institution} logoUrl={institutionLogo ?? null} className="size-9" compacto />
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{institution}</p>
          <p className="text-xs text-muted-foreground">Panel de {label}</p>
        </div>
      </div>
    </aside>
  )
}
