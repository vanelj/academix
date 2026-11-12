"use server"

import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { obtenerCertificacionCurso } from "@/lib/certificados/datos"
import { valoresDeCurso } from "@/lib/cursos/asistente"
import {
  canonCertificacion,
  canonCuota,
  canonCurso,
  canonGrupo,
  canonHorario,
  iguales,
  valoresCuota,
  valoresGrupo,
  valoresHorario,
  type DatosGrupo,
  type Esperado,
  type ValoresCuota,
} from "@/lib/cursos/asistente-logica"
import { obtenerCurso, obtenerPlanCuotas } from "@/lib/cursos/datos"
import { obtenerGrupo } from "@/lib/grupos/datos"
import { valoresCertificacion, type CertificacionValues } from "@/lib/validations/certificacion-curso"
import type { CursoValues } from "@/lib/validations/curso"
import type { HorarioValues } from "@/lib/validations/grupo"

/**
 * Antes de guardar desde el asistente: ¿alguien cambió en otra sesión algo que
 * este guardado va a modificar o borrar? Compara lo que el asistente cargó con lo
 * que hay ahora en Supabase (formas canónicas: "260" = "260.00"). Solo lee.
 * Si hay conflictos, el asistente no escribe nada y pide recargar.
 */

const texto = z.string().max(5000)
const valores = z.record(z.string(), z.union([texto, z.boolean(), z.null()]))
const esperadoSchema = z.object({
  curso: z.object({ valores: z.looseObject({ condiciones: valores }), tieneCondiciones: z.boolean() }).optional(),
  cuotas: z.array(z.object({ id: z.uuid(), valores })).max(500).optional(),
  grupos: z.array(z.object({ id: z.uuid(), valores })).max(200).optional(),
  horarios: z.array(z.object({ grupoId: z.uuid(), id: z.uuid(), valores })).max(2000).optional(),
  certificacion: valores.nullable().optional(),
})

export type ResultadoConflictos = { ok: true; conflictos: string[] } | { ok: false; mensaje: string }

const NO_VERIFICADO: ResultadoConflictos = {
  ok: false,
  mensaje: "No se pudo comprobar si el curso cambió en otra sesión. No se guardó nada para no sobrescribir cambios; inténtalo de nuevo.",
}

export async function comprobarConflictos(cursoId: unknown, esperado: unknown): Promise<ResultadoConflictos> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return { ok: false, mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
  const id = z.uuid().safeParse(cursoId)
  const e = esperadoSchema.safeParse(esperado)
  if (!id.success || !e.success) return NO_VERIFICADO
  const pedido = e.data as Esperado

  try {
    const conflictos: string[] = []

    if (pedido.curso) {
      const actual = await obtenerCurso(institucionId, id.data)
      if (!actual) return { ok: true, conflictos: ["El curso ya no existe o no pertenece a tu institución."] }
      const ahora = canonCurso(valoresDeCurso(actual), actual.condiciones !== null)
      const antes = canonCurso(pedido.curso.valores as CursoValues, pedido.curso.tieneCondiciones)
      if (!iguales(ahora, antes)) conflictos.push("Los datos, precios o condiciones del curso cambiaron en otra sesión.")
    }

    if (pedido.cuotas?.length) {
      const plan = await obtenerPlanCuotas(institucionId, id.data)
      if (!plan) return NO_VERIFICADO
      for (const q of pedido.cuotas) {
        const fila = plan.find((x) => x.id === q.id)
        const numero = (q.valores as ValoresCuota).numero
        if (!fila) conflictos.push(`La cuota ${numero} del plan ya no existe.`)
        else if (!iguales(canonCuota(valoresCuota(fila)), canonCuota(q.valores as ValoresCuota))) conflictos.push(`La cuota ${numero} del plan cambió.`)
      }
    }

    const gruposALeer = new Set([...(pedido.grupos ?? []).map((g) => g.id), ...(pedido.horarios ?? []).map((h) => h.grupoId)])
    const grupos = new Map(await Promise.all([...gruposALeer].map(async (gid) => [gid, await obtenerGrupo(institucionId, gid)] as const)))
    for (const g of pedido.grupos ?? []) {
      const fila = grupos.get(g.id)
      const codigo = (g.valores as DatosGrupo).codigo
      if (!fila || fila.curso?.id !== id.data) conflictos.push(`El grupo «${codigo}» ya no existe.`)
      else if (!iguales(canonGrupo(valoresGrupo(fila)), canonGrupo(g.valores as DatosGrupo))) conflictos.push(`El grupo «${codigo}» cambió.`)
    }
    for (const h of pedido.horarios ?? []) {
      const grupo = grupos.get(h.grupoId)
      const fila = grupo?.curso?.id === id.data ? grupo.horarios.find((x) => x.id === h.id) : undefined
      const nombre = grupo ? `del grupo «${grupo.codigo}»` : "de un grupo"
      if (!fila) conflictos.push(`Un horario ${nombre} ya no existe.`)
      else if (!iguales(canonHorario(valoresHorario(fila)), canonHorario(h.valores as HorarioValues))) conflictos.push(`Un horario ${nombre} cambió.`)
    }

    if (pedido.certificacion !== undefined) {
      const cert = await obtenerCertificacionCurso(institucionId, id.data)
      if (!cert.disponible) return NO_VERIFICADO
      const ahora = cert.config ? canonCertificacion(valoresCertificacion(cert.config)) : null
      const antes = pedido.certificacion ? canonCertificacion(pedido.certificacion as CertificacionValues) : null
      if (!iguales(ahora, antes)) conflictos.push("La certificación del curso cambió.")
    }

    return { ok: true, conflictos }
  } catch (error) {
    console.error("[asistente] comprobar conflictos", error instanceof Error ? error.message : error)
    return NO_VERIFICADO
  }
}
