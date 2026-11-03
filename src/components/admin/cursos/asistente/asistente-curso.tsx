"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  CloudOff,
  GraduationCap,
  History,
  ImageIcon,
  Loader2,
  ReceiptText,
  TriangleAlert,
} from "lucide-react"

import { CertificacionCursoForm } from "@/components/admin/cursos/certificacion-curso"
import { AvisoPrecio, CampoArea, CampoTexto, DESCRIPCION_COBRO, Seccion } from "@/components/admin/cursos/curso-form"
import { formatoSoles } from "@/components/admin/cursos/curso-ui"
import { PlanCuotas } from "@/components/admin/cursos/plan-cuotas"
import { PasoGrupos, type PasoGruposHandle } from "@/components/admin/cursos/asistente/paso-grupos"
import { PasoRevision } from "@/components/admin/cursos/asistente/paso-revision"
import { PortadaCurso } from "@/components/admin/cursos/asistente/portada-curso"
import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { crearCurso, editarCurso } from "@/lib/cursos/acciones"
import { versionCondiciones } from "@/lib/cursos/asistente-acciones"
import {
  CAMPOS_PASO,
  PASOS,
  TOTAL_PASOS,
  baseTrasGuardar,
  camposModificados,
  estadoPasos,
  hayCambiosSinGuardar,
  type NumeroPaso,
  type PasoFormulario,
  type GuardadorAsistente,
  type ResultadoGuardadoAsistente,
  valoresParaGuardar,
} from "@/lib/cursos/asistente-logica"
import type { DatosAsistente } from "@/lib/cursos/asistente"
import { eliminarPortadaCurso, subirPortadaCurso } from "@/lib/cursos/portada-acciones"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import {
  CONDICIONES_ESPECIALES_MAX,
  CURSO_DESCRIPCION_MAX,
  CURSO_NOMBRE_MAX,
  REQUISITOS_MAX,
  TIPOS_COBRO,
  cursoSchema,
  importeTotalCondiciones,
  type CursoValues,
} from "@/lib/validations/curso"

type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "error"
const CLAVE_RESPALDO = (cursoId: string | null) => `academix:asistente-curso:${cursoId ?? "nuevo"}`
/** Copias locales más antiguas que esto se descartan. */
const RESPALDO_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

type Respaldo = { valores: CursoValues; fecha: number }

/** Copia local de cambios sin guardar (solo en el navegador; null en el servidor). */
function leerRespaldo(cursoId: string | null, guardados: CursoValues): Respaldo | null {
  if (typeof window === "undefined") return null
  try {
    const crudo = localStorage.getItem(CLAVE_RESPALDO(cursoId))
    if (!crudo) return null
    const r = JSON.parse(crudo) as Respaldo
    if (Date.now() - r.fecha < RESPALDO_VIGENCIA_MS && r.valores?.condiciones && hayCambiosSinGuardar(guardados, r.valores)) return r
    localStorage.removeItem(CLAVE_RESPALDO(cursoId))
  } catch {
    // Almacenamiento no disponible o copia dañada: se ignora.
  }
  return null
}

const sinSuscripcion = () => () => {}

/**
 * Asistente de creación y configuración de cursos (6 pasos en una sola página).
 * - Pasos 1–3 comparten un formulario y se guardan con las acciones existentes
 *   (crearCurso / editarCurso: mismas validaciones, RLS y reglas de V5).
 * - Pasos 4–5 reutilizan los módulos de grupos, horarios y certificación, que
 *   guardan por sí mismos. Paso 6: revisión y publicación.
 * - El curso nuevo se crea como borrador al guardar el paso 1; se puede salir y
 *   continuar más tarde desde el listado de cursos.
 */
export function AsistenteCurso({ datos, pasoInicial }: { datos: DatosAsistente; pasoInicial: NumeroPaso }) {
  const router = useRouter()
  const cursoId = datos.curso?.id ?? null
  const tieneCondiciones = datos.curso?.tieneCondiciones === true
  const [paso, setPaso] = useState<NumeroPaso>(cursoId ? pasoInicial : 1)
  const [base, setBase] = useState<CursoValues>(datos.valores)
  const [estado, setEstado] = useState<EstadoGuardado>("guardado")
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null)
  const [portadaPendiente, setPortadaPendiente] = useState<Blob | null>(null)
  const [portadaProcesando, setPortadaProcesando] = useState(false)
  const [quitandoPortada, setQuitandoPortada] = useState(false)
  const [pendientesExternos, setPendientesExternos] = useState({ grupos: false, certificacion: false })
  // La copia local se lee una sola vez; el aviso se muestra solo tras montar (sin desajustes de hidratación).
  const [respaldoInicial] = useState(() => leerRespaldo(cursoId, datos.valores))
  const [respaldoResuelto, setRespaldoResuelto] = useState(false)
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false)
  const respaldo = montado && !respaldoResuelto ? respaldoInicial : null
  // Versión de las condiciones que este asistente conoce: la del servidor o la de su último guardado.
  const versionServidor = datos.curso?.condiciones?.actualizado_en ?? null
  const [versionPropia, setVersionPropia] = useState<string | null | undefined>(undefined)
  const bloqueo = useRef(false)
  const pasoGruposRef = useRef<PasoGruposHandle | null>(null)
  const guardarCertificacionRef = useRef<GuardadorAsistente | null>(null)
  const registrarGuardadoCertificacion = useCallback((guardar: GuardadorAsistente | null, pendiente: boolean) => {
    guardarCertificacionRef.current = guardar
    setPendientesExternos((actual) => actual.certificacion === pendiente ? actual : { ...actual, certificacion: pendiente })
  }, [])
  const actualizarPendientesGrupos = useCallback((pendiente: boolean) => {
    setPendientesExternos((actual) => actual.grupos === pendiente ? actual : { ...actual, grupos: pendiente })
  }, [])

  const form = useForm<CursoValues>({ resolver: zodResolver(cursoSchema), defaultValues: datos.valores, mode: "onTouched" })
  const actuales = useWatch({ control: form.control }) as CursoValues
  const tipoCobro = useWatch({ control: form.control, name: "condiciones.tipo_cobro" })
  const permiteReserva = useWatch({ control: form.control, name: "condiciones.permite_reserva" })

  const cambios = hayCambiosSinGuardar(base, actuales) || portadaPendiente !== null || pendientesExternos.grupos || pendientesExternos.certificacion
  useProtegerCambios(cambios)

  // --- Copia local de recuperación (solo texto del curso; nada sensible) ---------------
  useEffect(() => {
    // Mientras se ofrece recuperar una copia, no se sobrescribe.
    if (respaldo) return
    const id = setTimeout(() => {
      try {
        if (hayCambiosSinGuardar(base, actuales)) {
          localStorage.setItem(CLAVE_RESPALDO(cursoId), JSON.stringify({ valores: actuales, fecha: Date.now() }))
        } else {
          localStorage.removeItem(CLAVE_RESPALDO(cursoId))
        }
      } catch {
        // Sin almacenamiento local: el asistente funciona igual.
      }
    }, 800)
    return () => clearTimeout(id)
  }, [actuales, base, cursoId, respaldo])

  // URL compartible con el paso actual (sin recargar la página).
  useEffect(() => {
    if (!cursoId) return
    const url = new URL(window.location.href)
    url.searchParams.set("paso", String(paso))
    window.history.replaceState(window.history.state, "", url)
  }, [paso, cursoId])

  const estados = estadoPasos({
        cursoId,
        base,
        actuales,
        tieneCondiciones,
        categoriaActiva: datos.curso ? datos.curso.categoria?.activo === true : true,
        importeCursoGuardado: datos.curso?.condiciones?.importe_curso ?? 0,
        tipoCobroGuardado: datos.curso?.condiciones?.tipo_cobro,
        plan: datos.plan,
        grupos: datos.grupos,
        certificacionConfigurada: datos.certificacion.disponible ? datos.certificacion.config !== null : null,
        estadoCurso: datos.curso?.estado ?? null,
      })
  const completados = PASOS.filter((p) => estados.pasos[p.numero].completo).length

  // --- Guardado del paso actual ----------------------------------------------------------
  async function guardarPaso(p: PasoFormulario): Promise<boolean> {
    const campos = [...CAMPOS_PASO[p], ...(p === 3 ? (["condiciones.requisitos", "condiciones.condiciones_especiales"] as const) : [])]
    // Paso 3 con cobro gratuito o sin reserva: sus campos ocultos no deben bloquear.
    const validos = await form.trigger(campos as never)
    if (!validos) {
      notificar.error("Revisa los campos marcados", { descripcion: "Hay datos de este paso que deben corregirse." })
      return false
    }
    const hayPortada = p === 1 && portadaPendiente !== null
    if (cursoId && camposModificados(p, base, actuales).length === 0 && !hayPortada && !(p === 3 && !tieneCondiciones)) return true

    if (bloqueo.current) return false
    bloqueo.current = true
    setEstado("guardando")
    const operacion = notificar.operacion("Guardando…")
    try {
      // No sobrescribir condiciones modificadas desde otra pestaña o por otro administrador.
      if (cursoId && (tieneCondiciones || p === 3)) {
        const v = await versionCondiciones(cursoId)
        if (!v.ok) {
          setEstado("error")
          operacion.error("No se pudo verificar la versión del curso", {
            descripcion: "No se guardó este paso para evitar sobrescribir condiciones que podrían haber cambiado en otra sesión. Inténtalo de nuevo.",
          })
          return false
        }
        if (v.actualizadoEn !== versionServidor && v.actualizadoEn !== versionPropia) {
          setEstado("error")
          operacion.advertencia("Las condiciones cambiaron en otra sesión", {
            descripcion: "Recarga la página para ver la versión más reciente antes de guardar. Tus datos siguen aquí.",
          })
          return false
        }
      }

      const enviados = valoresParaGuardar(p, base, actuales, tieneCondiciones)
      const r = cursoId ? await editarCurso(cursoId, enviados) : await crearCurso({ ...enviados, configurarCondiciones: false })
      if (!r.ok) {
        if (r.campo) form.setError(r.campo, { message: r.mensaje }, { shouldFocus: true })
        setEstado("error")
        ;(r.gravedad === "advertencia" ? operacion.advertencia : operacion.error)("No se pudo guardar", { descripcion: r.mensaje })
        return false
      }

      setBase(baseTrasGuardar(p, enviados))
      setUltimoGuardado(new Date())
      if (cursoId && (tieneCondiciones || p === 3)) {
        const nueva = await versionCondiciones(cursoId)
        if (nueva.ok) setVersionPropia(nueva.actualizadoEn)
      }

      let avisoPortada: string | null = null
      if (hayPortada && portadaPendiente) {
        const fd = new FormData()
        fd.set("portada", portadaPendiente, "portada")
        const rp = await subirPortadaCurso(r.id, fd)
        if (rp.ok) setPortadaPendiente(null)
        else avisoPortada = rp.mensaje
      }

      if (!cursoId) {
        borrarRespaldo(null)
        operacion.exito("Curso creado como borrador", {
          descripcion: avisoPortada ?? "Aún no aparece en el catálogo. Continúa con sus características.",
        })
        router.replace(`/admin/cursos/${r.id}/asistente?paso=2`)
        return false // la página cambia de ruta: no avanzar aquí
      }

      if (avisoPortada) operacion.advertencia("Datos guardados; la portada no se pudo subir", { descripcion: avisoPortada })
      else if (r.aviso) operacion.advertencia("Guardado con avisos", { descripcion: r.aviso })
      else operacion.exito("Paso guardado")
      setEstado("guardado")
      router.refresh()
      return true
    } catch {
      setEstado("error")
      operacion.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo. Tus datos siguen en el formulario." })
      return false
    } finally {
      bloqueo.current = false
    }
  }

  async function irA(destino: NumeroPaso) {
    if (destino === paso || bloqueo.current || portadaProcesando) return

    // Retroceder solo cambia el paso. Las pantallas de grupos y certificación
    // siguen montadas y conservan lo escrito; no se envía ni borra nada.
    if (destino < paso) {
      setPaso(destino)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // La navegación por el indicador también respeta el orden de validación.
    if (destino > paso + 1) return

    if (!cursoId && destino > 1) {
      // El curso aún no existe: se crea guardando el paso 1.
      await guardarPaso(1)
      return
    }

    if (destino > paso && paso <= 3) {
      const ok = await guardarPaso(paso as PasoFormulario)
      if (!ok) return
    } else if (paso === 4 || paso === 5) {
      bloqueo.current = true
      setEstado("guardando")
      const operacion = notificar.operacion("Guardando cambios…")
      try {
        const resultado: ResultadoGuardadoAsistente | undefined = paso === 4
          ? await pasoGruposRef.current?.guardarPendientes()
          : datos.certificacion.disponible
            ? await guardarCertificacionRef.current?.()
            : { ok: true, guardado: false }

        if (!resultado) {
          setEstado("error")
          operacion.error("No se pudieron guardar los cambios", { descripcion: "No se pudo preparar el guardado de este paso. Inténtalo de nuevo." })
          return
        }
        if (!resultado.ok) {
          setEstado("error")
          operacion.error("No se pudieron guardar los cambios", { descripcion: resultado.mensaje })
          return
        }

        setEstado("guardado")
        if (resultado.guardado !== false) setUltimoGuardado(new Date())
        if (resultado.avisos?.length) {
          operacion.advertencia("Cambios guardados con avisos", { descripcion: resultado.avisos.join(" ") })
        } else if (resultado.guardado !== false) {
          operacion.exito("Cambios guardados")
        } else {
          operacion.exito("No hay cambios pendientes")
        }
      } catch {
        setEstado("error")
        operacion.error("No se pudieron guardar los cambios", { descripcion: "Revisa tu conexión e inténtalo de nuevo. El paso no cambió." })
        return
      } finally {
        bloqueo.current = false
      }
    }

    setPaso(destino)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function quitarPortada() {
    if (!cursoId || quitandoPortada) return
    setQuitandoPortada(true)
    const op = notificar.operacion("Quitando portada…")
    const r = await eliminarPortadaCurso(cursoId).catch(() => ({ ok: false as const, mensaje: "Revisa tu conexión e inténtalo de nuevo." }))
    setQuitandoPortada(false)
    if (r.ok) {
      op.exito("Portada quitada", { descripcion: "El catálogo mostrará la portada generada de la categoría." })
      router.refresh()
    } else op.error("No se pudo quitar la portada", { descripcion: r.mensaje })
  }

  const nombre = actuales.nombre?.trim() || "Nuevo curso"
  const pasoInfo = PASOS[paso - 1]
  const esFormulario = paso <= 3

  return (
    <div className="space-y-6 pb-28">
      {/* Cabecera: curso, paso, progreso y estado de guardado */}
      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                {cursoId ? "Configuración del curso" : "Nuevo curso"} · Paso {paso} de {TOTAL_PASOS}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold break-words">{nombre}</h2>
              <p className="text-sm text-muted-foreground">{pasoInfo.descripcion}</p>
            </div>
            <EstadoGuardadoChip estado={cambios && estado === "guardado" ? "pendiente" : estado} ultimo={ultimoGuardado} onReintentar={paso < TOTAL_PASOS ? () => irA((paso + 1) as NumeroPaso) : undefined} />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{completados} de {TOTAL_PASOS} pasos completos</span>
              <span>{Math.round((completados / TOTAL_PASOS) * 100)} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progreso de la configuración"
              aria-valuemin={0} aria-valuemax={TOTAL_PASOS} aria-valuenow={completados}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(completados / TOTAL_PASOS) * 100}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Los cambios confirmados se guardan en Supabase. La recuperación local dura hasta 7 días, solo en este navegador y cubre los datos de los pasos 1–3; no se sincroniza entre dispositivos. Grupos, horarios y certificación se guardan desde sus formularios o antes de continuar.
          </p>
          <nav aria-label="Pasos del asistente">
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PASOS.map((p) => {
                const e = estados.pasos[p.numero]
                const actual = p.numero === paso
                const habilitado = (cursoId !== null || p.numero === 1) && p.numero <= paso + 1
                return (
                  <li key={p.numero}>
                    <button
                      type="button"
                      onClick={() => irA(p.numero)}
                      disabled={!habilitado || estado === "guardando"}
                      aria-current={actual ? "step" : undefined}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 rounded-2xl border p-2.5 text-left text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                        actual ? "border-primary bg-secondary" : "hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                          e.completo ? "bg-success text-success-foreground" : actual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                        aria-hidden
                      >
                        {e.completo ? <Check className="size-3.5" /> : p.numero}
                      </span>
                      <span className="leading-tight font-semibold">{p.titulo}</span>
                      <span className="sr-only">{e.completo ? "(completo)" : e.opcional ? "(opcional, pendiente)" : "(pendiente)"}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        </CardContent>
      </Card>

      {respaldo && (
        <Card size="sm" className="ring-warning/40">
          <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-2">
              <History className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Encontramos una copia local de los pasos 1–3, guardada en este navegador el {new Date(respaldo.fecha).toLocaleString("es-PE")}.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => { form.reset(respaldo.valores, { keepDefaultValues: true }); setRespaldoResuelto(true) }}>
                Recuperar cambios
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { borrarRespaldo(cursoId); setRespaldoResuelto(true) }}>
                Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {estados.pasos[paso].pendientes.length > 0 && paso !== 6 && (
        <div role="status" className="flex gap-2 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <ul className="space-y-0.5">{estados.pasos[paso].pendientes.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      {/* Pasos 1–3: un formulario compartido */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); void irA(Math.min(paso + 1, TOTAL_PASOS) as NumeroPaso) }} className={cn("space-y-6", !esFormulario && "hidden")}>
        <fieldset disabled={estado === "guardando"} className="min-w-0 space-y-6">
          {paso === 1 && (
            <>
              <Seccion icono={BookOpen} titulo="Información básica" descripcion="Cómo se identifica el curso en tu institución y en el catálogo.">
                <CampoTexto control={form.control} name="nombre" label="Nombre del curso" required maxLength={CURSO_NOMBRE_MAX} className="sm:col-span-2" />
                <Controller
                  control={form.control}
                  name="categoria_id"
                  render={({ field, fieldState }) => {
                    const actual = datos.categorias.find((c) => c.id === field.value)
                    return (
                      <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                        <FieldLabel htmlFor="asistente-categoria">Categoría<span className="text-destructive" aria-hidden>*</span></FieldLabel>
                        <Select
                          items={datos.categorias.map((c) => ({ value: c.id, label: c.activo ? c.nombre : `${c.nombre} (inactiva)` }))}
                          value={field.value || null}
                          onValueChange={(v) => field.onChange(v ? String(v) : "")}
                        >
                          <SelectTrigger id="asistente-categoria" className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                            <SelectValue placeholder="Selecciona una categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            {datos.categorias.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.activo ? c.nombre : `${c.nombre} (inactiva)`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {actual && !actual.activo ? (
                          <p className="flex gap-1.5 text-xs text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />La categoría está inactiva: el curso no se mostrará en el catálogo hasta que la actives.</p>
                        ) : (
                          !fieldState.invalid && <FieldDescription>Solo las categorías activas de tu institución. <Link href="/admin/categorias" target="_blank" className="underline">Gestionar categorías</Link></FieldDescription>
                        )}
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )
                  }}
                />
                <CampoArea control={form.control} name="descripcion" label="Descripción" max={CURSO_DESCRIPCION_MAX} className="sm:col-span-2"
                  descripcion="Presentación del curso: se muestra en el catálogo y en la ficha pública." />
              </Seccion>
              <Seccion icono={ImageIcon} titulo="Portada del curso" descripcion="La misma imagen se usa en el catálogo, la ficha pública y los listados.">
                <div className="sm:col-span-2">
                  <PortadaCurso
                    portadaActual={datos.portada.url}
                    disponible={datos.portada.disponible}
                    deshabilitado={estado === "guardando"}
                    pendiente={portadaPendiente}
                    alCambiarPendiente={setPortadaPendiente}
                    alCambiarProcesando={setPortadaProcesando}
                    alQuitarActual={cursoId && datos.portada.url ? quitarPortada : undefined}
                    quitando={quitandoPortada}
                  />
                  {!cursoId && datos.portada.disponible && <p className="mt-2 text-xs text-muted-foreground">La portada se sube al guardar este paso, cuando se crea el curso.</p>}
                </div>
              </Seccion>
            </>
          )}

          {paso === 2 && (
            <Seccion icono={GraduationCap} titulo="Características y requisitos" descripcion="Datos académicos del curso y lo que se pide para inscribirse.">
              <div className="grid gap-2">
                <p className="text-sm font-medium">Modalidad</p>
                <p className="flex h-8 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground">Virtual</p>
                <p className="text-xs text-muted-foreground">Todos los cursos de la plataforma son virtuales.</p>
              </div>
              <CampoTexto control={form.control} name="nota_aprobatoria" label="Nota aprobatoria" required inputMode="decimal" descripcion="Escala de 0 a 20." />
              <CampoArea control={form.control} name="condiciones.requisitos" label="Requisitos del curso" max={REQUISITOS_MAX} className="sm:col-span-2"
                descripcion="Requisitos académicos o documentos que pide este curso." />
              <CampoArea control={form.control} name="condiciones.condiciones_especiales" label="Condiciones particulares" max={CONDICIONES_ESPECIALES_MAX} className="sm:col-span-2"
                descripcion="Se suman a las políticas generales de tu institución." />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                La duración la marcan las fechas de cada grupo (paso 4) y las horas académicas se declaran en la certificación (paso 5).
                {!tieneCondiciones && " Los requisitos y condiciones particulares se guardan junto con las condiciones económicas del paso 3."}
              </p>
            </Seccion>
          )}

          {paso === 3 && (
            <Seccion icono={ReceiptText} titulo="Precios y condiciones" descripcion="Cada institución define sus propias condiciones. Los pagos son externos (Yape, Plin, transferencia o depósito) y los verifica tu institución.">
              <Controller
                control={form.control}
                name="condiciones.tipo_cobro"
                render={({ field }) => (
                  <fieldset className="grid gap-2 sm:col-span-2">
                    <legend className="mb-2 text-sm font-medium">Tipo de cobro</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {TIPOS_COBRO.map((tipo) => (
                        <label key={tipo} className={cn("flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                          field.value === tipo ? "border-primary bg-secondary" : "hover:bg-muted/50")}>
                          <input type="radio" name={field.name} value={tipo} checked={field.value === tipo} onChange={() => field.onChange(tipo)} className="mt-0.5 size-4 accent-primary" />
                          <span>
                            <span className="font-medium">{DESCRIPCION_COBRO[tipo].titulo}</span>
                            <span className="block text-xs text-muted-foreground">{DESCRIPCION_COBRO[tipo].texto}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              />
              {tipoCobro !== "gratuito" && (
                <>
                  <CampoTexto control={form.control} name="condiciones.matricula_importe" label="Importe de matrícula (S/)" required inputMode="decimal" />
                  <CampoTexto control={form.control} name="condiciones.importe_curso" label="Importe del curso (S/)" required inputMode="decimal"
                    descripcion={tipoCobro === "cuotas" ? "Se reparte en el plan de cuotas (debajo, al guardar)." : undefined} />
                  <Controller
                    control={form.control}
                    name="condiciones.permite_reserva"
                    render={({ field }) => (
                      <label className="flex items-start gap-3 rounded-2xl border p-3 sm:col-span-2">
                        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} onBlur={field.onBlur} />
                        <span className="text-sm">
                          <span className="font-medium">Permitir reserva de vacante</span>
                          <span className="block text-muted-foreground">El estudiante separa su vacante con un pago previo y tiene un plazo para completar la matrícula.</span>
                        </span>
                      </label>
                    )}
                  />
                  {permiteReserva && (
                    <>
                      <CampoTexto control={form.control} name="condiciones.reserva_importe" label="Pago de la reserva (S/)" required inputMode="decimal" descripcion="Mayor que cero y no superior al importe total." />
                      <CampoTexto control={form.control} name="condiciones.reserva_plazo_horas" label="Plazo de la reserva (horas)" required inputMode="numeric" descripcion="Por ejemplo, 48 = 2 días." />
                      <Controller
                        control={form.control}
                        name="condiciones.reserva_descuenta_matricula"
                        render={({ field }) => (
                          <label className="flex items-center gap-3 text-sm sm:col-span-2">
                            <input type="checkbox" className="size-4 accent-primary" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                            El pago de la reserva se descuenta del importe de la matrícula
                          </label>
                        )}
                      />
                    </>
                  )}
                </>
              )}
              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <CampoTexto control={form.control} name="precio" label="Precio publicado en el catálogo (S/)" required inputMode="decimal"
                  descripcion="Es el importe que verán los visitantes." />
                <Button type="button" variant="outline" size="sm" className="mb-6"
                  onClick={() => {
                    const c = form.getValues("condiciones")
                    const total = importeTotalCondiciones({ tipo_cobro: c.tipo_cobro, matricula_importe: Number(c.matricula_importe) || 0, importe_curso: Number(c.importe_curso) || 0 })
                    form.setValue("precio", total.toFixed(2).replace(/\.00$/, ""), { shouldDirty: true, shouldValidate: true })
                  }}>
                  Usar el total de las condiciones
                </Button>
              </div>
              <div className="sm:col-span-2"><AvisoPrecio control={form.control} /></div>
            </Seccion>
          )}
        </fieldset>
      </form>

      {paso === 3 && cursoId && (
        <Card>
          <CardContent className="space-y-3">
            <h3 className="text-base font-bold">Plan de cuotas</h3>
            {datos.curso?.condiciones?.tipo_cobro === "cuotas" ? (
              datos.plan ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Mensualidades que se generan al confirmar cada matrícula. La matrícula ({formatoSoles.format(datos.curso.condiciones.matricula_importe)}) se paga aparte, al inscribirse.
                    Cambiar el plan no modifica las cuotas de matrículas ya confirmadas.
                  </p>
                  <PlanCuotas cursoId={cursoId} plan={datos.plan} importeCurso={datos.curso.condiciones.importe_curso} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No se pudo cargar el plan de cuotas. Recarga la página.</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {tipoCobro === "cuotas" ? "Guarda este paso con el cobro «En cuotas» para configurar aquí el plan." : "Solo aplica cuando el cobro es «En cuotas»."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {datos.curso && (
        <div className={cn(paso !== 4 && "hidden")} aria-hidden={paso !== 4}>
          <PasoGrupos ref={pasoGruposRef} curso={{ id: datos.curso.id, nombre: datos.curso.nombre, estado: datos.curso.estado }} grupos={datos.grupos} gruposError={datos.gruposError} docentes={datos.docentes} onPendientesChange={actualizarPendientesGrupos} />
        </div>
      )}

      {datos.curso && (
        <div className={cn(paso !== 5 && "hidden")} aria-hidden={paso !== 5}>
          <Card>
            <CardContent className="space-y-3">
              {datos.certificacion.disponible ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Elige si el curso entrega certificado y en qué condiciones. Las plantillas y firmantes se gestionan en{" "}
                    <Link href="/admin/certificados/plantillas" target="_blank" className="underline">Certificados</Link>; la emisión siempre verifica los requisitos.
                  </p>
                  <CertificacionCursoForm
                    cursoId={datos.curso.id}
                    config={datos.certificacion.config}
                    plantillas={datos.certificacion.plantillas}
                    firmantes={datos.certificacion.firmantes}
                    notaAprobatoria={Number(base.nota_aprobatoria)}
                    ocultarBotonGuardar
                    onRegistrarGuardado={registrarGuardadoCertificacion}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">La configuración de certificados no está disponible (migración «certificados_v5» pendiente). Puedes continuar.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {paso === 6 && datos.curso && (
        <PasoRevision
          datos={datos}
          base={base}
          estados={estados}
          alEditar={(p) => irA(p)}
        />
      )}

      {/* Barra de navegación fija */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 py-3 lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button variant="outline" onClick={() => irA((paso - 1) as NumeroPaso)} disabled={paso === 1 || estado === "guardando" || portadaProcesando}>
            <ArrowLeft aria-hidden />
            Anterior
          </Button>
          <p className="hidden text-center text-xs text-muted-foreground sm:block" aria-live="polite">
            Paso {paso} de {TOTAL_PASOS}: {pasoInfo.titulo}
          </p>
          {paso < TOTAL_PASOS ? (
            <Button onClick={() => irA((paso + 1) as NumeroPaso)} disabled={estado === "guardando" || portadaProcesando}>
              {estado === "guardando" && <Loader2 className="animate-spin" aria-hidden />}
              {cursoId ? "Guardar y continuar" : "Crear borrador y continuar"}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Link href={cursoId ? `/admin/cursos/${cursoId}` : "/admin/cursos"} className={buttonVariants({ variant: "outline" })}>
              Finalizar
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function borrarRespaldo(cursoId: string | null) {
  try {
    localStorage.removeItem(CLAVE_RESPALDO(cursoId))
  } catch {
    // Sin almacenamiento local: no hay nada que borrar.
  }
}

function EstadoGuardadoChip({ estado, ultimo, onReintentar }: { estado: EstadoGuardado; ultimo: Date | null; onReintentar?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-2 text-sm">
      {estado === "guardando" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Guardando cambios…</span>
      )}
      {estado === "pendiente" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 font-medium text-warning"><span className="size-2 rounded-full bg-warning" aria-hidden />Cambios del curso sin guardar</span>
      )}
      {estado === "guardado" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 font-medium text-success">
          <Check className="size-3.5" aria-hidden />
          {ultimo ? `Último guardado a las ${ultimo.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` : "Cambios confirmados en Supabase"}
        </span>
      )}
      {estado === "error" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">
          <CloudOff className="size-3.5" aria-hidden />
          No se pudieron guardar los cambios
          {onReintentar && <button type="button" onClick={onReintentar} className="underline underline-offset-2">Reintentar</button>}
        </span>
      )}
    </div>
  )
}
