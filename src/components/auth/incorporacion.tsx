"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, GraduationCap, Loader2, Presentation } from "lucide-react"

import { CompletarRegistroForm } from "@/components/auth/completar-registro-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { registrarEstudiante } from "@/lib/auth/incorporacion"
import { notificar } from "@/lib/notificaciones"
import type { DatosRegistro } from "@/lib/registro/pendiente"
import { cn } from "@/lib/utils"
import { estudianteSchema, type EstudianteValues } from "@/lib/validations/estudiante"

type Opcion = "estudiante" | "institucion" | "docente"

const OPCIONES: { valor: Opcion; titulo: string; texto: string; icono: React.ComponentType<{ className?: string }> }[] = [
  { valor: "estudiante", titulo: "Soy estudiante", texto: "Crea tu cuenta para inscribirte en cursos de distintas instituciones.", icono: GraduationCap },
  { valor: "institucion", titulo: "Registrar mi institución", texto: "Crea tu institución y administra su oferta académica.", icono: Building2 },
  { valor: "docente", titulo: "Soy docente", texto: "Tu institución gestiona tu cuenta.", icono: Presentation },
]

/**
 * Primer acceso de una cuenta autenticada sin perfil (p. ej. con Google). La
 * persona elige cómo incorporarse; ninguna opción concede roles por sí sola:
 * - Estudiante → RPC registrar_estudiante (perfil global, rol estudiante).
 * - Institución → flujo existente con registrar_institucion (rol admin).
 * - Docente → solo informa: la cuenta la crea e invita la institución.
 */
export function Incorporacion({
  correo,
  nombreSugerido,
}: {
  correo: string | null
  nombreSugerido: { nombres: string; apellidos: string }
}) {
  const [opcion, setOpcion] = useState<Opcion>("estudiante")
  const datosInstitucion: DatosRegistro = {
    institucion: { nombre: "", ruc: "", correo: "", telefono: "", direccion: "" },
    administrador: { ...nombreSugerido, dni: "" },
  }

  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="¿Cómo usarás Academix?" className="grid gap-3 sm:grid-cols-3">
        {OPCIONES.map(({ valor, titulo, texto, icono: Icono }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={opcion === valor}
            onClick={() => setOpcion(valor)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              opcion === valor ? "border-primary bg-primary/5 dark:bg-primary/10" : "bg-card hover:bg-muted/50"
            )}
          >
            <Icono className={cn("size-5", opcion === valor ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-semibold">{titulo}</span>
            <span className="text-xs text-muted-foreground">{texto}</span>
          </button>
        ))}
      </div>

      {opcion === "estudiante" && <EstudianteForm valoresIniciales={{ ...nombreSugerido, dni: "", telefono: "" }} />}
      {opcion === "institucion" && <CompletarRegistroForm datos={datosInstitucion} correo={correo} />}
      {opcion === "docente" && (
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="space-y-3 px-5 py-6 text-sm sm:px-8">
            <p className="font-medium">Las cuentas docentes las crea cada institución.</p>
            <p className="text-muted-foreground">
              Esta cuenta no tiene acceso como docente. Pide al administrador de tu institución que te
              registre: recibirás un correo de invitación para activar tu cuenta. Si ya lo recibiste,
              ábrelo y crea tu contraseña; después podrás ingresar también con Google usando el mismo correo.
            </p>
            {correo && <p className="text-muted-foreground">Correo de esta sesión: <span className="font-medium text-foreground">{correo}</span></p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EstudianteForm({ valoresIniciales }: { valoresIniciales: EstudianteValues }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)
  const form = useForm<EstudianteValues>({
    resolver: zodResolver(estudianteSchema),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })

  async function onSubmit(valores: EstudianteValues) {
    if (bloqueo.current) return
    bloqueo.current = true
    setEnviando(true)
    const operacion = notificar.operacion("Creando tu cuenta de estudiante…")
    try {
      const r = await registrarEstudiante(valores)
      if (r.ok) {
        operacion.exito("Cuenta de estudiante creada", { descripcion: "Ya puedes explorar e inscribirte en cursos." })
        router.replace(r.destino)
        router.refresh()
        return
      }
      if (r.campo) form.setError(r.campo, { message: r.mensaje }, { shouldFocus: true })
      operacion.error("No se pudo crear tu cuenta", { descripcion: r.mensaje })
    } catch {
      operacion.error("No se pudo crear tu cuenta", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    }
    bloqueo.current = false
    setEnviando(false)
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={enviando}>
        <CardContent className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          <fieldset disabled={enviando} className="grid min-w-0 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Campo control={form.control} name="nombres" label="Nombres" required autoComplete="given-name" />
            <Campo control={form.control} name="apellidos" label="Apellidos" required autoComplete="family-name" />
            <Campo control={form.control} name="dni" label="Documento de identidad" autoComplete="off" />
            <Campo control={form.control} name="telefono" label="Teléfono" type="tel" autoComplete="tel" />
          </fieldset>
          <Button type="submit" size="lg" className="h-10 w-full" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {enviando ? "Creando cuenta…" : "Crear mi cuenta de estudiante"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Tu cuenta no queda ligada a una sola institución: podrás inscribirte en cursos de cualquiera.
          </p>
        </CardContent>
      </form>
    </Card>
  )
}

function Campo({
  control,
  name,
  label,
  required,
  type,
  autoComplete,
  descripcion,
}: {
  control: Control<EstudianteValues>
  name: FieldPath<EstudianteValues>
  label: string
  required?: boolean
  type?: string
  autoComplete?: string
  descripcion?: string
}) {
  const id = `estudiante-${name}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>
            {label}
            {required ? (
              <span className="text-destructive" aria-hidden>*</span>
            ) : (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </FieldLabel>
          <Input {...field} id={id} type={type} autoComplete={autoComplete} required={required} aria-invalid={fieldState.invalid} />
          {descripcion && !fieldState.invalid && <FieldDescription>{descripcion}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
