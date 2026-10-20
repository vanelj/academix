"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, CircleAlert, Loader2, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { completarRegistro } from "@/lib/auth/acciones"
import { datosRegistroSchema, type DatosRegistro } from "@/lib/registro/pendiente"

const VACIO: DatosRegistro = {
  institucion: { nombre: "", ruc: "", correo: "", telefono: "", direccion: "" },
  administrador: { nombres: "", apellidos: "", dni: "" },
}

export function CompletarRegistroForm({
  datos,
  correo,
}: {
  datos: DatosRegistro | null
  correo: string | null
}) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const form = useForm<DatosRegistro>({
    resolver: zodResolver(datosRegistroSchema),
    defaultValues: datos ?? VACIO,
    mode: "onTouched",
  })

  function onSubmit(valores: DatosRegistro) {
    setMensaje(null)
    startTransition(async () => {
      try {
        const resultado = await completarRegistro(valores)
        if (!resultado.ok) {
          setMensaje(resultado.mensaje)
          return
        }
        router.replace(resultado.destino)
        router.refresh()
      } catch {
        setMensaje("No se pudo completar el registro. Revisa tu conexión e inténtalo de nuevo.")
      }
    })
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={pendiente}>
        <CardContent className="px-5 py-6 sm:px-8 sm:py-8">
          <fieldset disabled={pendiente} className="min-w-0 space-y-8">
            <Seccion icono={Building2} titulo="Datos de la institución">
              <Campo control={form.control} name="institucion.nombre" label="Nombre de la institución" required className="sm:col-span-2" />
              <Campo control={form.control} name="institucion.ruc" label="RUC" inputMode="numeric" />
              <Campo control={form.control} name="institucion.telefono" label="Teléfono" type="tel" />
              <Campo control={form.control} name="institucion.correo" label="Correo de la institución" type="email" />
              <Campo control={form.control} name="institucion.direccion" label="Dirección" />
            </Seccion>

            <Separator />

            <Seccion icono={UserRound} titulo="Datos del administrador">
              <Campo control={form.control} name="administrador.nombres" label="Nombres" required />
              <Campo control={form.control} name="administrador.apellidos" label="Apellidos" required />
              <Campo control={form.control} name="administrador.dni" label="DNI" inputMode="numeric" />
              {correo && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Correo de acceso</p>
                  <p className="flex h-8 items-center truncate rounded-lg bg-muted px-2.5 text-sm text-muted-foreground">
                    {correo}
                  </p>
                </div>
              )}
            </Seccion>
          </fieldset>

          {mensaje && (
            <div
              role="alert"
              className="mt-8 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm dark:bg-destructive/10"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <p>{mensaje}</p>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <Button type="submit" size="lg" className="w-full px-5 sm:w-auto" disabled={pendiente}>
              {pendiente && <Loader2 className="animate-spin" aria-hidden />}
              {pendiente ? "Creando institución…" : "Crear institución"}
            </Button>
          </div>
        </CardContent>
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
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
          <Icono className="size-4.5" aria-hidden />
        </span>
        <h2 className="text-base font-semibold">{titulo}</h2>
      </div>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({
  control,
  name,
  label,
  required,
  className,
  type,
  inputMode,
}: {
  control: Control<DatosRegistro>
  name: FieldPath<DatosRegistro>
  label: string
  required?: boolean
  className?: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>
            {label}
            {required && (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            )}
          </FieldLabel>
          <Input
            {...field}
            value={field.value as string}
            id={name}
            type={type}
            inputMode={inputMode}
            required={required}
            aria-invalid={fieldState.invalid}
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
