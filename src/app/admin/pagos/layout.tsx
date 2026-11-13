import { requerirArea } from "@/lib/auth/contexto"

// Sección del panel protegida por permiso del equipo administrativo (área «pagos»).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requerirArea("pagos")
  return children
}
