import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Info } from "lucide-react"

import { ETIQUETA_ESTADO_GRUPO } from "@/components/admin/grupos/grupo-ui"
import { ComprobanteVisor } from "@/components/admin/pagos/comprobante-visor"
import { ETIQUETA_DESTINO_PAGO, ETIQUETA_ESTADO_CUOTA, EstadoPagoBadge } from "@/components/admin/pagos/pago-ui"
import { RevisionPago } from "@/components/admin/pagos/revision-pago"
import { DatosMedioCobro, tituloMedio } from "@/components/pagos/medio-cobro"
import { ETIQUETA_ESTADO_SOLICITUD, fechaSimple, formatoFechaHoraSolicitud, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { MOTIVO_REVISION_DESHABILITADA, REVISION_PAGOS_HABILITADA } from "@/lib/pagos/config"
import { obtenerPago, type PagoDetalle } from "@/lib/pagos/datos"
import { obtenerMediosCobro, type LecturaMedios } from "@/lib/pagos/medios"
import { cn } from "@/lib/utils"
import { idSchema, type EstadoGrupo } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Pago · Academix",
}

/** Situaciones que impiden aprobar o que el administrador debe conocer antes de decidir. */
function alertasDeAprobacion(p: PagoDetalle): string[] {
  const a: string[] = []
  if (p.destino === "solicitud") {
    if (p.solicitud && p.solicitud.estado !== "pendiente") {
      a.push(`La solicitud está «${ETIQUETA_ESTADO_SOLICITUD[p.solicitud.estado]}»: ya no puede confirmarse con este pago.`)
    }
    if (p.grupo && p.grupo.estado !== "abierto") {
      a.push(
        `El grupo está «${ETIQUETA_ESTADO_GRUPO[p.grupo.estado as EstadoGrupo] ?? p.grupo.estado}» y no admite nuevas reservas ni matrículas. Rechaza el pago y coordina la devolución según tus políticas.`
      )
    }
  } else if (p.destino === "cuota") {
    if (p.matricula?.estado === "anulada") {
      a.push("La matrícula de esta cuota está anulada: no apliques pagos a sus cuotas. Rechaza el pago y coordina la devolución según tus políticas.")
    }
    if (p.cuota && p.cuota.estado !== "pendiente" && p.cuota.estado !== "parcial") {
      a.push(`La cuota está «${ETIQUETA_ESTADO_CUOTA[p.cuota.estado]}»: no admite más pagos.`)
    }
  } else {
    a.push("Este pago no corresponde a una solicitud ni a una cuota de V5: solo puede rechazarse.")
  }
  if (p.comprobante !== "privado") a.push("No hay un comprobante en el almacenamiento privado: V5 no permite aprobar el pago.")
  if (!p.referencia_operacion?.trim()) a.push("El pago no tiene número de operación: V5 no permite aprobarlo.")
  return a
}

export default async function PagoPage({ params }: PageProps<"/admin/pagos/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Un pago de otra institución se trata como inexistente (RLS + filtro explícito).
  const p = await obtenerPago(institucionId, id)
  if (!p) notFound()

  // Cuentas de la institución, para contrastar el ingreso mientras el pago está en revisión.
  const medios: LecturaMedios | null =
    p.estado === "pendiente" ? await obtenerMediosCobro(institucionId, true).catch(() => null) : null

  const s = formatoSolesSolicitud
  const historial = [
    { fecha: p.fecha_pago, texto: `Comprobante presentado (${s.format(p.monto)})` },
    ...(p.verificado_en ? [{ fecha: p.verificado_en, texto: `Pago ${p.estado === "pagado" ? "aprobado" : "rechazado"}${p.verificadoPor ? ` por ${p.verificadoPor}` : ""}` }] : []),
  ]

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/pagos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a pagos
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight break-words">{p.concepto}</h2>
            <EstadoPagoBadge estado={p.estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.estudiante.nombre ?? "Estudiante"} · {s.format(p.monto)} · {formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos del pago</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Monto">{s.format(p.monto)} <span className="font-normal text-muted-foreground">(PEN)</span></Dato>
                <Dato etiqueta="Método declarado">{p.metodo}</Dato>
                <Dato etiqueta="Número de operación">{p.referencia_operacion ?? <Sin />}</Dato>
                <Dato etiqueta="Fecha de presentación">{formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}</Dato>
                <Dato etiqueta="Corresponde a">{ETIQUETA_DESTINO_PAGO[p.destino]}</Dato>
                <Dato etiqueta="Concepto">
                  {p.cuota ? (
                    <Link href={`/admin/pagos/cuotas/${p.cuota.id}`} className="hover:underline">{p.concepto}</Link>
                  ) : p.solicitud ? (
                    <Link href={`/admin/solicitudes/${p.solicitud.id}`} className="hover:underline">{p.concepto}</Link>
                  ) : p.concepto}
                  {p.cuota && <span className="block text-xs font-normal text-muted-foreground">Vence el {fechaSimple(p.cuota.vencimiento)} · {s.format(p.cuota.importe)}</span>}
                </Dato>
                <Dato etiqueta="Curso">
                  {p.curso ? <Link href={`/admin/cursos/${p.curso.id}`} className="hover:underline">{p.curso.nombre}</Link> : "—"}
                </Dato>
                <Dato etiqueta="Grupo">
                  {p.grupo ? (
                    <Link href={`/admin/grupos/${p.grupo.id}`} className="hover:underline">
                      {p.grupo.codigo} · {fechaSimple(p.grupo.fecha_inicio)} – {fechaSimple(p.grupo.fecha_fin)}
                    </Link>
                  ) : "—"}
                  {p.grupo && (
                    <span className="block text-xs font-normal text-muted-foreground">{ETIQUETA_ESTADO_GRUPO[p.grupo.estado as EstadoGrupo] ?? p.grupo.estado}</span>
                  )}
                </Dato>
                {p.solicitud && (
                  <Dato etiqueta="Solicitud">
                    <Link href={`/admin/solicitudes/${p.solicitud.id}`} className="hover:underline">
                      {ETIQUETA_ESTADO_SOLICITUD[p.solicitud.estado]} · {s.format(p.solicitud.importe_esperado)}
                    </Link>
                  </Dato>
                )}
                {p.matricula && (
                  <Dato etiqueta="Matrícula">
                    <Link href={`/admin/matriculas/${p.matricula.id}`} className="hover:underline">
                      {p.matricula.estado === "activa" ? "Activa" : "Anulada"}
                    </Link>
                  </Dato>
                )}
                {p.destino === "cuota" && p.aplicadoOtros !== null && (
                  <Dato etiqueta="Otros pagos aprobados de la cuota">{s.format(p.aplicadoOtros)}</Dato>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comprobante</CardTitle>
              <CardDescription>Archivo que adjuntó el estudiante. Se guarda en un almacenamiento privado.</CardDescription>
            </CardHeader>
            <CardContent>
              {p.comprobante === "privado" ? (
                <ComprobanteVisor pagoId={p.id} />
              ) : (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {p.comprobante === "anterior"
                    ? "El comprobante está registrado en un formato anterior y no se puede abrir desde el panel."
                    : "Este pago no tiene un comprobante adjunto."}
                </p>
              )}
            </CardContent>
          </Card>

          {p.estado === "pendiente" ? (
            <RevisionPago
              pagoId={p.id}
              habilitada={REVISION_PAGOS_HABILITADA}
              motivoDeshabilitada={MOTIVO_REVISION_DESHABILITADA}
              monto={p.monto}
              esperado={p.esperado}
              regla={p.destino === "solicitud" ? "igual" : p.destino === "cuota" ? "maximo" : null}
              referencia={p.referencia_operacion}
              tieneComprobante={p.comprobante === "privado"}
              alertas={alertasDeAprobacion(p)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Resultado de la revisión</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Dato etiqueta="Decisión"><EstadoPagoBadge estado={p.estado} /></Dato>
                  <Dato etiqueta="Revisado por">{p.verificadoPor ?? <Sin texto="No registrado" />}</Dato>
                  <Dato etiqueta="Fecha de revisión">
                    {p.verificado_en ? formatoFechaHoraSolicitud.format(new Date(p.verificado_en)) : <Sin texto="No registrada" />}
                  </Dato>
                  <Dato etiqueta="Observación">{p.observacion ?? <Sin texto="Sin observación" />}</Dato>
                </dl>
                {p.estado === "pagado" && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Aprobar un pago no genera devoluciones ni anulaciones automáticas. Si luego corresponde una devolución, gestiónala según tus políticas.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Estudiante</CardTitle>
            </CardHeader>
            <CardContent>
              {p.estudiante.id ? (
                <Link href={`/admin/estudiantes/${p.estudiante.id}`} className="font-medium hover:underline">{p.estudiante.nombre ?? "Estudiante"}</Link>
              ) : (
                <p className="text-sm text-muted-foreground">No se pudo identificar al estudiante.</p>
              )}
            </CardContent>
          </Card>
          {medios?.disponible && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Tus medios de cobro</CardTitle>
                <CardDescription>Confirma que el ingreso llegó a una de estas cuentas antes de aprobar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {medios.medios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes medios de cobro habilitados.</p>
                ) : (
                  medios.medios.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <p className="text-sm font-medium">{tituloMedio(m)}</p>
                      <DatosMedioCobro medio={{ ...m, instrucciones: null }} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Historial</CardTitle>
              <CardDescription>Fechas registradas por el sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5 border-l pl-4">
                {historial.map((h, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden />
                    <p>{h.texto}</p>
                    <p className="text-xs text-muted-foreground">{formatoFechaHoraSolicitud.format(new Date(h.fecha))}</p>
                  </li>
                ))}
              </ol>
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

function Sin({ texto = "Sin especificar" }: { texto?: string }) {
  return <span className="font-normal text-muted-foreground">{texto}</span>
}
