"use client"

import { useId, useState } from "react"
import { CalendarDays, CircleAlert, CircleCheck, Clock, ExternalLink, Pencil, Plus, RefreshCw, Trash2, Undo2, UserRound, Users, X } from "lucide-react"
import { useRouter } from "next/navigation"

import { DIA_CORTO, EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  GRUPO_VACIO,
  codigoSugerido,
  grupoLocalListo,
  resumenSemanal,
  validarGrupo,
  validarHorario,
  type DatosGrupo,
  type Errores,
  type GrupoLocal,
  type HorarioLocal,
} from "@/lib/cursos/asistente-logica"
import type { OpcionDocente } from "@/lib/grupos/datos"
import { cn } from "@/lib/utils"
import { DIAS_SEMANA, HORARIO_INICIAL, VACANTES_MAX, type HorarioValues } from "@/lib/validations/grupo"

/**
 * Paso 4 (opcional): grupos del curso con sus horarios y docentes, en memoria.
 * - No se abre ningún formulario automáticamente: «Agregar grupo» es voluntario.
 * - Un grupo nuevo se valida solo al «Incorporarlo»; hasta entonces puede
 *   descartarse sin dejar rastro. Nada se escribe hasta el último paso.
 * - Los grupos existentes no se eliminan desde aquí (su estado, apertura y
 *   eliminación se gestionan en «Grupos y horarios»).
 */
export function PasoGrupos({
  grupos,
  docentes,
  gruposError,
  alCambiar,
  deshabilitado,
}: {
  grupos: GrupoLocal[]
  docentes: OpcionDocente[]
  gruposError: boolean
  alCambiar: (grupos: GrupoLocal[]) => void
  deshabilitado?: boolean
}) {
  const router = useRouter()
  const [errores, setErrores] = useState<Record<string, Errores>>({})
  const habilitados = docentes.filter((d) => d.habilitado)
  const nombreDocente = (id: string) => docentes.find((d) => d.id === id)?.nombre ?? "Docente no disponible"

  const cambiar = (clave: string, f: (g: GrupoLocal) => GrupoLocal) => alCambiar(grupos.map((g) => (g.clave === clave ? f(g) : g)))

  function agregar() {
    const clave = crypto.randomUUID()
    // Código propuesto («Grupo 1», «Grupo 2»…): se puede cambiar.
    alCambiar([...grupos, { clave, existente: false, estado: "programado", valores: { ...GRUPO_VACIO, codigo: codigoSugerido(grupos) }, original: null, editando: true, antesDeEditar: null, horarios: [] }])
  }

  function incorporar(g: GrupoLocal) {
    const e = validarGrupo(g.valores, grupos, g.clave)
    setErrores((x) => ({ ...x, [g.clave]: e }))
    if (Object.keys(e).length) return
    cambiar(g.clave, (x) => ({ ...x, editando: false, antesDeEditar: null, valores: { ...x.valores, codigo: x.valores.codigo.replace(/\s+/g, " ").trim() } }))
  }

  function cancelar(g: GrupoLocal) {
    setErrores((x) => ({ ...x, [g.clave]: {} }))
    if (!g.antesDeEditar) alCambiar(grupos.filter((x) => x.clave !== g.clave)) // nuevo sin incorporar: se descarta
    else cambiar(g.clave, (x) => ({ ...x, valores: x.antesDeEditar!, editando: false, antesDeEditar: null }))
  }

  return (
    <div className="space-y-5">
      <Card size="sm">
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Los grupos son <strong className="font-semibold text-foreground">opcionales</strong>: puedes guardar el curso sin grupos y crearlos después.
            Para recibir inscripciones, un grupo necesita horarios y estar abierto (eso se hace en «Grupos y horarios» cuando el curso esté publicado).
            El docente es opcional para inscribir: los estudiantes verán «Docente por asignar» y se exige al iniciar las clases.
          </p>
        </CardContent>
      </Card>

      {gruposError && (
        <p role="alert" className="rounded-xl border border-dashed border-destructive/40 p-4 text-sm text-destructive">
          No se pudieron cargar todos los grupos de este curso. Recarga la página antes de agregar otro, para no duplicarlo.
        </p>
      )}

      {habilitados.length === 0 && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-2 text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Tu institución aún no tiene docentes habilitados. Puedes crear el grupo sin docente y asignarlo después.
              Los docentes se invitan por correo desde «Docentes».
            </p>
            <div className="flex shrink-0 gap-2">
              <a href="/admin/docentes" target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink aria-hidden />
                Abrir Docentes
              </a>
              <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
                <RefreshCw aria-hidden />
                Actualizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {grupos.map((g) => {
        const listo = !g.editando && grupoLocalListo(g)
        const titulo = g.valores.codigo.trim() ? `Grupo ${g.valores.codigo.trim()}` : "Nuevo grupo"
        return (
          <Card key={g.clave} className={cn(listo && "ring-success/40")} data-grupo={g.clave}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {titulo}
                    {g.existente ? <EstadoGrupoBadge estado={g.estado} /> : <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">Nuevo · sin guardar</span>}
                  </CardTitle>
                  {!g.editando && (
                    <CardDescription className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{fechaCorta(g.valores.fecha_inicio)} – {fechaCorta(g.valores.fecha_fin)}</span>
                      <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden />{g.valores.vacantes} vacantes</span>
                      <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" aria-hidden />{g.valores.docente_id ? nombreDocente(g.valores.docente_id) : "Docente por asignar"}</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />{resumenSemanal(g.horarios.filter((h) => !h.eliminado).map((h) => h.valores))}</span>
                    </CardDescription>
                  )}
                </div>
                {!g.editando && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={deshabilitado} onClick={() => cambiar(g.clave, (x) => ({ ...x, editando: true, antesDeEditar: x.valores }))}>
                      <Pencil aria-hidden />
                      Editar datos
                    </Button>
                    {!g.existente && (
                      <Button variant="ghost" size="sm" disabled={deshabilitado} onClick={() => alCambiar(grupos.filter((x) => x.clave !== g.clave))}>
                        <Trash2 aria-hidden />
                        Quitar grupo
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {!g.editando && (
                <p className={cn("mt-2 flex items-center gap-1.5 text-xs", listo ? "text-success" : "text-muted-foreground")}>
                  {listo ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5 text-warning" aria-hidden />}
                  {listo
                    ? g.valores.docente_id
                      ? "Tiene docente y horarios."
                      : "Tiene horarios. Docente por asignar: podrá recibir inscripciones y se asignará antes de iniciar las clases."
                    : g.horarios.every((h) => h.eliminado)
                      ? "Faltan los horarios (puedes agregarlos después)."
                      : "El grupo no está vigente (cerrado, en curso o cancelado)."}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {g.editando && (
                <FormularioGrupo
                  grupo={g}
                  errores={errores[g.clave] ?? {}}
                  docentes={docentes}
                  deshabilitado={deshabilitado}
                  alCambiar={(valores) => {
                    cambiar(g.clave, (x) => ({ ...x, valores }))
                    setErrores((x) => ({ ...x, [g.clave]: {} }))
                  }}
                  alIncorporar={() => incorporar(g)}
                  alCancelar={() => cancelar(g)}
                />
              )}
              <EditorHorarios
                horarios={g.horarios}
                deshabilitado={deshabilitado}
                alCambiar={(horarios) => cambiar(g.clave, (x) => ({ ...x, horarios }))}
              />
              {g.existente && (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  El estado del grupo (abrir a inscripciones, cerrar o cancelar) y su eliminación se gestionan en{" "}
                  <a href={`/admin/grupos/${g.clave}`} target="_blank" rel="noopener" className="underline">la ficha del grupo</a>.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Button variant="outline" onClick={agregar} disabled={deshabilitado || gruposError}>
        <Plus aria-hidden />
        {grupos.length === 0 ? "Agregar grupo" : "Agregar otro grupo"}
      </Button>
    </div>
  )
}

function FormularioGrupo({
  grupo,
  errores,
  docentes,
  deshabilitado,
  alCambiar,
  alIncorporar,
  alCancelar,
}: {
  grupo: GrupoLocal
  errores: Errores
  docentes: OpcionDocente[]
  deshabilitado?: boolean
  alCambiar: (v: DatosGrupo) => void
  alIncorporar: () => void
  alCancelar: () => void
}) {
  const id = useId()
  const v = grupo.valores
  const set = (k: keyof DatosGrupo, valor: string) => alCambiar({ ...v, [k]: valor })
  const opciones = docentes.filter((d) => d.habilitado || d.id === v.docente_id)
  const nuevo = !grupo.antesDeEditar

  const campo = (k: keyof DatosGrupo, etiqueta: string, props: React.ComponentProps<typeof Input>) => (
    <Field data-invalid={!!errores[k] || undefined}>
      <FieldLabel htmlFor={`${id}-${k}`}>{etiqueta}</FieldLabel>
      <Input id={`${id}-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errores[k] || undefined} disabled={deshabilitado} {...props} />
      {errores[k] && <FieldError>{errores[k]}</FieldError>}
    </Field>
  )

  return (
    <div className="space-y-4 rounded-2xl border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("codigo", "Código del grupo", { maxLength: 30, placeholder: "Ej.: A — Turno mañana" })}
        {campo("vacantes", "Vacantes", { inputMode: "numeric", maxLength: String(VACANTES_MAX).length })}
        {campo("fecha_inicio", "Fecha de inicio", { type: "date" })}
        {campo("fecha_fin", "Fecha de fin", { type: "date" })}
        <Field data-invalid={!!errores.docente_id || undefined} className="sm:col-span-2">
          <FieldLabel htmlFor={`${id}-docente`}>Docente (opcional)</FieldLabel>
          <select
            id={`${id}-docente`}
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            value={v.docente_id}
            onChange={(e) => set("docente_id", e.target.value)}
            disabled={deshabilitado}
          >
            <option value="">Sin docente por ahora</option>
            {opciones.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.habilitado ? "" : " (no habilitado)"}</option>)}
          </select>
          {errores.docente_id && <FieldError>{errores.docente_id}</FieldError>}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={alIncorporar} disabled={deshabilitado}>
          <CircleCheck aria-hidden />
          {nuevo ? "Incorporar grupo" : "Aplicar cambios"}
        </Button>
        <Button size="sm" variant="ghost" onClick={alCancelar} disabled={deshabilitado}>
          <X aria-hidden />
          {nuevo ? "Descartar grupo" : "Cancelar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {nuevo ? "El grupo se valida al incorporarlo y se crea al guardar el curso (último paso)." : "Los cambios se aplican en Supabase al guardar el curso (último paso)."}
      </p>
    </div>
  )
}

type Franja = { inicio: string; fin: string }
type EdicionHorarios = {
  /** Horario existente en edición (un solo día); null = agregar uno o varios días. */
  clave: string | null
  dias: string[]
  mismoHorario: boolean
  general: Franja
  porDia: Record<string, Franja>
  enlace: string
}

const NUEVA_EDICION: EdicionHorarios = {
  clave: null,
  dias: [],
  mismoHorario: true,
  general: { inicio: HORARIO_INICIAL.hora_inicio, fin: HORARIO_INICIAL.hora_fin },
  porDia: {},
  enlace: "",
}

/**
 * Horarios semanales del grupo, en memoria. Se eligen varios días a la vez
 * (p. ej. lunes y viernes) con la misma franja o una distinta por día; cada día
 * se guarda como una fila de `horarios` con las acciones existentes.
 */
function EditorHorarios({ horarios, deshabilitado, alCambiar }: { horarios: HorarioLocal[]; deshabilitado?: boolean; alCambiar: (h: HorarioLocal[]) => void }) {
  const [edicion, setEdicion] = useState<EdicionHorarios | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const id = useId()
  const vigentes = horarios.filter((h) => !h.eliminado).sort((a, b) => a.valores.dia_semana.localeCompare(b.valores.dia_semana) || a.valores.hora_inicio.localeCompare(b.valores.hora_inicio))
  const quitados = horarios.filter((h) => h.eliminado && h.existente)

  const franjaDe = (e: EdicionHorarios, dia: string): Franja => (e.mismoHorario ? e.general : e.porDia[dia] ?? e.general)
  const propuestos = (e: EdicionHorarios): HorarioValues[] =>
    [...e.dias].sort().map((dia) => ({ dia_semana: dia, hora_inicio: franjaDe(e, dia).inicio, hora_fin: franjaDe(e, dia).fin, enlace_clase: e.enlace.trim() }))

  function aceptar() {
    if (!edicion) return
    if (edicion.dias.length === 0) {
      setErrores({ dias: "Elige al menos un día de clase." })
      return
    }
    const nuevos = propuestos(edicion)
    const e: Record<string, string> = {}
    // Cada día se valida contra los horarios del grupo y contra los demás días que se agregan ahora.
    const aceptados: HorarioLocal[] = []
    for (const v of nuevos) {
      const otros = [...horarios.filter((h) => h.clave !== edicion.clave), ...aceptados]
      const err = validarHorario(v, otros, null)
      if (err.enlace_clase) e.enlace = err.enlace_clase
      const franja = err.hora_inicio ?? err.hora_fin ?? err.dia_semana
      if (franja) {
        // Con una sola franja para varios días, el mensaje indica qué día falla.
        const unaFranja = edicion.mismoHorario || edicion.clave !== null
        const clave = unaFranja ? "general" : v.dia_semana
        e[clave] ??= unaFranja && nuevos.length > 1 ? `${DIAS_SEMANA[Number(v.dia_semana) - 1]}: ${franja}` : franja
      }
      aceptados.push({ clave: `tmp-${v.dia_semana}`, existente: false, valores: v, original: null, eliminado: false })
    }
    setErrores(e)
    if (Object.keys(e).length) return
    if (edicion.clave) alCambiar(horarios.map((h) => (h.clave === edicion.clave ? { ...h, valores: nuevos[0] } : h)))
    else alCambiar([...horarios, ...nuevos.map((valores) => ({ clave: crypto.randomUUID(), existente: false, valores, original: null, eliminado: false }))])
    setEdicion(null)
  }

  function alternarDia(dia: string) {
    setErrores({})
    setEdicion((x) => {
      if (!x) return x
      if (x.clave) return { ...x, dias: [dia] } // un horario existente es de un solo día
      const dias = x.dias.includes(dia) ? x.dias.filter((d) => d !== dia) : [...x.dias, dia]
      return { ...x, dias, porDia: { ...x.porDia, [dia]: x.porDia[dia] ?? x.general } }
    })
  }

  const cambiarFranja = (dia: string | null, campo: keyof Franja, valor: string) => {
    setErrores({})
    setEdicion((x) => {
      if (!x) return x
      if (dia === null) return { ...x, general: { ...x.general, [campo]: valor } }
      return { ...x, porDia: { ...x.porDia, [dia]: { ...franjaDe(x, dia), [campo]: valor } } }
    })
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="size-4 text-primary" aria-hidden />Horarios semanales</h4>
      <p className="text-sm text-muted-foreground" data-resumen-horarios>{resumenSemanal(vigentes.map((h) => h.valores))}</p>
      <ul className="space-y-1.5">
        {vigentes.map((h) => (
          <li key={h.clave} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-sm">
            <span>
              <span className="font-medium">{DIAS_SEMANA[Number(h.valores.dia_semana) - 1]}</span> {h.valores.hora_inicio}–{h.valores.hora_fin}
              {h.valores.enlace_clase && <span className="ml-2 text-xs text-muted-foreground">· con enlace de clase</span>}
              {!h.existente && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">Nuevo</span>}
            </span>
            <span className="flex gap-1">
              <Button size="icon-sm" variant="ghost" aria-label={`Editar horario ${DIAS_SEMANA[Number(h.valores.dia_semana) - 1]} ${h.valores.hora_inicio}`} disabled={deshabilitado || edicion !== null}
                onClick={() => {
                  setErrores({})
                  setEdicion({ clave: h.clave, dias: [h.valores.dia_semana], mismoHorario: true, general: { inicio: h.valores.hora_inicio, fin: h.valores.hora_fin }, porDia: {}, enlace: h.valores.enlace_clase })
                }}>
                <Pencil aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Quitar horario ${DIAS_SEMANA[Number(h.valores.dia_semana) - 1]} ${h.valores.hora_inicio}`} disabled={deshabilitado}
                onClick={() => alCambiar(horarios.map((x) => (x.clave === h.clave ? { ...x, eliminado: true } : x)))}>
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        ))}
        {quitados.map((h) => (
          <li key={h.clave} className="flex flex-wrap items-center gap-2 px-3 text-sm text-muted-foreground">
            <span className="line-through">{DIA_CORTO[Number(h.valores.dia_semana) - 1]} {h.valores.hora_inicio}–{h.valores.hora_fin}</span>
            <span>· se quitará al guardar</span>
            <Button size="xs" variant="ghost" disabled={deshabilitado} onClick={() => alCambiar(horarios.map((x) => (x.clave === h.clave ? { ...x, eliminado: false } : x)))}>
              <Undo2 aria-hidden />
              Deshacer
            </Button>
          </li>
        ))}
      </ul>

      {edicion ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-3">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{edicion.clave ? "Día de clase" : "Días de clase"}</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d, i) => {
                const dia = String(i + 1)
                const activo = edicion.dias.includes(dia)
                return (
                  <button key={d} type="button" aria-pressed={activo} aria-label={d} onClick={() => alternarDia(dia)}
                    className={cn("min-w-11 rounded-full border px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {DIA_CORTO[i]}
                  </button>
                )
              })}
            </div>
            {errores.dias && <p className="mt-1 text-sm text-destructive">{errores.dias}</p>}
          </fieldset>

          {!edicion.clave && edicion.dias.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={edicion.mismoHorario}
                onChange={(e) => { const mismo = e.target.checked; setErrores({}); setEdicion((x) => (x ? { ...x, mismoHorario: mismo } : x)) }} />
              Mismo horario para todos los días elegidos
            </label>
          )}

          {edicion.mismoHorario || edicion.clave ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!errores.general || undefined}>
                <FieldLabel htmlFor={`${id}-inicio`}>Hora de inicio</FieldLabel>
                <Input id={`${id}-inicio`} type="time" value={edicion.general.inicio} onChange={(e) => cambiarFranja(null, "inicio", e.target.value)} aria-invalid={!!errores.general || undefined} />
              </Field>
              <Field data-invalid={!!errores.general || undefined}>
                <FieldLabel htmlFor={`${id}-fin`}>Hora de fin</FieldLabel>
                <Input id={`${id}-fin`} type="time" value={edicion.general.fin} onChange={(e) => cambiarFranja(null, "fin", e.target.value)} aria-invalid={!!errores.general || undefined} />
              </Field>
              {errores.general && <FieldError className="sm:col-span-2">{errores.general}</FieldError>}
            </div>
          ) : (
            <ul className="space-y-2">
              {[...edicion.dias].sort().map((dia) => {
                const nombreDia = DIAS_SEMANA[Number(dia) - 1]
                const f = franjaDe(edicion, dia)
                return (
                  <li key={dia} className="grid items-center gap-2 sm:grid-cols-[6rem_1fr_1fr]">
                    <span className="text-sm font-medium">{nombreDia}</span>
                    <Input type="time" aria-label={`Hora de inicio del ${nombreDia.toLowerCase()}`} value={f.inicio} onChange={(e) => cambiarFranja(dia, "inicio", e.target.value)} aria-invalid={!!errores[dia] || undefined} />
                    <Input type="time" aria-label={`Hora de fin del ${nombreDia.toLowerCase()}`} value={f.fin} onChange={(e) => cambiarFranja(dia, "fin", e.target.value)} aria-invalid={!!errores[dia] || undefined} />
                    {errores[dia] && <p className="text-sm text-destructive sm:col-span-3">{errores[dia]}</p>}
                  </li>
                )
              })}
            </ul>
          )}

          <Field data-invalid={!!errores.enlace || undefined}>
            <FieldLabel htmlFor={`${id}-enlace`}>Enlace de clase (opcional)</FieldLabel>
            <Input id={`${id}-enlace`} inputMode="url" maxLength={500} placeholder="https://" value={edicion.enlace}
              onChange={(e) => { const enlace = e.target.value; setErrores({}); setEdicion((x) => (x ? { ...x, enlace } : x)) }} aria-invalid={!!errores.enlace || undefined} />
            {errores.enlace && <FieldError>{errores.enlace}</FieldError>}
          </Field>

          {edicion.dias.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {edicion.clave ? "Quedará: " : "Se agregará: "}<span className="font-medium text-foreground">{resumenSemanal(propuestos(edicion))}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={aceptar}>{edicion.clave ? "Aplicar horario" : edicion.dias.length > 1 ? `Añadir ${edicion.dias.length} horarios` : "Añadir horario"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEdicion(null); setErrores({}) }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => { setErrores({}); setEdicion(NUEVA_EDICION) }}>
          <Plus aria-hidden />
          Agregar horario
        </Button>
      )}
    </div>
  )
}
