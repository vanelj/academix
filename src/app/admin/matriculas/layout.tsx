import { requerirArea } from "@/lib/auth/contexto"

// Sección del panel protegida por permiso del equipo administrativo (área «estudiantes»).
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requerirArea("estudiantes")
  return children
}
