import type { Metadata } from "next"
import { CalendarDays, Fingerprint, ShieldCheck, UserRound } from "lucide-react"

import { InstitucionForm } from "@/components/admin/institucion-form"
import { LogoInstitucion } from "@/components/admin/logo-institucion"
import { LogoUploader } from "@/components/admin/logo-uploader"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nombreCompleto, requerirPanel } from "@/lib/auth/contexto"
import { obtenerInstitucion } from "@/lib/institucion/datos"

export const metadata: Metadata = {
  title: "Mi institución · Academix",
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "long" })

// Módulo "Mi institución": solo administrador con rol activo; la institución sale del perfil.
export default async function MiInstitucionPage() {
  const sesion = await requerirPanel("admin")
  const institucion = sesion.perfil.institucionId
    ? await obtenerInstitucion(sesion.perfil.institucionId)
    : null

  if (!institucion) {
    return (
      <>
        <PageHeader title="Mi institución" />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No se encontró la institución asociada a tu cuenta. Si el problema continúa,
            vuelve a iniciar sesión.
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Mi institución"
        description="Consulta y actualiza los datos generales de tu institución."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <div className="space-y-6">
          {/* A. Identidad institucional */}
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <LogoInstitucion nombre={institucion.nombre} logoUrl={institucion.logo_url} className="size-20" />
              <div className="min-w-0">
                <p className="text-lg font-semibold break-words">{institucion.nombre}</p>
                <Badge variant={institucion.activo ? "success" : "warning"} className="mt-2">
                  {institucion.activo ? "Institución activa" : "Institución inactiva"}
                </Badge>
              </div>
              {!institucion.activo && (
                <p className="text-xs text-muted-foreground">
                  Mientras esté inactiva, sus cursos no aparecen en el catálogo público.
                </p>
              )}
            </CardContent>
            <CardContent className="space-y-3 border-t pt-4 pb-1 text-sm">
              <Dato icono={CalendarDays} etiqueta="Registrada el">
                {formatoFecha.format(new Date(institucion.created_at))}
              </Dato>
              <Dato icono={Fingerprint} etiqueta="Identificador interno">
                <code className="block truncate font-mono text-xs" title={institucion.id}>
                  {institucion.id}
                </code>
              </Dato>
            </CardContent>
          </Card>

          {/* Logotipo: subir, cambiar o eliminar (Supabase Storage). */}
          <LogoUploader nombre={institucion.nombre} logoUrl={institucion.logo_url} />

          {/* C. Administración (informativo) */}
          <Card>
            <CardHeader>
              <CardTitle>Administración</CardTitle>
              <CardDescription>Cuenta con la que estás gestionando la institución.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Dato icono={UserRound} etiqueta="Administrador">
                <span className="block break-words">{nombreCompleto(sesion.perfil)}</span>
                {sesion.email && (
                  <span className="block truncate text-xs text-muted-foreground">{sesion.email}</span>
                )}
              </Dato>
              <Dato icono={ShieldCheck} etiqueta="Rol activo">
                Administrador
              </Dato>
              <p className="text-xs text-muted-foreground">
                Este formulario no modifica roles ni permisos.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* B. Datos editables (nombre y contacto) */}
        <InstitucionForm
          valoresIniciales={{
            nombre: institucion.nombre,
            ruc: institucion.ruc ?? "",
            correo: institucion.correo ?? "",
            telefono: institucion.telefono ?? "",
            direccion: institucion.direccion ?? "",
          }}
        />
      </div>
    </>
  )
}

function Dato({
  icono: Icono,
  etiqueta,
  children,
}: {
  icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  etiqueta: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Icono className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  )
}
