"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { BookOpen, GraduationCap, Loader2, ReceiptText, RotateCcw, TriangleAlert } from "lucide-react"

import { formatoSoles } from "@/components/admin/cursos/curso-ui"
import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { crearCurso, editarCurso } from "@/lib/cursos/acciones"
import type { CategoriaOpcion } from "@/lib/cursos/datos"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import {
  CONDICIONES_ESPECIALES_MAX,
  CONDICIONES_INICIALES,
  CURSO_DESCRIPCION_MAX,
  CURSO_NOMBRE_MAX,
  REQUISITOS_MAX,
  TIPOS_COBRO,
  cursoSchema,
  type CursoValues,
  type TipoCobro,
} from "@/lib/validations/curso"

type Icono = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

const DESCRIPCION_COBRO: Record<TipoCobro, { titulo: string; texto: string }> = {
  gratuito: { titulo: "Gratuito", texto: "Sin importes ni reserva de vacante." },
  unico: { titulo: "Pago único", texto: "Matrícula y curso se pagan al inscribirse." },
  cuotas: { titulo: "En cuotas", texto: "Matrícula al inscribirse; el curso, según un plan de cuotas." },
}

export function CursoForm({
  cursoId,
  valoresIniciales,
  categorias,
  condicionesExistentes,
}: {
  /** Sin id = creación. */
  cursoId?: string
  valoresIniciales: CursoValues
  categorias: CategoriaOpcion[]
  /** El curso ya tiene condiciones: no pueden quitarse, solo modificarse. */
  condicionesExistentes: boolean
}) {
  const router = useRouter()
  const editando = Boolean(cursoId)
  const [guardando, setGuardando] = useState(false)
  // Evita envíos duplicados (doble clic o Enter repetido).
  const bloqueo = useRef(false)

  const form = useForm<CursoValues>({
    resolver: zodResolver(cursoSchema),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const { isDirty } = form.formState
  useProtegerCambios(isDirty)

  const configurar = useWatch({ control: form.control, name: "configurarCondiciones" })
  const tipoCobro = useWatch({ control: form.control, name: "condiciones.tipo_cobro" })
  const permiteReserva = useWatch({ control: form.control, name: "condiciones.permite_reserva" })

  async function onSubmit(valores: CursoValues) {
    if (bloqueo.current) return
    if (editando && !form.formState.isDirty) {
      notificar.info("No hay cambios para guardar.")
      return
    }
    bloqueo.current = true
    setGuardando(true)
    const operacion = notificar.operacion("Guardando…")
    try {
      const resultado = cursoId ? await editarCurso(cursoId, valores) : await crearCurso(valores)
      if (resultado.ok) {
        // Lo guardado pasa a ser la referencia: no queda "cambios sin guardar".
        form.reset(valores)
        if (resultado.aviso) {
          operacion.advertencia("Curso creado con avisos", { descripcion: resultado.aviso })
        } else {
          operacion.exito(editando ? "Los cambios del curso se guardaron correctamente" : "Curso creado correctamente", {
            descripcion: editando ? undefined : "Se creó como borrador: aún no aparece en el catálogo.",
          })
        }
        router.push(`/admin/cursos/${resultado.id}`)
        router.refresh()
      } else {
        if (resultado.campo) form.setError(resultado.campo, { message: resultado.mensaje }, { shouldFocus: true })
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo guardar el curso", { descripcion: resultado.mensaje })
      }
    } catch {
      operacion.error("No se pudo guardar el curso", {
        descripcion: "Revisa tu conexión e inténtalo de nuevo. Tus datos siguen en el formulario.",
      })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  function alFallarValidacion() {
    notificar.error("Revisa los campos marcados", { descripcion: "Hay datos del curso que deben corregirse." })
  }

  return (
    <form
      noValidate
      onSubmit={(e) => form.handleSubmit(onSubmit, alFallarValidacion)(e)}
      aria-busy={guardando}
      className="space-y-6"
    >
      <fieldset disabled={guardando} className="min-w-0 space-y-6">
        <legend className="sr-only">{editando ? "Editar curso" : "Nuevo curso"}</legend>

        {/* Información general */}
        <Seccion icono={BookOpen} titulo="Información general" descripcion="Cómo se identifica el curso en tu institución y en el catálogo.">
          <CampoTexto control={form.control} name="nombre" label="Nombre del curso" required maxLength={CURSO_NOMBRE_MAX} className="sm:col-span-2" />
          <Controller
            control={form.control}
            name="categoria_id"
            render={({ field, fieldState }) => {
              const actual = categorias.find((c) => c.id === field.value)
              return (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor="curso-categoria">
                    Categoría
                    <span className="text-destructive" aria-hidden>*</span>
                  </FieldLabel>
                  <Select
                    items={categorias.map((c) => ({ value: c.id, label: c.activo ? c.nombre : `${c.nombre} (inactiva)` }))}
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ? String(v) : "")}
                    disabled={guardando || categorias.length === 0}
                  >
                    <SelectTrigger
                      id="curso-categoria"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder={categorias.length ? "Selecciona una categoría" : "No hay categorías activas"} />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.activo ? c.nombre : `${c.nombre} (inactiva)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {actual && !actual.activo && (
                    <p className="flex gap-1.5 text-xs text-warning">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                      La categoría actual está inactiva. Se conserva mientras no elijas otra, pero el
                      curso no se mostrará en el catálogo hasta que la actives.
                    </p>
                  )}
                  {!fieldState.invalid && !(actual && !actual.activo) && (
                    <FieldDescription>Solo se muestran las categorías activas de tu institución.</FieldDescription>
                  )}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )
            }}
          />
          <CampoArea control={form.control} name="descripcion" label="Descripción" max={CURSO_DESCRIPCION_MAX} className="sm:col-span-2"
            descripcion="Se muestra en el catálogo público junto al curso." />
        </Seccion>

        {/* Información académica */}
        <Seccion icono={GraduationCap} titulo="Información académica" descripcion="Datos académicos que registra la plataforma para el curso.">
          <div className="grid gap-2">
            <p className="text-sm font-medium">Modalidad</p>
            <p className="flex h-8 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground">Virtual</p>
            <p className="text-xs text-muted-foreground">Todos los cursos de la plataforma son virtuales.</p>
          </div>
          <CampoTexto control={form.control} name="nota_aprobatoria" label="Nota aprobatoria" required inputMode="decimal"
            descripcion="Escala de 0 a 20." />
        </Seccion>

        {/* Precio y condiciones */}
        <Seccion icono={ReceiptText} titulo="Precio y condiciones" descripcion="Lo que verá el público y las condiciones con las que se aceptan inscripciones.">
          <CampoTexto control={form.control} name="precio" label="Precio publicado (S/)" required inputMode="decimal"
            descripcion="Es el precio que muestra el catálogo público." />
          <div className="hidden sm:block" />

          <Controller
            control={form.control}
            name="configurarCondiciones"
            render={({ field }) => (
              <label className={cn("flex items-start gap-3 rounded-lg border p-3 sm:col-span-2", condicionesExistentes && "opacity-80")}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={field.value}
                  disabled={condicionesExistentes || guardando}
                  onChange={(e) => {
                    field.onChange(e.target.checked)
                    // Al desmarcar, las condiciones vuelven a sus valores iniciales y no se validan.
                    if (!e.target.checked) form.setValue("condiciones", CONDICIONES_INICIALES, { shouldDirty: true })
                  }}
                  onBlur={field.onBlur}
                />
                <span className="text-sm">
                  <span className="font-medium">Configurar condiciones de inscripción</span>
                  <span className="block text-muted-foreground">
                    {condicionesExistentes
                      ? "Este curso ya tiene condiciones; puedes modificarlas, pero no quitarlas."
                      : "Son necesarias para publicar el curso. Puedes dejarlas para más adelante."}
                  </span>
                </span>
              </label>
            )}
          />

          {configurar && (
            <div className="space-y-5 sm:col-span-2">
              <Controller
                control={form.control}
                name="condiciones.tipo_cobro"
                render={({ field }) => (
                  <fieldset className="grid gap-2">
                    <legend className="mb-2 text-sm font-medium">Tipo de cobro</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {TIPOS_COBRO.map((tipo) => (
                        <label
                          key={tipo}
                          className={cn(
                            "flex cursor-pointer gap-2 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            field.value === tipo ? "border-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50"
                          )}
                        >
                          <input
                            type="radio"
                            name={field.name}
                            value={tipo}
                            checked={field.value === tipo}
                            onChange={() => field.onChange(tipo)}
                            className="mt-0.5 size-4 accent-primary"
                          />
                          <span>
                            <span className="font-medium">{DESCRIPCION_COBRO[tipo].titulo}</span>
                            <span className="block text-xs text-muted-foreground">{DESCRIPCION_COBRO[tipo].texto}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              />

              {tipoCobro !== "gratuito" && (
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <CampoTexto control={form.control} name="condiciones.matricula_importe" label="Importe de matrícula (S/)" required inputMode="decimal" />
                  <CampoTexto control={form.control} name="condiciones.importe_curso" label="Importe del curso (S/)" required inputMode="decimal"
                    descripcion={tipoCobro === "cuotas" ? "Se cobrará según el plan de cuotas (se configura en una etapa posterior)." : undefined} />

                  <Controller
                    control={form.control}
                    name="condiciones.permite_reserva"
                    render={({ field }) => (
                      <label className="flex items-start gap-3 rounded-lg border p-3 sm:col-span-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-primary"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          onBlur={field.onBlur}
                        />
                        <span className="text-sm">
                          <span className="font-medium">Permitir reserva de vacante</span>
                          <span className="block text-muted-foreground">
                            El estudiante separa su vacante con un pago previo y tiene un plazo para completar la matrícula.
                          </span>
                        </span>
                      </label>
                    )}
                  />

                  {permiteReserva && (
                    <>
                      <CampoTexto control={form.control} name="condiciones.reserva_importe" label="Pago de la reserva (S/)" required inputMode="decimal"
                        descripcion="Mayor que cero y no superior al importe total." />
                      <CampoTexto control={form.control} name="condiciones.reserva_plazo_horas" label="Plazo de la reserva (horas)" required inputMode="numeric"
                        descripcion="Por ejemplo, 48 = 2 días." />
                      <Controller
                        control={form.control}
                        name="condiciones.reserva_descuenta_matricula"
                        render={({ field }) => (
                          <label className="flex items-center gap-3 text-sm sm:col-span-2">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                            />
                            El pago de la reserva se descuenta del importe de la matrícula
                          </label>
                        )}
                      />
                    </>
                  )}
                </div>
              )}

              <AvisoPrecio control={form.control} />

              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <CampoArea control={form.control} name="condiciones.requisitos" label="Requisitos del curso" max={REQUISITOS_MAX}
                  descripcion="Requisitos académicos o documentos que pide este curso." />
                <CampoArea control={form.control} name="condiciones.condiciones_especiales" label="Condiciones particulares" max={CONDICIONES_ESPECIALES_MAX}
                  descripcion="Se suman a las políticas generales de tu institución." />
              </div>
            </div>
          )}
        </Seccion>
      </fieldset>

      {/* Barra de acciones fija al pie */}
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
                <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                Cambios sin guardar
              </span>
            ) : (
              <span className="text-muted-foreground">{editando ? "No hay cambios sin guardar." : "Completa los datos del curso."}</span>
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              disabled={!isDirty || guardando}
              onClick={() => {
                form.reset()
                notificar.info("Cambios descartados")
              }}
              className="w-full sm:w-auto"
            >
              <RotateCcw aria-hidden />
              Descartar cambios
            </Button>
            <Button type="submit" disabled={guardando || (editando && !isDirty)} className="w-full sm:w-auto">
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear curso"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  )
}

/** Aviso (no bloquea) si el precio publicado no coincide con lo que fijan las condiciones. */
function AvisoPrecio({ control }: { control: Control<CursoValues> }) {
  const [precio, tipo, matricula, importe] = useWatch({
    control,
    name: ["precio", "condiciones.tipo_cobro", "condiciones.matricula_importe", "condiciones.importe_curso"],
  })
  const total = tipo === "gratuito" ? 0 : Number(matricula) + Number(importe)
  if ([Number(precio), total].some(Number.isNaN) || Number(precio) === total) return null
  return (
    <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs dark:bg-warning/10">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        El precio publicado ({formatoSoles.format(Number(precio))}) no coincide con el total de las condiciones
        ({formatoSoles.format(total)}). Revísalo para que el catálogo no muestre un importe distinto al que se cobrará.
      </span>
    </p>
  )
}

function Seccion({
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  icono: Icono
  titulo: string
  descripcion: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icono className="size-4 text-primary" aria-hidden />
          {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

function CampoTexto({
  control,
  name,
  label,
  required,
  descripcion,
  className,
  inputMode,
  maxLength,
}: {
  control: Control<CursoValues>
  name: FieldPath<CursoValues>
  label: string
  required?: boolean
  descripcion?: string
  className?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?: number
}) {
  const id = `curso-${name.replace(".", "-")}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={id}>
            {label}
            {required && <span className="text-destructive" aria-hidden>*</span>}
          </FieldLabel>
          <Input
            id={id}
            name={field.name}
            value={String(field.value ?? "")}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            inputMode={inputMode}
            maxLength={maxLength}
            autoComplete="off"
            required={required}
            aria-invalid={fieldState.invalid}
          />
          {descripcion && !fieldState.invalid && <FieldDescription>{descripcion}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

function CampoArea({
  control,
  name,
  label,
  max,
  descripcion,
  className,
}: {
  control: Control<CursoValues>
  name: FieldPath<CursoValues>
  label: string
  max: number
  descripcion?: string
  className?: string
}) {
  const id = `curso-${name.replace(".", "-")}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const valor = String(field.value ?? "")
        return (
          <Field data-invalid={fieldState.invalid} className={className}>
            <FieldLabel htmlFor={id}>
              {label}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </FieldLabel>
            <Textarea
              id={id}
              name={field.name}
              value={valor}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              rows={4}
              maxLength={max}
              aria-invalid={fieldState.invalid}
              className="max-h-80 min-h-24 resize-y"
            />
            <div className="flex items-start justify-between gap-3">
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                descripcion && <FieldDescription>{descripcion}</FieldDescription>
              )}
              <p className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {valor.length.toLocaleString("es-PE")} / {max.toLocaleString("es-PE")}
              </p>
            </div>
          </Field>
        )
      }}
    />
  )
}
