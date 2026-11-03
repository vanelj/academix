"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlert, CircleCheck, Globe, Loader2, Pencil, Trash2 } from "lucide-react"

import { ETIQUETA_COBRO, EstadoCursoBadge, formatoHoras, formatoSoles } from "@/components/admin/cursos/curso-ui"
import { EstadoGrupoBadge, fechaCorta, resumenHorarios } from "@/components/admin/grupos/grupo-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ETIQUETA_MODALIDAD } from "@/lib/certificados/config"
import { cambiarEstadoCurso, eliminarCurso } from "@/lib/cursos/acciones"
import type { DatosAsistente } from "@/lib/cursos/asistente"
import { estadoPasos, estadoPlan, type NumeroPaso } from "@/lib/cursos/asistente-logica"
import { notificar } from "@/lib/notificaciones"
import { horaCorta } from "@/lib/validations/grupo"
import { importeTotalCondiciones, type CursoValues } from "@/lib/validations/curso"

/** Paso 6: resumen por secciones con «Editar», comprobaciones y publicación. */
export function PasoRevision({
  datos,
  base,
  estados,
  alEditar,
}: {
  datos: DatosAsistente
  base: CursoValues
  estados: ReturnType<typeof estadoPasos>
  alEditar: (paso: NumeroPaso) => void
}) {
  const router = useRouter()
  const curso = datos.curso!
  const c = curso.condiciones
  const [ocupado, setOcupado] = useState<"publicar" | "eliminar" | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const categoria = datos.categorias.find((x) => x.id === base.categoria_id)
  const plan = estadoPlan(c?.tipo_cobro, c?.importe_curso ?? 0, datos.plan)
  const sinDependencias = (curso.grupos ?? 0) === 0 && (curso.cuotasPlan ?? 0) === 0
  const publicable = estados.bloqueosPublicacion.length === 0

  async function publicar() {
    setOcupado("publicar")
    const op = notificar.operacion("Publicando…")
    try {
      const r = await cambiarEstadoCurso(curso.id, "publicado")
      if (r.ok) {
        op.exito("Curso publicado", { descripcion: "Ya aparece en el catálogo público." })
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo publicar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo publicar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(null)
    }
  }

  async function eliminarBorrador() {
    setOcupado("eliminar")
    const op = notificar.operacion("Eliminando borrador…")
    try {
      const r = await eliminarCurso(curso.id)
      if (r.ok) {
        op.exito("Borrador eliminado")
        router.push("/admin/cursos")
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo eliminar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo eliminar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(null)
      setCancelar(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Seccion titulo="Información del curso" paso={1} alEditar={alEditar}>
          <div className="flex flex-col gap-4 sm:flex-row">
            {datos.portada.url && (
              // URL pública del bucket de portadas.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={datos.portada.url} alt="" className="aspect-video w-full rounded-xl object-cover ring-1 ring-border sm:w-56" />
            )}
            <dl className="grid flex-1 gap-3 text-sm">
              <Dato k="Nombre">{base.nombre}</Dato>
              <Dato k="Categoría">{categoria ? `${categoria.nombre}${categoria.activo ? "" : " (inactiva)"}` : "—"}</Dato>
              <Dato k="Descripción">{base.descripcion ? <span className="line-clamp-4 whitespace-pre-line">{base.descripcion}</span> : <Vacio />}</Dato>
              {!datos.portada.url && <Dato k="Portada">{datos.portada.disponible ? "Sin portada (se usa la generada por categoría)" : "Pendiente de la migración de portadas"}</Dato>}
            </dl>
          </div>
        </Seccion>

        <Seccion titulo="Características" paso={2} alEditar={alEditar}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Dato k="Modalidad">Virtual</Dato>
            <Dato k="Nota aprobatoria">{Number(base.nota_aprobatoria).toLocaleString("es-PE")} / 20</Dato>
            <Dato k="Requisitos" className="sm:col-span-2">{c?.requisitos ? <span className="whitespace-pre-line">{c.requisitos}</span> : <Vacio />}</Dato>
            <Dato k="Condiciones particulares" className="sm:col-span-2">{c?.condiciones_especiales ? <span className="whitespace-pre-line">{c.condiciones_especiales}</span> : <Vacio />}</Dato>
          </dl>
        </Seccion>

        <Seccion titulo="Economía" paso={3} alEditar={alEditar}>
          {c ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Dato k="Tipo de cobro">{ETIQUETA_COBRO[c.tipo_cobro]}</Dato>
              <Dato k="Precio publicado">{formatoSoles.format(curso.precio)}</Dato>
              {c.tipo_cobro !== "gratuito" && (
                <>
                  <Dato k="Total">{formatoSoles.format(importeTotalCondiciones(c))}</Dato>
                  <Dato k="Matrícula">{formatoSoles.format(c.matricula_importe)}</Dato>
                  <Dato k="Importe del curso">{formatoSoles.format(c.importe_curso)}</Dato>
                  <Dato k="Reserva">
                    {c.permite_reserva ? `${formatoSoles.format(c.reserva_importe)} · ${formatoHoras(c.reserva_plazo_horas ?? 0)}` : "No se ofrece"}
                  </Dato>
                </>
              )}
              {plan.aplica && (
                <Dato k="Plan de cuotas" className="sm:col-span-3">
                  {(datos.plan ?? []).length} cuota(s) · suma {formatoSoles.format(plan.suma)}{" "}
                  {plan.ok ? <span className="text-success">(cuadra con el importe)</span> : <span className="text-warning">(no cuadra con el importe)</span>}
                </Dato>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Las condiciones aún no se han configurado.</p>
          )}
        </Seccion>

        <Seccion titulo="Grupos" paso={4} alEditar={alEditar}>
          {datos.grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin grupos todavía.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {datos.grupos.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-2.5">
                  <span className="font-semibold">Grupo {g.codigo}</span>
                  <EstadoGrupoBadge estado={g.estado} />
                  <span className="text-muted-foreground">{fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}</span>
                  <span className="text-muted-foreground">{g.vacantes} vacantes</span>
                  <span className="text-muted-foreground">{g.docente?.nombre ?? "Sin docente"}</span>
                  <span className="w-full text-xs text-muted-foreground">
                    {resumenHorarios(g.horarios.map((h) => ({ ...h, hora_inicio: horaCorta(h.hora_inicio), hora_fin: horaCorta(h.hora_fin) })))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Certificación" paso={5} alEditar={alEditar}>
          {!datos.certificacion.disponible ? (
            <p className="text-sm text-muted-foreground">No disponible (migración de certificados pendiente).</p>
          ) : datos.certificacion.config ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Dato k="Modalidad">{ETIQUETA_MODALIDAD[datos.certificacion.config.modalidad]}</Dato>
              {datos.certificacion.config.importe > 0 && <Dato k="Costo">{formatoSoles.format(datos.certificacion.config.importe)}</Dato>}
              {datos.certificacion.config.nota_minima != null && <Dato k="Nota mínima">{datos.certificacion.config.nota_minima}</Dato>}
              {datos.certificacion.config.horas_academicas != null && <Dato k="Horas académicas">{datos.certificacion.config.horas_academicas}</Dato>}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Sin configurar (por defecto, el curso no entrega certificado).</p>
          )}
        </Seccion>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">Publicación <EstadoCursoBadge estado={curso.estado} /></CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {estados.bloqueosPublicacion.length > 0 ? (
              <ul className="space-y-1.5">
                {estados.bloqueosPublicacion.map((b) => (
                  <li key={b} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{b}</li>
                ))}
              </ul>
            ) : (
              <p className="flex gap-2 text-success"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Cumple los requisitos para publicarse.</p>
            )}
            {estados.avisosPublicacion.map((a) => (
              <p key={a} className="flex gap-2 text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{a}</p>
            ))}
            {curso.estado !== "publicado" ? (
              <Button className="w-full" onClick={publicar} disabled={!publicable || ocupado !== null}>
                {ocupado === "publicar" ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
                Publicar curso
              </Button>
            ) : (
              <p className="text-muted-foreground">El curso ya está publicado. Los cambios guardados se reflejan en el catálogo.</p>
            )}
            <Link href={`/admin/cursos/${curso.id}`} className={buttonVariants({ variant: "outline", className: "w-full" })}>
              {curso.estado === "borrador" ? "Guardar borrador y salir" : "Salir del asistente"}
            </Link>
            {curso.estado === "borrador" && (
              <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelar(true)} disabled={ocupado !== null}>
                Cancelar la creación…
              </Button>
            )}
          </CardContent>
        </Card>
      </aside>

      <Dialog open={cancelar} onOpenChange={(a) => !a && ocupado === null && setCancelar(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Cancelar la creación de «{curso.nombre}»?</DialogTitle>
            <DialogDescription>
              {sinDependencias
                ? "Puedes eliminar el borrador y sus condiciones de forma permanente, o salir y conservarlo para continuar más tarde."
                : "El borrador tiene grupos o plan de cuotas, así que no se puede eliminar desde aquí. Puedes conservarlo como borrador o desactivarlo desde su ficha."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={ocupado !== null} autoFocus />}>Seguir editando</DialogClose>
            <Link href={`/admin/cursos/${curso.id}`} className={buttonVariants({ variant: "outline" })}>Conservar borrador y salir</Link>
            {sinDependencias && (
              <Button variant="destructive" onClick={eliminarBorrador} disabled={ocupado !== null}>
                {ocupado === "eliminar" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                Eliminar borrador
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Seccion({ titulo, paso, alEditar, children }: { titulo: string; paso: NumeroPaso; alEditar: (p: NumeroPaso) => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{titulo}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => alEditar(paso)} aria-label={`Editar ${titulo.toLowerCase()} (paso ${paso})`}>
            <Pencil aria-hidden />
            Editar
          </Button>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Dato({ k, className, children }: { k: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 font-medium break-words">{children}</dd>
    </div>
  )
}

function Vacio() {
  return <span className="font-normal text-muted-foreground">Sin especificar</span>
}
