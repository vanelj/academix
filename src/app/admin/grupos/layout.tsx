import { requerirArea } from "@/lib/auth/contexto"

// Sección del panel protegida por permiso del equipo administrativo (área «docentes»).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requerirArea("docentes")
  return children
}
