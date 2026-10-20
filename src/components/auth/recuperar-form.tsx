"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

import { Aviso } from "@/components/auth/aviso"
import type { AvisoLogin } from "@/components/login/login-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ESPERA_REENVIO_S, useEspera } from "@/hooks/use-espera"
import { solicitarRecuperacion } from "@/lib/auth/correos"
import { recuperarSchema, type RecuperarValues } from "@/lib/validations/contrasena"

type Estado =
  | { tipo: "inicial" }
  | { tipo: "enviado" }
  | { tipo: "error"; mensaje: string }

export function RecuperarForm({ aviso }: { aviso: AvisoLogin | null }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  const [enviando, setEnviando] = useState(false)
  // Evita envíos duplicados (doble clic o Enter repetido).
  const bloqueo = useRef(false)
  const espera = useEspera()

  const form = useForm<RecuperarValues>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { correo: "" },
    mode: "onTouched",
  })

  async function onSubmit({ correo }: RecuperarValues) {
    if (bloqueo.current || espera.enEspera) return
    bloqueo.current = true
    setEnviando(true)

    const resultado = navigator.onLine
      ? await solicitarRecuperacion(correo)
      : { ok: false as const, mensaje: "No hay conexión a internet. Revísala e inténtalo de nuevo." }

    bloqueo.current = false
    setEnviando(false)
    if (resultado.ok) {
      espera.iniciar(ESPERA_REENVIO_S)
      setEstado({ tipo: "enviado" })
    } else {
      setEstado({ tipo: "error", mensaje: resultado.mensaje })
    }
  }

  const deshabilitado = enviando || espera.enEspera

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={enviando}>
        <CardContent className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
          {aviso && estado.tipo === "inicial" && <Aviso tipo={aviso.tipo}>{aviso.mensaje}</Aviso>}

          <Controller
            control={form.control}
            name="correo"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Correo electrónico</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  disabled={enviando}
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {estado.tipo === "enviado" && (
            // No revela si el correo tiene cuenta ni promete la entrega.
            <Aviso tipo="exito">
              Si hay una cuenta registrada con ese correo, recibirás un enlace para
              restablecer tu contraseña. Puede tardar unos minutos; revisa también la
              carpeta de spam.
            </Aviso>
          )}
          {estado.tipo === "error" && <Aviso tipo="error">{estado.mensaje}</Aviso>}

          <Button type="submit" size="lg" className="h-10 w-full" disabled={deshabilitado}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            {enviando
              ? "Enviando…"
              : espera.enEspera
                ? `Podrás solicitar otro enlace en ${espera.restante} s`
                : "Enviar enlace de recuperación"}
          </Button>
        </CardContent>

        <CardFooter className="justify-center px-5 py-4 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Volver a iniciar sesión
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
