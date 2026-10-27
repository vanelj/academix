import type { Metadata } from "next"
import { CheckCircle2 } from "lucide-react"

import { MisCertificados } from "@/components/estudiante/mis-certificados"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMisCertificados, type MiCertificado } from "@/lib/certificados/estudiante"

export const metadata: Metadata = {
  title: "Mis certificados · Academix",
}

async function leer(): Promise<"error" | "no_disponible" | MiCertificado[]> {
  try {
    const r = await obtenerMisCertificados()
    return r.disponible ? r.certificados : "no_disponible"
  } catch {
    return "error"
  }
}

// Certificados del propio estudiante (RPC mis_certificados: solo sus matrículas).
export default async function MisCertificadosPage({ searchParams }: PageProps<"/estudiante/certificados">) {
  await requerirPanel("estudiante")
  const { enviado } = await searchParams
  const r = await leer()
  return (
    <>
      <PageHeader title="Mis certificados" description="Certificados emitidos por las instituciones y los que están pendientes de emisión." />
      {typeof r === "string" ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {r === "no_disponible" ? "Los certificados estarán disponibles aquí próximamente." : "No se pudieron cargar tus certificados. Recarga la página en unos minutos."}
          </CardContent>
        </Card>
      ) : (
        <>
          {enviado === "1" && (
            <p role="status" className="mb-4 flex gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              Comprobante enviado. La institución verificará el ingreso antes de emitir tu certificado.
            </p>
          )}
          <MisCertificados certificados={r} />
        </>
      )}
    </>
  )
}
