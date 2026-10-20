import { SeccionEnPreparacion, seccionesDeRol } from "@/components/layout/panel-placeholders"
import { requerirPanel } from "@/lib/auth/contexto"

/**
 * Marcador temporal para las secciones del menú del administrador.
 * Cada módulo tendrá su propia carpeta (p. ej. app/admin/cursos) cuando se desarrolle,
 * y esa ruta estática tendrá prioridad sobre esta ruta dinámica.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return seccionesDeRol("admin").map((item) => ({ seccion: item.href.split("/").pop()! }))
}

export default async function AdminSectionPlaceholder({
  params,
}: PageProps<"/admin/[seccion]">) {
  await requerirPanel("admin")
  const { seccion } = await params
  return <SeccionEnPreparacion rol="admin" seccion={seccion} />
}
