import Link from "next/link"
import { CheckCircle2, CircleAlert, Clock, Receipt, Wallet } from "lucide-react"

import { EstadoCuotaBadge, EstadoPagoBadge, Indicador } from "@/components/admin/pagos/pago-ui"
import { fechaSimple, formatoFechaHoraSolicitud, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CuotaEstudiante, EstadoCuenta } from "@/lib/pagos/estudiante"
import { cn } from "@/lib/utils"

const s = formatoSolesSolicitud

type Pendiente = {
  clave: string
  titulo: string
  detalle: string
  monto: number
  vencida: boolean
  vencimiento: string | null
  enRevision: boolean
  href: string
}

/** Estado de cuenta del estudiante: qué debe, qué está en revisión y qué ya pagó (estados reales de V5). */
export function EstadoCuentaVista({ cuenta }: { cuenta: EstadoCuenta }) {
  const pendientes: Pendiente[] = [
    ...cuenta.solicitudes
      .filter((x) => x.estado === "pendiente" && x.importe_esperado > 0)
      .map((x) => ({
        clave: `s-${x.id}`,
        titulo: `${x.tipo === "reserva" ? "Reserva de vacante" : "Matrícula"} · ${x.curso?.nombre ?? "Curso"}`,
        detalle: [x.curso?.institucion, x.grupo && `Grupo ${x.grupo.codigo}`].filter(Boolean).join(" · "),
        monto: x.importe_esperado,
        vencida: false,
        vencimiento: null,
        enRevision: x.pagoPendiente,
        href: `/estudiante/pagos/pagar?solicitud=${x.id}`,
      })),
    ...cuenta.cuotas
      .filter((q) => q.matriculaActiva && (q.estado === "pendiente" || q.estado === "parcial"))
      .map((q) => ({
        clave: `q-${q.id}`,
        titulo: `${q.concepto} ${q.numero} · ${q.curso ?? "Curso"}`,
        detalle: [q.institucion, q.grupo && `Grupo ${q.grupo}`, q.estado === "parcial" && `pagado ${s.format(q.aplicado)} de ${s.format(q.importe)}`].filter(Boolean).join(" · "),
        monto: q.saldo,
        vencida: q.vencida,
        vencimiento: q.vencimiento,
        enRevision: q.enRevision,
        href: `/estudiante/pagos/pagar?cuota=${q.id}`,
      })),
  ].sort((a, b) => Number(b.vencida) - Number(a.vencida) || (a.vencimiento ?? "").localeCompare(b.vencimiento ?? ""))

  const porPagar = pendientes.filter((p) => !p.enRevision).reduce((t, p) => t + p.monto, 0)
  const enRevision = cuenta.pagos.filter((p) => p.estado === "pendiente")
  const vencidas = pendientes.filter((p) => p.vencida && !p.enRevision).length

  // Matrículas con cuotas, agrupadas por curso.
  const porMatricula = new Map<string, CuotaEstudiante[]>()
  for (const q of cuenta.cuotas) porMatricula.set(q.matriculaId, [...(porMatricula.get(q.matriculaId) ?? []), q])

  const solicitudAbierta = new Set(cuenta.solicitudes.filter((x) => x.estado === "pendiente" && !x.pagoPendiente).map((x) => x.id))
  const cuotaAbierta = new Set(cuenta.cuotas.filter((q) => q.matriculaActiva && (q.estado === "pendiente" || q.estado === "parcial") && !q.enRevision).map((q) => q.id))

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="Por pagar" valor={s.format(porPagar)} tono={porPagar > 0 ? "warning" : undefined} detalle={vencidas ? `${vencidas} vencida${vencidas === 1 ? "" : "s"}` : undefined} />
        <Indicador etiqueta="Comprobantes en revisión" valor={String(enRevision.length)} detalle={enRevision.length ? s.format(enRevision.reduce((t, p) => t + p.monto, 0)) : undefined} />
        <Indicador etiqueta="Pagos aprobados" valor={String(cuenta.pagos.filter((p) => p.estado === "pagado").length)} tono="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por pagar</CardTitle>
          <CardDescription>Paga directamente a la institución y envía tu comprobante. Ella verificará el ingreso.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendientes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              No tienes pagos pendientes.
            </p>
          ) : (
            <ul className="divide-y">
              {pendientes.map((p) => (
                <li key={p.clave} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium break-words">{p.titulo}</p>
                    {p.detalle && <p className="text-muted-foreground break-words">{p.detalle}</p>}
                    {p.vencimiento && (
                      <p className={cn("text-xs", p.vencida ? "text-destructive" : "text-muted-foreground")}>
                        {p.vencida ? "Venció el" : "Vence el"} {fechaSimple(p.vencimiento)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold tabular-nums">{s.format(p.monto)}</span>
                    {p.enRevision ? (
                      <span className="flex items-center gap-1 text-xs text-warning">
                        <Clock className="size-3.5" aria-hidden />
                        Comprobante en revisión
                      </span>
                    ) : (
                      <Link href={p.href} className={buttonVariants({ size: "sm" })}>
                        <Wallet aria-hidden />
                        Pagar
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {porMatricula.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mis cuotas</CardTitle>
            <CardDescription>Cronograma de cada matrícula. Las fechas y los importes se fijaron al confirmar la matrícula.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!cuenta.nombresCompletos && (
              <p className="text-xs text-muted-foreground">Algunos nombres de cursos pueden no mostrarse mientras el grupo esté en curso.</p>
            )}
            {[...porMatricula.values()].map((qs) => {
              const q0 = qs[0]
              const saldo = qs.reduce((t, q) => t + q.saldo, 0)
              return (
                <section key={q0.matriculaId} aria-label={`Cuotas de ${q0.curso ?? "curso"}`} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium">
                      {q0.curso ?? "Curso"}
                      <span className="font-normal text-muted-foreground">{[q0.institucion, q0.grupo && `Grupo ${q0.grupo}`].filter(Boolean).map((t) => ` · ${t}`).join("")}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {q0.matriculaActiva ? `Saldo: ${s.format(saldo)}` : "Matrícula anulada (la anulación no implica devolución)"}
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Cuota</th>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Vence</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Importe</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Pagado</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Saldo</th>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qs.map((q) => (
                          <tr key={q.id} className="border-t">
                            <td className="px-3 py-2">{q.concepto} {q.numero}</td>
                            <td className={cn("px-3 py-2", q.vencida && "text-destructive")}>{fechaSimple(q.vencimiento)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.format(q.importe)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.format(q.aplicado)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{q.estado === "anulada" ? "—" : s.format(q.saldo)}</td>
                            <td className="px-3 py-2">
                              <span className="flex flex-wrap items-center gap-1">
                                <EstadoCuotaBadge cuota={q} />
                                {q.enRevision && <span className="text-xs text-warning">En revisión</span>}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de comprobantes</CardTitle>
          <CardDescription>Todos los comprobantes que enviaste y el resultado de su revisión. Nunca se eliminan.</CardDescription>
        </CardHeader>
        <CardContent>
          {cuenta.pagos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Receipt className="size-4" aria-hidden />
              Aún no enviaste comprobantes.
            </p>
          ) : (
            <ul className="divide-y">
              {cuenta.pagos.map((p) => {
                const reenviar =
                  p.estado === "rechazado" &&
                  ((p.solicitudId && solicitudAbierta.has(p.solicitudId)) || (p.cuotaId && cuotaAbierta.has(p.cuotaId)))
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-0.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{p.concepto}{p.curso ? ` · ${p.curso}` : ""}</p>
                        <EstadoPagoBadge estado={p.estado} />
                      </div>
                      <p className="text-muted-foreground">
                        {[p.institucion, p.metodo, p.referencia && `Op. ${p.referencia}`, formatoFechaHoraSolicitud.format(new Date(p.fecha))].filter(Boolean).join(" · ")}
                      </p>
                      {p.estado === "rechazado" && (
                        <p className="flex gap-1.5 text-destructive">
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {p.observacion ? `Motivo: ${p.observacion}` : "La institución no pudo verificar este pago."}
                        </p>
                      )}
                      {p.estado === "pagado" && p.verificadoEn && (
                        <p className="text-xs text-success">Aprobado el {formatoFechaHoraSolicitud.format(new Date(p.verificadoEn))}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <span className="font-semibold tabular-nums">{s.format(p.monto)}</span>
                      {reenviar && (
                        <Link
                          href={p.solicitudId ? `/estudiante/pagos/pagar?solicitud=${p.solicitudId}` : `/estudiante/pagos/pagar?cuota=${p.cuotaId}`}
                          className={buttonVariants({ size: "sm", variant: "outline" })}
                        >
                          Enviar un nuevo comprobante
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
