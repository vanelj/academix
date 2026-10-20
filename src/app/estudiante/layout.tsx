import { DashboardShell } from "@/components/layout/dashboard-shell"
import { requerirPanel, usuarioDelPanel } from "@/lib/auth/contexto"

// Panel protegido en el servidor: exige sesión, perfil activo y rol estudiante activo.
export default async function EstudianteLayout({ children }: LayoutProps<"/estudiante">) {
  const sesion = await requerirPanel("estudiante")

  return <DashboardShell user={usuarioDelPanel(sesion)}>{children}</DashboardShell>
}
