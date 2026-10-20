import type { Metadata } from "next"
import { Eye, Info, ListChecks } from "lucide-react"

import { PoliticasForm } from "@/components/admin/politicas-form"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerPoliticas, type PoliticasInstitucion } from "@/lib/politicas/datos"
import { POLITICAS_VACIAS } from "@/lib/validations/politicas"

export const metadata: Metadata = {
  title: "Políticas institucionales · Academix",
}

// Módulo "Políticas institucionales": solo administrador con rol activo; la
// institución sale del perfil del servidor y RLS limita la lectura a la propia.
export default async function PoliticasPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader
      title="Políticas institucionales"
      description="Define las condiciones generales que tu institución aplica a matrículas, reservas y pagos."
    />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>
          No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a
          iniciar sesión.
        </Aviso>
      </>
    )
  }

  let politicas: PoliticasInstitucion | null
  try {
    politicas = await obtenerPoliticas(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar las políticas. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <PoliticasForm
          valoresIniciales={politicas?.valores ?? POLITICAS_VACIAS}
          actualizadoEn={politicas?.actualizadoEn ?? null}
        />

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="size-4 text-primary" aria-hidden />
                Cómo se usan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground">
              <p>
                Son textos de referencia redactados por tu institución. La plataforma no
                impone importes, plazos de reserva, vencimientos ni mensualidades.
              </p>
              <p>
                Todas son opcionales: completa solo las que apliquen. Se conservan los
                saltos de línea tal como los escribas.
              </p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" aria-hidden />
                Condiciones por curso
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Más adelante, cada curso podrá establecer sus propios requisitos, importes y
              plazos, además de estas políticas generales.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-4 text-primary" aria-hidden />
                Visibilidad
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Mientras tu institución esté activa, estos textos son de consulta pública para
              quienes se interesen en tus cursos. No incluyas datos personales ni información
              interna.
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
