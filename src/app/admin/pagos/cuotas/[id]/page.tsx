import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleAlert, Eye } from "lucide-react"

import { ETIQUETA_ESTADO_GRUPO } from "@/components/admin/grupos/grupo-ui"
import { EstadoCuotaBadge, EstadoPagoBadge } from "@/components/admin/pagos/pago-ui"
import { fechaSimple, formatoFechaHoraSolicitud, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCuota } from "@/lib/pagos/datos"
import { cn } from "@/lib/utils"
import { idSchema, type EstadoGrupo } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Cuota · Academix",
}

export default async function CuotaPage({ params }: PageProps<"/admin/pagos/cuotas/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Una cuota de otra institución se trata como inexistente (RLS + filtro explícito).
  const c = await obtenerCuota(institucionId, id)
  if (!c) notFound()

  const s = formatoSolesSolicitud
  const anulada = c.matricula?.estado === "anulada"

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/pagos/cuotas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a cuotas
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight break-words">Cuota {c.numero} · {c.concepto}</h2>
            <EstadoCuotaBadge cuota={c} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.estudiante.nombre ?? "Estudiante"} · {c.curso?.nombre ?? "Curso"} · Grupo {c.grupo?.codigo ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saldo de la cuota</CardTitle>
              <CardDescription>Importe fijado al confirmar la matrícula según el plan de cuotas del curso.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Cifra etiqueta="Importe" valor={s.format(c.importe)} />
                <Cifra etiqueta="Pagos aprobados" valor={s.format(c.aplicado)} />
                <Cifra etiqueta="Saldo" valor={s.format(c.saldo)} destacado />
                <Cifra etiqueta="En revisión" valor={s.format(c.enRevision)} />
              </dl>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Vencimiento">
                  <span className={cn(c.vencida && "text-destructive")}>{fechaSimple(c.vencimiento)}{c.vencida && " (vencida)"}</span>
                </Dato>
                <Dato etiqueta="Matrícula">
                  {c.matricula ? (
                    <Link href={`/admin/matriculas/${c.matricula.id}`} className="hover:underline">{anulada ? "Anulada" : "Activa"}</Link>
                  ) : "—"}
                </Dato>
                <Dato etiqueta="Curso">
                  {c.curso ? <Link href={`/admin/cursos/${c.curso.id}`} className="hover:underline">{c.curso.nombre}</Link> : "—"}
                </Dato>
                <Dato etiqueta="Grupo">
                  {c.grupo ? (
                    <Link href={`/admin/grupos/${c.grupo.id}`} className="hover:underline">
                      {c.grupo.codigo} · {ETIQUETA_ESTADO_GRUPO[c.grupo.estado as EstadoGrupo] ?? c.grupo.estado}
                    </Link>
                  ) : "—"}
                </Dato>
              </dl>
              {anulada && (c.estado === "pendiente" || c.estado === "parcial") && (
                <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm dark:bg-warning/10">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {c.estado === "parcial"
                    ? "La matrícula está anulada y esta cuota se conserva como «pago parcial» con lo ya pagado."
                    : "La matrícula está anulada, pero esta cuota sigue «pendiente»: se anuló antes de instalar la anulación protegida."}{" "}
                  El estudiante ya no puede presentar comprobantes para ella. Cualquier obligación o devolución se gestiona según las
                  políticas de tu institución.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagos de la cuota</CardTitle>
              <CardDescription>Comprobantes presentados para esta cuota.</CardDescription>
            </CardHeader>
            <CardContent>
              {c.pagos.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">Aún no se presentaron comprobantes para esta cuota.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {c.pagos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{s.format(p.monto)} · {p.metodo}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}
                          {p.referencia_operacion && ` · Op. ${p.referencia_operacion}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <EstadoPagoBadge estado={p.estado} />
                        <Link href={`/admin/pagos/${p.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Ver pago">
                          <Eye aria-hidden />
                        </Link>
                      </div>
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
              <CardTitle>Estudiante</CardTitle>
            </CardHeader>
            <CardContent>
              {c.estudiante.id ? (
                <Link href={`/admin/estudiantes/${c.estudiante.id}`} className="font-medium hover:underline">{c.estudiante.nombre ?? "Estudiante"}</Link>
              ) : (
                <p className="text-sm text-muted-foreground">No se pudo identificar al estudiante.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Cifra({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("mt-0.5 font-semibold tabular-nums", destacado && "text-lg")}>{valor}</dd>
    </div>
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
