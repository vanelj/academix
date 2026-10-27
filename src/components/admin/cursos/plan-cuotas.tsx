"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleAlert, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { formatoSoles } from "@/components/admin/cursos/curso-ui"
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
import { eliminarCuotaPlan, guardarCuotaPlan } from "@/lib/cursos/plan-cuotas"
import type { CuotaPlan } from "@/lib/cursos/datos"
import { notificar } from "@/lib/notificaciones"
import {
  CONCEPTO_MAX,
  DESCRIPCION_VENCIMIENTO_MAX,
  cuotaPlanSchema,
  textoVencimiento,
  type CuotaPlanValues,
} from "@/lib/validations/plan-cuotas"

/**
 * Cronograma de mensualidades del curso. V5 lo copia a las cuotas del
 * estudiante al confirmar la matrícula (vencimiento = inicio del grupo + días).
 */
export function PlanCuotas({ cursoId, plan, importeCurso }: { cursoId: string; plan: CuotaPlan[]; importeCurso: number }) {
  const router = useRouter()
  const [editando, setEditando] = useState<{ id: string | null; valores: CuotaPlanValues } | null>(null)
  const [eliminar, setEliminar] = useState<CuotaPlan | null>(null)
  const [procesando, setProcesando] = useState(false)

  const total = Math.round(plan.reduce((s, c) => s + c.importe, 0) * 100) / 100
  const difiere = plan.length > 0 && Math.abs(total - importeCurso) >= 0.005
  const siguiente = (plan.at(-1)?.numero ?? 0) + 1

  async function confirmarEliminar() {
    if (!eliminar || procesando) return
    setProcesando(true)
    const op = notificar.operacion("Eliminando cuota…")
    try {
      const r = await eliminarCuotaPlan(cursoId, eliminar.id)
      if (r.ok) {
        op.exito("Cuota eliminada del plan")
        setEliminar(null)
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo eliminar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo eliminar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="space-y-3">
      {plan.length === 0 ? (
        <p className="flex gap-2 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Sin plan de cuotas no se aceptan solicitudes de matrícula para este curso.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Plan de cuotas</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">N.°</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Concepto</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Importe</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Vence</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {plan.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                  <td className="px-3 py-2">{c.concepto}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoSoles.format(c.importe)}</td>
                  <td className="px-3 py-2">
                    <span className={c.dias_desde_inicio === null ? "text-destructive" : ""}>{textoVencimiento(c.dias_desde_inicio)}</span>
                    {c.descripcion_vencimiento && <span className="block text-xs text-muted-foreground">{c.descripcion_vencimiento}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar cuota ${c.numero}`}
                      onClick={() =>
                        setEditando({
                          id: c.id,
                          valores: {
                            numero: String(c.numero),
                            concepto: c.concepto,
                            importe: c.importe.toFixed(2),
                            dias_desde_inicio: c.dias_desde_inicio === null ? "" : String(c.dias_desde_inicio),
                            descripcion_vencimiento: c.descripcion_vencimiento ?? "",
                          },
                        })
                      }
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Eliminar cuota ${c.numero}`} onClick={() => setEliminar(c)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={2}>Total del plan</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoSoles.format(total)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {difiere && (
        <p className="flex gap-2 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          La suma de las cuotas ({formatoSoles.format(total)}) no coincide con el importe del curso ({formatoSoles.format(importeCurso)}). Revisa si es intencional.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Los cambios solo se aplican a matrículas que se confirmen después; las cuotas ya generadas no cambian.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setEditando({
            id: null,
            valores: { numero: String(siguiente), concepto: "Mensualidad", importe: "", dias_desde_inicio: plan.length === 0 ? "0" : "", descripcion_vencimiento: "" },
          })
        }
      >
        <Plus aria-hidden />
        Añadir cuota
      </Button>

      {editando && (
        <FormularioCuota
          key={editando.id ?? "nueva"}
          cursoId={cursoId}
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
            <DialogTitle>¿Eliminar la cuota {eliminar?.numero} del plan?</DialogTitle>
            <DialogDescription>Las matrículas ya confirmadas conservan sus cuotas. Solo cambia el plan para las próximas matrículas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={procesando}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormularioCuota({
  cursoId,
  id,
  inicial,
  alCerrar,
  alGuardar,
}: {
  cursoId: string
  id: string | null
  inicial: CuotaPlanValues
  alCerrar: () => void
  alGuardar: () => void
}) {
  const [v, setV] = useState(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const set = (k: keyof CuotaPlanValues, valor: string) => {
    setV((x) => ({ ...x, [k]: valor }))
    setErrores((e) => ({ ...e, [k]: "" }))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    const local = cuotaPlanSchema.safeParse(v)
    if (!local.success) {
      const campos: Record<string, string> = {}
      for (const i of local.error.issues) campos[String(i.path[0])] ??= i.message
      setErrores(campos)
      return
    }
    setEnviando(true)
    const op = notificar.operacion("Guardando cuota…")
    try {
      const r = await guardarCuotaPlan(cursoId, id, v)
      if (r.ok) {
        op.exito(id ? "Cuota actualizada" : "Cuota añadida al plan")
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

  const campo = (k: keyof CuotaPlanValues, etiqueta: string, props: React.ComponentProps<typeof Input>, ayuda?: string) => (
    <Field data-invalid={!!errores[k] || undefined}>
      <FieldLabel htmlFor={`cuota-${k}`}>{etiqueta}</FieldLabel>
      <Input id={`cuota-${k}`} value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errores[k] || undefined} disabled={enviando} {...props} />
      {ayuda && <FieldDescription>{ayuda}</FieldDescription>}
      {errores[k] && <FieldError>{errores[k]}</FieldError>}
    </Field>
  )

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{id ? "Editar cuota" : "Nueva cuota"}</DialogTitle>
          <DialogDescription>El vencimiento se calcula con la fecha de inicio de cada grupo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            {campo("numero", "N.°", { inputMode: "numeric", maxLength: 3 })}
            {campo("concepto", "Concepto", { maxLength: CONCEPTO_MAX })}
          </div>
          {campo("importe", "Importe (S/)", { inputMode: "decimal", placeholder: "150.00" })}
          {campo("dias_desde_inicio", "Días desde el inicio del grupo", { inputMode: "numeric", maxLength: 4 }, "0 = el día de inicio; 30 = un mes después.")}
          {campo("descripcion_vencimiento", "Descripción del vencimiento (opcional)", { maxLength: DESCRIPCION_VENCIMIENTO_MAX, placeholder: "Ej.: Primera semana del segundo mes" })}
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
