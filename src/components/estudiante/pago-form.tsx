"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlert, FileText, Loader2, ShieldCheck, Upload, X } from "lucide-react"

import { DatosMedioCobro, IconoMedio, tituloMedio } from "@/components/pagos/medio-cobro"
import { fechaSimple, formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { notificar } from "@/lib/notificaciones"
import { BUCKET_COMPROBANTES, TAMANO_MAX_COMPROBANTE, TIPOS_COMPROBANTE, tipoPorFirma, type TipoComprobante } from "@/lib/pagos/config"
import type { ObjetivoPago } from "@/lib/pagos/estudiante"
import { presentarComprobante } from "@/lib/pagos/estudiante-acciones"
import type { LecturaMedios } from "@/lib/pagos/medios"
import { createClient } from "@/lib/supabase/client"
import { ETIQUETA_TIPO_MEDIO, TIPOS_MEDIO, type TipoMedio } from "@/lib/validations/medio-cobro"
import { cn } from "@/lib/utils"

type Archivo = { file: File; tipo: TipoComprobante; vista: string | null }
type Errores = Partial<Record<"metodo" | "monto" | "referencia" | "archivo" | "confirmo", string>>

const s = formatoSolesSolicitud
const MB = (b: number) => `${(b / 1024 / 1024).toLocaleString("es-PE", { maximumFractionDigits: 1 })} MB`

/** Pago manual: el estudiante paga FUERA de Academix y sube el comprobante para que la institución lo verifique. */
export function PagoForm({ objetivo, medios, textoPagos, userId }: { objetivo: ObjetivoPago; medios: LecturaMedios; textoPagos: string | null; userId: string }) {
  const router = useRouter()
  const lista = medios.disponible ? medios.medios : []
  const [medioId, setMedioId] = useState<string | null>(lista.length === 1 ? lista[0].id : null)
  const [tipoManual, setTipoManual] = useState<TipoMedio | null>(null)
  const [monto, setMonto] = useState(objetivo.saldo.toFixed(2))
  const [referencia, setReferencia] = useState("")
  const [archivo, setArchivo] = useState<Archivo | null>(null)
  const [confirmo, setConfirmo] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [revisar, setRevisar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Ruta ya subida para ESTE archivo: si la RPC falla y se reintenta, no se vuelve a subir.
  const subida = useRef<{ file: File; ruta: string } | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (archivo?.vista) URL.revokeObjectURL(archivo.vista) }, [archivo])

  const medio = lista.find((m) => m.id === medioId) ?? null
  const metodo: TipoMedio | null = medio?.tipo ?? tipoManual
  const montoNumero = Number(monto)
  const institucion = objetivo.institucion ?? "la institución"

  function validar(): Errores {
    const e: Errores = {}
    if (!metodo) e.metodo = "Elige el medio con el que pagaste."
    if (!/^\d+(\.\d{1,2})?$/.test(monto.trim()) || montoNumero <= 0) e.monto = "Introduce un monto válido, por ejemplo 150 o 150.50."
    else if (objetivo.regla === "igual" && Math.abs(montoNumero - objetivo.importe) >= 0.005) e.monto = `Debe ser exactamente ${s.format(objetivo.importe)}.`
    else if (objetivo.regla === "maximo" && montoNumero > objetivo.saldo + 0.005) e.monto = `No puede superar el saldo de ${s.format(objetivo.saldo)}.`
    const r = referencia.trim()
    if (r.length < 4) e.referencia = "Introduce el número de operación que figura en tu comprobante."
    else if (r.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 ./#-]*$/.test(r)) e.referencia = "Usa solo letras, números, espacios y . / # - (máximo 40)."
    if (!archivo) e.archivo = "Adjunta la imagen o el PDF del comprobante."
    if (!confirmo) e.confirmo = "Confirma que realizaste el pago."
    return e
  }

  async function elegirArchivo(f: File | undefined) {
    setErrores((e) => ({ ...e, archivo: undefined }))
    if (!f) return
    const error = (m: string) => {
      setErrores((e) => ({ ...e, archivo: m }))
      if (entrada.current) entrada.current.value = ""
    }
    if (f.size === 0) return error("El archivo está vacío.")
    if (f.size > TAMANO_MAX_COMPROBANTE) return error(`El archivo pesa ${MB(f.size)}; el máximo es 5 MB.`)
    const firma = tipoPorFirma(new Uint8Array(await f.slice(0, 8).arrayBuffer()))
    if (!firma) return error("Solo se admiten imágenes JPG o PNG y archivos PDF.")
    setArchivo({ file: f, tipo: firma, vista: firma === "application/pdf" ? null : URL.createObjectURL(f) })
  }

  function abrirRevision(e: React.FormEvent) {
    e.preventDefault()
    const encontrados = validar()
    setErrores(encontrados)
    if (Object.keys(encontrados).length === 0) setRevisar(true)
  }

  async function enviar() {
    if (enviando || !archivo || !metodo) return
    setEnviando(true)
    const op = notificar.operacion("Enviando comprobante…")
    try {
      let ruta = subida.current?.file === archivo.file ? subida.current.ruta : null
      if (!ruta) {
        const nueva = `${userId}/${crypto.randomUUID()}.${TIPOS_COMPROBANTE[archivo.tipo]}`
        const { error } = await createClient().storage.from(BUCKET_COMPROBANTES).upload(nueva, archivo.file, { contentType: archivo.tipo, upsert: false, cacheControl: "0" })
        if (error) {
          const m = error.message ?? ""
          op.error("No se pudo subir el comprobante", {
            descripcion: /size|exceed|large/i.test(m) ? "El archivo supera el tamaño permitido (5 MB)." : /mime|type/i.test(m) ? "Tipo de archivo no permitido." : "Revisa tu conexión e inténtalo de nuevo.",
          })
          return
        }
        ruta = nueva
        subida.current = { file: archivo.file, ruta }
      }
      const r = await presentarComprobante({ destino: objetivo.destino, id: objetivo.id, monto: monto.trim(), metodo, referencia: referencia.trim(), ruta, confirmado: true })
      if (r.ok) {
        op.exito("Comprobante enviado", { descripcion: `${institucion} verificará el ingreso y verás el resultado en «Mis pagos y cuotas».` })
        setRevisar(false)
        router.push(objetivo.destino === "certificado" ? "/estudiante/certificados?enviado=1" : "/estudiante/pagos?enviado=1")
        router.refresh()
      } else {
        if (r.campo) setErrores((e) => ({ ...e, [r.campo!]: r.mensaje }))
        if (r.campo === "archivo") subida.current = null
        ;(r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo enviar el comprobante", { descripcion: r.mensaje })
        setRevisar(false)
      }
    } catch {
      op.error("No se pudo enviar el comprobante", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={abrirRevision} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Realiza el pago a {institucion}</CardTitle>
            <CardDescription>Academix no recibe tu dinero: pagas directamente a la institución con uno de sus medios.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lista.length > 0 ? (
              <div role="radiogroup" aria-label="Medio de pago" className="grid gap-3 sm:grid-cols-2">
                {lista.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      enviando && "pointer-events-none opacity-60"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="medio"
                        checked={medioId === m.id}
                        onChange={() => {
                          setMedioId(m.id)
                          setErrores((e) => ({ ...e, metodo: undefined }))
                        }}
                        className="size-4 accent-primary"
                      />
                      <IconoMedio tipo={m.tipo} className="text-muted-foreground" />
                      {tituloMedio(m)}
                    </span>
                    <DatosMedioCobro medio={m} />
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <p className="flex gap-2 font-medium">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    {institucion} aún no publicó sus medios de cobro en Academix.
                  </p>
                  {textoPagos ? (
                    <p className="mt-2 whitespace-pre-line text-muted-foreground">{textoPagos}</p>
                  ) : (
                    <p className="mt-2 text-muted-foreground">Comunícate con la institución para conocer la cuenta o el número donde debes pagar.</p>
                  )}
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">¿Cómo pagaste?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TIPOS_MEDIO.map((t) => (
                      <label key={t} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                        <input type="radio" name="tipo" checked={tipoManual === t} onChange={() => { setTipoManual(t); setErrores((e) => ({ ...e, metodo: undefined })) }} className="size-4 accent-primary" />
                        {ETIQUETA_TIPO_MEDIO[t]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {errores.metodo && <p className="text-sm text-destructive" role="alert">{errores.metodo}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Registra tu comprobante</CardTitle>
            <CardDescription>Los datos deben coincidir con tu comprobante. La institución los contrastará con su banco o aplicación.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field data-invalid={!!errores.monto || undefined}>
              <FieldLabel htmlFor="pago-monto">Monto pagado (S/)</FieldLabel>
              <Input
                id="pago-monto"
                inputMode="decimal"
                value={monto}
                onChange={(e) => { setMonto(e.target.value); setErrores((x) => ({ ...x, monto: undefined })) }}
                readOnly={objetivo.regla === "igual"}
                disabled={enviando}
                aria-invalid={!!errores.monto || undefined}
                className="max-w-48 tabular-nums"
              />
              <FieldDescription>
                {objetivo.regla === "igual"
                  ? "Debe pagarse el importe exacto de la solicitud."
                  : `Puedes pagar el saldo completo (${s.format(objetivo.saldo)}) o una parte; el resto quedará pendiente.`}
              </FieldDescription>
              {errores.monto && <FieldError>{errores.monto}</FieldError>}
            </Field>

            <Field data-invalid={!!errores.referencia || undefined}>
              <FieldLabel htmlFor="pago-referencia">Número de operación</FieldLabel>
              <Input
                id="pago-referencia"
                value={referencia}
                onChange={(e) => { setReferencia(e.target.value); setErrores((x) => ({ ...x, referencia: undefined })) }}
                maxLength={40}
                autoComplete="off"
                disabled={enviando}
                aria-invalid={!!errores.referencia || undefined}
                placeholder="Ej.: 01234567"
                className="max-w-72"
              />
              <FieldDescription>Figura en la constancia de Yape, Plin, la transferencia o el voucher del depósito.</FieldDescription>
              {errores.referencia && <FieldError>{errores.referencia}</FieldError>}
            </Field>

            <Field data-invalid={!!errores.archivo || undefined}>
              <FieldLabel htmlFor="pago-archivo">Comprobante (JPG, PNG o PDF, máx. 5 MB)</FieldLabel>
              {archivo ? (
                <div className="flex items-center gap-3 rounded-lg border p-2.5">
                  {archivo.vista ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no optimizable
                    <img src={archivo.vista} alt="Vista previa del comprobante" className="size-14 rounded object-cover" />
                  ) : (
                    <FileText className="size-8 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{archivo.file.name}</p>
                    <p className="text-xs text-muted-foreground">{MB(archivo.file.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar archivo" disabled={enviando} onClick={() => { setArchivo(null); if (entrada.current) entrada.current.value = "" }}>
                    <X aria-hidden />
                  </Button>
                </div>
              ) : (
                <label htmlFor="pago-archivo" className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <Upload className="size-5" aria-hidden />
                  Elige una captura o el PDF del comprobante
                </label>
              )}
              <input
                ref={entrada}
                id="pago-archivo"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
                disabled={enviando}
                onChange={(e) => elegirArchivo(e.target.files?.[0])}
              />
              <FieldDescription>Se guarda en un almacenamiento privado: solo tú y {institucion} pueden verlo.</FieldDescription>
              {errores.archivo && <FieldError>{errores.archivo}</FieldError>}
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmo} onChange={(e) => { setConfirmo(e.target.checked); setErrores((x) => ({ ...x, confirmo: undefined })) }} disabled={enviando} className="mt-0.5 size-4 accent-primary" />
              <span>
                Confirmo que realicé este pago a {institucion} y que los datos son verdaderos.
                {errores.confirmo && <span className="block text-destructive">{errores.confirmo}</span>}
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Fila k="Institución" v={objetivo.institucion ?? "—"} />
              <Fila k="Curso" v={[objetivo.curso, objetivo.grupo && `Grupo ${objetivo.grupo}`].filter(Boolean).join(" · ") || "—"} />
              <Fila k="Concepto" v={objetivo.concepto} />
              {objetivo.destino === "cuota" && objetivo.importe !== objetivo.saldo && <Fila k="Importe de la cuota" v={s.format(objetivo.importe)} />}
              <Fila k={objetivo.regla === "igual" ? "Importe a pagar" : "Saldo pendiente"} v={s.format(objetivo.saldo)} fuerte />
              {objetivo.vencimiento && <Fila k="Vencimiento" v={`${fechaSimple(objetivo.vencimiento)}${objetivo.vencida ? " (vencida)" : ""}`} alerta={objetivo.vencida} />}
            </dl>
            <Button type="submit" className="mt-4 w-full" disabled={enviando}>
              Revisar y enviar
            </Button>
            <Link href="/estudiante/pagos" className={cn(buttonVariants({ variant: "ghost" }), "mt-2 w-full")}>
              Volver
            </Link>
          </CardContent>
        </Card>
        <p className="flex gap-2 px-1 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Enviar el comprobante no confirma tu {objetivo.destino === "solicitud" ? "inscripción" : "pago"}: la institución debe verificar el ingreso y aprobarlo.
        </p>
      </aside>

      <Dialog open={revisar} onOpenChange={(v) => !v && !enviando && setRevisar(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Enviar el comprobante?</DialogTitle>
            <DialogDescription>Revisa los datos: una vez enviado, no podrás modificarlo mientras esté en revisión.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-1.5 rounded-lg border p-3 text-sm">
            <Fila k="Para" v={institucion} />
            <Fila k="Concepto" v={objetivo.concepto} />
            <Fila k="Monto" v={Number.isFinite(montoNumero) ? s.format(montoNumero) : "—"} fuerte />
            <Fila k="Medio" v={medio ? tituloMedio(medio) : metodo ? ETIQUETA_TIPO_MEDIO[metodo] : "—"} />
            <Fila k="N.° de operación" v={referencia.trim()} />
            <Fila k="Archivo" v={archivo?.file.name ?? "—"} />
          </dl>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={enviando} autoFocus />}>Corregir</DialogClose>
            <Button onClick={enviar} disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Enviar comprobante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function Fila({ k, v, fuerte, alerta }: { k: string; v: string; fuerte?: boolean; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("min-w-0 text-right break-words", fuerte && "font-semibold tabular-nums", alerta && "text-destructive")}>{v}</dd>
    </div>
  )
}
