"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { editarDocente, registrarDocente } from "@/lib/docentes/acciones"
import { notificar } from "@/lib/notificaciones"
import {
  DOCENTE_INICIAL,
  datosDocenteSchema,
  nuevoDocenteSchema,
  type NuevoDocenteValues,
} from "@/lib/validations/docente"

// En edición el correo no se muestra ni se envía.
const esquemaEdicion = datosDocenteSchema.extend({ correo: z.string() })

type Edicion = { id: string; nombres: string; apellidos: string; dni: string | null; telefono: string | null }

/**
 * Registrar (docente = null) o editar los datos de un docente. Al registrar se
 * crea su cuenta y se le envía una invitación para que cree su contraseña.
 */
export function DocenteFormDialog({
  abierto,
  onAbiertoChange,
  docente,
  miembroExistente,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  docente: Edicion | null
  /** Única entrada «Agregar docente»: si hay personas de la institución sin el rol, se ofrece ese camino. */
  miembroExistente?: { disponibles: number; elegir: () => void }
}) {
  const [guardando, setGuardando] = useState(false)
  return (
    <Dialog open={abierto} onOpenChange={(v) => !guardando && onAbiertoChange(v)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>{docente ? "Editar datos del docente" : "Agregar docente"}</DialogTitle>
          <DialogDescription>
            {docente
              ? "El correo de acceso no se modifica desde aquí."
              : "Registra sus datos y le enviaremos una invitación para activar su cuenta. Los grupos se asignan después."}
          </DialogDescription>
        </DialogHeader>
        {!docente && miembroExistente && miembroExistente.disponibles > 0 && (
          <div role="group" aria-label="¿A quién agregas?" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            <span className="rounded-md bg-background px-3 py-1.5 text-center font-medium shadow-sm" aria-current="true">Persona nueva</span>
            <button type="button" className="rounded-md px-3 py-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={miembroExistente.elegir} disabled={guardando}>
              Ya está en mi institución ({miembroExistente.disponibles})
            </button>
          </div>
        )}
        <Formulario docente={docente} guardando={guardando} setGuardando={setGuardando} alTerminar={() => onAbiertoChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  docente,
  guardando,
  setGuardando,
  alTerminar,
}: {
  docente: Edicion | null
  guardando: boolean
  setGuardando: (v: boolean) => void
  alTerminar: () => void
}) {
  const router = useRouter()
  const bloqueo = useRef(false)
  const form = useForm<NuevoDocenteValues>({
    resolver: zodResolver(docente ? esquemaEdicion : nuevoDocenteSchema),
    defaultValues: docente
      ? { nombres: docente.nombres, apellidos: docente.apellidos, dni: docente.dni ?? "", telefono: docente.telefono ?? "", correo: "" }
      : DOCENTE_INICIAL,
    mode: "onTouched",
  })

  async function onSubmit(valores: NuevoDocenteValues) {
    if (bloqueo.current) return
    if (docente && !form.formState.isDirty) {
      notificar.info("No hay cambios para guardar.")
      return
    }
    bloqueo.current = true
    setGuardando(true)
    const operacion = notificar.operacion(docente ? "Guardando cambios…" : "Registrando docente…")
    try {
      const { correo, ...datos } = valores
      const resultado = docente ? await editarDocente(docente.id, datos) : await registrarDocente({ ...datos, correo })
      if (resultado.ok) {
        if (resultado.aviso) operacion.advertencia("Docente registrado con avisos", { descripcion: resultado.aviso })
        else
          operacion.exito(docente ? "Los cambios se guardaron correctamente" : "Docente registrado correctamente", {
            descripcion: docente ? undefined : `Se envió la invitación a ${correo}.`,
          })
        alTerminar()
        if (!docente) router.push(`/admin/docentes/${resultado.id}`)
        router.refresh()
      } else {
        if (resultado.campo) form.setError(resultado.campo, { message: resultado.mensaje }, { shouldFocus: true })
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar(docente ? "No se pudieron guardar los cambios" : "No se pudo registrar al docente", { descripcion: resultado.mensaje })
      }
    } catch {
      operacion.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={guardando}>
      <fieldset disabled={guardando} className="grid min-w-0 gap-x-4 gap-y-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Datos personales</legend>
        <Campo control={form.control} name="nombres" label="Nombres" required autoComplete="off" autoFocus />
        <Campo control={form.control} name="apellidos" label="Apellidos" required autoComplete="off" />
        <Campo control={form.control} name="dni" label="Documento de identidad" autoComplete="off" descripcion="Único dentro de tu institución." />
        <Campo control={form.control} name="telefono" label="Teléfono" type="tel" autoComplete="off" />
      </fieldset>
      {!docente && (
        <fieldset disabled={guardando} className="mt-5 grid min-w-0 gap-4 border-t pt-4">
          <legend className="sr-only">Acceso a Academix</legend>
          <p className="text-sm font-semibold">Acceso a Academix</p>
          <Campo
            control={form.control}
            name="correo"
            label="Correo electrónico"
            required
            type="email"
            autoComplete="off"
            descripcion="Será su usuario de acceso."
          />
          <ol className="list-decimal space-y-0.5 rounded-lg bg-muted/40 py-2 pr-3 pl-7 text-xs text-muted-foreground">
            <li>Creamos su cuenta y le enviamos la invitación a este correo.</li>
            <li>Aparece como «Activación pendiente» hasta que cree su contraseña.</li>
            <li>Al activarla entra directo a su panel docente. Puedes reenviar la invitación desde su ficha.</li>
          </ol>
        </fieldset>
      )}
      <DialogFooter className="mt-6">
        <DialogClose render={<Button type="button" variant="outline" disabled={guardando} />}>Cancelar</DialogClose>
        <Button type="submit" disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : docente ? "Guardar cambios" : "Registrar e invitar"}
        </Button>
      </DialogFooter>
    </form>
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
  autoComplete,
  autoFocus,
}: {
  control: Control<NuevoDocenteValues>
  name: FieldPath<NuevoDocenteValues>
  label: string
  required?: boolean
  descripcion?: string
  className?: string
  type?: string
  autoComplete?: string
  autoFocus?: boolean
}) {
  const id = `docente-${name}`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={id}>
            {label}
            {required ? (
              <span className="text-destructive" aria-hidden>*</span>
            ) : (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </FieldLabel>
          <Input
            {...field}
            id={id}
            type={type}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
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
