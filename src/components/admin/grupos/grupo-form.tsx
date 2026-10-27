"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react"

import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { crearGrupo, editarGrupo } from "@/lib/grupos/acciones"
import type { OpcionCurso, OpcionDocente } from "@/lib/grupos/datos"
import { notificar } from "@/lib/notificaciones"
import { grupoSchema, type EstadoGrupo, type GrupoValues } from "@/lib/validations/grupo"

const SIN_DOCENTE = "__sin_docente__"
const ETIQUETA_CURSO: Record<string, string> = { borrador: " (borrador)", publicado: "", desactivado: " (desactivado)" }

export function GrupoForm({
  grupoId,
  valoresIniciales,
  cursos,
  docentes,
  estado,
}: {
  /** Sin id = creación. */
  grupoId?: string
  /** Estado actual del grupo (solo en edición). */
  estado?: EstadoGrupo
  valoresIniciales: GrupoValues
  cursos: OpcionCurso[]
  docentes: OpcionDocente[]
}) {
  const router = useRouter()
  const editando = Boolean(grupoId)
  const [guardando, setGuardando] = useState(false)
  const bloqueo = useRef(false)

  const form = useForm<GrupoValues>({
    resolver: zodResolver(grupoSchema),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const { isDirty } = form.formState
  useProtegerCambios(isDirty)
  const docenteElegido = useWatch({ control: form.control, name: "docente_id" })
  // Advertencia al retirar o cambiar el docente de un grupo vigente con estudiantes potenciales.
  const cambioDocenteVigente =
    editando && (estado === "abierto" || estado === "en_curso") && docenteElegido !== valoresIniciales.docente_id

  async function onSubmit(valores: GrupoValues) {
    if (bloqueo.current) return
    if (editando && !form.formState.isDirty) {
      notificar.info("No hay cambios para guardar.")
      return
    }
    bloqueo.current = true
    setGuardando(true)
    const operacion = notificar.operacion(editando ? "Guardando cambios…" : "Creando grupo…")
    try {
      const r = grupoId ? await editarGrupo(grupoId, valores) : await crearGrupo(valores)
      if (r.ok) {
        form.reset(valores)
        if (r.aviso) operacion.advertencia("Los cambios se guardaron correctamente", { descripcion: r.aviso })
        else
          operacion.exito(editando ? "Los cambios se guardaron correctamente" : "Grupo creado correctamente", {
            descripcion: editando ? undefined : "Agrega sus horarios y ábrelo a inscripciones cuando esté listo.",
          })
        router.push(`/admin/grupos/${r.id}`)
        router.refresh()
      } else {
        if (r.campo && r.campo in valores) form.setError(r.campo as FieldPath<GrupoValues>, { message: r.mensaje }, { shouldFocus: true })
        const avisar = r.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo guardar el grupo", { descripcion: r.mensaje })
      }
    } catch {
      operacion.error("No se pudo guardar el grupo", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={guardando} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos del grupo</CardTitle>
          <CardDescription>Cada grupo es una apertura del curso con sus propias fechas, vacantes y docente.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={guardando} className="grid min-w-0 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="curso_id"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor="grupo-curso">
                    Curso<span className="text-destructive" aria-hidden>*</span>
                  </FieldLabel>
                  <Select
                    items={cursos.map((c) => ({ value: c.id, label: `${c.nombre}${ETIQUETA_CURSO[c.estado] ?? ""}` }))}
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ? String(v) : "")}
                    disabled={guardando || editando}
                  >
                    <SelectTrigger id="grupo-curso" className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                      <SelectValue placeholder="Selecciona un curso" />
                    </SelectTrigger>
                    <SelectContent>
                      {cursos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{`${c.nombre}${ETIQUETA_CURSO[c.estado] ?? ""}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!fieldState.invalid && (
                    <FieldDescription>
                      {editando ? "El curso no se cambia una vez creado el grupo." : "Para abrir inscripciones, el curso debe estar publicado."}
                    </FieldDescription>
                  )}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Campo control={form.control} name="codigo" label="Código del grupo" required descripcion="Único dentro del curso, por ejemplo «2026-I-A»." />
            <Campo control={form.control} name="vacantes" label="Vacantes" required inputMode="numeric" />
            <Campo control={form.control} name="fecha_inicio" label="Fecha de inicio" required type="date" />
            <Campo control={form.control} name="fecha_fin" label="Fecha de fin" required type="date" />
            <Controller
              control={form.control}
              name="docente_id"
              render={({ field, fieldState }) => {
                const actual = docentes.find((d) => d.id === field.value)
                return (
                  <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                    <FieldLabel htmlFor="grupo-docente">
                      Docente <span className="font-normal text-muted-foreground">(opcional)</span>
                    </FieldLabel>
                    <Select
                      items={[{ value: SIN_DOCENTE, label: "Sin docente asignado" }, ...docentes.map((d) => ({ value: d.id, label: d.habilitado ? d.nombre : `${d.nombre} (deshabilitado)` }))]}
                      value={field.value || SIN_DOCENTE}
                      onValueChange={(v) => field.onChange(!v || v === SIN_DOCENTE ? "" : String(v))}
                      disabled={guardando}
                    >
                      <SelectTrigger id="grupo-docente" className="w-full" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SIN_DOCENTE}>Sin docente asignado</SelectItem>
                        {docentes.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.habilitado ? d.nombre : `${d.nombre} (deshabilitado)`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {cambioDocenteVigente && (
                      <p className="flex gap-1.5 text-xs text-warning" role="status">
                        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                        {field.value
                          ? "Vas a cambiar el docente de un grupo vigente. Avisa al docente anterior y a los estudiantes."
                          : "Vas a dejar sin docente un grupo vigente. Asigna uno antes de que continúen las clases."}
                      </p>
                    )}
                    {actual && !actual.habilitado ? (
                      <p className="flex gap-1.5 text-xs text-warning">
                        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                        Este docente está deshabilitado. Se conserva mientras no elijas otro.
                      </p>
                    ) : (
                      !fieldState.invalid && (
                        <FieldDescription>
                          {docentes.length === 0 ? "Aún no hay docentes habilitados: regístralos en «Docentes»." : "Puedes asignarlo más adelante."}
                        </FieldDescription>
                      )
                    )}
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )
              }}
            />
          </fieldset>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 pb-2">
        <Card className="flex-col gap-3 px-4 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" role="status" aria-live="polite">
            {guardando ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Guardando…
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-2 font-medium text-warning">
                <span className="size-2 rounded-full bg-warning" aria-hidden />
                Cambios sin guardar
              </span>
            ) : (
              <span className="text-muted-foreground">{editando ? "No hay cambios sin guardar." : "Completa los datos del grupo."}</span>
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" disabled={!isDirty || guardando} onClick={() => { form.reset(); notificar.info("Cambios descartados") }} className="w-full sm:w-auto">
              <RotateCcw aria-hidden />
              Descartar cambios
            </Button>
            <Button type="submit" disabled={guardando || (editando && !isDirty)} className="w-full sm:w-auto">
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear grupo"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  )
}

function Campo({
  control,
  name,
  label,
  required,
  descripcion,
  type,
  inputMode,
}: {
  control: Control<GrupoValues>
  name: FieldPath<GrupoValues>
  label: string
  required?: boolean
  descripcion?: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  const id = `grupo-${name}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>
            {label}
            {required && <span className="text-destructive" aria-hidden>*</span>}
          </FieldLabel>
          <Input {...field} id={id} type={type} inputMode={inputMode} autoComplete="off" required={required} aria-invalid={fieldState.invalid} />
          {descripcion && !fieldState.invalid && <FieldDescription>{descripcion}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
