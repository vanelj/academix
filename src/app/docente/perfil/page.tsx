import type { Metadata } from "next"

import { MiPerfil } from "@/components/layout/mi-perfil"
import { requerirPanel } from "@/lib/auth/contexto"

export const metadata: Metadata = {
  title: "Mi perfil · Academix",
}

export default async function DocentePerfilPage() {
  return <MiPerfil sesion={await requerirPanel("docente")} />
}
