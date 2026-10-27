"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react"

import { DatosMedioCobro, IconoMedio, tituloMedio } from "@/components/pagos/medio-cobro"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { notificar } from "@/lib/notificaciones"
import { cambiarEstadoMedio, eliminarMedioCobro, guardarMedioCobro } from "@/lib/pagos/medios-acciones"
import type { MedioCobro } from "@/lib/pagos/medios"
import {
  BANCOS_SUGERIDOS,
  ETIQUETA_TIPO_MEDIO,
  INSTRUCCIONES_MAX,
  MEDIO_VACIO,
  TIPOS_MEDIO,
  esBilletera,
  medioCobroSchema,
  type MedioCobroValues,
} from "@/lib/validations/medio-cobro"
import { cn } from "@/lib/utils"

/** Medios de cobro de la institución: el dinero llega directo a sus cuentas; Academix no lo recibe. */
export function MediosPanel({ medios }: { medios: MedioCobro[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<{ id: string | null; valores: MedioCobroValues } | null>(null)
  const [eliminar, setEliminar] = useState<MedioCobro | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const activos = medios.filter((m) => m.activo).length

  async function alternar(m: MedioCobro) {
    if (procesando) return
    setProcesando(m.id)
    const op = notificar.operacion(m.activo ? "Deshabilitando…" : "Habilitando…")
    try {
      const r = await cambiarEstadoMedio(m.id, !m.activo)
      if (r.ok) {
        op.exito(m.activo ? "Medio deshabilitado" : "Medio habilitado")
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo actualizar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo actualizar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  async function confirmarEliminar() {
    if (!eliminar || procesando) return
    setProcesando(eliminar.id)
    const op = notificar.operacion("Eliminando…")
    try {
      const r = await eliminarMedioCobro(eliminar.id)
      if (r.ok) {
        op.exito("Medio de cobro eliminado")
        setEliminar(null)
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo eliminar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo eliminar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {medios.length === 0
            ? "Aún no registraste medios de cobro."
            : `${activos} de ${medios.length} ${medios.length === 1 ? "medio habilitado" : "medios habilitados"}. Los estudiantes solo ven los habilitados.`}
        </p>
        <Button onClick={() => setEditando({ id: null, valores: MEDIO_VACIO })}>
          <Plus aria-hidden />
          Añadir medio de cobro
        </Button>
      </div>

      {medios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Wallet className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Registra tu Yape, Plin o cuentas bancarias. Los estudiantes los verán al pagar una solicitud o cuota de tu institución.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {medios.map((m) => (
            <li key={m.id}>
              <Card size="sm" className={cn("h-full", !m.activo && "opacity-70")}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2 font-medium">
                      <IconoMedio tipo={m.tipo} className="text-muted-foreground" />
                      {tituloMedio(m)}
                    </p>
                    <Badge variant={m.activo ? "success" : "outline"}>{m.activo ? "Habilitado" : "Deshabilitado"}</Badge>
                  </div>
                  <DatosMedioCobro medio={m} />
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setEditando({ id: m.id, valores: aValores(m) })} disabled={procesando !== null}>
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => alternar(m)} disabled={procesando !== null}>
                      {procesando === m.id && <Loader2 className="animate-spin" aria-hidden />}
                      {m.activo ? "Deshabilitar" : "Habilitar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEliminar(m)} disabled={procesando !== null} aria-label={`Eliminar ${tituloMedio(m)}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FormularioMedio
          key={editando.id ?? "nuevo"}
          id={editando.id}
          inicial={editando.valores}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null)
            router.refresh()
          }}
        />
      )}

      <Dialog open={eliminar !== null} onOpenChange={(v) => !v && !procesando && setEliminar(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Eliminar este medio de cobro?</DialogTitle>
            <DialogDescription>
              Los estudiantes dejarán de verlo. Los pagos ya presentados no cambian. Si solo quieres ocultarlo temporalmente, usa «Deshabilitar».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando !== null} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={procesando !== null}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function aValores(m: MedioCobro): MedioCobroValues {
  return {
    tipo: m.tipo,
    titular: m.titular,
    celular: m.celular ?? "",
    banco: m.banco ?? "",
    numero_cuenta: m.numero_cuenta ?? "",
    cci: m.cci ?? "",
    instrucciones: m.instrucciones ?? "",
    activo: m.activo,
  }
}

function FormularioMedio({
  id,
  inicial,
  alCerrar,
  alGuardar,
}: {
  id: string | null
  inicial: MedioCobroValues
  alCerrar: () => void
  alGuardar: () => void
}) {
  const [v, setV] = useState(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const billetera = esBilletera(v.tipo)
  const set = <K extends keyof MedioCobroValues>(k: K, valor: MedioCobroValues[K]) => {
    setV((x) => ({ ...x, [k]: valor }))
    setErrores((e) => ({ ...e, [k]: "" }))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    const local = medioCobroSchema.safeParse(v)
    if (!local.success) {
      const campos: Record<string, string> = {}
      for (const i of local.error.issues) campos[String(i.path[0])] ??= i.message
      setErrores(campos)
      return
    }
    setEnviando(true)
    const op = notificar.operacion("Guardando medio de cobro…")
    try {
      const r = await guardarMedioCobro(id, v)
      if (r.ok) {
        op.exito(id ? "Medio de cobro actualizado" : "Medio de cobro añadido")
        alGuardar()
      } else {
        if (r.campos) setErrores(r.campos)
        ;(r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo guardar", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  const campo = (k: keyof MedioCobroValues, etiqueta: string, props: React.ComponentProps<typeof Input> = {}, ayuda?: string) => (
    <Field data-invalid={!!errores[k] || undefined}>
      <FieldLabel htmlFor={`medio-${k}`}>{etiqueta}</FieldLabel>
      <Input
        id={`medio-${k}`}
        value={String(v[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
        aria-invalid={!!errores[k] || undefined}
        disabled={enviando}
        {...props}
      />
      {ayuda && <FieldDescription>{ayuda}</FieldDescription>}
      {errores[k] && <FieldError>{errores[k]}</FieldError>}
    </Field>
  )

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{id ? "Editar medio de cobro" : "Nuevo medio de cobro"}</DialogTitle>
          <DialogDescription>Datos que verá el estudiante para pagarte. No escribas contraseñas ni claves.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Medio</legend>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_MEDIO.map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    enviando && "pointer-events-none opacity-60"
                  )}
                >
                  <input type="radio" name="tipo" value={t} checked={v.tipo === t} onChange={() => set("tipo", t)} className="sr-only" />
                  <IconoMedio tipo={t} className="text-muted-foreground" />
                  {ETIQUETA_TIPO_MEDIO[t]}
                </label>
              ))}
            </div>
          </fieldset>

          {campo("titular", "Titular", { autoComplete: "off", maxLength: 150 }, "Nombre que aparece al pagar (persona o razón social).")}
          {billetera ? (
            campo("celular", `Celular de ${ETIQUETA_TIPO_MEDIO[v.tipo]}`, { inputMode: "numeric", autoComplete: "off", maxLength: 11, placeholder: "9XXXXXXXX" })
          ) : (
            <>
              {campo("banco", "Banco", { list: "bancos-sugeridos", autoComplete: "off", maxLength: 100 })}
              <datalist id="bancos-sugeridos">
                {BANCOS_SUGERIDOS.map((b) => <option key={b} value={b} />)}
              </datalist>
              {campo("numero_cuenta", "Número de cuenta", { inputMode: "numeric", autoComplete: "off", maxLength: 30 })}
              {campo("cci", "CCI (opcional)", { inputMode: "numeric", autoComplete: "off", maxLength: 24 }, "Código de Cuenta Interbancario de 20 dígitos, para transferencias desde otros bancos.")}
            </>
          )}

          <Field data-invalid={!!errores.instrucciones || undefined}>
            <FieldLabel htmlFor="medio-instrucciones">Instrucciones (opcional)</FieldLabel>
            <Textarea
              id="medio-instrucciones"
              value={v.instrucciones}
              onChange={(e) => set("instrucciones", e.target.value)}
              maxLength={INSTRUCCIONES_MAX}
              rows={3}
              disabled={enviando}
              placeholder="Ej.: Indica tu DNI en el mensaje del pago."
            />
            {errores.instrucciones && <FieldError>{errores.instrucciones}</FieldError>}
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={v.activo} onChange={(e) => set("activo", e.target.checked)} disabled={enviando} className="mt-0.5 size-4 accent-primary" />
            Habilitado: los estudiantes lo verán al pagar.
          </label>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={enviando} />}>Cancelar</DialogClose>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
