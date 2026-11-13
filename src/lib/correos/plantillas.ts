import { SITIO_URL } from "@/lib/correos/config"
import { boton, caja, detalles as tablaDetalles, documento, escapar, lista as listaHtml, nota as notaHtml, parrafo, type Tono } from "@/lib/correos/diseno"

export { escapar }

/**
 * Plantillas de los correos transaccionales. Se construyen con los datos que la
 * BD guardó al encolar (instantánea del evento), nunca con datos del navegador.
 *
 * - Todo valor se escapa antes de entrar al HTML.
 * - Las instrucciones de pago son el texto que la institución escribió en sus
 *   políticas (politicas_institucion.texto_pagos). Si no lo configuró, se remite
 *   al estudiante a la institución: nunca se inventan cuentas ni datos bancarios.
 * - Los correos de Supabase Auth (invitación de docentes y administradores,
 *   recuperación de contraseña) NO están aquí: los envía Supabase con el SMTP de
 *   Resend y sus plantillas se generan con el MISMO diseño (npm run correos:sincronizar).
 *   Así un evento nunca produce dos correos.
 * - Diseño compartido: lib/correos/diseno.ts.
 */

export const TIPOS_CORREO = [
  "solicitud_recibida",
  "reserva_confirmada",
  "solicitud_rechazada",
  "solicitud_cancelada",
  "reserva_vencida",
  "reserva_por_vencer",
  "comprobante_recibido",
  "comprobante_por_revisar",
  "pago_rechazado",
  "cuota_confirmada",
  "matricula_confirmada",
  "matricula_anulada",
  "recordatorio_cuota",
  "certificado_emitido",
  "horario_cambiado",
  "resultado_final",
] as const
export type TipoCorreo = (typeof TIPOS_CORREO)[number]

export type CorreoRenderizado = { asunto: string; html: string; texto: string }

type Datos = Record<string, unknown>
type Contenido = {
  /** Etiqueta superior y color del correo. */
  etiqueta?: string
  tono?: Tono
  asunto: string
  titulo: string
  parrafos: string[]
  detalles?: [string, string | null][]
  lista?: string[]
  instrucciones?: boolean
  boton?: { texto: string; ruta: string }
  nota?: string
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const txt = (d: Datos, k: string): string | null => {
  const v = d[k]
  return typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null
}
const num = (d: Datos, k: string): number | null => {
  const v = typeof d[k] === "string" ? Number(d[k]) : d[k]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

const FORMATO_SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
export const soles = (v: number | null) => (v === null ? null : FORMATO_SOLES.format(v))

/** "2026-11-05" (columna date) sin desplazar el día por la zona horaria. */
export function fecha(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: m ? "UTC" : "America/Lima" })
}
export function fechaHora(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return `${d.toLocaleString("es-PE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })} (hora de Lima)`
}


// ---------------------------------------------------------------------------
// Contenido por tipo
// ---------------------------------------------------------------------------

function curso(d: Datos) {
  const c = txt(d, "curso") ?? "tu curso"
  const g = txt(d, "grupo")
  return g ? `${c} (grupo ${g})` : c
}

const CONTENIDO: Record<TipoCorreo, (d: Datos) => Contenido> = {
  solicitud_recibida: (d) => {
    const importe = num(d, "importe") ?? 0
    const reserva = txt(d, "tipo_solicitud") === "reserva"
    return {
      asunto: `Recibimos tu solicitud de ${reserva ? "reserva" : "matrícula"}: ${txt(d, "curso") ?? "curso"}`,
      titulo: "Solicitud recibida",
      parrafos: [
        `Registramos tu solicitud de ${reserva ? "reserva de vacante" : "matrícula"} en ${curso(d)}.`,
        importe > 0
          ? "Para continuar, realiza el pago y sube tu comprobante desde tu panel. La institución lo verificará manualmente."
          : "No requiere pago. Puedes confirmar tu matrícula desde tu panel.",
      ],
      detalles: [
        ["Institución", txt(d, "institucion")],
        ["Importe a pagar", importe > 0 ? soles(importe) : "Sin costo"],
        ["Inicio del grupo", fecha(txt(d, "fecha_inicio"))],
      ],
      instrucciones: importe > 0,
      boton: { texto: "Ver mis solicitudes", ruta: "/estudiante/solicitudes" },
      nota: "Tu vacante no queda asegurada hasta que la institución apruebe el pago.",
    }
  },
  reserva_confirmada: (d) => ({
    asunto: `Reserva confirmada: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu reserva está confirmada",
    parrafos: [
      `La institución aprobó tu pago y reservó tu vacante en ${curso(d)}.`,
      "Completa tu matrícula antes de que venza la reserva.",
    ],
    detalles: [
      ["Pago aprobado", soles(num(d, "monto_aprobado"))],
      ["Reserva válida hasta", fechaHora(txt(d, "reserva_vence_en"))],
    ],
    boton: { texto: "Completar mi matrícula", ruta: "/estudiante/solicitudes" },
  }),
  solicitud_rechazada: (d) => ({
    asunto: `Solicitud no aprobada: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu solicitud no fue aprobada",
    parrafos: [`La institución no aprobó tu solicitud para ${curso(d)}.`],
    detalles: [["Motivo", txt(d, "comentario")]],
    boton: { texto: "Ver mis solicitudes", ruta: "/estudiante/solicitudes" },
    nota: "Si tienes dudas, comunícate directamente con la institución.",
  }),
  solicitud_cancelada: (d) => ({
    asunto: `Solicitud cancelada: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Solicitud cancelada",
    parrafos: [`Tu solicitud para ${curso(d)} fue cancelada y la vacante quedó liberada.`],
    boton: { texto: "Ver cursos disponibles", ruta: "/cursos" },
    nota: "Si no reconoces esta cancelación, comunícate con la institución.",
  }),
  reserva_vencida: (d) => ({
    asunto: `Tu reserva venció: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu reserva venció",
    parrafos: [
      `El plazo de tu reserva en ${curso(d)} terminó sin completarse la matrícula.`,
      "La vacante ya no está garantizada. Si aún quieres inscribirte, revisa la disponibilidad del grupo.",
    ],
    detalles: [["Venció el", fechaHora(txt(d, "reserva_vence_en"))]],
    boton: { texto: "Ver mis solicitudes", ruta: "/estudiante/solicitudes" },
  }),
  reserva_por_vencer: (d) => ({
    asunto: `Tu reserva vence pronto: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu reserva está por vencer",
    parrafos: [`Tu reserva en ${curso(d)} vence en menos de 24 horas. Completa tu matrícula para no perder la vacante.`],
    detalles: [["Vence el", fechaHora(txt(d, "reserva_vence_en"))]],
    instrucciones: true,
    boton: { texto: "Completar mi matrícula", ruta: "/estudiante/solicitudes" },
  }),
  comprobante_recibido: (d) => ({
    asunto: `Recibimos tu comprobante de pago: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Comprobante recibido",
    parrafos: [
      `Recibimos tu comprobante de pago para ${curso(d)}. La institución lo revisará y te avisaremos el resultado por correo.`,
    ],
    detalles: [
      ["Concepto", txt(d, "concepto")],
      ["Monto declarado", soles(num(d, "monto"))],
      ["Método", txt(d, "metodo")],
      ["N.° de operación", txt(d, "referencia")],
    ],
    boton: { texto: "Ver mis solicitudes", ruta: "/estudiante/solicitudes" },
    nota: "Este correo confirma la recepción, no la aprobación del pago.",
  }),
  comprobante_por_revisar: (d) => ({
    asunto: `Nuevo comprobante por revisar: ${txt(d, "estudiante") ?? "estudiante"}`,
    titulo: "Nuevo comprobante por revisar",
    parrafos: [`${txt(d, "estudiante") ?? "Un estudiante"} presentó un comprobante de pago para ${curso(d)}.`],
    detalles: [
      ["Concepto", txt(d, "concepto")],
      ["Monto declarado", soles(num(d, "monto"))],
      ["Método", txt(d, "metodo")],
      ["N.° de operación", txt(d, "referencia")],
    ],
    boton: { texto: "Revisar el pago", ruta: `/admin/pagos/${txt(d, "pago_id") ?? ""}` },
    nota: "Verifica el depósito o la transferencia en tu cuenta antes de aprobarlo.",
  }),
  pago_rechazado: (d) => ({
    asunto: `Pago no aprobado: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu pago no fue aprobado",
    parrafos: [`La institución revisó tu comprobante para ${curso(d)} y no pudo aprobarlo.`],
    detalles: [
      ["Concepto", txt(d, "concepto")],
      ["Monto declarado", soles(num(d, "monto"))],
      ["N.° de operación", txt(d, "referencia")],
      ["Motivo", txt(d, "observacion")],
    ],
    instrucciones: true,
    boton: { texto: "Presentar un nuevo comprobante", ruta: "/estudiante/solicitudes" },
  }),
  cuota_confirmada: (d) => {
    const saldo = num(d, "saldo") ?? 0
    return {
      asunto: `Pago de cuota aprobado: ${txt(d, "concepto") ?? "cuota"}`,
      titulo: saldo > 0 ? "Pago parcial aprobado" : "Cuota pagada",
      parrafos: [
        saldo > 0
          ? `Aprobamos tu pago de ${txt(d, "concepto") ?? "la cuota"} en ${curso(d)}. Aún queda un saldo pendiente.`
          : `Tu ${txt(d, "concepto") ?? "cuota"} de ${curso(d)} quedó pagada por completo.`,
      ],
      detalles: [
        ["Monto aprobado", soles(num(d, "monto"))],
        ["Importe de la cuota", soles(num(d, "importe_cuota"))],
        ["Saldo pendiente", saldo > 0 ? soles(saldo) : null],
        ["Vencimiento", saldo > 0 ? fecha(txt(d, "vencimiento")) : null],
      ],
      instrucciones: saldo > 0,
      boton: { texto: "Ir a mi panel", ruta: "/estudiante" },
    }
  },
  matricula_confirmada: (d) => {
    const cuotas = Array.isArray(d.cuotas) ? (d.cuotas as Datos[]) : []
    return {
      etiqueta: "Matrícula",
      tono: "menta",
      asunto: `Matrícula confirmada: ${txt(d, "curso") ?? "curso"}`,
      titulo: "¡Tu matrícula está confirmada!",
      parrafos: [
        `Ya estás matriculado en ${curso(d)}.`,
        cuotas.length > 0 ? "Este es tu cronograma de cuotas:" : "",
      ].filter(Boolean),
      detalles: [
        ["Institución", txt(d, "institucion")],
        ["Grupo", txt(d, "grupo")],
        ["Horario", txt(d, "horario")],
        ["Pago aprobado", soles(num(d, "monto_aprobado"))],
        ["Inicio de clases", fecha(txt(d, "fecha_inicio"))],
      ],
      lista: cuotas.map(
        (c) => `${txt(c, "concepto") ?? "Cuota"} ${txt(c, "numero") ?? ""}: ${soles(num(c, "importe")) ?? "—"} · vence el ${fecha(txt(c, "vencimiento")) ?? "—"}`
      ),
      instrucciones: cuotas.length > 0,
      boton: { texto: "Entrar a mi curso", ruta: txt(d, "matricula_id") ? `/estudiante/cursos/${txt(d, "matricula_id")}` : "/estudiante/cursos" },
    }
  },
  matricula_anulada: (d) => {
    const parciales = num(d, "cuotas_parciales") ?? 0
    return {
      asunto: `Matrícula anulada: ${txt(d, "curso") ?? "curso"}`,
      titulo: "Tu matrícula fue anulada",
      parrafos: [
        `La institución anuló tu matrícula en ${curso(d)}. Las cuotas pendientes sin pagos quedaron anuladas.`,
        parciales > 0 ? "Las cuotas con pagos parciales se conservan en tu historial; consulta con la institución sobre su devolución." : "",
      ].filter(Boolean),
      nota: "Si no esperabas esta anulación, comunícate con la institución.",
    }
  },
  certificado_emitido: (d) => ({
    asunto: `Tu certificado está disponible: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu certificado está disponible",
    parrafos: [
      `${txt(d, "institucion") ?? "La institución"} emitió tu certificado de ${curso(d)}.`,
      "Puedes descargarlo cuando quieras desde tu cuenta, en «Mis certificados».",
    ],
    etiqueta: "Certificado",
    tono: "menta",
    detalles: [["Institución", txt(d, "institucion")], ["Código de verificación", txt(d, "codigo")]],
    boton: { texto: "Ver mis certificados", ruta: "/estudiante/certificados" },
    nota: "Por seguridad, el certificado no se adjunta: descárgalo iniciando sesión en Academix.",
  }),
  horario_cambiado: (d) => ({
    etiqueta: "Horario",
    tono: "ambar",
    asunto: `Cambió el horario de ${txt(d, "curso") ?? "tu curso"}`,
    titulo: "Se actualizó el horario de tu curso",
    parrafos: [
      `${txt(d, "institucion") ?? "La institución"} actualizó el horario de ${curso(d)}.`,
      "Revisa tu calendario: ya muestra las clases con el horario vigente.",
    ],
    detalles: [
      ["Antes", txt(d, "anterior")],
      ["Ahora", txt(d, "nuevo")],
      ["Horario vigente", txt(d, "horario")],
    ],
    boton: { texto: "Ver mi calendario", ruta: "/estudiante/horarios" },
    nota: "Si hubo varios cambios el mismo día, el calendario siempre muestra el horario actualizado.",
  }),
  resultado_final: (d) => ({
    etiqueta: "Resultado académico",
    tono: "violeta",
    asunto: `Tu resultado final está disponible: ${txt(d, "curso") ?? "curso"}`,
    titulo: "Tu resultado final está disponible",
    parrafos: [
      `${txt(d, "institucion") ?? "La institución"} registró tu resultado final en ${curso(d)}.`,
      "Por privacidad, la nota no se incluye en este correo: consúltala iniciando sesión.",
    ],
    boton: { texto: "Ver evaluaciones y notas", ruta: txt(d, "matricula_id") ? `/estudiante/cursos/${txt(d, "matricula_id")}?seccion=notas` : "/estudiante/evaluaciones" },
  }),
  recordatorio_cuota: (d) => {
    const momento = txt(d, "momento")
    const concepto = txt(d, "concepto") ?? "tu cuota"
    const vencida = momento === "vencida_1" || momento === "vencida_7"
    const asunto =
      momento === "faltan_3" ? `Tu ${concepto} vence en 3 días`
      : momento === "hoy" ? `Tu ${concepto} vence hoy`
      : `Tu ${concepto} está vencida`
    return {
      asunto,
      titulo: vencida ? "Tienes una cuota vencida" : "Recordatorio de pago",
      parrafos: [
        vencida
          ? `La ${concepto} de ${curso(d)} venció y aún tiene saldo pendiente.`
          : `Te recordamos el vencimiento de la ${concepto} de ${curso(d)}.`,
        "Si ya pagaste, sube tu comprobante desde tu panel para que la institución lo verifique.",
      ],
      detalles: [
        ["Saldo pendiente", soles(num(d, "saldo"))],
        ["Vencimiento", fecha(txt(d, "vencimiento"))],
      ],
      instrucciones: true,
      boton: { texto: "Ir a mi panel", ruta: "/estudiante" },
    }
  },
}

// ---------------------------------------------------------------------------
// Diseño (HTML compatible con clientes de correo: tablas y estilos en línea)
// ---------------------------------------------------------------------------

export function esTipoCorreo(t: string): t is TipoCorreo {
  return (TIPOS_CORREO as readonly string[]).includes(t)
}

const ETIQUETA_POR_DEFECTO: Partial<Record<TipoCorreo, [string, Tono]>> = {
  solicitud_recibida: ["Solicitud de inscripción", "violeta"],
  reserva_confirmada: ["Reserva", "menta"],
  solicitud_rechazada: ["Solicitud de inscripción", "coral"],
  solicitud_cancelada: ["Solicitud de inscripción", "ambar"],
  reserva_vencida: ["Reserva", "ambar"],
  reserva_por_vencer: ["Reserva", "ambar"],
  comprobante_recibido: ["Pago recibido", "violeta"],
  comprobante_por_revisar: ["Pagos por revisar", "violeta"],
  pago_rechazado: ["Pago no aprobado", "coral"],
  cuota_confirmada: ["Pago aprobado", "menta"],
  matricula_anulada: ["Matrícula", "coral"],
  recordatorio_cuota: ["Recordatorio de pago", "ambar"],
}

/** Devuelve null si el tipo no existe (el procesador lo marca como fallido sin reintentar). */
export function renderizarCorreo(tipo: string, datos: Datos): CorreoRenderizado | null {
  if (!esTipoCorreo(tipo)) return null
  const c = CONTENIDO[tipo](datos ?? {})
  const [etiqueta, tono] = c.etiqueta ? [c.etiqueta, c.tono ?? "violeta"] : (ETIQUETA_POR_DEFECTO[tipo] ?? ["Academix", "violeta" as Tono])
  const institucion = txt(datos, "institucion")
  const contacto = [txt(datos, "institucion_correo"), txt(datos, "institucion_telefono")].filter(Boolean).join(" · ")
  const nombre = txt(datos, "nombre")
  const filas = (c.detalles ?? []).filter((x): x is [string, string] => Boolean(x[1]))
  const instrucciones = c.instrucciones
    ? (txt(datos, "instrucciones_pago") ??
      `Consulta los medios de pago (Yape, Plin, depósito o transferencia) directamente con ${institucion ?? "la institución"}${contacto ? ` (${contacto})` : ""}.`)
    : null
  const url = c.boton ? `${SITIO_URL}${c.boton.ruta}` : null
  const pieTexto = institucion
    ? `Este correo se envió por tu relación con ${institucion} en Academix.`
    : "Este correo se envió desde Academix."
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:"
  const e = escapar

  const cuerpo = [
    parrafo(e(saludo)),
    ...c.parrafos.map((t) => parrafo(e(t))),
    tablaDetalles(filas.map(([k, v]) => [e(k), e(v)])),
    listaHtml((c.lista ?? []).map(e)),
    instrucciones ? caja("Instrucciones de pago", e(instrucciones)) : "",
    url && c.boton ? boton(e(url), e(c.boton.texto)) : "",
    c.nota ? notaHtml(e(c.nota)) : "",
  ].join("\n")

  const html = documento({
    titulo: e(c.asunto),
    preencabezado: e(c.parrafos[0] ?? c.titulo),
    etiqueta: e(etiqueta),
    tono,
    encabezado: e(c.titulo),
    institucion: institucion ? e(institucion) : null,
    cuerpo,
    pie: `${e(pieTexto)}${contacto ? `<br>Contacto de la institución: ${e(contacto)}` : ""}<br>Correo automático de Academix. Las respuestas llegan a la institución si configuró su correo de contacto.`,
  })

  const texto = [
    c.titulo,
    "",
    saludo,
    ...c.parrafos,
    ...(filas.length ? ["", ...filas.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.lista?.length ? ["", ...c.lista.map((l) => `- ${l}`)] : []),
    ...(instrucciones ? ["", "Instrucciones de pago:", instrucciones] : []),
    ...(url && c.boton ? ["", `${c.boton.texto}: ${url}`] : []),
    ...(c.nota ? ["", c.nota] : []),
    "",
    "—",
    pieTexto,
    ...(contacto ? [`Contacto de la institución: ${contacto}`] : []),
  ].join("\n")

  return { asunto: c.asunto.slice(0, 200), html, texto }
}
