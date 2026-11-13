import type { TipoCorreo } from "@/lib/correos/plantillas"

/**
 * Datos FICTICIOS para vistas previas y pruebas (nunca se envían). Mismas
 * claves que guarda la BD al encolar cada correo (correos_transaccionales_v5).
 */
export function ejemplosCorreos(): Record<TipoCorreo, Record<string, unknown>> {
  const base = {
    nombre: "Lucía",
    curso: "Programación con Python desde Cero",
    grupo: "PY-01",
    institucion: "Institución de ejemplo",
    institucion_correo: "contacto@ejemplo.edu.pe",
    fecha_inicio: "2026-11-16",
    matricula_id: "00000000-0000-4000-8000-000000000001",
  }
  return {
    solicitud_recibida: { ...base, importe: 250, tipo_solicitud: "matricula", instrucciones_pago: "Yape al 999 999 999 a nombre de la institución." },
    reserva_confirmada: { ...base, monto_aprobado: 50, reserva_vence_en: "2026-11-14T23:00:00Z" },
    solicitud_rechazada: { ...base, comentario: "El comprobante no corresponde al curso." },
    solicitud_cancelada: { ...base },
    reserva_vencida: { ...base, reserva_vence_en: "2026-11-10T23:00:00Z" },
    reserva_por_vencer: { ...base, reserva_vence_en: "2026-11-14T23:00:00Z" },
    comprobante_recibido: { ...base, concepto: "Matrícula", monto: 250, metodo: "Yape", referencia: "123456" },
    comprobante_por_revisar: { ...base, estudiante: "Lucía Ramos", concepto: "Matrícula", monto: 250, metodo: "Yape", referencia: "123456", pago_id: "00000000-0000-4000-8000-000000000002" },
    pago_rechazado: { ...base, concepto: "Matrícula", monto: 250, referencia: "123456", observacion: "El monto no coincide con el depósito." },
    cuota_confirmada: { ...base, concepto: "Mensualidad 2", monto: 150, importe_cuota: 150, saldo: 0 },
    matricula_confirmada: { ...base, monto_aprobado: 250, horario: "Lunes y viernes, 7:00 p. m. – 9:00 p. m.", cuotas: [{ numero: 1, concepto: "Mensualidad", importe: 150, vencimiento: "2026-12-16" }] },
    matricula_anulada: { ...base, cuotas_parciales: 0 },
    recordatorio_cuota: { ...base, momento: "faltan_3", concepto: "Mensualidad 2", saldo: 150, vencimiento: "2026-12-16" },
    certificado_emitido: { ...base, codigo: "AX-2026-0001" },
    horario_cambiado: { ...base, anterior: "Lunes 7:00 p. m. – 9:00 p. m.", nuevo: "Lunes 6:00 p. m. – 8:00 p. m.", horario: "Lunes y viernes, 6:00 p. m. – 8:00 p. m." },
    resultado_final: { ...base },
  }
}
