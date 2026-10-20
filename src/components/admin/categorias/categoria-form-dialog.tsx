"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { crearCategoria, editarCategoria } from "@/lib/categorias/acciones"
import type { Categoria } from "@/lib/categorias/datos"
import { notificar } from "@/lib/notificaciones"
import {
  CATEGORIA_DESCRIPCION_MAX,
  CATEGORIA_NOMBRE_MAX,
  categoriaSchema,
  type CategoriaValues,
} from "@/lib/validations/categoria"

/**
 * Diálogo para crear (categoria = null) o editar una categoría. El formulario
 * se monta al abrir el diálogo, así que siempre parte de los valores actuales.
 */
export function CategoriaFormDialog({
  abierto,
  onAbiertoChange,
  categoria,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  categoria: Categoria | null
}) {
  const [guardando, setGuardando] = useState(false)

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !guardando && onAbiertoChange(valor)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>{categoria ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          <DialogDescription>
            {categoria
              ? "Los cambios se reflejan en todos los cursos de esta categoría."
              : "Las categorías organizan los cursos de tu institución por áreas temáticas."}
          </DialogDescription>
        </DialogHeader>
        <Formulario
          categoria={categoria}
          guardando={guardando}
          setGuardando={setGuardando}
          alTerminar={() => onAbiertoChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  categoria,
  guardando,
  setGuardando,
  alTerminar,
}: {
  categoria: Categoria | null
  guardando: boolean
  setGuardando: (valor: boolean) => void
  alTerminar: () => void
}) {
  const router = useRouter()
  // Evita envíos duplicados (doble clic o Enter repetido).
  const bloqueo = useRef(false)
  const form = useForm<CategoriaValues>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nombre: categoria?.nombre ?? "", descripcion: categoria?.descripcion ?? "" },
    mode: "onTouched",
  })

  async function onSubmit(valores: CategoriaValues) {
    if (bloqueo.current) return
    if (categoria && !form.formState.isDirty) {
      notificar.info("No hay cambios para guardar.")
      return
    }
    bloqueo.current = true
    setGuardando(true)
    const operacion = notificar.operacion(categoria ? "Guardando cambios…" : "Creando categoría…")
    try {
      const resultado = categoria ? await editarCategoria(categoria.id, valores) : await crearCategoria(valores)
      if (resultado.ok) {
        operacion.exito(categoria ? "Los cambios se guardaron correctamente" : "Categoría creada correctamente", {
          descripcion: `«${valores.nombre.replace(/\s+/g, " ")}»`,
        })
        alTerminar()
        router.refresh()
      } else {
        if (resultado.campo) form.setError(resultado.campo, { message: resultado.mensaje }, { shouldFocus: true })
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo completar la operación", { descripcion: resultado.mensaje })
      }
    } catch {
      operacion.error("No se pudo completar la operación", {
        descripcion: "Revisa tu conexión e inténtalo de nuevo.",
      })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => form.handleSubmit(onSubmit)(e)} aria-busy={guardando}>
      <fieldset disabled={guardando} className="min-w-0 space-y-5">
        <Controller
          control={form.control}
          name="nombre"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="categoria-nombre">
                Nombre
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id="categoria-nombre"
                autoComplete="off"
                maxLength={CATEGORIA_NOMBRE_MAX}
                required
                aria-invalid={fieldState.invalid}
                autoFocus
              />
              {!fieldState.invalid && (
                <FieldDescription>Debe ser único dentro de tu institución.</FieldDescription>
              )}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="descripcion"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="categoria-descripcion">
                Descripción
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </FieldLabel>
              <Textarea
                {...field}
                id="categoria-descripcion"
                rows={3}
                maxLength={CATEGORIA_DESCRIPCION_MAX}
                aria-invalid={fieldState.invalid}
                className="max-h-48 min-h-20 resize-y"
              />
              <div className="flex items-start justify-between gap-3">
                <FieldError errors={[fieldState.error]} />
                <p className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {field.value.length} / {CATEGORIA_DESCRIPCION_MAX}
                </p>
              </div>
            </Field>
          )}
        />
      </fieldset>

      <DialogFooter className="mt-6">
        <DialogClose render={<Button type="button" variant="outline" disabled={guardando} />}>Cancelar</DialogClose>
        <Button type="submit" disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : categoria ? "Guardar cambios" : "Crear categoría"}
        </Button>
      </DialogFooter>
    </form>
  )
}
