import { CertificadosTabs } from "@/components/admin/certificados/certificado-ui"
import { PageHeader } from "@/components/layout/page-header"

/** Encabezado común de las secciones de «Certificados». */
export function EncabezadoCertificados({ actual }: { actual: Parameters<typeof CertificadosTabs>[0]["actual"] }) {
  return (
    <>
      <PageHeader title="Certificados" description="Emisión, plantillas, firmantes y pagos de los certificados de tu institución." />
      <CertificadosTabs actual={actual} />
    </>
  )
}
