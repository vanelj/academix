import { SeccionEnPreparacion, seccionesDeRol } from "@/components/layout/panel-placeholders"
import { requerirPanel } from "@/lib/auth/contexto"

export const dynamicParams = false

export function generateStaticParams() {
  return seccionesDeRol("docente").map((item) => ({ seccion: item.href.split("/").pop()! }))
}

export default async function DocenteSeccionPage({ params }: PageProps<"/docente/[seccion]">) {
  await requerirPanel("docente")
  const { seccion } = await params
  return <SeccionEnPreparacion rol="docente" seccion={seccion} />
}
