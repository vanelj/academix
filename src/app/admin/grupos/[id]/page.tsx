import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react"

import { GrupoAcciones } from "@/components/admin/grupos/grupo-acciones"
import { DESCRIPCION_ESTADO_GRUPO, DisponibilidadBadge, EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { HorariosGrupo } from "@/components/admin/grupos/horarios-grupo"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGrupo } from "@/lib/grupos/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Grupo · Academix",
}

export default async function GrupoPage({ params }: PageProps<"/admin/grupos/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Un grupo de otra institución se trata como inexistente (RLS + filtro explícito).
  const grupo = await obtenerGrupo(institucionId, id)
  if (!grupo) notFound()

  const d = grupo.dependencias
  const eliminable = d !== null && d.matriculas + d.solicitudes + d.evaluaciones === 0
  const ocupadas = grupo.vacantesDisponibles == null ? null : grupo.vacantes - grupo.vacantesDisponibles
  const requisitos = [
    { ok: grupo.curso?.estado === "publicado", texto: "Curso publicado" },
    { ok: grupo.cursoConCondiciones, texto: "Condiciones del curso configuradas" },
    { ok: grupo.docente !== null && grupo.docenteHabilitado, texto: "Docente asignado y habilitado" },
    { ok: grupo.horarios.length > 0, texto: "Al menos un horario" },
    { ok: grupo.vacantesDisponibles === null || grupo.vacantesDisponibles > 0, texto: "Vacantes disponibles" },
  ]

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/grupos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a grupos
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">
                {grupo.curso?.nombre ?? "Curso"} · {grupo.codigo}
              </h2>
              <EstadoGrupoBadge estado={grupo.estado} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{DESCRIPCION_ESTADO_GRUPO[grupo.estado]}</p>
          </div>
          <GrupoAcciones grupoId={grupo.id} codigo={grupo.codigo} estado={grupo.estado} eliminable={eliminable} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos del grupo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Curso">
                  {grupo.curso ? (
                    <Link href={`/admin/cursos/${grupo.curso.id}`} className="hover:underline">{grupo.curso.nombre}</Link>
                  ) : "—"}
                </Dato>
                <Dato etiqueta="Docente">
                  {grupo.docente ? (
                    <Link href={`/admin/docentes/${grupo.docente.id}`} className="hover:underline">{grupo.docente.nombre}</Link>
                  ) : (
                    <span className="font-normal text-muted-foreground">Sin asignar</span>
                  )}
                </Dato>
                <Dato etiqueta="Fechas">{fechaCorta(grupo.fecha_inicio)} – {fechaCorta(grupo.fecha_fin)}</Dato>
                <Dato etiqueta="Vacantes">
                  {grupo.vacantes}
                  {ocupadas !== null && (
                    <span className="font-normal text-muted-foreground"> · {ocupadas} ocupadas, {grupo.vacantesDisponibles} libres</span>
                  )}
                  <span className="mt-1 block">
                    <DisponibilidadBadge vacantes={grupo.vacantes} disponibles={grupo.vacantesDisponibles} />
                  </span>
                </Dato>
              </dl>
            </CardContent>
          </Card>

          <HorariosGrupo grupoId={grupo.id} horarios={grupo.horarios} />
        </div>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Para abrir inscripciones</CardTitle>
              <CardDescription>Requisitos que comprueba el sistema antes de abrir el grupo.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {requisitos.map((r) => (
                  <li key={r.texto} className="flex items-start gap-2 text-sm">
                    {r.ok ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Cumplido" />
                    ) : (
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Pendiente" />
                    )}
                    <span className={r.ok ? "" : "text-muted-foreground"}>{r.texto}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {d && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Registros del grupo</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Link href={`/admin/matriculas?grupo=${grupo.id}`} className="rounded-lg outline-none hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring">
                    <Contador etiqueta="Matrículas" valor={d.matriculas} />
                  </Link>
                  <Link href={`/admin/solicitudes?grupo=${grupo.id}`} className="rounded-lg outline-none hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring">
                    <Contador etiqueta="Solicitudes" valor={d.solicitudes} />
                  </Link>
                  <Link href={`/admin/evaluaciones/${grupo.id}`} className="rounded-lg outline-none hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring">
                    <Contador etiqueta="Evaluaciones" valor={d.evaluaciones} />
                  </Link>
                </dl>
              </CardContent>
            </Card>
          )}
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

function Contador({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex flex-col-reverse rounded-lg bg-muted/50 p-2">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
    </div>
  )
}
