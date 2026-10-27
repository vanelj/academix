import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleAlert, Info, Mail, Phone } from "lucide-react"

import {
  MatriculaBadge,
  SituacionBadge,
  SolicitudBadge,
  formatoFechaEstudiante,
  formatoFechaHoraEstudiante,
  nombreEstudiante,
  situacion,
} from "@/components/admin/estudiantes/estudiante-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerContacto, obtenerEstudiante, type ContactoEstudiante } from "@/lib/estudiantes/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Estudiante · Academix",
}

const grupoTexto = (g: { codigo: string; curso: { nombre: string } | null } | null) =>
  g ? `${g.curso?.nombre ?? "Curso"} · Grupo ${g.codigo}` : "Grupo no disponible"

export default async function EstudiantePage({ params }: PageProps<"/admin/estudiantes/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Solo si tiene solicitudes o matrículas en ESTA institución (las de otras no se leen).
  const e = await obtenerEstudiante(institucionId, id)
  if (!e) notFound()

  // Contacto: la RPC solo lo devuelve con relación vigente. "error" = falló la consulta
  // (no es lo mismo que no tener relación vigente).
  let contacto: ContactoEstudiante | null | "error"
  try {
    contacto = await obtenerContacto(id)
  } catch {
    contacto = "error"
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/estudiantes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a estudiantes
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={cn("text-2xl font-semibold tracking-tight break-words", !e.datosVisibles && "text-muted-foreground italic")}>
            {nombreEstudiante(e)}
          </h2>
          <SituacionBadge valor={situacion(e)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Matrículas en tu institución</CardTitle>
              <CardDescription>Solo se muestran las de tus grupos.</CardDescription>
            </CardHeader>
            <CardContent>
              {e.matriculas.length === 0 ? (
                <Vacio>Aún no tiene matrículas en tu institución.</Vacio>
              ) : (
                <ul className="divide-y">
                  {e.matriculas.map((m) => (
                    <li key={m.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          <Link href={`/admin/matriculas/${m.id}`} className="hover:underline">{grupoTexto(m.grupo)}</Link>
                        </p>
                        <p className="text-xs text-muted-foreground">Matriculado el {formatoFechaEstudiante.format(new Date(m.fecha_matricula))}</p>
                      </div>
                      <MatriculaBadge estado={m.estado} final={m.estado_final} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solicitudes de inscripción</CardTitle>
              <CardDescription>Reservas de vacante y solicitudes de matrícula en tus grupos.</CardDescription>
            </CardHeader>
            <CardContent>
              {e.solicitudes.length === 0 ? (
                <Vacio>No tiene solicitudes en tu institución.</Vacio>
              ) : (
                <ul className="divide-y">
                  {e.solicitudes.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          <Link href={`/admin/solicitudes/${s.id}`} className="hover:underline">{grupoTexto(s.grupo)}</Link>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.tipo === "reserva" ? "Reserva de vacante" : "Solicitud de matrícula"} · {formatoFechaHoraEstudiante.format(new Date(s.fecha_solicitud))}
                          {s.estado === "reservada" && s.reserva_vence_en && ` · vence el ${formatoFechaHoraEstudiante.format(new Date(s.reserva_vence_en))}`}
                        </p>
                      </div>
                      <SolicitudBadge estado={s.estado} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Datos del estudiante</CardTitle>
            </CardHeader>
            <CardContent>
              {contacto !== null && contacto !== "error" ? (
                <dl className="space-y-3">
                  <Dato etiqueta="Nombres">{contacto.nombres}</Dato>
                  <Dato etiqueta="Apellidos">{contacto.apellidos}</Dato>
                  <Dato etiqueta="Documento">{contacto.dni ?? <Sin />}</Dato>
                  <Dato etiqueta="Teléfono">
                    {contacto.telefono ? (
                      <a href={`tel:${contacto.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <Phone className="size-3.5" aria-hidden />
                        {contacto.telefono}
                      </a>
                    ) : (
                      <Sin />
                    )}
                  </Dato>
                  <Dato etiqueta="Correo">
                    {contacto.correo ? (
                      <a href={`mailto:${contacto.correo}`} className="inline-flex items-center gap-1.5 break-all hover:underline">
                        <Mail className="size-3.5 shrink-0" aria-hidden />
                        {contacto.correo}
                      </a>
                    ) : (
                      <Sin />
                    )}
                  </Dato>
                </dl>
              ) : (
                <div className="space-y-3">
                  {e.datosVisibles && (
                    <dl className="space-y-3">
                      <Dato etiqueta="Nombres">{e.nombres}</Dato>
                      <Dato etiqueta="Apellidos">{e.apellidos}</Dato>
                    </dl>
                  )}
                  {contacto === "error" ? (
                    <p className="flex gap-2 text-sm text-destructive" role="alert">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      No se pudieron consultar los datos de contacto. Recarga la página en unos minutos.
                    </p>
                  ) : (
                    <p className="flex gap-2 text-sm text-muted-foreground">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Solo tiene historial en tu institución. El documento, el teléfono y el correo se muestran cuando
                      tiene una solicitud pendiente o reservada, o una matrícula activa.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">
            Esta ficha es de consulta: la cuenta, el correo de acceso y el perfil los gestiona el propio estudiante.
          </p>
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

function Sin() {
  return <span className="font-normal text-muted-foreground">Sin especificar</span>
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">{children}</p>
}
