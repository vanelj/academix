"use client"

import { useState } from "react"
import { CircleAlert, Pencil, Plus, Trash2, Undo2 } from "lucide-react"

import { formatoSoles } from "@/components/admin/cursos/curso-ui"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { planVigente, validarCuota, type CuotaLocal, type Errores, type ValoresCuota } from "@/lib/cursos/asistente-logica"
import { CONCEPTO_MAX, DESCRIPCION_VENCIMIENTO_MAX, textoVencimiento } from "@/lib/validations/plan-cuotas"

/**
 * Plan de cuotas (condiciones anteriores, paso Precio), en memoria: añadir, editar y quitar cuotas no
 * escribe nada; se guarda con el curso en el último paso (mismas validaciones que
 * la acción del servidor).
 */
export function EditorPlan({
  plan,
  importeCurso,
  matricula,
  alCambiar,
  deshabilitado,
}: {
  plan: CuotaLocal[]
  importeCurso: number
  matricula: number
  alCambiar: (plan: CuotaLocal[]) => void
  deshabilitado?: boolean
}) {
  const [editando, setEditando] = useState<{ clave: string | null; valores: ValoresCuota } | null>(null)
  const vigentes = planVigente(plan)
  const quitadas = plan.filter((c) => c.eliminada && c.existente)
  const total = vigentes.reduce((s, c) => s + Math.round((Number(c.valores.importe) || 0) * 100), 0) / 100
  const siguiente = vigentes.reduce((m, c) => Math.max(m, Number(c.valores.numero) || 0), 0) + 1

  function guardarCuota(clave: string | null, valores: ValoresCuota) {
    if (clave) alCambiar(plan.map((c) => (c.clave === clave ? { ...c, valores } : c)))
    else alCambiar([...plan, { clave: crypto.randomUUID(), existente: false, valores, original: null, eliminada: false }])
    setEditando(null)
  }

  const ordenadas = [...vigentes].sort((a, b) => Number(a.valores.numero) - Number(b.valores.numero))

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mensualidades que se generan al confirmar cada matrícula. La matrícula ({formatoSoles.format(matricula)}) se paga aparte, al inscribirse.
        Cambiar el plan no modifica las cuotas de matrículas ya confirmadas.
      </p>
      {ordenadas.length === 0 ? (
        <p className="flex gap-2 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Sin plan de cuotas no se aceptan solicitudes de matrícula. Agrega al menos una cuota antes de publicar.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
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
              {ordenadas.map((c) => {
                const dias = c.valores.dias_desde_inicio === "" ? null : Number(c.valores.dias_desde_inicio)
                return (
                  <tr key={c.clave} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{c.valores.numero}</td>
                    <td className="px-3 py-2">
                      {c.valores.concepto}
                      {!c.existente && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">Nueva</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatoSoles.format(Number(c.valores.importe) || 0)}</td>
                    <td className="px-3 py-2">
                      <span className={dias === null ? "text-destructive" : ""}>{textoVencimiento(dias)}</span>
                      {c.valores.descripcion_vencimiento && <span className="block text-xs text-muted-foreground">{c.valores.descripcion_vencimiento}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar cuota ${c.valores.numero}`} disabled={deshabilitado} onClick={() => setEditando({ clave: c.clave, valores: c.valores })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Quitar cuota ${c.valores.numero}`} disabled={deshabilitado}
                        onClick={() => alCambiar(plan.map((x) => (x.clave === c.clave ? { ...x, eliminada: true } : x)))}>
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  </tr>
                )
              })}
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
      {vigentes.length > 0 && Math.round(total * 100) !== Math.round(importeCurso * 100) && (
        <p className="flex gap-2 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          La suma de las cuotas ({formatoSoles.format(total)}) no coincide con el importe del curso ({formatoSoles.format(importeCurso)}). Debe cuadrar para publicar.
        </p>
      )}
      {quitadas.length > 0 && (
        <ul className="space-y-1 text-sm">
          {quitadas.map((c) => (
            <li key={c.clave} className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span className="line-through">Cuota {c.original?.numero ?? c.valores.numero}: {c.original?.concepto ?? c.valores.concepto}</span>
              <span>· se quitará al guardar</span>
              <Button size="xs" variant="ghost" disabled={deshabilitado} onClick={() => alCambiar(plan.map((x) => (x.clave === c.clave ? { ...x, eliminada: false } : x)))}>
                <Undo2 aria-hidden />
                Deshacer
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={deshabilitado}
        onClick={() =>
          setEditando({
            clave: null,
            valores: { numero: String(siguiente), concepto: "Mensualidad", importe: "", dias_desde_inicio: vigentes.length === 0 ? "0" : "", descripcion_vencimiento: "" },
          })
        }
      >
        <Plus aria-hidden />
        Añadir cuota
      </Button>

      {editando && (
        <FormularioCuota
          key={editando.clave ?? "nueva"}
          inicial={editando.valores}
          nueva={editando.clave === null}
          validar={(v) => validarCuota(v, plan, editando.clave)}
          alCerrar={() => setEditando(null)}
          alAceptar={(v) => guardarCuota(editando.clave, v)}
        />
      )}
    </div>
  )
}

function FormularioCuota({
  inicial,
  nueva,
  validar,
  alCerrar,
  alAceptar,
}: {
  inicial: ValoresCuota
  nueva: boolean
  validar: (v: ValoresCuota) => Errores
  alCerrar: () => void
  alAceptar: (v: ValoresCuota) => void
}) {
  const [v, setV] = useState(inicial)
  const [errores, setErrores] = useState<Errores>({})
  const set = (k: keyof ValoresCuota, valor: string) => {
    setV((x) => ({ ...x, [k]: valor }))
    setErrores((e) => ({ ...e, [k]: "" }))
  }

  function aceptar(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const errs = validar(v)
    if (Object.keys(errs).length) {
      setErrores(errs)
      return
    }
    alAceptar({ ...v, concepto: v.concepto.trim(), importe: v.importe.trim(), numero: v.numero.trim(), dias_desde_inicio: v.dias_desde_inicio.trim(), descripcion_vencimiento: v.descripcion_vencimiento.trim() })
  }

  const campo = (k: keyof ValoresCuota, etiqueta: string, props: React.ComponentProps<typeof Input>, ayuda?: string) => (
    <Field data-invalid={!!errores[k] || undefined}>
      <FieldLabel htmlFor={`cuota-${k}`}>{etiqueta}</FieldLabel>
      <Input id={`cuota-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errores[k] || undefined} {...props} />
      {ayuda && <FieldDescription>{ayuda}</FieldDescription>}
      {errores[k] && <FieldError>{errores[k]}</FieldError>}
    </Field>
  )

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{nueva ? "Nueva cuota" : "Editar cuota"}</DialogTitle>
          <DialogDescription>Se guarda junto con el curso al final del asistente. El vencimiento se calcula con la fecha de inicio de cada grupo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={aceptar} className="space-y-4" noValidate>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            {campo("numero", "N.°", { inputMode: "numeric", maxLength: 3 })}
            {campo("concepto", "Concepto", { maxLength: CONCEPTO_MAX })}
          </div>
          {campo("importe", "Importe (S/)", { inputMode: "decimal", placeholder: "150.00" })}
          {campo("dias_desde_inicio", "Días desde el inicio del grupo", { inputMode: "numeric", maxLength: 4 }, "0 = el día de inicio; 30 = un mes después.")}
          {campo("descripcion_vencimiento", "Descripción del vencimiento (opcional)", { maxLength: DESCRIPCION_VENCIMIENTO_MAX, placeholder: "Ej.: Primera semana del segundo mes" })}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit">{nueva ? "Añadir al plan" : "Aplicar cambios"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
