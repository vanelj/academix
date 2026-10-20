import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarRange, Info } from "lucide-react"

import { DocenteAcciones } from "@/components/admin/docentes/docente-acciones"
import {
  ETIQUETA_ESTADO_GRUPO,
  EstadoCuenta,
  EstadoRol,
  formatoFechaDocente,
  formatoFechaHoraDocente,
} from "@/components/admin/docentes/docente-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { roleConfig } from "@/config/navigation"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerDocente } from "@/lib/docentes/datos"
import { cuentasConfiguradas } from "@/lib/supabase/admin"
import { cn } from "@/lib/utils"
import { idPerfilSchema } from "@/lib/validations/docente"

export const metadata: Metadata = {
  title: "Docente · Academix",
}

const fechaCorta = (iso: string) => formatoFechaDocente.format(new Date(`${iso}T00:00:00`))

export default async function DocentePage({ params }: PageProps<"/admin/docentes/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idPerfilSchema.safeParse(id).success) notFound()

  // Un perfil de otra institución, o sin rol docente, se trata como inexistente.
  const docente = await obtenerDocente(institucionId, id)
  if (!docente) notFound()
  const configuradas = cuentasConfiguradas()

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/docentes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a docentes
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">
                {docente.nombres} {docente.apellidos}
              </h2>
              <EstadoRol docente={docente} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Docente desde el {formatoFechaDocente.format(new Date(docente.asignadoEn))}
              {docente.otrosRoles.length > 0 &&
                ` · también ${docente.otrosRoles.map((r) => roleConfig[r].label.toLowerCase()).join(", ")}`}
            </p>
          </div>
          <DocenteAcciones docente={docente} cuentasConfiguradas={configuradas} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Grupos asignados</CardTitle>
            <CardDescription>Los grupos y su docente se gestionan en «Grupos y horarios».</CardDescription>
          </CardHeader>
          <CardContent>
            {docente.gruposAsignados.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                <CalendarRange className="size-5" aria-hidden />
                Aún no tiene grupos asignados.
              </div>
            ) : (
              <ul className="divide-y">
                {docente.gruposAsignados.map((g) => (
                  <li key={g.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        {g.curso ? (
                          <Link href={`/admin/cursos/${g.curso.id}`} className="hover:underline">{g.curso.nombre}</Link>
                        ) : (
                          "Curso no disponible"
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Grupo {g.codigo} · {fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{ETIQUETA_ESTADO_GRUPO[g.estado] ?? g.estado}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Datos personales</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Dato etiqueta="Documento">{docente.dni ?? <Vacio />}</Dato>
                <Dato etiqueta="Teléfono">{docente.telefono ?? <Vacio />}</Dato>
              </dl>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Cuenta de acceso</CardTitle>
            </CardHeader>
            <CardContent>
              {docente.cuenta ? (
                <dl className="space-y-3">
                  <Dato etiqueta="Correo">{docente.cuenta.correo ?? <Vacio />}</Dato>
                  <Dato etiqueta="Estado"><EstadoCuenta cuenta={docente.cuenta} /></Dato>
                  {docente.cuenta.invitadoEn && !docente.cuenta.activada && (
                    <Dato etiqueta="Invitado el">{formatoFechaHoraDocente.format(new Date(docente.cuenta.invitadoEn))}</Dato>
                  )}
                  <Dato etiqueta="Último acceso">
                    {docente.cuenta.ultimoAcceso ? formatoFechaHoraDocente.format(new Date(docente.cuenta.ultimoAcceso)) : <Vacio texto="Nunca" />}
                  </Dato>
                </dl>
              ) : (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {configuradas
                    ? "No se pudo consultar la cuenta de acceso."
                    : "El correo y el estado de la cuenta se muestran cuando el servidor tiene configurada SUPABASE_SECRET_KEY."}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function Vacio({ texto = "Sin especificar" }: { texto?: string }) {
  return <span className="font-normal text-muted-foreground">{texto}</span>
}
