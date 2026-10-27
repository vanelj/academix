import { SITIO_URL } from "@/lib/correos/config"

/**
 * Plantillas de los correos transaccionales. Se construyen con los datos que la
 * BD guardó al encolar (instantánea del evento), nunca con datos del navegador.
 *
 * - Todo valor se escapa antes de entrar al HTML.
 * - Las instrucciones de pago son el texto que la institución escribió en sus
 *   políticas (politicas_institucion.texto_pagos). Si no lo configuró, se remite
 *   al estudiante a la institución: nunca se inventan cuentas ni datos bancarios.
 * - Los correos de Supabase Auth (recuperar contraseña, invitación docente) NO
 *   están aquí: los envía Supabase con su SMTP (ver docs/correos).
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
] as const
export type TipoCorreo = (typeof TIPOS_CORREO)[number]

export type CorreoRenderizado = { asunto: string; html: string; texto: string }

type Datos = Record<string, unknown>
type Contenido = {
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

export const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

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
      asunto: `Matrícula confirmada: ${txt(d, "curso") ?? "curso"}`,
      titulo: "¡Tu matrícula está confirmada!",
      parrafos: [
        `Ya estás matriculado en ${curso(d)}.`,
        cuotas.length > 0 ? "Este es tu cronograma de cuotas:" : "",
      ].filter(Boolean),
      detalles: [
        ["Institución", txt(d, "institucion")],
        ["Pago aprobado", soles(num(d, "monto_aprobado"))],
        ["Inicio de clases", fecha(txt(d, "fecha_inicio"))],
      ],
      lista: cuotas.map(
        (c) => `${txt(c, "concepto") ?? "Cuota"} ${txt(c, "numero") ?? ""}: ${soles(num(c, "importe")) ?? "—"} · vence el ${fecha(txt(c, "vencimiento")) ?? "—"}`
      ),
      instrucciones: cuotas.length > 0,
      boton: { texto: "Ir a mi panel", ruta: "/estudiante" },
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
    detalles: [["Código de verificación", txt(d, "codigo")]],
    boton: { texto: "Ver mis certificados", ruta: "/estudiante/certificados" },
    nota: "Por seguridad, el certificado no se adjunta: descárgalo iniciando sesión en Academix.",
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

/** Devuelve null si el tipo no existe (el procesador lo marca como fallido sin reintentar). */
export function renderizarCorreo(tipo: string, datos: Datos): CorreoRenderizado | null {
  if (!esTipoCorreo(tipo)) return null
  const c = CONTENIDO[tipo](datos ?? {})
  const institucion = txt(datos, "institucion")
  const contacto = [txt(datos, "institucion_correo"), txt(datos, "institucion_telefono")].filter(Boolean).join(" · ")
  const nombre = txt(datos, "nombre")
  const detalles = (c.detalles ?? []).filter((x): x is [string, string] => Boolean(x[1]))
  const instrucciones = c.instrucciones
    ? (txt(datos, "instrucciones_pago") ??
      `Consulta los medios de pago (Yape, Plin, depósito o transferencia) directamente con ${institucion ?? "la institución"}${contacto ? ` (${contacto})` : ""}.`)
    : null
  const url = c.boton ? `${SITIO_URL}${c.boton.ruta}` : null
  const pie = institucion
    ? `Este correo se envió por tu relación con ${institucion} en Academix.`
    : "Este correo se envió desde Academix."

  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:"
  const e = escapar
  const parrafo = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${e(t)}</p>`

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.asunto)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-size:18px;font-weight:700;color:#0f172a">Academix${institucion ? `<span style="font-weight:400;color:#64748b"> · ${e(institucion)}</span>` : ""}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#0f172a">${e(c.titulo)}</h1>
${parrafo(saludo)}
${c.parrafos.map(parrafo).join("\n")}
${detalles.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border:1px solid #e2e8f0;border-radius:8px">${detalles
    .map(([k, v]) => `<tr><td style="padding:9px 12px;font-size:13px;color:#64748b;width:42%;border-bottom:1px solid #f1f5f9">${e(k)}</td><td style="padding:9px 12px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9">${e(v)}</td></tr>`)
    .join("")}</table>` : ""}
${c.lista?.length ? `<ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.7;color:#334155">${c.lista.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : ""}
${instrucciones ? `<div style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border-left:3px solid #2563eb;border-radius:6px"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#0f172a">Instrucciones de pago</p><p style="margin:0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-line">${e(instrucciones)}</p></div>` : ""}
${url && c.boton ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border-radius:8px;background:#2563eb"><a href="${e(url)}" style="display:inline-block;padding:11px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${e(c.boton.texto)}</a></td></tr></table>` : ""}
${c.nota ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b">${e(c.nota)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#94a3b8">${e(pie)}${contacto ? `<br>Contacto de la institución: ${e(contacto)}` : ""}<br>Correo automático; las respuestas llegan a la institución si configuró su correo de contacto.</td></tr>
</table></td></tr></table></body></html>`

  const texto = [
    c.titulo,
    "",
    saludo,
    ...c.parrafos,
    ...(detalles.length ? ["", ...detalles.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.lista?.length ? ["", ...c.lista.map((l) => `- ${l}`)] : []),
    ...(instrucciones ? ["", "Instrucciones de pago:", instrucciones] : []),
    ...(url && c.boton ? ["", `${c.boton.texto}: ${url}`] : []),
    ...(c.nota ? ["", c.nota] : []),
    "",
    "—",
    pie,
    ...(contacto ? [`Contacto de la institución: ${contacto}`] : []),
  ].join("\n")

  return { asunto: c.asunto.slice(0, 200), html, texto }
}
