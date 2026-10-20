"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Building2,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  Loader2,
  MailCheck,
  UserRound,
} from "lucide-react"

import { PasswordInput } from "@/components/registro/password-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ESPERA_REENVIO_S, useEspera } from "@/hooks/use-espera"
import { reenviarConfirmacion, type ResultadoCorreo } from "@/lib/auth/correos"
import { registrarInstitucion } from "@/lib/registro/registrar-institucion"
import { cn } from "@/lib/utils"
import {
  PASSWORD_MIN_LENGTH,
  registroDefaultValues,
  registroSchema,
  type RegistroValues,
} from "@/lib/validations/registro"

type Estado =
  | { tipo: "inicial" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "completado" }
  | { tipo: "confirmar_correo"; correo: string }

export function RegistroForm() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  // Evita un segundo envío (p. ej. pulsar Enter) mientras el primero sigue en curso.
  const enviando = useRef(false)

  const form = useForm<RegistroValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: registroDefaultValues,
    mode: "onTouched",
  })

  async function onSubmit(valores: RegistroValues) {
    if (enviando.current) return
    enviando.current = true
    setEstado({ tipo: "inicial" })

    const resultado = await registrarInstitucion(valores)

    if (resultado.estado === "completado") {
      setEstado({ tipo: "completado" })
      router.replace("/admin")
      router.refresh()
      return // Se mantiene bloqueado hasta que termine la navegación.
    }

    enviando.current = false
    setEstado(
      resultado.estado === "confirmar_correo"
        ? { tipo: "confirmar_correo", correo: resultado.correo }
        : { tipo: "error", mensaje: resultado.mensaje }
    )
  }

  const bloqueado = form.formState.isSubmitting || estado.tipo === "completado"

  if (estado.tipo === "confirmar_correo") {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <ConfirmarCorreo correo={estado.correo} />
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form
        noValidate
        onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
        aria-busy={bloqueado}
      >
        <CardContent className="px-5 py-6 sm:px-8 sm:py-8">
          <fieldset disabled={bloqueado} className="min-w-0 space-y-8">
            <FormSection
              icon={Building2}
              paso={1}
              titulo="Datos de la institución"
              descripcion="Información general de la institución que ofrecerá los cursos."
            >
              <TextField
                control={form.control}
                name="institucion.nombre"
                label="Nombre de la institución"
                placeholder="Ej.: Instituto de Formación Digital"
                autoComplete="organization"
                required
                className="sm:col-span-2"
              />
              <TextField
                control={form.control}
                name="institucion.ruc"
                label="RUC"
                inputMode="numeric"
                autoComplete="off"
              />
              <TextField
                control={form.control}
                name="institucion.telefono"
                label="Teléfono"
                type="tel"
                autoComplete="tel"
              />
              <TextField
                control={form.control}
                name="institucion.correo"
                label="Correo de la institución"
                type="email"
                placeholder="contacto@institucion.edu.pe"
                autoComplete="email"
              />
              <TextField
                control={form.control}
                name="institucion.direccion"
                label="Dirección"
                autoComplete="street-address"
              />
            </FormSection>

            <Separator />

            <FormSection
              icon={UserRound}
              paso={2}
              titulo="Datos del administrador"
              descripcion="Cuenta inicial con la que se gestionará la institución."
            >
              <TextField
                control={form.control}
                name="administrador.nombres"
                label="Nombres"
                autoComplete="given-name"
                required
              />
              <TextField
                control={form.control}
                name="administrador.apellidos"
                label="Apellidos"
                autoComplete="family-name"
                required
              />
              <TextField
                control={form.control}
                name="administrador.dni"
                label="DNI"
                inputMode="numeric"
                autoComplete="off"
              />
              <TextField
                control={form.control}
                name="administrador.correo"
                label="Correo electrónico"
                type="email"
                placeholder="admin@institucion.edu.pe"
                autoComplete="username"
                description="Lo usarás para iniciar sesión."
                required
              />
              <PasswordFields control={form.control} />
            </FormSection>
          </fieldset>

          {estado.tipo === "error" && (
            <Aviso tipo="error" className="mt-8">
              {estado.mensaje}
            </Aviso>
          )}
          {estado.tipo === "completado" && (
            <Aviso tipo="exito" className="mt-8">
              Institución registrada correctamente. Redirigiendo al panel…
            </Aviso>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Los campos marcados con <span className="text-destructive">*</span>{" "}
              son obligatorios.
            </p>
            <Button
              type="submit"
              size="lg"
              className="w-full px-5 sm:w-auto"
              disabled={bloqueado}
            >
              {bloqueado && <Loader2 className="animate-spin" aria-hidden />}
              {estado.tipo === "completado"
                ? "Redirigiendo…"
                : bloqueado
                  ? "Registrando…"
                  : "Crear institución"}
            </Button>
          </div>
        </CardContent>

        <LoginFooter />
      </form>
    </Card>
  )
}

function ConfirmarCorreo({ correo }: { correo: string }) {
  // El primer correo se acaba de enviar: se espera antes de permitir reenviarlo.
  const espera = useEspera(ESPERA_REENVIO_S)
  const [reenviando, setReenviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCorreo | null>(null)

  async function reenviar() {
    if (reenviando || espera.enEspera) return
    setReenviando(true)
    const r = await reenviarConfirmacion(correo)
    setReenviando(false)
    setResultado(r)
    if (r.ok) espera.iniciar(ESPERA_REENVIO_S)
  }

  return (
    <>
      <CardContent className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:px-8 sm:py-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/15">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <div role="status" className="space-y-2">
          <h2 className="text-lg font-semibold">Confirma tu correo electrónico</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Creamos tu cuenta y enviamos un enlace de confirmación a{" "}
            <span className="font-medium break-all text-foreground">{correo}</span>.
            Abre ese enlace para activar tu cuenta.
          </p>
        </div>
        <Aviso tipo="info" className="max-w-md text-left">
          La institución todavía no se ha registrado: se completará después de
          confirmar el correo. Tus datos quedan guardados hasta entonces.
        </Aviso>
        {resultado && (
          <Aviso tipo={resultado.ok ? "exito" : "error"} className="max-w-md text-left">
            {resultado.ok
              ? "Solicitamos el envío de un nuevo correo. Puede tardar unos minutos; revisa también la carpeta de spam."
              : resultado.mensaje}
          </Aviso>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={reenviar}
          disabled={reenviando || espera.enEspera}
        >
          {reenviando && <Loader2 className="animate-spin" aria-hidden />}
          {reenviando
            ? "Reenviando…"
            : espera.enEspera
              ? `Podrás reenviar el correo en ${espera.restante} s`
              : "Reenviar correo de confirmación"}
        </Button>
      </CardContent>
      <LoginFooter />
    </>
  )
}

function LoginFooter() {
  return (
    <CardFooter className="justify-center px-5 py-4 text-sm text-muted-foreground">
      ¿Ya tienes una cuenta?&nbsp;
      <Link
        href="/login"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Iniciar sesión
      </Link>
    </CardFooter>
  )
}

const avisoEstilos = {
  error: {
    icono: CircleAlert,
    clases: "border-destructive/30 bg-destructive/5 dark:bg-destructive/10",
    iconoClases: "text-destructive",
  },
  exito: {
    icono: CircleCheck,
    clases: "border-success/30 bg-success/5 dark:bg-success/10",
    iconoClases: "text-success",
  },
  info: {
    icono: MailCheck,
    clases: "border-primary/30 bg-primary/5 dark:bg-primary/10",
    iconoClases: "text-primary",
  },
} as const

function Aviso({
  tipo,
  className,
  children,
}: {
  tipo: keyof typeof avisoEstilos
  className?: string
  children: React.ReactNode
}) {
  const { icono: Icono, clases, iconoClases } = avisoEstilos[tipo]

  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", clases, className)}
    >
      <Icono className={cn("mt-0.5 size-4 shrink-0", iconoClases)} aria-hidden />
      <p>{children}</p>
    </div>
  )
}

type FormSectionProps = {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  paso: number
  titulo: string
  descripcion: string
  children: React.ReactNode
}

function FormSection({
  icon: Icon,
  paso,
  titulo,
  descripcion,
  children,
}: FormSectionProps) {
  const tituloId = `seccion-${paso}`

  return (
    <section aria-labelledby={tituloId} className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
          <Icon className="size-4.5" aria-hidden />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">
            Paso {paso} de 2
          </p>
          <h2 id={tituloId} className="text-base leading-tight font-semibold">
            {titulo}
          </h2>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </div>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

type TextFieldProps = {
  control: Control<RegistroValues>
  name: FieldPath<RegistroValues>
  label: string
  required?: boolean
  description?: string
  className?: string
} & Pick<
  React.ComponentProps<"input">,
  "type" | "placeholder" | "autoComplete" | "inputMode"
>

function TextField({
  control,
  name,
  label,
  required,
  description,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>
            {label}
            {required && <RequiredMark />}
          </FieldLabel>
          <Input
            {...field}
            {...inputProps}
            value={field.value as string}
            id={name}
            required={required}
            aria-invalid={fieldState.invalid}
            aria-describedby={describedBy(name, description, fieldState.invalid)}
          />
          {description && !fieldState.invalid && (
            <FieldDescription id={`${name}-descripcion`}>
              {description}
            </FieldDescription>
          )}
          <FieldError id={`${name}-error`} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

function PasswordFields({ control }: { control: Control<RegistroValues> }) {
  const [password, confirmarPassword] = useWatch({
    control,
    name: ["administrador.password", "administrador.confirmarPassword"],
  })

  const longitudOk = password.length >= PASSWORD_MIN_LENGTH
  const coinciden = confirmarPassword.length > 0 && password === confirmarPassword

  return (
    <>
      <Controller
        control={control}
        name="administrador.password"
        // Revalida la confirmación cuando cambia la contraseña.
        rules={{ deps: ["administrador.confirmarPassword"] }}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>
              Contraseña
              <RequiredMark />
            </FieldLabel>
            <PasswordInput
              {...field}
              id={field.name}
              autoComplete="new-password"
              required
              aria-invalid={fieldState.invalid}
              aria-describedby={`${field.name}-requisito`}
            />
            <Requisito id={`${field.name}-requisito`} cumplido={longitudOk}>
              Al menos {PASSWORD_MIN_LENGTH} caracteres
            </Requisito>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="administrador.confirmarPassword"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>
              Confirmar contraseña
              <RequiredMark />
            </FieldLabel>
            <PasswordInput
              {...field}
              id={field.name}
              autoComplete="new-password"
              required
              aria-invalid={fieldState.invalid}
              aria-describedby={`${field.name}-requisito`}
            />
            <Requisito id={`${field.name}-requisito`} cumplido={coinciden}>
              Las contraseñas coinciden
            </Requisito>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  )
}

function Requisito({
  id,
  cumplido,
  children,
}: {
  id: string
  cumplido: boolean
  children: React.ReactNode
}) {
  const Icono = cumplido ? Check : Circle

  return (
    <p
      id={id}
      className={cn(
        "flex items-center gap-1.5 text-xs transition-colors",
        cumplido ? "text-success" : "text-muted-foreground"
      )}
    >
      <Icono className={cn("shrink-0", cumplido ? "size-3.5" : "size-3")} aria-hidden />
      {children}
      <span className="sr-only">{cumplido ? "(cumplido)" : "(pendiente)"}</span>
    </p>
  )
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

function describedBy(name: string, description: string | undefined, invalid: boolean) {
  if (invalid) return `${name}-error`
  return description ? `${name}-descripcion` : undefined
}
