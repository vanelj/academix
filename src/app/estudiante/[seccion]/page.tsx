import { SeccionEnPreparacion, seccionesDeRol } from "@/components/layout/panel-placeholders"
import { requerirPanel } from "@/lib/auth/contexto"

export const dynamicParams = false

export function generateStaticParams() {
  return seccionesDeRol("estudiante").map((item) => ({ seccion: item.href.split("/").pop()! }))
}

export default async function EstudianteSeccionPage({ params }: PageProps<"/estudiante/[seccion]">) {
  await requerirPanel("estudiante")
  const { seccion } = await params
  return <SeccionEnPreparacion rol="estudiante" seccion={seccion} />
}
