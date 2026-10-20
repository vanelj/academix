"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Bookmark,
  CircleAlert,
  ClipboardCheck,
  Clock,
  Eraser,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react"

import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { notificar } from "@/lib/notificaciones"
import { guardarPoliticas, type VersionPoliticas } from "@/lib/politicas/acciones"
import { cn } from "@/lib/utils"
import {
  CAMPOS_POLITICA,
  POLITICA_MAX,
  politicasEstanVacias,
  politicasSchema,
  type CampoPolitica,
  type PoliticasValues,
} from "@/lib/validations/politicas"

type Icono = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

/** Textos de ayuda: orientan sin sugerir importes, plazos ni penalidades. */
const INFO_CAMPOS: Record<CampoPolitica, { titulo: string; descripcion: string; icono: Icono }> = {
  texto_matricula: {
    titulo: "Política general de matrícula",
    descripcion:
      "Reglas generales, requisitos y condiciones para matricularse en tu institución. Cada curso podrá añadir después sus propias condiciones.",
    icono: ClipboardCheck,
  },
  texto_reservas: {
    titulo: "Política de reserva de vacantes",
    descripcion:
      "Cómo se separa una vacante, si tu institución lo permite: plazos y condiciones generales. Los importes concretos se definirán en cada curso.",
    icono: Bookmark,
  },
  texto_pagos: {
    titulo: "Política de pagos y comprobantes",
    descripcion:
      "Medios de pago que aceptas, cómo presentar los comprobantes y cómo los verifica manualmente tu institución.",
    icono: Receipt,
  },
  texto_devoluciones: {
    titulo: "Política de cancelaciones y devoluciones",
    descripcion: "Cuándo puede cancelarse una inscripción y en qué condiciones procede un reembolso, si lo hay.",
    icono: Undo2,
  },
  texto_morosidad: {
    titulo: "Política de morosidad y pagos vencidos",
    descripcion: "Qué ocurre cuando una cuota o un pago vence sin abonarse y qué condiciones se aplican.",
    icono: Clock,
  },
}

type Estado =
  | { tipo: "inicial" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "conflicto"; mensaje: string; version: VersionPoliticas }

const formatoFecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short" })

const lista = new Intl.ListFormat("es", { style: "long", type: "conjunction" })

export function PoliticasForm({
  valoresIniciales,
  actualizadoEn,
}: {
  valoresIniciales: PoliticasValues
  /** null = la institución aún no tiene políticas configuradas. */
  actualizadoEn: string | null
}) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" })
  const [guardando, setGuardando] = useState(false)
  // Fecha de la versión guardada; también es la "versión base" para detectar
  // si otra sesión guardó mientras se editaba.
  const [ultimaActualizacion, setUltimaActualizacion] = useState(actualizadoEn)
  // Evita envíos duplicados (doble clic o Enter repetido).
  const bloqueo = useRef(false)

  const form = useForm<PoliticasValues>({
    resolver: zodResolver(politicasSchema),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const { isDirty, dirtyFields, defaultValues } = form.formState
  const pendientes = CAMPOS_POLITICA.filter((campo) => dirtyFields[campo]).length

  // Diálogo al salir por los enlaces del panel + aviso del navegador al cerrar o recargar.
  useProtegerCambios(isDirty)

  async function onSubmit(valores: PoliticasValues) {
    if (bloqueo.current) return
    // Sin cambios no se llama al servidor.
    if (!form.formState.isDirty) {
      notificar.info("No hay cambios para guardar.")
      return
    }
    bloqueo.current = true
    setGuardando(true)
    setEstado({ tipo: "inicial" })

    // Políticas que tenían texto guardado y ahora se envían vacías.
    const guardadas = form.formState.defaultValues ?? {}
    const vaciadas = CAMPOS_POLITICA.filter((campo) => (guardadas[campo] ?? "") !== "" && valores[campo] === "")

    const operacion = notificar.operacion("Guardando cambios…")
    try {
      const resultado = await guardarPoliticas(valores, ultimaActualizacion)
      if (resultado.ok) {
        // Solo con la confirmación del servidor: nueva referencia, fecha y sin indicadores.
        form.reset(resultado.valores)
        setUltimaActualizacion(resultado.actualizadoEn)
        operacion.exito("Políticas guardadas correctamente", {
          descripcion: politicasEstanVacias(resultado.valores)
            ? "Se quitaron todas las políticas: tu institución queda sin políticas configuradas."
            : vaciadas.length > 0
              ? `Se eliminó el texto de: ${lista.format(vaciadas.map((c) => INFO_CAMPOS[c].titulo.toLowerCase()))}.`
              : undefined,
        })
        router.refresh()
      } else if (resultado.conflicto) {
        setEstado({ tipo: "conflicto", mensaje: resultado.mensaje, version: resultado.conflicto })
        operacion.advertencia("Las políticas cambiaron en otra sesión", {
          descripcion: "Tus cambios no se guardaron. Revisa el aviso del formulario.",
        })
      } else {
        setEstado({ tipo: "error", mensaje: resultado.mensaje })
        operacion.error("No se pudieron guardar las políticas", { descripcion: resultado.mensaje })
      }
    } catch {
      const mensaje = "Revisa tu conexión e inténtalo de nuevo. Tus textos siguen en el formulario."
      setEstado({ tipo: "error", mensaje: `No se pudieron guardar las políticas. ${mensaje}` })
      operacion.error("No se pudieron guardar las políticas", { descripcion: mensaje })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  function alFallarValidacion() {
    notificar.error("Revisa las políticas marcadas", {
      descripcion: `Cada política admite como máximo ${POLITICA_MAX.toLocaleString("es-PE")} caracteres.`,
    })
  }

  function descartar() {
    form.reset()
    setEstado({ tipo: "inicial" })
    notificar.info("Cambios descartados", { descripcion: "Se restauraron los textos guardados." })
  }

  function vaciar(campo: CampoPolitica) {
    const anterior = form.getValues(campo)
    form.setValue(campo, "", { shouldDirty: true, shouldValidate: true })
    notificar.info(`Se vació la ${INFO_CAMPOS[campo].titulo.toLowerCase()}`, {
      descripcion: "Aún no se ha guardado: el cambio se aplicará al pulsar «Guardar cambios».",
      accion: {
        etiqueta: "Deshacer",
        alPulsar: () => form.setValue(campo, anterior, { shouldDirty: true, shouldValidate: true }),
      },
    })
  }

  function cargarVersion(version: VersionPoliticas) {
    form.reset(version.valores)
    setUltimaActualizacion(version.actualizadoEn)
    setEstado({ tipo: "inicial" })
    notificar.info("Se cargó la versión guardada", {
      descripcion: version.actualizadoEn
        ? `Actualizada el ${formatoFecha.format(new Date(version.actualizadoEn))}.`
        : "Actualmente no hay políticas configuradas.",
    })
    router.refresh()
  }

  return (
    <form
      noValidate
      onSubmit={(e) => form.handleSubmit(onSubmit, alFallarValidacion)(e)}
      aria-busy={guardando}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        {ultimaActualizacion ? (
          <>Última actualización: {formatoFecha.format(new Date(ultimaActualizacion))}.</>
        ) : (
          <>Tu institución aún no tiene políticas configuradas. Completa las que apliquen y guarda.</>
        )}
      </p>

      <fieldset disabled={guardando} className="min-w-0 space-y-4">
        <legend className="sr-only">Políticas institucionales</legend>
        {CAMPOS_POLITICA.map((campo) => (
          <TarjetaPolitica
            key={campo}
            control={form.control}
            campo={campo}
            modificado={!!dirtyFields[campo]}
            guardado={defaultValues?.[campo] ?? ""}
            onVaciar={() => vaciar(campo)}
          />
        ))}
      </fieldset>

      {estado.tipo === "error" && <Mensaje tipo="error">{estado.mensaje}</Mensaje>}
      {estado.tipo === "conflicto" && (
        <Mensaje tipo="advertencia">
          {estado.mensaje} Puedes copiar lo que escribiste y luego cargar la versión guardada
          {estado.version.actualizadoEn
            ? ` (actualizada el ${formatoFecha.format(new Date(estado.version.actualizadoEn))})`
            : " (actualmente sin políticas configuradas)"}
          .
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 flex"
            onClick={() => cargarVersion(estado.version)}
          >
            <RefreshCw aria-hidden />
            Cargar la versión guardada
          </Button>
        </Mensaje>
      )}

      {/* Barra de acciones fija al pie mientras se desplaza por las tarjetas. */}
      <div className="sticky bottom-0 z-10 -mx-1 pb-2">
        <Card className="flex-col gap-3 px-4 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" role="status" aria-live="polite">
            {guardando ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Guardando cambios…
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-2 font-medium text-warning">
                <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                {pendientes === 1 ? "1 política con cambios sin guardar" : `${pendientes} políticas con cambios sin guardar`}
              </span>
            ) : (
              <span className="text-muted-foreground">No hay cambios sin guardar.</span>
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              disabled={!isDirty || guardando}
              onClick={descartar}
              className="w-full sm:w-auto"
            >
              <RotateCcw aria-hidden />
              Descartar cambios
            </Button>
            <Button type="submit" disabled={!isDirty || guardando} className="w-full sm:w-auto">
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  )
}

function TarjetaPolitica({
  control,
  campo,
  modificado,
  guardado,
  onVaciar,
}: {
  control: Control<PoliticasValues>
  campo: CampoPolitica
  modificado: boolean
  /** Texto guardado actualmente en la BD (vacío si no hay). */
  guardado: string
  onVaciar: () => void
}) {
  const { titulo, descripcion, icono: Icono } = INFO_CAMPOS[campo]
  const id = `politica-${campo}`
  const valor = useWatch({ control, name: campo })
  // Vaciado en el formulario pero aún no guardado: se distingue del simple "modificado".
  const vaciada = modificado && guardado !== "" && valor.trim() === ""

  return (
    <Card role="group" aria-labelledby={`${id}-titulo`} className={cn("gap-4", modificado && "ring-warning/50")}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
            <Icono className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle id={`${id}-titulo`}>{titulo}</CardTitle>
              {vaciada ? (
                <Badge variant="destructive">Se vaciará al guardar</Badge>
              ) : (
                modificado && <Badge variant="warning">Sin guardar</Badge>
              )}
            </div>
            <CardDescription id={`${id}-ayuda`}>{descripcion}</CardDescription>
          </div>
          {valor !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onVaciar}
              className="shrink-0 text-muted-foreground"
              aria-label={`Vaciar la ${titulo.toLowerCase()}`}
            >
              <Eraser aria-hidden />
              <span className="hidden sm:inline">Vaciar</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Controller
          control={control}
          name={campo}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={id} className="sr-only">
                {titulo}
              </FieldLabel>
              <Textarea
                {...field}
                id={id}
                rows={6}
                maxLength={POLITICA_MAX}
                placeholder="Escribe aquí la política de tu institución. Puedes dejarla vacía si no aplica."
                aria-invalid={fieldState.invalid}
                aria-describedby={`${id}-ayuda ${id}-contador${vaciada ? ` ${id}-vaciada` : ""}`}
                className="max-h-[32rem] min-h-36 resize-y leading-relaxed"
              />
              {vaciada && (
                <p id={`${id}-vaciada`} className="text-xs text-muted-foreground">
                  Has vaciado esta política. El texto guardado se eliminará solo cuando pulses
                  «Guardar cambios»; con «Descartar cambios» lo recuperas.
                </p>
              )}
              <div className="flex items-start justify-between gap-3">
                <FieldError errors={[fieldState.error]} />
                <Contador valor={valor} id={`${id}-contador`} />
              </div>
            </Field>
          )}
        />
      </CardContent>
    </Card>
  )
}

function Contador({ valor, id }: { valor: string; id: string }) {
  const usados = valor.length
  const cerca = usados > POLITICA_MAX * 0.9
  return (
    <p
      id={id}
      className={cn("ml-auto shrink-0 text-xs tabular-nums text-muted-foreground", cerca && "text-warning")}
    >
      {usados.toLocaleString("es-PE")} / {POLITICA_MAX.toLocaleString("es-PE")}
    </p>
  )
}

function Mensaje({ tipo, children }: { tipo: "error" | "advertencia"; children: React.ReactNode }) {
  const IconoMensaje = tipo === "error" ? CircleAlert : TriangleAlert
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        tipo === "error"
          ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10"
          : "border-warning/40 bg-warning/5 dark:bg-warning/10"
      )}
    >
      <IconoMensaje
        className={cn("mt-0.5 size-4 shrink-0", tipo === "error" ? "text-destructive" : "text-warning")}
        aria-hidden
      />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
