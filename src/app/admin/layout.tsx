import { DashboardShell } from "@/components/layout/dashboard-shell"
import { requerirPanel, usuarioDelPanel } from "@/lib/auth/contexto"

// Panel protegido en el servidor: exige sesión, perfil activo y rol admin activo.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const sesion = await requerirPanel("admin")

  return <DashboardShell user={usuarioDelPanel(sesion)}>{children}</DashboardShell>
}
