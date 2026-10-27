"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarClock, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { nombreDia } from "@/components/admin/grupos/grupo-ui"
import { Button } from "@/components/ui/button"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { eliminarHorario, guardarHorario } from "@/lib/grupos/acciones"
import type { Horario } from "@/lib/grupos/datos"
import { notificar } from "@/lib/notificaciones"
import { DIAS_SEMANA, HORARIO_INICIAL, horarioSchema, type HorarioValues } from "@/lib/validations/grupo"

/** Horarios semanales del grupo: listar, agregar, editar y eliminar. */
export function HorariosGrupo({ grupoId, horarios }: { grupoId: string; horarios: Horario[] }) {
  const router = useRouter()
  const [editar, setEditar] = useState<Horario | "nuevo" | null>(null)
  const [borrar, setBorrar] = useState<Horario | null>(null)
  const [borrando, setBorrando] = useState(false)

  async function confirmarBorrado() {
    if (!borrar || borrando) return
    setBorrando(true)
    const op = notificar.operacion("Eliminando horario…")
    try {
      const r = await eliminarHorario(grupoId, borrar.id)
      if (r.ok) {
        op.exito("Horario eliminado")
        setBorrar(null)
        router.refresh()
      } else op.error("No se pudo eliminar el horario", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo eliminar el horario", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setBorrando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Horarios</CardTitle>
          <CardDescription>Sesiones semanales del grupo. El enlace de clase solo lo ven el docente y los matriculados.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditar("nuevo")} className="shrink-0">
          <Plus aria-hidden />
          Agregar
        </Button>
      </CardHeader>
      <CardContent>
        {horarios.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            <CalendarClock className="size-5" aria-hidden />
            Aún no hay horarios. Agrega al menos uno para abrir inscripciones.
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {horarios.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {nombreDia(h.dia_semana)} · {h.hora_inicio} – {h.hora_fin}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Link2 className="size-3 shrink-0" aria-hidden />
                    {h.enlace_clase ?? "Sin enlace de clase"}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditar(h)} aria-label={`Editar horario del ${nombreDia(h.dia_semana)}`}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setBorrar(h)} aria-label={`Eliminar horario del ${nombreDia(h.dia_semana)}`}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <HorarioDialog grupoId={grupoId} horario={editar} onCerrar={() => setEditar(null)} />

      <Dialog open={borrar !== null} onOpenChange={(v) => !v && !borrando && setBorrar(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Eliminar este horario?</DialogTitle>
            <DialogDescription>
              {borrar && `${nombreDia(borrar.dia_semana)} de ${borrar.hora_inicio} a ${borrar.hora_fin}.`} Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={borrando} autoFocus />}>Cancelar</DialogClose>
            <Button variant="destructive" onClick={confirmarBorrado} disabled={borrando}>
              {borrando && <Loader2 className="animate-spin" aria-hidden />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function HorarioDialog({ grupoId, horario, onCerrar }: { grupoId: string; horario: Horario | "nuevo" | null; onCerrar: () => void }) {
  const [guardando, setGuardando] = useState(false)
  return (
    <Dialog open={horario !== null} onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>{horario === "nuevo" ? "Agregar horario" : "Editar horario"}</DialogTitle>
          <DialogDescription>Día y horas de la sesión semanal.</DialogDescription>
        </DialogHeader>
        {horario !== null && (
          <FormularioHorario grupoId={grupoId} horario={horario === "nuevo" ? null : horario} guardando={guardando} setGuardando={setGuardando} alTerminar={onCerrar} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormularioHorario({
  grupoId,
  horario,
  guardando,
  setGuardando,
  alTerminar,
}: {
  grupoId: string
  horario: Horario | null
  guardando: boolean
  setGuardando: (v: boolean) => void
  alTerminar: () => void
}) {
  const router = useRouter()
  const bloqueo = useRef(false)
  const form = useForm<HorarioValues>({
    resolver: zodResolver(horarioSchema),
    defaultValues: horario
      ? { dia_semana: String(horario.dia_semana), hora_inicio: horario.hora_inicio, hora_fin: horario.hora_fin, enlace_clase: horario.enlace_clase ?? "" }
      : HORARIO_INICIAL,
    mode: "onTouched",
  })

  async function onSubmit(valores: HorarioValues) {
    if (bloqueo.current) return
    bloqueo.current = true
    setGuardando(true)
    const op = notificar.operacion("Guardando horario…")
    try {
      const r = await guardarHorario(grupoId, horario?.id ?? null, valores)
      if (r.ok) {
        // Advertencia: se guardó, pero el docente tiene otra clase a esa hora (requiere revisión).
        if (r.aviso) op.advertencia("Horario guardado correctamente", { descripcion: r.aviso })
        else op.exito("Horario guardado correctamente")
        alTerminar()
        router.refresh()
      } else {
        if (r.campo === "hora_inicio" || r.campo === "hora_fin") form.setError(r.campo, { message: r.mensaje })
        // Conflicto que impide guardar: dos sesiones del mismo grupo a la vez.
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar(r.campo ? "Se detectó un conflicto de horario" : "No se pudo guardar el horario", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo guardar el horario", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={guardando}>
      <fieldset disabled={guardando} className="grid min-w-0 gap-x-4 gap-y-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="dia_semana"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
              <FieldLabel htmlFor="horario-dia">Día</FieldLabel>
              <Select
                items={DIAS_SEMANA.map((d, i) => ({ value: String(i + 1), label: d }))}
                value={field.value}
                onValueChange={(v) => field.onChange(v ? String(v) : "1")}
                disabled={guardando}
              >
                <SelectTrigger id="horario-dia" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((d, i) => (
                    <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {(["hora_inicio", "hora_fin"] as const).map((nombre) => (
          <Controller
            key={nombre}
            control={form.control}
            name={nombre}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`horario-${nombre}`}>{nombre === "hora_inicio" ? "Hora de inicio" : "Hora de fin"}</FieldLabel>
                <Input {...field} id={`horario-${nombre}`} type="time" step={300} aria-invalid={fieldState.invalid} />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        ))}
        <Controller
          control={form.control}
          name="enlace_clase"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
              <FieldLabel htmlFor="horario-enlace">
                Enlace de clase <span className="font-normal text-muted-foreground">(opcional)</span>
              </FieldLabel>
              <Input {...field} id="horario-enlace" type="url" placeholder="https://meet.google.com/…" aria-invalid={fieldState.invalid} />
              {!fieldState.invalid && <FieldDescription>Zoom, Meet, Teams u otra plataforma. No se publica en el catálogo.</FieldDescription>}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </fieldset>
      <DialogFooter className="mt-6">
        <DialogClose render={<Button type="button" variant="outline" disabled={guardando} />}>Cancelar</DialogClose>
        <Button type="submit" disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : "Guardar horario"}
        </Button>
      </DialogFooter>
    </form>
  )
}
