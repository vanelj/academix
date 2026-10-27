import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Pestañas del módulo «Certificados» (una sola entrada de menú). */
export function CertificadosTabs({ actual }: { actual: "emitidos" | "elegibles" | "pagos" | "plantillas" | "firmantes" }) {
  const pestañas = [
    { id: "emitidos", href: "/admin/certificados", texto: "Emitidos" },
    { id: "elegibles", href: "/admin/certificados/elegibles", texto: "Por emitir" },
    { id: "pagos", href: "/admin/certificados/pagos", texto: "Pagos de certificados" },
    { id: "plantillas", href: "/admin/certificados/plantillas", texto: "Plantillas" },
    { id: "firmantes", href: "/admin/certificados/firmantes", texto: "Firmantes" },
  ] as const
  return (
    <nav aria-label="Secciones de certificados" className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {pestañas.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={actual === p.id ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            actual === p.id ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  )
}

export function AvisoCertificados({ texto }: { texto: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent>
    </Card>
  )
}

export const MIGRACION_PENDIENTE =
  "Los certificados personalizables requieren la migración «certificados_v5», pendiente de aplicar. Mientras tanto puedes ver vistas previas de las plantillas de Academix con datos ficticios."

export const formatoFechaCert = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" })
