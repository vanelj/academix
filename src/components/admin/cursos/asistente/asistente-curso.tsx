"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
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
  Save,
  TriangleAlert,
  Undo2,
} from "lucide-react"

import { AvisoPrecio, CampoArea, CampoTexto, DESCRIPCION_COBRO, Seccion } from "@/components/admin/cursos/curso-form"
import { formatoSoles } from "@/components/admin/cursos/curso-ui"
import { EditorCertificacion } from "@/components/admin/cursos/asistente/editor-certificacion"
import { EditorPlan } from "@/components/admin/cursos/asistente/editor-plan"
import { PasoGrupos } from "@/components/admin/cursos/asistente/paso-grupos"
import { PasoRevision, type EstadoOperacion, type Guardado } from "@/components/admin/cursos/asistente/paso-revision"
import { PortadaCurso } from "@/components/admin/cursos/asistente/portada-curso"
import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { guardarCertificacionCurso } from "@/lib/certificados/acciones"
import { cambiarEstadoCurso, crearCurso, editarCurso } from "@/lib/cursos/acciones"
import type { DatosAsistente } from "@/lib/cursos/asistente"
import { comprobarConflictos } from "@/lib/cursos/asistente-acciones"
import {
  CAMPOS_PASO,
  PASO,
  PASOS,
  PASOS_EDITABLES,
  TOTAL_PASOS,
  avisosPublicacion,
  bloqueosPublicacion,
  cambiosEconomicos,
  conPrecioSimple,
  ejecutarGuardado,
  errorPrecio,
  esCobroAnterior,
  esPasoFormulario,
  esperadoParaOperaciones,
  grupoNuevoVacio,
  gruposParaAbrir,
  totalPagoUnico,
  iguales,
  planificarGuardado,
  rebasar,
  revisarPasos,
  validarCertificacion,
  valoresCuota,
  valoresGrupo,
  valoresHorario,
  type AccionesGuardado,
  type Base,
  type Complementos,
  type NumeroPaso,
  type PasoEditable,
} from "@/lib/cursos/asistente-logica"
import { eliminarCuotaPlan, guardarCuotaPlan } from "@/lib/cursos/plan-cuotas"
import { eliminarPortadaCurso, subirPortadaCurso } from "@/lib/cursos/portada-acciones"
import { cambiarEstadoGrupo, crearGrupo, editarGrupo, eliminarHorario, guardarHorario } from "@/lib/grupos/acciones"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"
import { CERTIFICACION_INICIAL, valoresCertificacion } from "@/lib/validations/certificacion-curso"
import {
  CONDICIONES_ESPECIALES_MAX,
  CURSO_DESCRIPCION_MAX,
  CURSO_INICIAL,
  CURSO_NOMBRE_MAX,
  REQUISITOS_MAX,
  TIPOS_COBRO,
  cursoSchema,
  importeTotalCondiciones,
  type CursoValues,
  type EstadoCurso,
} from "@/lib/validations/curso"

// --- Copia local de recuperación ---------------------------------------------------------

const CLAVE_RESPALDO = (cursoId: string | null) => `academix:asistente-curso:v3:${cursoId ?? "nuevo"}`
/** Copias de versiones anteriores (podían incluir enlaces de clase): se borran al abrir. */
const CLAVES_ANTIGUAS = (cursoId: string | null) => [`academix:asistente-curso:v2:${cursoId ?? "nuevo"}`, `academix:asistente-curso:${cursoId ?? "nuevo"}`]
/** Copias locales más antiguas que esto se descartan. */
const RESPALDO_VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

type Respaldo = {
  v: 3
  fecha: number
  cursoId: string
  base: Base
  curso: CursoValues
  complementos: Complementos
  confirmados: PasoEditable[]
  paso: NumeroPaso
  quitarPortada: boolean
  estadoCurso: EstadoCurso | null
}

function leerRespaldo(clave: string): Respaldo | null {
  if (typeof window === "undefined") return null
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return null
    const r = JSON.parse(crudo) as Respaldo
    if (r?.v === 3 && Date.now() - r.fecha < RESPALDO_VIGENCIA_MS && r.curso?.condiciones && r.complementos?.grupos && r.base?.cursoInicial) return r
    localStorage.removeItem(clave)
  } catch {
    // Almacenamiento no disponible o copia dañada: se ignora.
  }
  return null
}

/**
 * Copia SIN datos sensibles: los enlaces de clase (privados en V5) no se guardan
 * en el navegador. Al recuperar, los horarios existentes vuelven a tomar el enlace
 * guardado en Supabase y los nuevos quedan sin enlace.
 */
function sinEnlaces(c: Complementos): Complementos {
  return {
    ...c,
    grupos: c.grupos.map((g) => ({
      ...g,
      horarios: g.horarios.map((h) => ({
        ...h,
        valores: { ...h.valores, enlace_clase: "" },
        original: h.original ? { ...h.original, enlace_clase: "" } : null,
      })),
    })),
  }
}

function conEnlacesGuardados(c: Complementos, datos: DatosAsistente): Complementos {
  const guardados = new Map(datos.grupos.flatMap((g) => g.horarios.map((h) => [h.id, h.enlace_clase ?? ""] as const)))
  return {
    ...c,
    grupos: c.grupos.map((g) => ({
      ...g,
      horarios: g.horarios.map((h) => {
        const enlace = h.existente ? guardados.get(h.clave) ?? "" : ""
        return { ...h, valores: { ...h.valores, enlace_clase: enlace }, original: h.original ? { ...h.original, enlace_clase: enlace } : null }
      }),
    })),
  }
}

function borrarRespaldo(clave: string) {
  try {
    localStorage.removeItem(clave)
  } catch {
    // Sin almacenamiento local: no hay nada que borrar.
  }
}

const sinSuscripcion = () => () => {}

function complementosIniciales(datos: DatosAsistente): Complementos {
  const config = datos.certificacion.disponible ? datos.certificacion.config : null
  return {
    plan: (datos.plan ?? []).map((c) => ({ clave: c.id, existente: true, valores: valoresCuota(c), original: valoresCuota(c), eliminada: false })),
    grupos: datos.grupos.map((g) => ({
      clave: g.id,
      existente: true,
      estado: g.estado,
      valores: valoresGrupo(g),
      original: valoresGrupo(g),
      editando: false,
      antesDeEditar: null,
      horarios: g.horarios.map((h) => ({ clave: h.id, existente: true, valores: valoresHorario(h), original: valoresHorario(h), eliminado: false })),
    })),
    certificacion: config ? valoresCertificacion(config) : CERTIFICACION_INICIAL,
    certificacionOriginal: config ? valoresCertificacion(config) : null,
  }
}

/** Pasos que ya están resueltos con lo guardado (al editar). Uno nuevo empieza sin ninguno. */
function confirmadosIniciales(datos: DatosAsistente): PasoEditable[] {
  if (!datos.curso) return []
  const p: PasoEditable[] = [PASO.curso, PASO.grupos]
  if (datos.curso.tieneCondiciones) p.push(PASO.precio)
  if (!datos.certificacion.disponible || datos.certificacion.config) p.push(PASO.certificado)
  return p
}

/**
 * Asistente de creación y edición de cursos (5 pasos en una sola página):
 * Curso · Precio · Grupos y horarios · Certificado · Revisar y publicar.
 *
 * Todo se configura EN MEMORIA: «Siguiente» valida el paso y avanza, sin escribir
 * en Supabase. El guardado es explícito en el último paso («Guardar como borrador»,
 * «Guardar cambios» o «Publicar curso») y aplica, en orden, las acciones
 * existentes (mismas validaciones, RLS y reglas de V5). Los ids de lo nuevo se
 * generan aquí, así un reintento tras un fallo no duplica nada.
 */
export function AsistenteCurso({ datos, pasoInicial }: { datos: DatosAsistente; pasoInicial: NumeroPaso }) {
  const router = useRouter()
  const claveRespaldo = CLAVE_RESPALDO(datos.curso?.id ?? null)
  const certDisponible = datos.certificacion.disponible
  const [cursoId, setCursoId] = useState(() => datos.curso?.id ?? crypto.randomUUID())
  const [base, setBase] = useState<Base>(() => ({ cursoExiste: datos.curso !== null, cursoInicial: datos.valores, tieneCondiciones: datos.curso?.tieneCondiciones === true }))
  const [complementos, setComplementos] = useState(() => complementosIniciales(datos))
  const [confirmados, setConfirmados] = useState<PasoEditable[]>(() => confirmadosIniciales(datos))
  const [intentados, setIntentados] = useState<PasoEditable[]>([])
  const [paso, setPaso] = useState<NumeroPaso>(datos.curso ? pasoInicial : 1)
  const [estadoCurso, setEstadoCurso] = useState<EstadoCurso | null>(datos.curso?.estado ?? null)
  const [portada, setPortada] = useState<{ blob: Blob | null; vista: string | null; quitar: boolean; url: string | null }>({ blob: null, vista: null, quitar: false, url: datos.portada.url })
  const [portadaProcesando, setPortadaProcesando] = useState(false)
  const [guardado, setGuardado] = useState<Guardado>({ fase: "inactivo" })
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null)
  const [confirmaEconomia, setConfirmaEconomia] = useState(false)
  // Cursos nuevos: gratuito o pago completo. Los que ya usan cuotas o reserva se respetan
  // tal cual («anterior») hasta que la institución los convierta a pago completo.
  const [modoPrecio, setModoPrecio] = useState<"simple" | "anterior">(() => (esCobroAnterior(datos.valores.condiciones) ? "anterior" : "simple"))
  const [abrirInscripciones, setAbrirInscripciones] = useState(true)
  // La copia local se lee una sola vez; el aviso se muestra solo tras montar (sin desajustes de hidratación).
  const [respaldoInicial] = useState(() => leerRespaldo(claveRespaldo))
  const [respaldoResuelto, setRespaldoResuelto] = useState(false)
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false)
  const respaldo = montado && !respaldoResuelto ? respaldoInicial : null
  const bloqueo = useRef(false)

  const form = useForm<CursoValues>({ resolver: zodResolver(cursoSchema), defaultValues: datos.valores, mode: "onTouched" })
  const actuales = useWatch({ control: form.control }) as CursoValues
  const tipoCobro = useWatch({ control: form.control, name: "condiciones.tipo_cobro" })
  const permiteReserva = useWatch({ control: form.control, name: "condiciones.permite_reserva" })

  const ocupado = guardado.fase === "comprobando" || guardado.fase === "guardando"
  const configurarCondiciones = !base.cursoExiste || base.tieneCondiciones || confirmados.includes(PASO.precio)
  const accionPortada = portada.blob ? "subir" : portada.quitar && portada.url ? "quitar" : null
  const revision = revisarPasos(actuales, complementos, certDisponible)
  const categoriaActiva = datos.categorias.find((c) => c.id === actuales.categoria_id)?.activo === true
  const bloqueos = bloqueosPublicacion(actuales, complementos, revision, categoriaActiva)
  const avisos = avisosPublicacion(complementos)
  const pendientes = planificarGuardado({
    base, curso: actuales, configurarCondiciones, portada: accionPortada, complementos,
    certificacionDisponible: certDisponible, certificacionConfirmada: confirmados.includes(PASO.certificado), publicar: false,
  })
  const hayCambios = base.cursoExiste
    ? pendientes.length > 0 || complementos.grupos.some((g) => g.editando)
    : !iguales(actuales, CURSO_INICIAL) || complementos.plan.length > 0 || complementos.grupos.length > 0 || portada.blob !== null || !iguales(complementos.certificacion, CERTIFICACION_INICIAL)
  const economia = estadoCurso === "publicado" ? cambiosEconomicos(actuales, base.cursoInicial, base.tieneCondiciones, complementos.plan) : []

  useProtegerCambios(hayCambios || ocupado)

  // --- Copia local de recuperación (todo menos la imagen) ------------------------------
  useEffect(() => {
    // Mientras se ofrece recuperar una copia, no se sobrescribe.
    if (respaldo) return
    const id = setTimeout(() => {
      try {
        if (hayCambios) {
          const copia: Respaldo = { v: 3, fecha: Date.now(), cursoId, base, curso: actuales, complementos: sinEnlaces(complementos), confirmados, paso, quitarPortada: portada.quitar, estadoCurso }
          localStorage.setItem(claveRespaldo, JSON.stringify(copia))
        } else {
          localStorage.removeItem(claveRespaldo)
        }
      } catch {
        // Sin almacenamiento local: el asistente funciona igual.
      }
    }, 800)
    return () => clearTimeout(id)
  }, [actuales, base, claveRespaldo, complementos, confirmados, cursoId, estadoCurso, hayCambios, paso, portada.quitar, respaldo])

  // Copias de versiones anteriores del asistente: podían contener enlaces de clase.
  useEffect(() => {
    for (const clave of CLAVES_ANTIGUAS(datos.curso?.id ?? null)) borrarRespaldo(clave)
  }, [datos.curso?.id])

  // Las notificaciones se muestran por encima de la barra de navegación fija (no tapan «Siguiente»).
  useEffect(() => {
    document.documentElement.style.setProperty("--barra-inferior", "4.5rem")
    return () => {
      document.documentElement.style.removeProperty("--barra-inferior")
    }
  }, [])

  // URL compartible con el paso actual (solo al editar un curso existente).
  useEffect(() => {
    if (!datos.curso) return
    const url = new URL(window.location.href)
    url.searchParams.set("paso", String(paso))
    window.history.replaceState(window.history.state, "", url)
  }, [paso, datos.curso])

  function recuperar(r: Respaldo) {
    form.reset(r.curso, { keepDefaultValues: true })
    setCursoId(r.cursoId)
    setBase(r.base)
    setComplementos(conEnlacesGuardados(r.complementos, datos))
    setConfirmados(r.confirmados)
    setEstadoCurso(r.estadoCurso)
    setPortada((p) => ({ ...p, quitar: r.quitarPortada }))
    setPaso(r.paso)
    setRespaldoResuelto(true)
    notificar.info("Cambios recuperados", { descripcion: "Siguen sin guardar en Supabase hasta que los guardes en el último paso." })
  }

  // --- Navegación -----------------------------------------------------------------------
  // Los pasos obligatorios (Curso, Precio) deben estar confirmados y válidos; los opcionales, solo válidos.
  const alcanzable = (n: NumeroPaso) =>
    n <= paso || PASOS_EDITABLES.filter((p) => p < n).every((p) => revision[p].valido && (revision[p].opcional || confirmados.includes(p)))

  function mostrar(n: NumeroPaso) {
    setPaso(n)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  /** Modo simple: deja las condiciones coherentes con «Gratuito» o «Pago completo» y el precio escrito. */
  function sincronizarPrecio(): CursoValues {
    const v = form.getValues()
    if (modoPrecio !== "simple") return v
    const tipo = v.condiciones.tipo_cobro === "gratuito" ? "gratuito" : "unico"
    const nuevo = conPrecioSimple(v, tipo, v.precio.trim())
    if (!iguales(nuevo, v)) {
      form.setValue("precio", nuevo.precio, { shouldDirty: true })
      form.setValue("condiciones", nuevo.condiciones, { shouldDirty: true })
    }
    return nuevo
  }

  async function pasoValido(p: PasoEditable, enfocar: boolean): Promise<boolean> {
    if (!esPasoFormulario(p)) return revision[p].valido
    if (p === PASO.precio) sincronizarPrecio()
    const ok = await form.trigger(CAMPOS_PASO[p] as never, { shouldFocus: enfocar })
    if (!ok || p !== PASO.precio) return ok
    const error = errorPrecio(form.getValues())
    if (error) form.setError("precio", { message: error }, { shouldFocus: enfocar })
    return !error
  }

  async function siguiente() {
    if (paso === TOTAL_PASOS || ocupado || portadaProcesando) return
    const p = paso as PasoEditable
    if (!(await pasoValido(p, true))) {
      // Los errores se muestran junto al paso (aviso y campos marcados, con el foco en el primero).
      setIntentados((x) => (x.includes(p) ? x : [...x, p]))
      return
    }
    setConfirmados((x) => (x.includes(p) ? x : [...x, p]))
    // Un grupo nuevo que se abrió y quedó vacío se descarta al continuar.
    if (p === PASO.grupos && complementos.grupos.some(grupoNuevoVacio)) setComplementos((c) => ({ ...c, grupos: c.grupos.filter((g) => !grupoNuevoVacio(g)) }))
    mostrar((p + 1) as NumeroPaso)
  }

  function irA(n: NumeroPaso) {
    if (n === paso || ocupado || portadaProcesando) return
    if (n === paso + 1) void siguiente()
    else if (alcanzable(n)) mostrar(n)
  }

  // --- Guardado explícito (último paso) ------------------------------------------------
  async function guardar(publicar: boolean) {
    if (bloqueo.current || ocupado) return
    for (const p of PASOS_EDITABLES) {
      if (!(await pasoValido(p, false))) {
        setIntentados((x) => (x.includes(p) ? x : [...x, p]))
        mostrar(p)
        if (esPasoFormulario(p)) void form.trigger(CAMPOS_PASO[p] as never, { shouldFocus: true })
        notificar.error(`Revisa el paso ${p}: ${PASOS[p - 1].titulo}`, { descripcion: "No se guardó nada. Corrige los datos marcados y vuelve a guardar." })
        return
      }
    }
    if (publicar && bloqueos.length) {
      notificar.advertencia("Aún no se puede publicar", { descripcion: bloqueos[0] })
      return
    }
    if (economia.length && !confirmaEconomia) {
      notificar.advertencia("Confirma los cambios de precios y condiciones", { descripcion: "El curso está publicado: marca la confirmación antes de guardar." })
      return
    }

    const curso = sincronizarPrecio()
    const ops = planificarGuardado({
      base, curso, configurarCondiciones, portada: accionPortada, complementos,
      certificacionDisponible: certDisponible, certificacionConfirmada: confirmados.includes(PASO.certificado), publicar: publicar && estadoCurso !== "publicado",
      abrirInscripciones: publicar && abrirInscripciones,
    })
    if (ops.length === 0) {
      notificar.info("No hay cambios que guardar.")
      return
    }

    bloqueo.current = true
    const lista: EstadoOperacion[] = ops.map((op) => ({ op, estado: "pendiente" }))
    try {
      // No sobrescribir cambios hechos desde otra sesión en lo que se va a modificar.
      if (base.cursoExiste) {
        const esperado = esperadoParaOperaciones(ops, base, complementos)
        if (Object.keys(esperado).length) {
          setGuardado({ fase: "comprobando", operaciones: lista })
          const r = await comprobarConflictos(cursoId, esperado).catch(() => null)
          if (!r || !r.ok) {
            const mensaje = r?.mensaje ?? "No se pudo conectar con el servidor. No se guardó nada; inténtalo de nuevo."
            setGuardado({ fase: "error", operaciones: lista, mensaje, paso: null })
            notificar.error("No se guardó", { descripcion: mensaje })
            return
          }
          if (r.conflictos.length) {
            setGuardado({ fase: "error", operaciones: lista, mensaje: "El curso cambió en otra sesión.", conflictos: r.conflictos, paso: null })
            notificar.advertencia("No se guardó para no sobrescribir cambios más recientes", { descripcion: r.conflictos[0] })
            return
          }
        }
      }

      setGuardado({ fase: "guardando", operaciones: lista })
      let nuevaPortada: string | null = null
      const blob = portada.blob
      const acciones: AccionesGuardado = {
        crearCurso: (d, id) => crearCurso(d, id),
        editarCurso: (id, d) => editarCurso(id, d),
        subirPortada: async (id) => {
          if (!blob) return { ok: true }
          const fd = new FormData()
          fd.set("portada", blob, "portada")
          const r = await subirPortadaCurso(id, fd)
          if (r.ok) nuevaPortada = r.portadaUrl
          return r
        },
        quitarPortada: (id) => eliminarPortadaCurso(id),
        guardarCuota: (c, id, crear, v) => guardarCuotaPlan(c, crear ? null : id, v, crear ? id : undefined),
        eliminarCuota: (c, id) => eliminarCuotaPlan(c, id),
        crearGrupo: (d, id) => crearGrupo(d, id),
        editarGrupo: (id, d) => editarGrupo(id, d),
        guardarHorario: (g, id, crear, v) => guardarHorario(g, crear ? null : id, v, crear ? id : undefined),
        eliminarHorario: (g, id) => eliminarHorario(g, id),
        guardarCertificacion: (c, v) => guardarCertificacionCurso(c, v),
        publicar: (c) => cambiarEstadoCurso(c, "publicado"),
        abrirGrupo: (g) => cambiarEstadoGrupo(g, "abierto"),
      }
      const resultado = await ejecutarGuardado(ops, cursoId, acciones, (op, estado) =>
        setGuardado((g) => (g.fase === "guardando" ? { ...g, operaciones: g.operaciones.map((x) => (x.op.clave === op.clave ? { ...x, estado } : x)) } : g))
      )

      // Lo confirmado por Supabase pasa a ser la nueva base (aunque algo haya fallado después).
      const nuevo = rebasar(base, complementos, resultado.hechas)
      setBase(nuevo.base)
      setComplementos(nuevo.complementos)
      if (resultado.hechas.some((op) => op.tipo === "portada")) {
        if (portada.vista) URL.revokeObjectURL(portada.vista)
        setPortada((p) => ({ blob: null, vista: null, quitar: false, url: p.quitar ? null : nuevaPortada ?? p.url }))
      }
      if (resultado.hechas.some((op) => op.tipo === "publicar")) setEstadoCurso("publicado")
      else if (nuevo.base.cursoExiste && !estadoCurso) setEstadoCurso("borrador")
      if (resultado.hechas.length) setUltimoGuardado(new Date())

      if (resultado.fallo) {
        const { op, mensaje } = resultado.fallo
        const hechas = new Set(resultado.hechas.map((x) => x.clave))
        setGuardado({
          fase: "error",
          operaciones: lista.map((x) => ({ ...x, estado: hechas.has(x.op.clave) ? "hecha" : x.op.clave === op.clave ? "error" : "pendiente" })),
          mensaje: `${op.descripcion}: ${mensaje}`,
          paso: op.paso,
        })
        notificar.error("El guardado no se completó", {
          descripcion: `${resultado.hechas.length ? `Se guardó una parte (${resultado.hechas.length} de ${ops.length}); lo demás sigue aquí sin guardar. ` : "No se guardó nada. "}${mensaje}`,
        })
        return
      }

      borrarRespaldo(claveRespaldo)
      setGuardado({ fase: "inactivo" })
      const titulo = resultado.hechas.some((op) => op.tipo === "publicar") ? "Curso guardado y publicado" : base.cursoExiste ? "Cambios guardados" : "Curso creado como borrador"
      if (resultado.avisos.length) notificar.advertencia(`${titulo}, con avisos`, { descripcion: resultado.avisos.join(" ") })
      else notificar.exito(titulo, { descripcion: "Los datos quedaron guardados en Supabase." })
      router.replace(`/admin/cursos/${cursoId}`)
      router.refresh()
    } catch {
      setGuardado({ fase: "error", operaciones: lista, mensaje: "Ocurrió un error inesperado. Lo que no se confirmó sigue aquí sin guardar.", paso: null })
      notificar.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
    }
  }

  function cambiarPortada(blob: Blob | null) {
    if (portada.vista) URL.revokeObjectURL(portada.vista)
    const vista = blob ? URL.createObjectURL(blob) : null
    setPortada((p) => ({ ...p, blob, vista }))
  }

  // --- Vista ---------------------------------------------------------------------------------
  const nombre = actuales.nombre?.trim() || "Nuevo curso"
  const pasoInfo = PASOS[paso - 1]
  const completados = PASOS_EDITABLES.filter((p) => confirmados.includes(p) && revision[p].valido).length + (base.cursoExiste && !hayCambios ? 1 : 0)
  const revisionActual = paso < TOTAL_PASOS ? revision[paso as PasoEditable] : null
  const certErrores = intentados.includes(PASO.certificado) ? validarCertificacion(complementos.certificacion) : {}
  const puedeGuardar = !ocupado && (!base.cursoExiste || hayCambios) && !(economia.length > 0 && !confirmaEconomia)
  const estadoChip: EstadoChip = ocupado
    ? "guardando"
    : guardado.fase === "error"
      ? "error"
      : hayCambios
        ? "local"
        : estadoCurso === "publicado"
          ? "publicado"
          : base.cursoExiste
            ? "guardado"
            : "vacio"

  return (
    <div className="space-y-6 pb-28">
      {/* Cabecera: curso, paso, progreso y estados */}
      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                {base.cursoExiste ? "Configuración del curso" : "Nuevo curso"} · Paso {paso} de {TOTAL_PASOS}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold break-words">{nombre}</h2>
              <p className="text-sm text-muted-foreground">{pasoInfo.descripcion}</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
              <EstadoGuardadoChip estado={estadoChip} ultimo={ultimoGuardado} />
              {revisionActual && <EstadoPasoChip valido={revisionActual.valido} intentado={intentados.includes(paso as PasoEditable)} opcional={revisionActual.opcional} />}
            </div>
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
            Avanzar entre pasos no guarda nada en Supabase: todo se guarda junto en el último paso. Mientras tanto, una copia local
            (solo en este navegador, hasta 7 días, sin la imagen de portada) permite recuperar lo escrito si cierras la página.
          </p>
          <nav aria-label="Pasos del asistente">
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PASOS.map((p) => {
                const n = p.numero as NumeroPaso
                const r = n < TOTAL_PASOS ? revision[n as PasoEditable] : null
                const completo = n < TOTAL_PASOS ? confirmados.includes(n as PasoEditable) && r!.valido : base.cursoExiste && !hayCambios
                const conError = r !== null && !r.valido && intentados.includes(n as PasoEditable)
                const actual = n === paso
                const habilitado = n === paso + 1 || alcanzable(n)
                return (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => irA(n)}
                      disabled={!habilitado || ocupado}
                      aria-current={actual ? "step" : undefined}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 rounded-2xl border p-2.5 text-left text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                        actual ? "border-primary bg-secondary" : "hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                          conError ? "bg-destructive text-white" : completo ? "bg-success text-success-foreground" : actual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                        aria-hidden
                      >
                        {conError ? "!" : completo ? <Check className="size-3.5" /> : n}
                      </span>
                      <span className="leading-tight font-semibold">{p.titulo}</span>
                      <span className="sr-only">
                        {conError ? "(con datos por corregir)" : completo ? "(completo)" : r?.opcional ? "(opcional, pendiente)" : "(pendiente)"}
                      </span>
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
              <span>
                Encontramos cambios sin guardar de este {respaldo.base.cursoExiste ? "curso" : "curso nuevo"}, copiados en este navegador el{" "}
                {new Date(respaldo.fecha).toLocaleString("es-PE")}. {respaldo.base.cursoExiste && !datos.curso && "Una parte ya se había guardado en Supabase. "}
                La copia no conserva la imagen de portada ni los enlaces de clase nuevos o modificados (por privacidad).
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => recuperar(respaldo)}>Recuperar cambios</Button>
              <Button size="sm" variant="ghost" onClick={() => { borrarRespaldo(claveRespaldo); setRespaldoResuelto(true) }}>Descartar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {revisionActual && (
        <>
          {!revisionActual.valido && intentados.includes(paso as PasoEditable) && revisionActual.mensajes.length > 0 && (
            <div role="alert" className="flex gap-2 rounded-2xl border border-destructive/40 p-3 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <ul className="space-y-0.5">{revisionActual.mensajes.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {revisionActual.avisos.length > 0 && (
            <div role="status" className="flex gap-2 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <ul className="space-y-0.5">{revisionActual.avisos.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
        </>
      )}

      {/* Pasos Curso y Precio: un formulario compartido (montado siempre: conserva lo escrito y la portada) */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); void siguiente() }} className={cn("space-y-6", paso > PASO.precio && "hidden")}>
        <fieldset disabled={ocupado} className="min-w-0 space-y-6">
          <div className={cn("space-y-6", paso !== PASO.curso && "hidden")}>
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
                        <p className="flex gap-1.5 text-xs text-warning"><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />La categoría está inactiva: el curso no se podrá publicar hasta que la actives.</p>
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
            <Seccion icono={ImageIcon} titulo="Portada del curso" descripcion="Opcional. La misma imagen se usa en el catálogo, la ficha pública y los listados.">
              <div className="space-y-2 sm:col-span-2">
                <PortadaCurso
                  portadaActual={portada.quitar ? null : portada.url}
                  disponible={datos.portada.disponible}
                  deshabilitado={ocupado}
                  pendiente={portada.blob}
                  alCambiarPendiente={cambiarPortada}
                  alCambiarProcesando={setPortadaProcesando}
                  alQuitarActual={portada.url && !portada.quitar ? () => setPortada((p) => ({ ...p, quitar: true })) : undefined}
                />
                {portada.quitar && portada.url && !portada.blob && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    La portada actual se quitará al guardar.
                    <Button type="button" size="xs" variant="ghost" onClick={() => setPortada((p) => ({ ...p, quitar: false }))}>
                      <Undo2 aria-hidden />
                      Deshacer
                    </Button>
                  </p>
                )}
                {datos.portada.disponible && <p className="text-xs text-muted-foreground">La imagen se sube a Supabase al guardar el curso, en el último paso.</p>}
              </div>
            </Seccion>
            <Seccion icono={GraduationCap} titulo="Requisitos y aprobación" descripcion="Todos los cursos son virtuales. La duración la marcan las fechas de cada grupo.">
              <CampoTexto control={form.control} name="nota_aprobatoria" label="Nota aprobatoria" required inputMode="decimal" descripcion="Escala de 0 a 20." />
              <CampoArea control={form.control} name="condiciones.requisitos" label="Requisitos del curso (opcional)" max={REQUISITOS_MAX} className="sm:col-span-2"
                descripcion="Requisitos académicos o documentos que pide este curso." />
              <CampoArea control={form.control} name="condiciones.condiciones_especiales" label="Condiciones particulares (opcional)" max={CONDICIONES_ESPECIALES_MAX} className="sm:col-span-2"
                descripcion="Se suman a las políticas generales de tu institución." />
            </Seccion>
          </div>

          <div className={cn(paso !== PASO.precio && "hidden")}>
            {modoPrecio === "simple" ? (
            <Seccion icono={ReceiptText} titulo="Precio" descripcion="Pago completo al inscribirse, como en cualquier tienda de cursos. El estudiante paga por Yape, Plin, transferencia o depósito y tu institución verifica el comprobante.">
              <Controller
                control={form.control}
                name="condiciones.tipo_cobro"
                render={({ field }) => (
                  <fieldset className="grid gap-2 sm:col-span-2">
                    <legend className="mb-2 text-sm font-medium">¿Cómo se ofrece el curso?</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {([
                        { valor: "unico", titulo: "Pago completo", texto: "Un solo pago por el total del curso." },
                        { valor: "gratuito", titulo: "Gratuito", texto: "Inscripción inmediata, sin pagos." },
                      ] as const).map((o) => {
                        const elegido = o.valor === "gratuito" ? field.value === "gratuito" : field.value !== "gratuito"
                        return (
                          <label key={o.valor} className={cn("flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            elegido ? "border-primary bg-secondary" : "hover:bg-muted/50")}>
                            <input type="radio" name={field.name} value={o.valor} checked={elegido} className="mt-0.5 size-4 accent-primary"
                              onChange={() => {
                                const v = conPrecioSimple(form.getValues(), o.valor, o.valor === "gratuito" ? "0" : form.getValues("precio") === "0" ? "" : form.getValues("precio"))
                                form.setValue("precio", v.precio, { shouldDirty: true })
                                form.setValue("condiciones", v.condiciones, { shouldDirty: true })
                                form.clearErrors("precio")
                              }} />
                            <span>
                              <span className="font-medium">{o.titulo}</span>
                              <span className="block text-xs text-muted-foreground">{o.texto}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                )}
              />
              {tipoCobro !== "gratuito" && (
                <CampoTexto control={form.control} name="precio" label="Precio del curso (S/)" required inputMode="decimal" className="sm:col-span-2"
                  descripcion="Es el total que paga el estudiante y el precio que se muestra en el catálogo." />
              )}
            </Seccion>
            ) : (
            <Seccion icono={ReceiptText} titulo="Precio (condiciones anteriores)" descripcion="Este curso se creó con matrícula, cuotas o reserva de vacante. Se conservan tal cual para no afectar a quienes ya se inscribieron.">
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed p-3 text-sm sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  Los cursos nuevos se ofrecen con <strong className="font-semibold text-foreground">pago completo</strong>. Puedes convertir este curso:
                  el precio pasará a ser el total ({formatoSoles.format(totalPagoUnico(actuales.condiciones))}) y dejará de ofrecer cuotas y reserva.
                  Las matrículas ya confirmadas no cambian.
                </p>
                <Button type="button" variant="outline" size="sm" className="shrink-0"
                  onClick={() => {
                    const total = totalPagoUnico(form.getValues("condiciones"))
                    const v = conPrecioSimple(form.getValues(), "unico", String(total))
                    form.setValue("precio", v.precio, { shouldDirty: true })
                    form.setValue("condiciones", v.condiciones, { shouldDirty: true })
                    setModoPrecio("simple")
                  }}>
                  Convertir a pago completo
                </Button>
              </div>
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
                    descripcion={tipoCobro === "cuotas" ? "Se reparte en el plan de cuotas (debajo)." : undefined} />
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
          </div>
        </fieldset>
      </form>

      {paso === PASO.precio && modoPrecio === "anterior" && tipoCobro === "cuotas" && (
        <Card>
          <CardContent className="space-y-3">
            <h3 className="text-base font-bold">Plan de cuotas</h3>
            <EditorPlan
              plan={complementos.plan}
              importeCurso={Number(actuales.condiciones?.importe_curso) || 0}
              matricula={Number(actuales.condiciones?.matricula_importe) || 0}
              deshabilitado={ocupado}
              alCambiar={(plan) => setComplementos((c) => ({ ...c, plan }))}
            />
          </CardContent>
        </Card>
      )}

      <div className={cn(paso !== PASO.grupos && "hidden")}>
        <PasoGrupos
          grupos={complementos.grupos}
          docentes={datos.docentes}
          gruposError={datos.gruposError}
          deshabilitado={ocupado}
          alCambiar={(grupos) => setComplementos((c) => ({ ...c, grupos }))}
        />
      </div>

      <div className={cn(paso !== PASO.certificado && "hidden")}>
        <Card>
          <CardContent className="space-y-3">
            {datos.certificacion.disponible ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Opcional. Elige si el curso entrega certificado. Tu institución lo emite a quien aprueba el curso, desde «Certificados».
                </p>
                <EditorCertificacion
                  valores={complementos.certificacion}
                  errores={certErrores}
                  plantillas={datos.certificacion.plantillas}
                  firmantes={datos.certificacion.firmantes}
                  notaAprobatoria={actuales.nota_aprobatoria || "11"}
                  cursoGratuito={actuales.condiciones?.tipo_cobro === "gratuito"}
                  institucion={datos.institucion}
                  deshabilitado={ocupado}
                  alCambiar={(certificacion) => setComplementos((c) => ({ ...c, certificacion }))}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">La configuración de certificados no está disponible (migración «certificados_v5» pendiente). Puedes continuar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {paso === PASO.revision && (
        <PasoRevision
          curso={actuales}
          complementos={complementos}
          categorias={datos.categorias}
          docentes={datos.docentes}
          portada={{
            url: portada.url,
            pendiente: portada.blob !== null,
            quitar: portada.quitar,
            disponible: datos.portada.disponible,
            vista: portada.vista ?? (portada.quitar ? null : portada.url),
          }}
          certificacionDisponible={certDisponible}
          estadoCurso={estadoCurso}
          existente={base.cursoExiste}
          hayCambios={hayCambios}
          revision={revision}
          bloqueos={bloqueos}
          avisos={avisos}
          cambiosEconomicos={economia}
          confirmaEconomia={confirmaEconomia}
          alConfirmarEconomia={setConfirmaEconomia}
          guardado={guardado}
          alEditar={(p) => { if (!ocupado) mostrar(p) }}
          gruposParaAbrir={gruposParaAbrir(complementos).length}
          abrirInscripciones={abrirInscripciones}
          alCambiarAbrirInscripciones={setAbrirInscripciones}
          alGuardar={(publicar) => void guardar(publicar)}
        />
      )}

      {/* Barra de navegación fija */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 py-3 lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button variant="outline" onClick={() => mostrar((paso - 1) as NumeroPaso)} disabled={paso === 1 || ocupado || portadaProcesando}>
            <ArrowLeft aria-hidden />
            Anterior
          </Button>
          <p className="hidden text-center text-xs text-muted-foreground sm:block" aria-live="polite">
            Paso {paso} de {TOTAL_PASOS}: {pasoInfo.titulo}
          </p>
          {paso < TOTAL_PASOS ? (
            <Button onClick={() => void siguiente()} disabled={ocupado || portadaProcesando}>
              {portadaProcesando && <Loader2 className="animate-spin" aria-hidden />}
              Siguiente
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button onClick={() => void guardar(false)} disabled={!puedeGuardar}>
              {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {estadoCurso === "publicado" || estadoCurso === "desactivado" ? "Guardar cambios" : "Guardar como borrador"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type EstadoChip = "vacio" | "local" | "guardando" | "guardado" | "publicado" | "error"

function EstadoGuardadoChip({ estado, ultimo }: { estado: EstadoChip; ultimo: Date | null }) {
  const hora = ultimo?.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
  return (
    <div role="status" aria-live="polite" className="text-sm">
      {estado === "vacio" && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground">Aún no guardado</span>}
      {estado === "local" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">
          <span className="size-2 rounded-full bg-warning" aria-hidden />Cambios sin guardar
        </span>
      )}
      {estado === "guardando" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Guardando en Supabase…</span>
      )}
      {estado === "guardado" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 font-medium text-success">
          <Check className="size-3.5" aria-hidden />{hora ? `Guardado correctamente a las ${hora}` : "Sin cambios pendientes"}
        </span>
      )}
      {estado === "publicado" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 font-medium text-success"><Check className="size-3.5" aria-hidden />Publicado · sin cambios pendientes</span>
      )}
      {estado === "error" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive"><CloudOff className="size-3.5" aria-hidden />Error al guardar</span>
      )}
    </div>
  )
}

function EstadoPasoChip({ valido, intentado, opcional }: { valido: boolean; intentado: boolean; opcional: boolean }) {
  if (valido) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" aria-hidden />{opcional ? "Paso opcional · información válida" : "Información válida"}</span>
  }
  return intentado
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><CircleAlert className="size-3.5" aria-hidden />Hay datos por corregir</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><CircleAlert className="size-3.5" aria-hidden />Información pendiente</span>
}
