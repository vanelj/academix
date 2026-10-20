import { DashboardShell } from "@/components/layout/dashboard-shell"
import { requerirPanel, usuarioDelPanel } from "@/lib/auth/contexto"

// Panel protegido en el servidor: exige sesión, perfil activo y rol docente activo.
export default async function DocenteLayout({ children }: LayoutProps<"/docente">) {
  const sesion = await requerirPanel("docente")

  return <DashboardShell user={usuarioDelPanel(sesion)}>{children}</DashboardShell>
}
