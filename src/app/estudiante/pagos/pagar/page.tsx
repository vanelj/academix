import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CircleAlert } from "lucide-react"
import { z } from "zod"

import { PagoForm } from "@/components/estudiante/pago-form"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerObjetivoPago, type ResultadoObjetivo } from "@/lib/pagos/estudiante"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Pagar · Academix",
}

const uuid = z.uuid()

// Pago de una solicitud (?solicitud=) o cuota (?cuota=) propia. Todo se vuelve a validar en presentar_comprobante.
export default async function PagarPage({ searchParams }: PageProps<"/estudiante/pagos/pagar">) {
  const sesion = await requerirPanel("estudiante")
  const params = await searchParams
  const solicitud = typeof params.solicitud === "string" && uuid.safeParse(params.solicitud).success ? params.solicitud : undefined
  const cuota = !solicitud && typeof params.cuota === "string" && uuid.safeParse(params.cuota).success ? params.cuota : undefined
  const certificado = !solicitud && !cuota && typeof params.certificado === "string" && uuid.safeParse(params.certificado).success ? params.certificado : undefined

  const volver = (
    <Link href="/estudiante/pagos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4 w-fit")}>
      <ArrowLeft aria-hidden />
      Mis pagos y cuotas
    </Link>
  )

  let r: ResultadoObjetivo
  try {
    r = await obtenerObjetivoPago(sesion.userId, { solicitud, cuota, certificado })
  } catch (e) {
    console.error("[pagar]", e instanceof Error ? e.message : e)
    r = { estado: "no_pagable", motivo: "No se pudo cargar el pago. Recarga la página en unos minutos." }
  }

  if (r.estado === "no_pagable") {
    return (
      <>
        {volver}
        <PageHeader title="Pagar" description="Envío de comprobante de pago." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <CircleAlert className="size-5 text-warning" aria-hidden />
            {r.motivo}
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {volver}
      <PageHeader title={`Pagar: ${r.objetivo.concepto}`} description="Paga a la institución con uno de sus medios y envía tu comprobante para su verificación." />
      <PagoForm objetivo={r.objetivo} medios={r.medios} textoPagos={r.textoPagos} userId={sesion.userId} />
    </>
  )
}
