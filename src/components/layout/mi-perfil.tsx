import { Info } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { roleConfig } from "@/config/navigation"
import { nombreCompleto, type SesionPanel } from "@/lib/auth/contexto"

/**
 * "Mi perfil": datos reales de la propia cuenta (perfiles + usuario_roles + correo
 * de Supabase Auth). Solo lectura: la edición se implementará más adelante.
 */
export function MiPerfil({ sesion }: { sesion: SesionPanel }) {
  const nombre = nombreCompleto(sesion.perfil)
  const inicial = (nombre || sesion.email || "?")[0].toLocaleUpperCase("es")
  const esEstudiante = sesion.rolActivo === "estudiante"

  const datos: { etiqueta: string; valor: string | null }[] = [
    { etiqueta: "Nombres", valor: sesion.perfil.nombres },
    { etiqueta: "Apellidos", valor: sesion.perfil.apellidos },
    { etiqueta: "Correo de acceso", valor: sesion.email },
    { etiqueta: "DNI", valor: sesion.perfil.dni },
    { etiqueta: "Teléfono", valor: sesion.perfil.telefono },
    {
      etiqueta: "Institución",
      valor: sesion.institucion ?? (esEstudiante ? "Cuenta de estudiante (sin institución fija)" : null),
    },
  ]

  return (
    <>
      <PageHeader title="Mi perfil" description="Datos de tu cuenta en Academix." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Avatar className="size-20">
              <AvatarFallback className="bg-primary/10 text-3xl font-semibold text-primary dark:bg-primary/20">
                {inicial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{nombre || sesion.email}</p>
              {sesion.email && (
                <p className="truncate text-sm text-muted-foreground">{sesion.email}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {sesion.roles.map((rol) => (
                <Badge key={rol} variant={rol === sesion.rolActivo ? "default" : "secondary"}>
                  {roleConfig[rol].label}
                  {rol === sesion.rolActivo && <span className="sr-only"> (rol activo)</span>}
                </Badge>
              ))}
            </div>
            {sesion.roles.length > 1 && (
              <p className="text-xs text-muted-foreground">El rol resaltado es el activo.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-2">
            <dl className="divide-y divide-border">
              {datos.map(({ etiqueta, valor }) => (
                <div key={etiqueta} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                  <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
                  <dd className="text-sm font-medium break-words sm:col-span-2">
                    {valor || <span className="font-normal text-muted-foreground">No registrado</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        La edición de los datos personales estará disponible en una próxima etapa. Para
        cambiar tu contraseña usa “¿Olvidaste tu contraseña?” en la pantalla de inicio de sesión.
      </p>
    </>
  )
}
