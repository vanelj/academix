import Link from "next/link"

import { Brand } from "@/components/public/brand"

const enlaces = [
  { title: "Inicio", href: "/" },
  { title: "Cursos", href: "/cursos" },
  { title: "Instituciones", href: "/instituciones" },
  { title: "Iniciar sesión", href: "/login" },
  { title: "Registrar institución", href: "/registro" },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm text-muted-foreground">
            Plataforma de oferta y gestión de cursos virtuales
          </p>
        </div>
        <nav aria-label="Enlaces del pie de página">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
            {enlaces.map((enlace) => (
              <li key={enlace.href}>
                <Link
                  href={enlace.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {enlace.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Academix
        </p>
      </div>
    </footer>
  )
}
