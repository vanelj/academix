import type { Metadata } from "next"
import Link from "next/link"
import { Award } from "lucide-react"

import { PagosPanel } from "@/components/admin/pagos/pagos-panel"
import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { contarPagosCertificadoPendientes } from "@/lib/certificados/datos"
import { obtenerPagos, type PagoAdmin } from "@/lib/pagos/datos"

export const metadata: Metadata = {
  title: "Pagos · Academix",
}

const ESTADOS = ["pendiente", "pagado", "rechazado"] as const

// Módulo "Pagos": solo administrador con rol activo; la institución sale del perfil.
export default async function PagosPage({ searchParams }: PageProps<"/admin/pagos">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { estado } = await searchParams
  const estadoInicial = ESTADOS.find((e) => e === estado) ?? "todos"

  const pendientesCertificado = institucionId ? await contarPagosCertificadoPendientes(institucionId).catch(() => null) : null

  const encabezado = (
    <>
      <PageHeader title="Pagos" description="Comprobantes de las compras de cursos y cuotas. Los cobros adicionales por certificado están en la pestaña «Certificados»." />
      <PagosTabs actual="pagos" pendientesCertificado={pendientesCertificado ?? undefined} />
      {pendientesCertificado ? (
        <Link
          href="/admin/pagos/certificados"
          className="mb-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm transition-colors hover:bg-warning/10"
        >
          <Award className="size-5 shrink-0 text-warning" aria-hidden />
          <span>
            <strong>{pendientesCertificado === 1 ? "1 pago de certificado" : `${pendientesCertificado} pagos de certificado`}</strong> por revisar. El certificado no se puede emitir hasta aprobar su pago.
          </span>
        </Link>
      ) : null}
    </>
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let pagos: PagoAdmin[]
  try {
    pagos = await obtenerPagos(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los pagos. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <PagosPanel pagos={pagos} estadoInicial={estadoInicial} />
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
