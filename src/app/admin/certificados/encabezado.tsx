import Link from "next/link"
import { HelpCircle } from "lucide-react"

import { CertificadosTabs } from "@/components/admin/certificados/certificado-ui"
import { PageHeader } from "@/components/layout/page-header"

const PASOS: { titulo: string; texto: string; href?: string; enlace?: string }[] = [
  { titulo: "Configura las condiciones del curso", texto: "En la ficha del curso: si entrega certificado, si es gratuito o tiene costo adicional, la nota mínima, las horas y el firmante que exige (si exige uno).", href: "/admin/cursos", enlace: "Ir a Cursos" },
  { titulo: "Prepara la plantilla y los firmantes", texto: "Elige el diseño y registra a las autoridades autorizadas a firmar, con su cargo y su firma escaneada.", href: "/admin/certificados/firmantes", enlace: "Agregar firmante" },
  { titulo: "Cierra el resultado del estudiante", texto: "En Evaluaciones se registra el resultado final. Solo una matrícula APROBADA puede certificarse.", href: "/admin/evaluaciones", enlace: "Ir a Evaluaciones" },
  { titulo: "Si el certificado tiene costo, aprueba el pago", texto: "El estudiante aprobado paga el certificado aparte y sube su comprobante. Lo revisas en Pagos → Certificados; sin pago aprobado no se puede emitir.", href: "/admin/pagos/certificados", enlace: "Pagos de certificados" },
  { titulo: "Emite el certificado", texto: "En «Elegibles» ves quién cumple todo. Al emitir se genera un código único y un QR de verificación pública; el contenido queda fijo.", href: "/admin/certificados/elegibles", enlace: "Ver elegibles" },
  { titulo: "El estudiante lo descarga", texto: "Aparece en «Mis certificados» del estudiante, que recibe un aviso. Cualquiera puede verificarlo con el código o el QR." },
]

/** Encabezado común de las secciones de «Certificados», con la guía del proceso. */
export function EncabezadoCertificados({ actual }: { actual: Parameters<typeof CertificadosTabs>[0]["actual"] }) {
  return (
    <>
      <PageHeader title="Certificados" description="Emisión, plantillas, firmantes y pagos de los certificados de tu institución." />
      <details className="group mb-4 rounded-xl border bg-card p-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <HelpCircle className="size-4 text-primary" aria-hidden />
          ¿Cómo funcionan los certificados?
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Ver los 6 pasos</span>
        </summary>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="rounded-lg bg-muted/40 p-3">
              <p className="font-medium"><span className="mr-1 text-primary tabular-nums">{i + 1}.</span>{p.titulo}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.texto}</p>
              {p.href && <Link href={p.href} className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2">{p.enlace}</Link>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>«Sin firmante»</strong>: el certificado se emite solo a nombre de la institución, sin nombre, cargo ni firma de una autoridad. Es válido y verificable,
          pero si el curso exige un firmante, Academix no permite emitirlo sin él ni con un firmante sin firma cargada.
        </p>
      </details>
      <CertificadosTabs actual={actual} />
    </>
  )
}
