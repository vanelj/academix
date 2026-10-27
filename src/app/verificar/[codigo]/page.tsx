import type { Metadata } from "next"
import Link from "next/link"
import { CircleAlert, CircleCheck, ShieldCheck } from "lucide-react"

import { PublicFooter } from "@/components/public/public-footer"
import { PublicHeader } from "@/components/public/public-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { verificarCertificado } from "@/lib/certificados/verificacion"

// Las páginas de verificación contienen el nombre del titular: no se indexan.
export const metadata: Metadata = {
  title: "Verificación de certificado · Academix",
  robots: { index: false, follow: false },
}

const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" })

export default async function VerificacionPage({ params }: PageProps<"/verificar/[codigo]">) {
  const { codigo } = await params
  // Un "%" mal formado no debe romper la página: se trata como código no válido.
  let texto = codigo
  try {
    texto = decodeURIComponent(codigo)
  } catch {
    texto = ""
  }
  const r = await verificarCertificado(texto)

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        {r.estado === "valido" ? (
          <Card className="border-success/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-success"><CircleCheck className="size-5" aria-hidden />Certificado auténtico</CardTitle>
              <CardDescription>Este certificado fue emitido a través de Academix por la institución indicada.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Dato k="Titular" v={r.estudiante} />
                <Dato k="Curso" v={r.curso} />
                <Dato k="Institución emisora" v={r.institucion} />
                <Dato k="Fecha de emisión" v={fecha.format(new Date(r.fecha_emision))} />
                {r.horas && <Dato k="Duración" v={`${r.horas} horas académicas`} />}
                <Dato k="Código" v={r.codigo} mono />
              </dl>
              <p className="mt-5 flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Academix confirma que el documento fue emitido por la institución mediante la plataforma. No es un título ni una acreditación oficial,
                salvo que la propia institución cuente con esa autorización. Compara estos datos con el documento que te presentaron.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CircleAlert className="size-5 text-warning" aria-hidden />
                {r.estado === "no_encontrado" ? "No encontramos este certificado" : r.estado === "codigo_invalido" ? "Código no válido" : "Verificación no disponible"}
              </CardTitle>
              <CardDescription>
                {r.estado === "no_encontrado" && "Ningún certificado emitido en Academix tiene este código. Revisa que esté bien escrito."}
                {r.estado === "codigo_invalido" && "El código debe tener entre 8 y 32 letras o números."}
                {r.estado === "no_disponible" && "No se pudo consultar en este momento. Inténtalo de nuevo más tarde."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/verificar" className={buttonVariants({ variant: "outline" })}>Verificar otro código</Link>
            </CardContent>
          </Card>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium break-words"}>{v}</dd>
    </div>
  )
}
