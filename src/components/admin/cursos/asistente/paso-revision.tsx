"use client"

import { useState } from "react"
import { CircleAlert, CircleCheck, CircleX, Globe, Loader2, Pencil, RotateCcw, Save } from "lucide-react"

import { ETIQUETA_COBRO, EstadoCursoBadge, formatoHoras, formatoSoles } from "@/components/admin/cursos/curso-ui"
import { fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ETIQUETA_MODALIDAD } from "@/lib/certificados/config"
import type { CategoriaOpcion } from "@/lib/cursos/datos"
import {
  PASO,
  esCobroAnterior,
  estadoPlanLocal,
  planVigente,
  resumenSemanal,
  type Complementos,
  type NumeroPaso,
  type Operacion,
  type PasoEditable,
  type RevisionPaso,
} from "@/lib/cursos/asistente-logica"
import type { OpcionDocente } from "@/lib/grupos/datos"
import { cn } from "@/lib/utils"
import { importeTotalCondiciones, type CursoValues, type EstadoCurso } from "@/lib/validations/curso"

export type EstadoOperacion = { op: Operacion; estado: "pendiente" | "en_curso" | "hecha" | "error" }
export type Guardado =
  | { fase: "inactivo" }
  | { fase: "comprobando" | "guardando"; operaciones: EstadoOperacion[] }
  | { fase: "error"; operaciones: EstadoOperacion[]; mensaje: string; paso: NumeroPaso | null; conflictos?: string[] }

/** Último paso: resumen de lo configurado (local), comprobaciones y guardado explícito. */
export function PasoRevision({
  curso,
  complementos,
  categorias,
  docentes,
  portada,
  certificacionDisponible,
  estadoCurso,
  existente,
  hayCambios,
  revision,
  bloqueos,
  avisos,
  cambiosEconomicos,
  confirmaEconomia,
  alConfirmarEconomia,
  guardado,
  alEditar,
  alGuardar,
  gruposParaAbrir,
  abrirInscripciones,
  alCambiarAbrirInscripciones,
}: {
  curso: CursoValues
  complementos: Complementos
  categorias: CategoriaOpcion[]
  docentes: OpcionDocente[]
  portada: { url: string | null; pendiente: boolean; quitar: boolean; disponible: boolean; vista: string | null }
  certificacionDisponible: boolean
  estadoCurso: EstadoCurso | null
  existente: boolean
  hayCambios: boolean
  revision: Record<PasoEditable, RevisionPaso>
  bloqueos: string[]
  avisos: string[]
  cambiosEconomicos: string[]
  confirmaEconomia: boolean
  alConfirmarEconomia: (v: boolean) => void
  guardado: Guardado
  alEditar: (paso: NumeroPaso) => void
  alGuardar: (publicar: boolean) => void
  /** Grupos programados con horarios que «Publicar» puede abrir a inscripciones. */
  gruposParaAbrir: number
  abrirInscripciones: boolean
  alCambiarAbrirInscripciones: (v: boolean) => void
}) {
  const [confirmarPublicar, setConfirmarPublicar] = useState(false)
  const c = curso.condiciones
  const categoria = categorias.find((x) => x.id === curso.categoria_id)
  const plan = estadoPlanLocal(curso, complementos.plan)
  const cuotas = planVigente(complementos.plan).sort((a, b) => Number(a.valores.numero) - Number(b.valores.numero))
  const ocupado = guardado.fase === "comprobando" || guardado.fase === "guardando"
  const publicado = estadoCurso === "publicado"
  const puedePublicar = !publicado && estadoCurso !== "desactivado"
  const pideConfirmacion = publicado && cambiosEconomicos.length > 0
  const nombreDocente = (id: string) => docentes.find((d) => d.id === id)?.nombre ?? "Docente no disponible"
  const cert = complementos.certificacion

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Seccion titulo="Curso" paso={PASO.curso} revision={revision[PASO.curso]} alEditar={alEditar}>
          <div className="flex flex-col gap-4 sm:flex-row">
            {portada.vista && (
              // Vista previa local (blob:) o URL pública del bucket de portadas.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portada.vista} alt="" className="aspect-video w-full rounded-xl object-cover ring-1 ring-border sm:w-56" />
            )}
            <dl className="grid flex-1 gap-3 text-sm">
              <Dato k="Nombre">{curso.nombre.trim() || <Vacio texto="Sin nombre" />}</Dato>
              <Dato k="Categoría">{categoria ? `${categoria.nombre}${categoria.activo ? "" : " (inactiva)"}` : <Vacio texto="Sin categoría" />}</Dato>
              <Dato k="Descripción">{curso.descripcion ? <span className="line-clamp-4 whitespace-pre-line">{curso.descripcion}</span> : <Vacio />}</Dato>
              <Dato k="Nota aprobatoria">{curso.nota_aprobatoria ? `${Number(curso.nota_aprobatoria).toLocaleString("es-PE")} / 20` : <Vacio />}</Dato>
              {c.requisitos && <Dato k="Requisitos"><span className="whitespace-pre-line">{c.requisitos}</span></Dato>}
              {c.condiciones_especiales && <Dato k="Condiciones particulares"><span className="whitespace-pre-line">{c.condiciones_especiales}</span></Dato>}
              <Dato k="Portada">
                {!portada.disponible
                  ? "No disponible (migración de portadas pendiente)"
                  : portada.pendiente
                    ? "Nueva imagen: se subirá al guardar"
                    : portada.quitar
                      ? "Se quitará al guardar (se usará la portada generada)"
                      : portada.url
                        ? "Imagen actual"
                        : "Sin portada (se usa la generada por categoría)"}
              </Dato>
            </dl>
          </div>
        </Seccion>

        <Seccion titulo="Precio" paso={PASO.precio} revision={revision[PASO.precio]} alEditar={alEditar}>
          {!esCobroAnterior(c) ? (
            <p className="text-sm">
              {c.tipo_cobro === "gratuito"
                ? <span className="font-semibold">Gratuito</span>
                : <><span className="text-2xl font-extrabold">{formatoSoles.format(Number(curso.precio) || 0)}</span> <span className="text-muted-foreground">· pago completo al inscribirse</span></>}
            </p>
          ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <Dato k="Tipo de cobro">{ETIQUETA_COBRO[c.tipo_cobro]} (condiciones anteriores)</Dato>
            <Dato k="Precio publicado">{formatoSoles.format(Number(curso.precio) || 0)}</Dato>
            {c.tipo_cobro !== "gratuito" && (
              <>
                <Dato k="Total">{formatoSoles.format(importeTotalCondiciones({ tipo_cobro: c.tipo_cobro, matricula_importe: Number(c.matricula_importe) || 0, importe_curso: Number(c.importe_curso) || 0 }))}</Dato>
                <Dato k="Matrícula">{formatoSoles.format(Number(c.matricula_importe) || 0)}</Dato>
                <Dato k="Importe del curso">{formatoSoles.format(Number(c.importe_curso) || 0)}</Dato>
                <Dato k="Reserva">{c.permite_reserva ? `${formatoSoles.format(Number(c.reserva_importe) || 0)} · ${formatoHoras(Number(c.reserva_plazo_horas) || 0)}` : "No se ofrece"}</Dato>
              </>
            )}
            {plan.aplica && (
              <Dato k="Plan de cuotas" className="sm:col-span-3">
                {cuotas.length} cuota(s) · suma {formatoSoles.format(plan.suma)}{" "}
                {plan.ok ? <span className="text-success">(cuadra con el importe)</span> : <span className="text-warning">(no cuadra con el importe)</span>}
              </Dato>
            )}
          </dl>
          )}
        </Seccion>

        <Seccion titulo="Grupos y horarios" paso={PASO.grupos} revision={revision[PASO.grupos]} alEditar={alEditar}>
          {complementos.grupos.filter((g) => !g.editando || g.existente).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin grupos. Es opcional: puedes crearlos después.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {complementos.grupos.filter((g) => !g.editando || g.existente).map((g) => {
                const v = g.editando && g.antesDeEditar ? g.antesDeEditar : g.valores
                const horarios = g.horarios.filter((h) => !h.eliminado)
                return (
                  <li key={g.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-2.5">
                    <span className="font-semibold">Grupo {v.codigo}</span>
                    {!g.existente && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">Nuevo</span>}
                    <span className="text-muted-foreground">{fechaCorta(v.fecha_inicio)} – {fechaCorta(v.fecha_fin)}</span>
                    <span className="text-muted-foreground">{v.vacantes} vacantes</span>
                    <span className="text-muted-foreground">{v.docente_id ? nombreDocente(v.docente_id) : "Docente por asignar"}</span>
                    <span className="w-full text-xs text-muted-foreground">
                      {resumenSemanal(horarios.map((h) => h.valores))}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Certificado" paso={PASO.certificado} revision={revision[PASO.certificado]} alEditar={alEditar}>
          {!certificacionDisponible ? (
            <p className="text-sm text-muted-foreground">No disponible (migración de certificados pendiente).</p>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Dato k="Modalidad">{ETIQUETA_MODALIDAD[cert.modalidad]}</Dato>
              {cert.modalidad === "costo_adicional" && <Dato k="Costo">{formatoSoles.format(Number(cert.importe) || 0)}</Dato>}
              {cert.modalidad !== "sin_certificado" && cert.nota_minima && <Dato k="Nota mínima">{cert.nota_minima}</Dato>}
              {cert.horas_academicas && <Dato k="Horas académicas">{cert.horas_academicas}</Dato>}
            </dl>
          )}
        </Seccion>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Guardar
              {estadoCurso ? <EstadoCursoBadge estado={estadoCurso} /> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Aún no creado</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!hayCambios && existente ? (
              <p className="flex gap-2 text-success"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />No hay cambios pendientes: todo coincide con lo guardado en Supabase.</p>
            ) : (
              <p className="text-muted-foreground">
                {existente
                  ? "Tus cambios están solo en este navegador hasta que los guardes."
                  : "Nada se ha guardado todavía. Al guardar se crea el curso con todo lo configurado."}
              </p>
            )}

            {puedePublicar && (
              bloqueos.length > 0 ? (
                <div>
                  <p className="font-medium">Para publicar falta:</p>
                  <ul className="mt-1 space-y-1.5">
                    {bloqueos.map((b) => <li key={b} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{b}</li>)}
                  </ul>
                </div>
              ) : (
                <p className="flex gap-2 text-success"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Cumple los requisitos para publicarse.</p>
              )
            )}
            {avisos.map((a) => <p key={a} className="flex gap-2 text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{a}</p>)}

            {pideConfirmacion && (
              <div className="space-y-2 rounded-2xl border border-warning/40 p-3">
                <p className="font-medium">El curso está publicado y cambian sus condiciones económicas:</p>
                <ul className="list-inside list-disc text-muted-foreground">{cambiosEconomicos.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="text-xs text-muted-foreground">Las matrículas ya confirmadas conservan sus importes y cuotas; los cambios se aplican a las nuevas inscripciones.</p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmaEconomia} onChange={(e) => alConfirmarEconomia(e.target.checked)} disabled={ocupado} />
                  <span>Confirmo estos cambios de precios y condiciones.</span>
                </label>
              </div>
            )}

            {guardado.fase !== "inactivo" && <ProgresoGuardado guardado={guardado} alEditar={alEditar} />}

            <div className="space-y-2 pt-1">
              {puedePublicar && (
                <Button className="w-full" onClick={() => setConfirmarPublicar(true)} disabled={ocupado || bloqueos.length > 0}>
                  <Globe aria-hidden />
                  {abrirInscripciones && gruposParaAbrir > 0 ? "Publicar y abrir inscripciones" : "Publicar curso"}
                </Button>
              )}
              {puedePublicar && gruposParaAbrir > 0 && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={abrirInscripciones} onChange={(e) => alCambiarAbrirInscripciones(e.target.checked)} disabled={ocupado} />
                  <span>
                    Al publicar, abrir las inscripciones de {gruposParaAbrir === 1 ? "su grupo con horarios" : `sus ${gruposParaAbrir} grupos con horarios`}.
                    Si no, ábrelos después desde «Grupos y horarios».
                  </span>
                </label>
              )}
              <Button
                className="w-full"
                variant={puedePublicar ? "outline" : "default"}
                onClick={() => alGuardar(false)}
                disabled={ocupado || (existente && !hayCambios) || (pideConfirmacion && !confirmaEconomia)}
              >
                {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : guardado.fase === "error" ? <RotateCcw aria-hidden /> : <Save aria-hidden />}
                {guardado.fase === "error" ? "Reintentar el guardado" : puedePublicar ? "Guardar como borrador" : "Guardar cambios"}
              </Button>
              {puedePublicar && <p className="text-xs text-muted-foreground">El borrador no aparece en el catálogo hasta que lo publiques.</p>}
            </div>
          </CardContent>
        </Card>
      </aside>

      <Dialog open={confirmarPublicar} onOpenChange={(a) => !a && setConfirmarPublicar(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Publicar «{curso.nombre.trim()}»?</DialogTitle>
            <DialogDescription>
              Se guardará todo lo configurado y el curso aparecerá en el catálogo público de tu institución.
              {abrirInscripciones && gruposParaAbrir > 0 && " Además se abrirán las inscripciones de sus grupos con horarios, así los estudiantes podrán comprarlo de inmediato."}
              {" "}Podrás desactivarlo después desde su ficha.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" autoFocus />}>Volver</DialogClose>
            <Button onClick={() => { setConfirmarPublicar(false); alGuardar(true) }} disabled={pideConfirmacion && !confirmaEconomia}>
              <Globe aria-hidden />
              {abrirInscripciones && gruposParaAbrir > 0 ? "Publicar y abrir inscripciones" : "Guardar y publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProgresoGuardado({ guardado, alEditar }: { guardado: Exclude<Guardado, { fase: "inactivo" }>; alEditar: (p: NumeroPaso) => void }) {
  return (
    <div className="space-y-2 rounded-2xl border p-3" aria-live="polite">
      {guardado.fase === "comprobando" && (
        <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden />Comprobando que nadie haya cambiado el curso en otra sesión…</p>
      )}
      {guardado.operaciones.length > 0 && (
        <ul className="space-y-1">
          {guardado.operaciones.map(({ op, estado }) => (
            <li key={op.clave} className={cn("flex gap-2", estado === "pendiente" && "text-muted-foreground")}>
              {estado === "hecha" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Guardado" />
                : estado === "en_curso" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-label="Guardando" />
                  : estado === "error" ? <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Error" />
                    : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-label="Pendiente" />}
              {op.descripcion}
            </li>
          ))}
        </ul>
      )}
      {guardado.fase === "error" && (
        <div role="alert" className="space-y-2 text-destructive">
          <p className="font-medium">{guardado.mensaje}</p>
          {guardado.conflictos && (
            <>
              <ul className="list-inside list-disc text-sm">{guardado.conflictos.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className="text-xs text-muted-foreground">
                No se guardó nada. Recarga la página para ver la versión actual; tus cambios quedan en una copia local que podrás revisar,
                pero conviene volver a aplicarlos sobre los datos actuales.
              </p>
            </>
          )}
          {guardado.paso && guardado.paso < PASO.revision && (
            <Button size="sm" variant="outline" onClick={() => alEditar(guardado.paso!)}>Ir al paso {guardado.paso}</Button>
          )}
        </div>
      )}
    </div>
  )
}

function Seccion({ titulo, paso, revision, alEditar, children }: { titulo: string; paso: NumeroPaso; revision: RevisionPaso; alEditar: (p: NumeroPaso) => void; children: React.ReactNode }) {
  return (
    <Card className={cn(!revision.valido && "ring-destructive/40")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {titulo}
            {!revision.valido && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Por corregir</span>}
            {revision.valido && revision.opcional && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Opcional</span>}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => alEditar(paso)} aria-label={`Editar ${titulo.toLowerCase()} (paso ${paso})`}>
            <Pencil aria-hidden />
            Editar
          </Button>
        </div>
        {!revision.valido && <ul className="mt-1 space-y-0.5 text-sm text-destructive">{revision.mensajes.map((m) => <li key={m}>{m}</li>)}</ul>}
        {revision.avisos.map((m) => <p key={m} className="mt-1 text-sm text-warning">{m}</p>)}
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

function Vacio({ texto = "Sin especificar" }: { texto?: string }) {
  return <span className="font-normal text-muted-foreground">{texto}</span>
}
