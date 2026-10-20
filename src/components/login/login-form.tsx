"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { AuthError } from "@supabase/supabase-js"
import { Loader2 } from "lucide-react"

import { Aviso } from "@/components/auth/aviso"
import { PasswordInput } from "@/components/registro/password-input"
import { BotonGoogle } from "@/components/login/boton-google"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ESPERA_REENVIO_S, useEspera } from "@/hooks/use-espera"
import { destinoTrasLogin } from "@/lib/auth/acciones"
import { reenviarConfirmacion } from "@/lib/auth/correos"
import {
  clasificarErrorAuth,
  MENSAJES_AUTH,
  registrarErrorAuth,
} from "@/lib/auth/errores-auth"
import { notificar } from "@/lib/notificaciones"
import { createClient } from "@/lib/supabase/client"
import {
  loginDefaultValues,
  loginSchema,
  type LoginValues,
} from "@/lib/validations/login"

type Estado =
  | { tipo: "inicial" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "correo_sin_confirmar"; correo: string; mensaje?: string }
  | { tipo: "reenviado"; correo: string }
  | { tipo: "ingresando" }

export type AvisoLogin = { tipo: "exito" | "info" | "error"; mensaje: string }

export function LoginForm({ aviso }: { aviso?: AvisoLogin | null }) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  const [reenviando, setReenviando] = useState(false)
  // Evita un segundo envío (p. ej. pulsar Enter) mientras el primero sigue en curso.
  const enviando = useRef(false)
  const espera = useEspera()

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginDefaultValues,
    mode: "onTouched",
  })

  async function onSubmit({ correo, password }: LoginValues) {
    if (enviando.current) return
    enviando.current = true
    setEstado({ tipo: "ingresando" })

    const fallar = (siguiente: Estado) => {
      enviando.current = false
      setEstado(siguiente)
      if (siguiente.tipo === "error") notificar.error("No se pudo iniciar sesión", { descripcion: siguiente.mensaje })
    }

    if (!navigator.onLine) return fallar({ tipo: "error", mensaje: MENSAJES_AUTH.sinConexion })

    // 1. Autenticación con Supabase Auth. La sesión la guarda @supabase/ssr en cookies.
    let errorAuth: AuthError | null = null
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: correo, password })
      errorAuth = error
    } catch (e) {
      console.error("[login] fallo al contactar Supabase Auth", e instanceof Error ? e.name : e)
      return fallar({ tipo: "error", mensaje: MENSAJES_AUTH.sinConexion })
    }

    if (errorAuth) {
      registrarErrorAuth("login", errorAuth)
      const tipo = clasificarErrorAuth(errorAuth)
      if (tipo === "correo_sin_confirmar") return fallar({ tipo: "correo_sin_confirmar", correo })
      return fallar({ tipo: "error", mensaje: mensajeLogin(tipo) })
    }

    // 2. El servidor valida la sesión y decide el destino según perfil y roles reales.
    try {
      const resultado = await destinoTrasLogin()
      if (!resultado.ok) return fallar({ tipo: "error", mensaje: resultado.mensaje })
      router.replace(resultado.destino)
      router.refresh()
    } catch (e) {
      // La contraseña fue correcta: el fallo está en el paso posterior (red o servidor).
      console.error("[login] fallo al resolver el destino", e instanceof Error ? e.message : e)
      fallar({
        tipo: "error",
        mensaje: "Iniciaste sesión, pero no pudimos abrir tu panel. Recarga la página para continuar.",
      })
    }
  }

  async function reenviar(correo: string) {
    if (reenviando || espera.enEspera) return
    setReenviando(true)
    const resultado = await reenviarConfirmacion(correo)
    setReenviando(false)
    if (resultado.ok) {
      espera.iniciar(ESPERA_REENVIO_S)
      setEstado({ tipo: "reenviado", correo })
    } else {
      setEstado({ tipo: "correo_sin_confirmar", correo, mensaje: resultado.mensaje })
    }
  }

  const ocupado = estado.tipo === "ingresando"
  const limpiarEstado = () => {
    if (estado.tipo === "error") setEstado({ tipo: "inicial" })
  }

  return (
    <div className="space-y-6">
      <form
        noValidate
        onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
        aria-busy={ocupado}
        className="space-y-5"
      >
          {aviso && estado.tipo === "inicial" && (
            <Aviso tipo={aviso.tipo}>{aviso.mensaje}</Aviso>
          )}

          <fieldset disabled={ocupado} className="min-w-0 space-y-5">
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
                    autoComplete="username"
                    placeholder="tu@correo.com"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      limpiarEstado()
                      field.onChange(e)
                    }}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor={field.name}>Contraseña</FieldLabel>
                    <Link
                      href="/recuperar-contrasena"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <PasswordInput
                    {...field}
                    id={field.name}
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      limpiarEstado()
                      field.onChange(e)
                    }}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </fieldset>

          {estado.tipo === "error" && <Aviso tipo="error">{estado.mensaje}</Aviso>}

          {estado.tipo === "correo_sin_confirmar" && (
            <Aviso tipo={estado.mensaje ? "error" : "advertencia"}>
              {estado.mensaje ??
                "Aún no has confirmado tu correo electrónico. Abre el enlace que te enviamos para activar tu cuenta."}{" "}
              <BotonReenviar
                reenviando={reenviando}
                restante={espera.restante}
                onClick={() => reenviar(estado.correo)}
              />
            </Aviso>
          )}

          {estado.tipo === "reenviado" && (
            // No se promete la entrega: Supabase solo confirma que aceptó el envío.
            <Aviso tipo="exito">
              Solicitamos el envío de un nuevo correo de confirmación. Puede tardar unos
              minutos; revisa también la carpeta de spam.{" "}
              <BotonReenviar
                reenviando={reenviando}
                restante={espera.restante}
                onClick={() => reenviar(estado.correo)}
              />
            </Aviso>
          )}

          <Button type="submit" size="lg" className="h-10 w-full" disabled={ocupado}>
            {ocupado && <Loader2 className="animate-spin" aria-hidden />}
            {ocupado ? "Ingresando…" : "Ingresar"}
          </Button>
      </form>

      <div className="flex items-center gap-3" role="separator" aria-label="o">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground uppercase" aria-hidden>o</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <BotonGoogle deshabilitado={ocupado} />
        <p className="text-center text-xs text-muted-foreground">
          Estudiantes: entren o creen su cuenta con Google. Docentes: usen la cuenta que les dio su
          institución.
        </p>
      </div>

      <p className="border-t pt-5 text-center text-sm text-muted-foreground">
        ¿Tu institución aún no está registrada?{" "}
        <Link href="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
          Regístrala aquí
        </Link>
      </p>
    </div>
  )
}

function BotonReenviar({
  reenviando,
  restante,
  onClick,
}: {
  reenviando: boolean
  restante: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={reenviando || restante > 0}
      className="font-medium text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
    >
      {reenviando
        ? "Reenviando…"
        : restante > 0
          ? `Podrás reenviarlo en ${restante} s`
          : "Reenviar correo de confirmación"}
    </button>
  )
}

function mensajeLogin(tipo: ReturnType<typeof clasificarErrorAuth>): string {
  switch (tipo) {
    case "credenciales":
      return MENSAJES_AUTH.credenciales
    case "limite":
      return MENSAJES_AUTH.limite
    case "sin_conexion":
      return MENSAJES_AUTH.sinConexion
    case "servicio":
      return MENSAJES_AUTH.servicio
    case "cuenta_bloqueada":
      return MENSAJES_AUTH.cuentaBloqueada
    default:
      return "No se pudo iniciar sesión por un problema inesperado. Inténtalo de nuevo en unos minutos."
  }
}
