"use client"

import { useId } from "react"
import { FileDown, Settings2 } from "lucide-react"

import { LienzoCertificado } from "@/components/certificados/lienzo-certificado"
import { buttonVariants } from "@/components/ui/button"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { MODALIDADES, type Modalidad } from "@/lib/certificados/config"
import { MARCA_DEMOSTRACION, VALORES_DEMOSTRACION, camposPredeterminados, disenoEfectivo } from "@/lib/certificados/diseno"
import type { Firmante, PlantillaCertificado } from "@/lib/certificados/datos"
import type { Errores } from "@/lib/cursos/asistente-logica"
import { cn } from "@/lib/utils"
import type { CertificacionValues } from "@/lib/validations/certificacion-curso"

/**
 * Paso «Certificado» (opcional): condiciones de certificación del curso, en memoria.
 * Tres opciones claras (sin certificado / incluido o gratis / con costo) y el
 * diseño ya elegido. Nota mínima, horas, requisitos y firmante no se piden aquí:
 * se conservan tal cual y se editan en la ficha del curso. Se guarda con el curso
 * en el último paso.
 */
export function EditorCertificacion({
  valores,
  errores,
  plantillas,
  cursoGratuito,
  institucion,
  deshabilitado,
  alCambiar,
}: {
  valores: CertificacionValues
  errores: Errores
  plantillas: PlantillaCertificado[]
  /** Nota mínima, horas, requisitos y firmante se editan en la ficha del curso, no en el asistente. */
  firmantes?: Firmante[]
  notaAprobatoria?: string
  /** En un curso gratuito el certificado «sin costo» es «gratuito»; en uno de pago, «incluido». */
  cursoGratuito: boolean
  institucion: { nombre: string; logo_url: string | null }
  deshabilitado?: boolean
  alCambiar: (v: CertificacionValues) => void
}) {
  const id = useId()
  const set = <K extends keyof CertificacionValues>(k: K, v: CertificacionValues[K]) => alCambiar({ ...valores, [k]: v })
  const sinCosto: Modalidad = cursoGratuito ? "gratuito" : "incluido"
  // Tres opciones; una modalidad ya guardada que no está entre ellas se sigue mostrando.
  const opciones = MODALIDADES.filter((m) => m === "sin_certificado" || m === sinCosto || m === "costo_adicional" || m === valores.modalidad)

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿El curso entrega certificado?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {opciones.map((m) => (
            <label key={m} className="flex cursor-pointer flex-col gap-0.5 rounded-2xl border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name={`${id}-modalidad`} checked={valores.modalidad === m} onChange={() => set("modalidad", m)} disabled={deshabilitado} className="size-4 accent-primary" />
                {TITULO[m]}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{EXPLICACION[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {valores.modalidad === "costo_adicional" && (
        <Field data-invalid={!!errores.importe || undefined} className="max-w-xs">
          <FieldLabel htmlFor={`${id}-importe`}>Precio del certificado (S/)</FieldLabel>
          <Input id={`${id}-importe`} inputMode="decimal" value={valores.importe} onChange={(e) => set("importe", e.target.value)} disabled={deshabilitado} aria-invalid={!!errores.importe || undefined} />
          <FieldDescription>Lo paga al terminar el curso, solo quien aprueba y lo quiere.</FieldDescription>
          {errores.importe && <FieldError>{errores.importe}</FieldError>}
        </Field>
      )}

      {valores.modalidad !== "sin_certificado" && (
        <SelectorPlantilla
          nombre={`${id}-plantilla`}
          valor={valores.plantilla_id}
          plantillas={plantillas}
          firmante={valores.firmante_id}
          institucion={institucion}
          deshabilitado={deshabilitado}
          alElegir={(plantilla) => set("plantilla_id", plantilla)}
        />
      )}
    </div>
  )
}

/** Títulos y explicaciones en lenguaje sencillo: qué recibe el estudiante y cuándo paga. */
const TITULO: Record<Modalidad, string> = {
  sin_certificado: "Sin certificado",
  gratuito: "Sí, gratis",
  incluido: "Sí, incluido",
  costo_adicional: "Sí, con costo",
}
const EXPLICACION: Record<Modalidad, string> = {
  sin_certificado: "El curso no entrega certificado.",
  gratuito: "Quien aprueba lo recibe sin pagar nada.",
  incluido: "Quien aprueba lo recibe; ya está pagado con el curso.",
  costo_adicional: "Opcional: quien aprueba y lo quiere, lo paga al final.",
}

/**
 * Elección de plantilla con miniaturas (mismo lienzo que «Certificados › Plantillas»)
 * y vista previa en PDF por la ruta existente: datos ficticios, marca
 * «DEMOSTRACIÓN — SIN VALIDEZ», QR sin enlace. No emite ni registra certificados.
 */
function SelectorPlantilla({
  nombre,
  valor,
  plantillas,
  firmante,
  institucion,
  deshabilitado,
  alElegir,
}: {
  nombre: string
  valor: string | null
  plantillas: PlantillaCertificado[]
  firmante: string | null
  institucion: { nombre: string; logo_url: string | null }
  deshabilitado?: boolean
  alElegir: (plantilla: string | null) => void
}) {
  const valores = { ...VALORES_DEMOSTRACION, institucion: institucion.nombre }
  const predeterminada = plantillas.find((p) => p.predeterminada && p.activo) ?? null
  const visibles = plantillas.filter((p) => p.activo || p.id === valor)
  const pdf = (plantilla: PlantillaCertificado | null) =>
    `/admin/certificados/vista-previa?${plantilla ? `plantilla=${plantilla.id}` : "base=clasico"}${firmante ? `&firmante=${firmante}` : ""}`
  // «Predeterminada» (plantilla_id = null) es la plantilla marcada como tal en la institución
  // o, si no hay ninguna, el diseño «Clásico» de Academix. Se muestra una sola vez.
  const opciones: { clave: string; plantilla: PlantillaCertificado | null; titulo: string; detalle: string }[] = [
    {
      clave: "predeterminada",
      plantilla: predeterminada,
      titulo: predeterminada ? predeterminada.nombre : "Clásico de Academix",
      detalle: "Predeterminada · recomendada",
    },
    ...visibles.filter((p) => p.id !== predeterminada?.id).map((p) => ({ clave: p.id, plantilla: p, titulo: p.nombre, detalle: p.base === "propia" ? "Fondo propio" : "Otra plantilla de tu institución" })),
  ]

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Diseño del certificado</legend>
      <p className="text-xs text-muted-foreground">
        Ya viene elegido el predeterminado; cámbialo solo si quieres otro. Las muestras usan datos ficticios y la marca «{MARCA_DEMOSTRACION}».
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {opciones.map((o) => {
          const elegida = o.clave === "predeterminada" ? valor === null || valor === predeterminada?.id : o.clave === valor
          const p = o.plantilla
          return (
            <li key={o.clave} className="flex flex-col gap-1">
              <label className={cn("flex flex-1 cursor-pointer flex-col gap-2 rounded-2xl border p-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                elegida ? "border-primary bg-secondary" : "hover:bg-muted/50", deshabilitado && "pointer-events-none opacity-60")}>
                <LienzoCertificado
                  fondo={!p ? { tipo: "base", base: "clasico" } : p.base === "propia" ? { tipo: "sin_fondo" } : { tipo: "base", base: p.base }}
                  campos={p ? disenoEfectivo(p.base, p.diseno).campos : camposPredeterminados("clasico")}
                  valores={valores}
                  logoUrl={institucion.logo_url}
                  demostracion
                  className="h-auto w-full rounded-md border bg-white"
                />
                <span className="flex items-start gap-2">
                  <input type="radio" name={nombre} checked={elegida} onChange={() => alElegir(o.clave === "predeterminada" ? null : o.clave)} disabled={deshabilitado} className="mt-0.5 size-4 accent-primary" />
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{o.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{o.detalle}{p && !p.activo ? " · inactiva" : ""}</span>
                  </span>
                </span>
              </label>
              <a href={pdf(p)} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}
                aria-label={`Vista previa PDF de «${o.titulo}» (demostración, sin validez)`}>
                <FileDown aria-hidden />
                Vista previa PDF
              </a>
            </li>
          )
        })}
      </ul>
      <a href="/admin/certificados/plantillas" target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Settings2 aria-hidden />
        Crear o editar plantillas
      </a>
    </fieldset>
  )
}
