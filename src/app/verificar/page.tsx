import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import { AcademixPublico } from "@/components/public/academix-publico"
import { AxCabecera, AxPie } from "@/components/public/academix-secciones"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { codigoValido, normalizarCodigo } from "@/lib/certificados/verificacion"

export const metadata: Metadata = {
  title: "Verificar certificado · Academix",
  description: "Comprueba la autenticidad de un certificado emitido en Academix con su código.",
}

export default async function VerificarPage({ searchParams }: PageProps<"/verificar">) {
  const { codigo } = await searchParams
  const valor = typeof codigo === "string" ? codigo : ""
  if (valor && codigoValido(valor)) redirect(`/verificar/${encodeURIComponent(normalizarCodigo(valor))}`)

  return (
    <AcademixPublico>
    <div className="flex min-h-dvh flex-col">
      <AxCabecera />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        {/* Encabezado principal para lectores de pantalla y buscadores (la tarjeta lleva el título visible). */}
        <h1 className="sr-only">Verificar certificado</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" aria-hidden />Verificar un certificado</CardTitle>
            <CardDescription>Escribe el código impreso en el certificado o escanea su código QR.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="get" action="/verificar" className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="codigo" className="sr-only">Código del certificado</label>
              <Input id="codigo" name="codigo" defaultValue={valor} required minLength={8} maxLength={32} autoComplete="off" placeholder="Ej.: A1B2C3D4E5F6" className="font-mono uppercase" />
              <Button type="submit">Verificar</Button>
            </form>
            {valor && <p className="mt-2 text-sm text-destructive" role="alert">El código no tiene un formato válido.</p>}
          </CardContent>
        </Card>
      </main>
      <AxPie />
    </div>
    </AcademixPublico>
  )
}
