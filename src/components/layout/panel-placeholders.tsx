import { notFound } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { getNavItems, roleConfig, type Role } from "@/config/navigation"

/**
 * Secciones internas del panel aún no desarrolladas (sin la portada, sin enlaces
 * externos como /cursos y sin módulos ya implementados, que tienen su propia ruta).
 */
export function seccionesDeRol(rol: Role) {
  const base = roleConfig[rol].basePath
  return getNavItems(rol).filter((item) => item.href.startsWith(`${base}/`) && !item.disponible)
}

/** Marcador de una sección del menú que todavía no se ha desarrollado. */
export function SeccionEnPreparacion({ rol, seccion }: { rol: Role; seccion: string }) {
  const item = seccionesDeRol(rol).find(
    (s) => s.href === `${roleConfig[rol].basePath}/${seccion}`
  )
  if (!item) notFound()

  const Icon = item.icon

  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="font-medium">Módulo en preparación</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Esta sección se desarrollará en una etapa posterior.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
