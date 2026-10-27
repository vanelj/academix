import { randomUUID } from "node:crypto"

import { BUCKET_COMPROBANTES, REVISION_PAGOS_HABILITADA } from "@/lib/pagos/config"
import { hoyEnLima, leerTodo } from "@/lib/pagos/datos"
import { createClient } from "@/lib/supabase/server"

/**
 * Verificación del módulo de pagos contra la base REAL con la sesión del
 * administrador (SOLO servidor). Nunca usa la clave secreta.
 *
 * Todas las comprobaciones son NO destructivas:
 * - lecturas permitidas por RLS;
 * - intentos de escritura y llamadas a RPC sobre un UUID aleatorio que no
 *   existe: si la BD los permitiera, no afectarían ninguna fila; lo esperado
 *   es que los rechace (permiso denegado o excepción de la función);
 * - enlaces firmados de 60 s y peticiones HEAD a Storage (no descargan ni
 *   modifican archivos; ninguna URL se envía al navegador).
 */

export type Resultado = "ok" | "falla" | "aviso" | "info" | "omitido"
export type Comprobacion = { id: string; grupo: string; titulo: string; resultado: Resultado; detalle: string }

type ErrorPg = { code?: string; message: string } | null
type FilaPago = { id: string; estado: string; monto: number | string; solicitud_id: string | null; cuota_id: string | null; matricula_id: string | null; verificado_por: string | null; verificado_en: string | null; comprobante_url: string | null; referencia_operacion: string | null }
type FilaCuota = { id: string; matricula_id: string; importe: number | string; estado: string }

const corto = (id: string) => id.slice(0, 8)
const describir = (e: ErrorPg) => (e ? `${e.code ?? "sin código"}: ${e.message}` : "sin error")

export async function verificarModuloPagos(institucionId: string): Promise<Comprobacion[]> {
  const supabase = await createClient()
  const r: Comprobacion[] = []
  const add = (grupo: string, id: string, titulo: string, resultado: Resultado, detalle: string) => r.push({ id, grupo, titulo, resultado, detalle })
  const inexistente = randomUUID()

  // ---------- A. Sesión ----------
  const inst = await supabase.from("instituciones").select("activo").eq("id", institucionId).maybeSingle()
  add("Sesión", "A1", "Institución activa", inst.data?.activo === true ? "ok" : "falla", inst.error ? describir(inst.error) : inst.data?.activo ? "La institución de tu perfil está activa." : "La institución no está activa o no es visible.")
  add("Sesión", "A2", "Revisión manual de pagos", REVISION_PAGOS_HABILITADA ? "aviso" : "info", REVISION_PAGOS_HABILITADA ? "El interruptor está ENCENDIDO." : "Deshabilitada (REVISION_PAGOS_HABILITADA = false), como corresponde hasta terminar las pruebas.")

  // ---------- B y C. RLS: lectura propia y aislamiento ----------
  for (const tabla of ["pagos", "cuotas", "matriculas", "solicitudes_inscripcion"]) {
    const propia = await supabase.from(tabla).select("id", { count: "exact", head: true }).eq("institucion_id", institucionId)
    add("RLS", `B-${tabla}`, `Lectura de ${tabla} de tu institución`, propia.error ? "falla" : "ok", propia.error ? describir(propia.error) : `${propia.count ?? 0} filas visibles.`)
    const ajena = await supabase.from(tabla).select("id", { count: "exact", head: true }).neq("institucion_id", institucionId)
    add("RLS", `C-${tabla}`, `Aislamiento: ${tabla} de otras instituciones`, ajena.error ? "aviso" : (ajena.count ?? 0) === 0 ? "ok" : "falla",
      ajena.error ? `No se pudo comprobar: ${describir(ajena.error)}` : (ajena.count ?? 0) === 0 ? "RLS no devuelve filas de otras instituciones." : `RLS devolvió ${ajena.count} filas de otras instituciones.`)
  }

  // ---------- D. Escritura directa bloqueada (sobre un id inexistente) ----------
  const escrituras: [string, string, PromiseLike<{ error: ErrorPg }>][] = [
    ["D1", "UPDATE directo de pagos", supabase.from("pagos").update({ observacion: "verificación" }).eq("id", inexistente)],
    ["D2", "DELETE directo de pagos", supabase.from("pagos").delete().eq("id", inexistente)],
    ["D3", "UPDATE directo de cuotas", supabase.from("cuotas").update({ estado: "anulada" }).eq("id", inexistente)],
    ["D4", "UPDATE directo de matriculas.estado", supabase.from("matriculas").update({ estado: "anulada" }).eq("id", inexistente)],
    ["D5", "UPDATE directo de solicitudes", supabase.from("solicitudes_inscripcion").update({ estado: "cancelada" }).eq("id", inexistente)],
  ]
  for (const [id, titulo, consulta] of escrituras) {
    const { error } = await consulta
    add("Escritura directa", id, titulo, error?.code === "42501" ? "ok" : error ? "aviso" : "falla",
      error?.code === "42501" ? "Rechazado por permisos (42501)." : error ? `Rechazado con otro error: ${describir(error)}` : "La BD aceptó la instrucción (no había filas que modificar): el permiso está abierto.")
  }

  // ---------- E. Funciones de negocio: existen y rechazan al administrador / ids inexistentes ----------
  const rpcs: [string, string, string, Record<string, unknown>, RegExp][] = [
    ["E1", "anular_matricula con matrícula inexistente o ajena", "anular_matricula", { p_matricula_id: inexistente }, /inaccesible/i],
    ["E2", "revisar_pago con pago inexistente o ajeno", "revisar_pago", { p_pago_id: inexistente, p_aprobar: false, p_observacion: null }, /inexistente|sin autorización/i],
    ["E3", "presentar_comprobante con rol admin", "presentar_comprobante", { p_solicitud_id: inexistente, p_monto: 1, p_metodo: "x", p_referencia: "x", p_comprobante_path: `${inexistente}/x.pdf` }, /estudiante/i],
    ["E4", "confirmar_matricula_sin_saldo con rol admin", "confirmar_matricula_sin_saldo", { p_solicitud_id: inexistente }, /estudiante/i],
    ["E5", "cancelar_solicitud con solicitud inexistente", "cancelar_solicitud", { p_solicitud_id: inexistente }, /inaccesible/i],
  ]
  for (const [id, titulo, nombre, args, esperado] of rpcs) {
    const { error } = await supabase.rpc(nombre, args)
    const resultado: Resultado = !error ? "falla" : error.code === "PGRST202" ? "falla" : esperado.test(error.message) || error.code === "42501" ? "ok" : "aviso"
    add("Funciones", id, titulo, resultado,
      !error ? "La función no devolvió error: revisar su definición." : error.code === "PGRST202" ? "La función no existe o cambió de firma." : `Rechazado: ${error.message}`)
  }

  // ---------- F. Storage privado ----------
  const bucket = supabase.storage.from(BUCKET_COMPROBANTES)
  const ajeno = await bucket.createSignedUrl(`${inexistente}/verificacion.pdf`, 60)
  add("Comprobantes", "F1", "Firmar un archivo que no está en tus pagos", ajeno.error ? "ok" : "falla", ajeno.error ? `Rechazado: ${ajeno.error.message}` : "Storage firmó un archivo ajeno.")
  const listado = await bucket.list(inexistente)
  add("Comprobantes", "F2", "Listar una carpeta ajena", listado.error || (listado.data ?? []).length === 0 ? "ok" : "falla", listado.error ? `Rechazado: ${listado.error.message}` : `${(listado.data ?? []).length} objetos visibles.`)

  const conArchivo = await supabase.from("pagos").select("id, comprobante_url").eq("institucion_id", institucionId)
    .not("comprobante_url", "is", null).order("fecha_pago", { ascending: false }).limit(20)
    .overrideTypes<{ id: string; comprobante_url: string }[], { merge: false }>()
  const muestra = (conArchivo.data ?? []).find((p) => p.comprobante_url && !/^https?:\/\//i.test(p.comprobante_url))
  if (!muestra) {
    add("Comprobantes", "F3", "Abrir un comprobante de tu institución", "omitido", "No hay pagos con comprobante en el almacenamiento privado para probar.")
  } else {
    const firmado = await bucket.createSignedUrl(muestra.comprobante_url, 60)
    let estado = 0
    if (firmado.data?.signedUrl) estado = (await fetch(firmado.data.signedUrl, { method: "HEAD", cache: "no-store" }).catch(() => null))?.status ?? 0
    add("Comprobantes", "F3", `Abrir el comprobante del pago ${corto(muestra.id)} con enlace firmado`, firmado.error ? "falla" : estado === 200 ? "ok" : "aviso",
      firmado.error ? `No se pudo firmar: ${firmado.error.message}` : estado === 200 ? "Enlace de 60 s generado y el archivo responde (HTTP 200)." : `Enlace generado, pero el archivo respondió HTTP ${estado}.`)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publico = base ? await fetch(`${base}/storage/v1/object/public/${BUCKET_COMPROBANTES}/${muestra.comprobante_url}`, { method: "HEAD", cache: "no-store" }).catch(() => null) : null
    add("Comprobantes", "F4", "El mismo archivo sin firma (acceso público)", publico && publico.status !== 200 ? "ok" : "falla",
      publico ? (publico.status !== 200 ? `Bloqueado (HTTP ${publico.status}): el bucket es privado.` : "El archivo es accesible sin firma.") : "No se pudo consultar.")
  }

  // ---------- G. Integridad de los datos de tu institución ----------
  try {
    const [pagos, cuotas, matriculas, solicitudes, grupos] = await Promise.all([
      leerTodo<FilaPago>((d, h) => supabase.from("pagos").select("id, estado, monto, solicitud_id, cuota_id, matricula_id, verificado_por, verificado_en, comprobante_url, referencia_operacion").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<FilaCuota>((d, h) => supabase.from("cuotas").select("id, matricula_id, importe, estado").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<{ id: string; estado: string }>((d, h) => supabase.from("matriculas").select("id, estado").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<{ id: string; estado: string; grupo_id: string; reserva_vence_en: string | null }>((d, h) => supabase.from("solicitudes_inscripcion").select("id, estado, grupo_id, reserva_vence_en").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<{ id: string; estado: string }>((d, h) => supabase.from("grupos").select("id, estado").eq("institucion_id", institucionId).order("id").range(d, h)),
    ])
    const matricula = new Map(matriculas.map((m) => [m.id, m]))
    const cuota = new Map(cuotas.map((q) => [q.id, q]))
    const solicitud = new Map(solicitudes.map((s) => [s.id, s]))
    const grupo = new Map(grupos.map((g) => [g.id, g]))
    const pendientes = pagos.filter((p) => p.estado === "pendiente")

    const g1 = pendientes.filter((p) => p.cuota_id && matricula.get(cuota.get(p.cuota_id)?.matricula_id ?? "")?.estado !== "activa")
    add("Integridad", "G1", "Comprobantes pendientes de cuotas de matrículas no activas", g1.length === 0 ? "ok" : "falla",
      g1.length === 0 ? "Ninguno." : `${g1.length}: ${g1.map((p) => corto(p.id)).join(", ")}. Deben rechazarse (el disparador impide aprobarlos).`)

    const g2 = pendientes.filter((p) => p.solicitud_id && grupo.get(solicitud.get(p.solicitud_id)?.grupo_id ?? "")?.estado !== "abierto")
    add("Integridad", "G2", "Comprobantes pendientes de solicitudes cuyo grupo ya no está abierto", g2.length === 0 ? "ok" : "aviso",
      g2.length === 0 ? "Ninguno." : `${g2.length}: ${g2.map((p) => corto(p.id)).join(", ")}. Corresponde rechazarlos y gestionar la devolución.`)

    const aprobado = (cuotaId: string) => pagos.filter((p) => p.cuota_id === cuotaId && p.estado === "pagado").reduce((t, p) => t + Number(p.monto), 0)
    const g3 = cuotas.filter((q) => {
      const a = aprobado(q.id), imp = Number(q.importe)
      return (q.estado === "pagada" && a < imp) || (q.estado === "pendiente" && a > 0) || (q.estado === "parcial" && (a === 0 || a >= imp)) || a > imp
    })
    add("Integridad", "G3", "Cuotas cuyo estado no coincide con sus pagos aprobados", g3.length === 0 ? "ok" : "falla",
      g3.length === 0 ? `${cuotas.length} cuotas revisadas.` : `${g3.length}: ${g3.map((q) => corto(q.id)).join(", ")}.`)

    const g4 = cuotas.filter((q) => q.estado === "pendiente" && matricula.get(q.matricula_id)?.estado === "anulada")
    add("Integridad", "G4", "Cuotas pendientes de matrículas anuladas (anuladas antes de la RPC)", g4.length === 0 ? "ok" : "aviso",
      g4.length === 0 ? "Ninguna." : `${g4.length}. No son cobrables desde Academix; quedan como historial.`)

    const porSolicitud = new Map<string, number>()
    for (const p of pendientes) if (p.solicitud_id) porSolicitud.set(p.solicitud_id, (porSolicitud.get(p.solicitud_id) ?? 0) + 1)
    const porCuota = new Map<string, number>()
    for (const p of pendientes) if (p.cuota_id) porCuota.set(p.cuota_id, (porCuota.get(p.cuota_id) ?? 0) + 1)
    const g5 = [...porSolicitud.values(), ...porCuota.values()].filter((n) => n > 1).length
    add("Integridad", "G5", "Más de un comprobante pendiente para la misma solicitud o cuota", g5 === 0 ? "ok" : "falla", g5 === 0 ? "Ninguno." : `${g5} casos.`)

    const g6 = pagos.filter((p) => p.estado !== "pendiente" && (!p.verificado_por || !p.verificado_en))
    add("Integridad", "G6", "Pagos revisados sin registro de quién y cuándo", g6.length === 0 ? "ok" : "aviso",
      g6.length === 0 ? "Todos tienen trazabilidad." : `${g6.length} (posiblemente de la versión anterior).`)

    const g7 = pendientes.filter((p) => !p.comprobante_url?.trim() || !p.referencia_operacion?.trim())
    add("Integridad", "G7", "Comprobantes pendientes sin archivo o sin número de operación", g7.length === 0 ? "ok" : "aviso",
      g7.length === 0 ? "Ninguno." : `${g7.length}. V5 no permite aprobarlos; solo rechazarlos.`)

    const g8 = pagos.filter((p) => !p.solicitud_id && !p.cuota_id)
    add("Integridad", "G8", "Pagos de la versión anterior (sin solicitud ni cuota)", g8.length === 0 ? "ok" : "info", g8.length === 0 ? "Ninguno." : `${g8.length}. Solo pueden rechazarse.`)

    const ahora = Date.now()
    const g9 = solicitudes.filter((s) => s.estado === "reservada" && s.reserva_vence_en && new Date(s.reserva_vence_en).getTime() <= ahora)
    add("Integridad", "G9", "Reservas vencidas que siguen como 'reservada'", g9.length === 0 ? "ok" : "info", g9.length === 0 ? "Ninguna." : `${g9.length}. No ocupan vacante; bloquean una nueva reserva del mismo estudiante.`)

    add("Integridad", "G10", "Resumen", "info",
      `${pagos.length} pagos (${pendientes.length} en revisión), ${cuotas.length} cuotas, ${matriculas.length} matrículas, ${solicitudes.length} solicitudes. Fecha de referencia: ${hoyEnLima()}.`)
  } catch (e) {
    const error = e as ErrorPg
    add("Integridad", "G0", "Lectura de datos para integridad", "falla", describir(error))
  }

  // ---------- H. Configuración de cobro (medios y planes de cuotas) ----------
  const medios = await supabase.from("medios_cobro_institucion").select("id, activo").eq("institucion_id", institucionId)
  const sinTabla = medios.error?.code === "PGRST205" || medios.error?.code === "42P01"
  const activos = (medios.data ?? []).filter((m: { activo: boolean }) => m.activo).length
  add("Cobro", "H1", "Medios de cobro de la institución", sinTabla ? "aviso" : medios.error ? "falla" : activos > 0 ? "ok" : "aviso",
    sinTabla ? "Migración medios_cobro_v5 pendiente: los estudiantes ven el texto de pagos de tus políticas."
      : medios.error ? describir(medios.error)
      : activos > 0 ? `${activos} habilitado(s).` : "No tienes medios de cobro habilitados: el estudiante no sabrá dónde pagar.")
  if (!sinTabla) {
    // FK a una institución inexistente: aunque RLS fallara, la fila no se podría crear.
    const ajeno = await supabase.from("medios_cobro_institucion").insert({ institucion_id: inexistente, tipo: "yape", titular: "Verificación", celular: "900000000" })
    add("Cobro", "H2", "Crear medios de cobro para otra institución", ajeno.error?.code === "42501" ? "ok" : ajeno.error ? "aviso" : "falla",
      ajeno.error?.code === "42501" ? "Rechazado por RLS (42501)." : ajeno.error ? `Rechazado con otro error: ${describir(ajeno.error)}` : "La BD aceptó la instrucción: revisar RLS.")
  }
  const misCuotas = await supabase.rpc("mis_cuotas")
  add("Cobro", "H3", "Función mis_cuotas (nombres en el estado de cuenta del estudiante)", misCuotas.error?.code === "PGRST202" ? "aviso" : misCuotas.error ? "falla" : "ok",
    misCuotas.error?.code === "PGRST202" ? "Migración medios_cobro_v5 pendiente: en grupos en curso el estudiante puede no ver el nombre del curso."
      : misCuotas.error ? describir(misCuotas.error) : `Instalada; con tu rol admin devuelve ${(misCuotas.data as unknown[] | null)?.length ?? 0} filas (debe ser 0).`)

  const [conds, plan] = await Promise.all([
    supabase.from("condiciones_curso").select("curso_id, importe_curso").eq("institucion_id", institucionId).eq("tipo_cobro", "cuotas"),
    supabase.from("plan_cuotas").select("curso_id, importe, dias_desde_inicio").eq("institucion_id", institucionId),
  ])
  if (conds.error || plan.error) {
    add("Cobro", "H4", "Planes de cuotas", "falla", describir(conds.error ?? plan.error))
  } else {
    const filas = (plan.data ?? []) as { curso_id: string; importe: number | string; dias_desde_inicio: number | null }[]
    const cursos = (conds.data ?? []) as { curso_id: string; importe_curso: number | string }[]
    const sinPlan = cursos.filter((c) => Number(c.importe_curso) > 0 && !filas.some((f) => f.curso_id === c.curso_id))
    const sinDias = new Set(filas.filter((f) => f.dias_desde_inicio === null).map((f) => f.curso_id))
    add("Cobro", "H4", "Cursos en cuotas sin plan de cuotas", sinPlan.length === 0 ? "ok" : "aviso",
      sinPlan.length === 0 ? "Ninguno." : `${sinPlan.length} curso(s): V5 rechazará sus solicitudes de matrícula ("Falta el cronograma de mensualidades").`)
    add("Cobro", "H5", "Cuotas del plan sin días desde el inicio", sinDias.size === 0 ? "ok" : "falla",
      sinDias.size === 0 ? "Ninguna." : `${sinDias.size} curso(s) con cuotas sin fecha: V5 rechazará sus matrículas. Corrígelas en el detalle del curso.`)
    const difieren = cursos.filter((c) => {
      const suma = filas.filter((f) => f.curso_id === c.curso_id).reduce((t, f) => t + Number(f.importe), 0)
      return suma > 0 && Math.abs(suma - Number(c.importe_curso)) >= 0.005
    })
    add("Cobro", "H6", "Planes cuya suma no coincide con el importe del curso", difieren.length === 0 ? "ok" : "info",
      difieren.length === 0 ? "Ninguno." : `${difieren.length} curso(s). V5 no lo exige; revisa si es intencional.`)
  }

  return r
}
