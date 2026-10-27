import { timingSafeEqual } from "node:crypto"

import { procesarCorreos } from "@/lib/correos/procesar"

/**
 * Tarea programada de correos: encola los recordatorios del día (cuotas y
 * reservas) y envía o reintenta los pendientes. Es idempotente: llamarla varias
 * veces no duplica correos.
 *
 * Protección: exige "Authorization: Bearer <CRON_SECRET>" (Vercel Cron lo envía
 * solo si CRON_SECRET está definida). Sin la variable, la ruta queda cerrada.
 */
export const maxDuration = 60

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET
  if (!secreto || secreto.length < 16) return false
  const recibido = Buffer.from(request.headers.get("authorization") ?? "")
  const esperado = Buffer.from(`Bearer ${secreto}`)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ error: "No autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  try {
    const resumen = await procesarCorreos({ lotes: 5, recordatorios: true })
    const status = resumen.estado === "ok" ? 200 : 503
    return Response.json(resumen, { status, headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[correos] tarea programada", e instanceof Error ? e.message : e)
    return Response.json({ error: "Error al procesar los correos" }, { status: 500, headers: { "Cache-Control": "no-store" } })
  }
}
