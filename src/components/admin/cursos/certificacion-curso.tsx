"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { guardarCertificacionCurso } from "@/lib/certificados/acciones"
import { DESCRIPCION_MODALIDAD, ETIQUETA_MODALIDAD, MODALIDADES, type Modalidad } from "@/lib/certificados/config"
import type { CertificacionCurso, Firmante, PlantillaCertificado } from "@/lib/certificados/datos"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

type Props = {
  cursoId: string
  config: CertificacionCurso | null
  plantillas: PlantillaCertificado[]
  firmantes: Firmante[]
  notaAprobatoria: number
}

/** Condiciones de certificación del curso (se muestran en el catálogo antes de inscribirse). */
export function CertificacionCursoForm({ cursoId, config, plantillas, firmantes, notaAprobatoria }: Props) {
  const router = useRouter()
  const [modalidad, setModalidad] = useState<Modalidad>(config?.modalidad ?? "sin_certificado")
  const [importe, setImporte] = useState(config && config.importe > 0 ? config.importe.toFixed(2) : "")
  const [notaMinima, setNotaMinima] = useState(config?.nota_minima !== null && config?.nota_minima !== undefined ? String(config.nota_minima) : "")
  const [horas, setHoras] = useState(config?.horas_academicas ? String(config.horas_academicas) : "")
  const [requisitos, setRequisitos] = useState(config?.requisitos_adicionales ?? "")
  const [plantilla, setPlantilla] = useState(config?.plantilla_id ?? "")
  const [firmante, setFirmante] = useState(config?.firmante_id ?? "")
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const ofrece = modalidad !== "sin_certificado"

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    const op = notificar.operacion("Guardando certificación…")
    try {
      const r = await guardarCertificacionCurso(cursoId, {
        modalidad, importe, nota_minima: notaMinima, horas_academicas: horas, requisitos_adicionales: requisitos,
        plantilla_id: plantilla || null, firmante_id: firmante || null,
      })
      if (r.ok) { op.exito("Certificación guardada", { descripcion: "Los cambios se aplican a los próximos certificados." }); setErrores({}); router.refresh() }
      else { setErrores(r.campos ?? {}); (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo guardar", { descripcion: r.mensaje }) }
    } catch {
      op.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4" noValidate>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Modalidad</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODALIDADES.map((m) => (
            <label key={m} className={cn("flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", enviando && "pointer-events-none opacity-60")}>
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="modalidad" checked={modalidad === m} onChange={() => setModalidad(m)} className="size-4 accent-primary" />
                {ETIQUETA_MODALIDAD[m]}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{DESCRIPCION_MODALIDAD[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {ofrece && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {modalidad === "costo_adicional" && (
              <Field data-invalid={!!errores.importe || undefined}>
                <FieldLabel htmlFor="cert-importe">Importe del certificado (S/)</FieldLabel>
                <Input id="cert-importe" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={enviando} />
                {errores.importe && <FieldError>{errores.importe}</FieldError>}
              </Field>
            )}
            <Field data-invalid={!!errores.nota_minima || undefined}>
              <FieldLabel htmlFor="cert-nota">Nota mínima (opcional)</FieldLabel>
              <Input id="cert-nota" inputMode="decimal" value={notaMinima} onChange={(e) => setNotaMinima(e.target.value)} disabled={enviando} placeholder={String(notaAprobatoria)} />
              <FieldDescription>Además de aprobar (nota aprobatoria del curso: {notaAprobatoria}).</FieldDescription>
              {errores.nota_minima && <FieldError>{errores.nota_minima}</FieldError>}
            </Field>
            <Field data-invalid={!!errores.horas_academicas || undefined}>
              <FieldLabel htmlFor="cert-horas">Horas académicas (opcional)</FieldLabel>
              <Input id="cert-horas" inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value)} disabled={enviando} />
              <FieldDescription>Se imprime solo si la indicas.</FieldDescription>
              {errores.horas_academicas && <FieldError>{errores.horas_academicas}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={!!errores.requisitos_adicionales || undefined}>
            <FieldLabel htmlFor="cert-req">Requisitos adicionales (opcional)</FieldLabel>
            <Textarea id="cert-req" rows={2} maxLength={2000} value={requisitos} onChange={(e) => setRequisitos(e.target.value)} disabled={enviando} placeholder="Ej.: Presentar el proyecto final." />
            <FieldDescription>Se muestran al estudiante. El administrador confirma su cumplimiento al autorizar la emisión.</FieldDescription>
            {errores.requisitos_adicionales && <FieldError>{errores.requisitos_adicionales}</FieldError>}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Plantilla</span>
              <select className="h-8 w-full rounded-lg border bg-background px-2" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} disabled={enviando}>
                <option value="">Predeterminada de la institución</option>
                {plantillas.filter((p) => p.activo || p.id === plantilla).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Firmante</span>
              <select className="h-8 w-full rounded-lg border bg-background px-2" value={firmante} onChange={(e) => setFirmante(e.target.value)} disabled={enviando}>
                <option value="">Sin firmante</option>
                {firmantes.filter((f) => f.activo || f.id === firmante).map((f) => <option key={f.id} value={f.id}>{f.nombre} — {f.cargo}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      <Button type="submit" size="sm" disabled={enviando}>
        {enviando && <Loader2 className="animate-spin" aria-hidden />}
        Guardar certificación
      </Button>
    </form>
  )
}
