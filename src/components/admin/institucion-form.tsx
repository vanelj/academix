"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, CircleAlert, CircleCheck, Loader2, Phone, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { actualizarInstitucion } from "@/lib/institucion/acciones"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import { institucionSchema, type InstitucionValues } from "@/lib/validations/institucion"

type Estado = { tipo: "inicial" } | { tipo: "guardado" } | { tipo: "error"; mensaje: string }

export function InstitucionForm({ valoresIniciales }: { valoresIniciales: InstitucionValues }) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  const [guardando, setGuardando] = useState(false)
  // Evita envíos duplicados (doble clic o Enter repetido).
  const bloqueo = useRef(false)

  const form = useForm<InstitucionValues>({
    resolver: zodResolver(institucionSchema),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const { isDirty } = form.formState

  async function onSubmit(valores: InstitucionValues) {
    if (bloqueo.current) return
    bloqueo.current = true
    setGuardando(true)
    setEstado({ tipo: "inicial" })

    const operacion = notificar.operacion("Guardando cambios…")
    try {
      const resultado = await actualizarInstitucion(valores)
      if (resultado.ok) {
        // Los valores guardados pasan a ser los nuevos valores de referencia.
        form.reset(resultado.valores)
        setEstado({ tipo: "guardado" })
        operacion.exito("Datos de la institución guardados correctamente")
        router.refresh()
      } else {
        if (resultado.campo) {
          form.setError(resultado.campo, { message: resultado.mensaje }, { shouldFocus: true })
        }
        setEstado({ tipo: "error", mensaje: resultado.mensaje })
        operacion.error("No se pudieron guardar los cambios", { descripcion: resultado.mensaje })
      }
    } catch {
      const mensaje = "No se pudieron guardar los cambios. Revisa tu conexión e inténtalo de nuevo."
      setEstado({ tipo: "error", mensaje })
      operacion.error("No se pudieron guardar los cambios", {
        descripcion: "Revisa tu conexión e inténtalo de nuevo.",
      })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <form
        noValidate
        onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
        onChange={() => estado.tipo === "guardado" && setEstado({ tipo: "inicial" })}
        aria-busy={guardando}
      >
        <CardHeader className="border-b py-4">
          <CardTitle>Datos de la institución</CardTitle>
          <CardDescription>
            Esta información identifica a tu institución en la plataforma.
          </CardDescription>
        </CardHeader>

        <CardContent className="py-5">
          <fieldset disabled={guardando} className="min-w-0 space-y-6">
            <Seccion icono={Building2} titulo="Identidad institucional">
              <Campo
                control={form.control}
                name="nombre"
                label="Nombre de la institución"
                required
                autoComplete="organization"
                className="sm:col-span-2"
                descripcion="Se muestra en el catálogo público junto a tus cursos."
              />
              <Campo control={form.control} name="ruc" label="RUC" inputMode="numeric" autoComplete="off" />
            </Seccion>

            <Separator />

            <Seccion icono={Phone} titulo="Información de contacto">
              <Campo control={form.control} name="correo" label="Correo institucional" type="email" autoComplete="email" />
              <Campo control={form.control} name="telefono" label="Teléfono" type="tel" autoComplete="tel" />
              <Campo
                control={form.control}
                name="direccion"
                label="Dirección"
                autoComplete="street-address"
                className="sm:col-span-2"
              />
            </Seccion>
          </fieldset>

          {estado.tipo === "error" && (
            <Mensaje tipo="error">{estado.mensaje}</Mensaje>
          )}
          {estado.tipo === "guardado" && (
            <Mensaje tipo="exito">Los cambios se guardaron correctamente.</Mensaje>
          )}
        </CardContent>

        <CardFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={!isDirty || guardando}
            onClick={() => {
              form.reset()
              setEstado({ tipo: "inicial" })
              notificar.info("Cambios descartados", { descripcion: "Se restauraron los datos guardados." })
            }}
            className="w-full sm:w-auto"
          >
            <RotateCcw aria-hidden />
            Descartar cambios
          </Button>
          <Button type="submit" disabled={!isDirty || guardando} className="w-full sm:w-auto">
            {guardando && <Loader2 className="animate-spin" aria-hidden />}
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icono className="size-4 text-primary" aria-hidden />
        {titulo}
      </h3>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({
  control,
  name,
  label,
  required,
  descripcion,
  className,
  type,
  inputMode,
  autoComplete,
}: {
  control: Control<InstitucionValues>
  name: FieldPath<InstitucionValues>
  label: string
  required?: boolean
  descripcion?: string
  className?: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  autoComplete?: string
}) {
  const id = `institucion-${name}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={id}>
            {label}
            {required ? (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </FieldLabel>
          <Input
            {...field}
            id={id}
            type={type}
            inputMode={inputMode}
            autoComplete={autoComplete}
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

function Mensaje({ tipo, children }: { tipo: "error" | "exito"; children: React.ReactNode }) {
  const Icono = tipo === "error" ? CircleAlert : CircleCheck
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={cn(
        "mt-6 flex gap-3 rounded-lg border p-3 text-sm",
        tipo === "error"
          ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10"
          : "border-success/30 bg-success/5 dark:bg-success/10"
      )}
    >
      <Icono
        className={cn("mt-0.5 size-4 shrink-0", tipo === "error" ? "text-destructive" : "text-success")}
        aria-hidden
      />
      <p>{children}</p>
    </div>
  )
}
