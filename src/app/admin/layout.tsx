import { DashboardShell } from "@/components/layout/dashboard-shell"
import { requerirPanel, usuarioDelPanelAdmin } from "@/lib/auth/contexto"

// Panel protegido en el servidor: exige sesión, perfil activo y rol admin activo.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const sesion = await requerirPanel("admin")

  // El menú muestra solo los módulos permitidos; cada sección vuelve a exigirlos (requerirArea).
  return <DashboardShell user={await usuarioDelPanelAdmin(sesion)}>{children}</DashboardShell>
}
