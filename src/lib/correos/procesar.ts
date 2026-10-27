import { configuracionCorreo, LOTE_CORREOS } from "@/lib/correos/config"
import { renderizarCorreo } from "@/lib/correos/plantillas"
import { enviarConResend } from "@/lib/correos/proveedor"
import { clienteAdministrativo } from "@/lib/supabase/admin"

/**
 * Procesador de la bandeja public.correos_salientes (SOLO servidor).
 *
 * No hay sesión de usuario (lo llaman la tarea programada y after()), por eso usa
 * el cliente administrativo, y solo para las tres RPC del procesador, que la BD
 * permite exclusivamente a service_role. Nunca recibe datos del navegador: el
 * destinatario y el contenido salen de la fila que encoló la propia BD.
 *
 * Flujo: correos_tomar (bloquea un lote con SKIP LOCKED) → plantilla → Resend →
 * correos_resultado (enviado / reintento con espera / fallido).
 */

export type ResumenProceso =
  | { estado: "sin_configurar"; motivo: string }
  | { estado: "no_disponible"; motivo: string }
  | { estado: "ok"; recordatorios: number | null; enviados: number; reintentos: number; fallidos: number; detenido: boolean }

type Fila = {
  id: string
  destinatario: string
  tipo: string
  clave: string
  datos: Record<string, unknown> | null
}

export async function procesarCorreos(opciones: { lotes?: number; recordatorios?: boolean } = {}): Promise<ResumenProceso> {
  const config = configuracionCorreo()
  if (!config) return { estado: "sin_configurar", motivo: "Faltan RESEND_API_KEY o CORREO_REMITENTE." }
  const admin = clienteAdministrativo()
  if (!admin) return { estado: "sin_configurar", motivo: "Falta SUPABASE_SECRET_KEY." }

  let recordatorios: number | null = null
  if (opciones.recordatorios) {
    const { data, error } = await admin.rpc("encolar_recordatorios_correo")
    if (error) {
      if (error.code === "PGRST202") return { estado: "no_disponible", motivo: "La migración correos_transaccionales_v5 no está aplicada." }
      console.error("[correos] recordatorios", error.code, error.message)
    } else {
      recordatorios = typeof data === "number" ? data : null
    }
  }

  const resumen = { enviados: 0, reintentos: 0, fallidos: 0, detenido: false }
  for (let lote = 0; lote < (opciones.lotes ?? 1) && !resumen.detenido; lote++) {
    const { data, error } = await admin.rpc("correos_tomar", { p_limite: LOTE_CORREOS })
    if (error) {
      if (error.code === "PGRST202") return { estado: "no_disponible", motivo: "La migración correos_transaccionales_v5 no está aplicada." }
      console.error("[correos] tomar", error.code, error.message)
      break
    }
    const filas = (data ?? []) as Fila[]
    if (filas.length === 0) break

    for (const fila of filas) {
      // Tras un error de configuración o límite, el resto del lote se devuelve a la cola sin enviarse.
      if (resumen.detenido) {
        await marcar(admin, fila.id, { ok: false, error: "Lote detenido por un error anterior", reintentable: true })
        resumen.reintentos++
        continue
      }
      const correo = renderizarCorreo(fila.tipo, fila.datos ?? {})
      if (!correo) {
        await marcar(admin, fila.id, { ok: false, error: `Tipo de correo desconocido: ${fila.tipo}`, reintentable: false })
        resumen.fallidos++
        continue
      }
      const institucionCorreo = typeof fila.datos?.institucion_correo === "string" ? fila.datos.institucion_correo : null
      const r = await enviarConResend(
        {
          para: fila.destinatario,
          ...correo,
          clave: fila.clave,
          // Las respuestas del estudiante van a la institución (no al aviso que recibe la propia institución).
          responderA: fila.tipo === "comprobante_por_revisar" ? null : institucionCorreo,
        },
        config
      )
      if (r.ok) {
        await marcar(admin, fila.id, { ok: true, id: r.id })
        resumen.enviados++
      } else {
        // Sin el destinatario ni el contenido en los registros: solo id, tipo y error.
        console.error("[correos] envío", fila.id, fila.tipo, r.error)
        await marcar(admin, fila.id, r)
        if (r.reintentable) resumen.reintentos++
        else resumen.fallidos++
        if (r.detener) resumen.detenido = true
      }
    }
    if (filas.length < LOTE_CORREOS) break
  }
  return { estado: "ok", recordatorios, ...resumen }
}

async function marcar(
  admin: NonNullable<ReturnType<typeof clienteAdministrativo>>,
  id: string,
  r: { ok: true; id: string | null } | { ok: false; error: string; reintentable: boolean }
) {
  const { error } = await admin.rpc("correos_resultado", {
    p_id: id,
    p_ok: r.ok,
    p_proveedor_id: r.ok ? r.id : null,
    p_error: r.ok ? null : r.error,
    p_reintentable: r.ok ? false : r.reintentable,
  })
  // Si falla, la fila sigue 'enviando' y vuelve a la cola cuando venza su bloqueo
  // (la Idempotency-Key impide que Resend la envíe dos veces).
  if (error) console.error("[correos] resultado", id, error.code, error.message)
}
