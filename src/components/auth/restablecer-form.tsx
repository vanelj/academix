"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Circle, Loader2 } from "lucide-react"

import { Aviso } from "@/components/auth/aviso"
import { PasswordInput } from "@/components/registro/password-input"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { actualizarContrasena } from "@/lib/auth/acciones"
import { cn } from "@/lib/utils"
import { restablecerSchema, type RestablecerValues } from "@/lib/validations/contrasena"
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/registro"

type Estado =
  | { tipo: "inicial" }
  | { tipo: "error"; mensaje: string; vencido?: boolean }
  | { tipo: "actualizada" }

/**
 * activacion: primera contraseña de una cuenta creada por la institución (enlace
 * de invitación). Mismo formulario y misma acción; cambian los textos.
 */
export function RestablecerForm({ activacion = false }: { activacion?: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)

  const form = useForm<RestablecerValues>({
    resolver: zodResolver(restablecerSchema),
    defaultValues: { password: "", confirmarPassword: "" },
    mode: "onTouched",
  })
  const [password, confirmarPassword] = useWatch({
    control: form.control,
    name: ["password", "confirmarPassword"],
  })

  async function onSubmit(valores: RestablecerValues) {
    if (bloqueo.current) return
    bloqueo.current = true
    setEnviando(true)
    try {
      const resultado = await actualizarContrasena(valores)
      setEstado(resultado.ok ? { tipo: "actualizada" } : { tipo: "error", ...resultado })
    } catch {
      setEstado({ tipo: "error", mensaje: "No se pudo actualizar la contraseña. Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setEnviando(false)
    }
  }

  if (estado.tipo === "actualizada") {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="space-y-5 px-5 py-8 sm:px-8">
          <Aviso tipo="exito">
            {activacion
              ? "Tu cuenta quedó activada. Inicia sesión con tu correo y la contraseña que acabas de crear."
              : "Tu contraseña se actualizó correctamente. Por seguridad cerramos la sesión: inicia sesión con tu contraseña nueva."}
          </Aviso>
          <Link href="/login?aviso=contrasena-actualizada" className={cn(buttonVariants({ size: "lg" }), "h-10 w-full")}>
            Ir a iniciar sesión
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={enviando}>
        <CardContent className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
          <fieldset disabled={enviando} className="min-w-0 space-y-5">
            <Controller
              control={form.control}
              name="password"
              rules={{ deps: ["confirmarPassword"] }}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Contraseña nueva</FieldLabel>
                  <PasswordInput {...field} id={field.name} autoComplete="new-password" aria-invalid={fieldState.invalid} />
                  <Requisito cumplido={password.length >= PASSWORD_MIN_LENGTH}>
                    Al menos {PASSWORD_MIN_LENGTH} caracteres
                  </Requisito>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="confirmarPassword"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Confirmar contraseña nueva</FieldLabel>
                  <PasswordInput {...field} id={field.name} autoComplete="new-password" aria-invalid={fieldState.invalid} />
                  <Requisito cumplido={confirmarPassword.length > 0 && password === confirmarPassword}>
                    Las contraseñas coinciden
                  </Requisito>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </fieldset>

          {estado.tipo === "error" && (
            <Aviso tipo="error">
              {estado.mensaje}{" "}
              {estado.vencido &&
                (activacion ? (
                  "Pide a tu institución que te reenvíe la invitación."
                ) : (
                  <Link href="/recuperar-contrasena" className="font-medium text-primary underline-offset-4 hover:underline">
                    Solicitar un enlace nuevo
                  </Link>
                ))}
            </Aviso>
          )}

          <Button type="submit" size="lg" className="h-10 w-full" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {enviando ? "Guardando…" : activacion ? "Activar mi cuenta" : "Guardar contraseña nueva"}
          </Button>
        </CardContent>
      </form>
    </Card>
  )
}

function Requisito({ cumplido, children }: { cumplido: boolean; children: React.ReactNode }) {
  const Icono = cumplido ? Check : Circle
  return (
    <p className={cn("flex items-center gap-1.5 text-xs transition-colors", cumplido ? "text-success" : "text-muted-foreground")}>
      <Icono className={cn("shrink-0", cumplido ? "size-3.5" : "size-3")} aria-hidden />
      {children}
      <span className="sr-only">{cumplido ? "(cumplido)" : "(pendiente)"}</span>
    </p>
  )
}
