/**
 * Integración con Supabase — SOLO LECTURA, con CUENTAS DE PRUEBA.
 * No crea, cambia ni borra datos. Se omite si no están las variables:
 *
 *   ACADEMIX_PRUEBA_URL, ACADEMIX_PRUEBA_CLAVE_PUBLICA
 *   ACADEMIX_PRUEBA_DOCENTE_CORREO, ACADEMIX_PRUEBA_DOCENTE_CLAVE      (rol activo: docente)
 *   ACADEMIX_PRUEBA_ESTUDIANTE_CORREO, ACADEMIX_PRUEBA_ESTUDIANTE_CLAVE (rol activo: estudiante)
 *
 * Ejecutar: npm run test:integracion
 * Comprueba el aislamiento que exige la RLS de V5: cada rol solo lee lo suyo.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const env = process.env
const URL_ = env.ACADEMIX_PRUEBA_URL
const CLAVE = env.ACADEMIX_PRUEBA_CLAVE_PUBLICA
const configurado = Boolean(URL_ && CLAVE)

async function sesion(correo?: string, clave?: string): Promise<{ cliente: SupabaseClient; id: string } | null> {
  if (!configurado || !correo || !clave) return null
  const cliente = createClient(URL_!, CLAVE!, { auth: { persistSession: false } })
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password: clave })
  if (error || !data.user) throw new Error(`No se pudo iniciar sesión con la cuenta de prueba (${correo}).`)
  return { cliente, id: data.user.id }
}

describe("RLS (solo lectura, cuentas de prueba)", { skip: !configurado && "Sin variables ACADEMIX_PRUEBA_*: prueba omitida" }, () => {
  it("anónimo: no lee notas, matrículas ni notificaciones", async () => {
    const anon = createClient(URL_!, CLAVE!, { auth: { persistSession: false } })
    for (const tabla of ["calificaciones", "matriculas", "notificaciones"]) {
      const { data } = await anon.from(tabla).select("id").limit(1)
      assert.equal((data ?? []).length, 0, tabla)
    }
  })

  it("docente: solo ve calificaciones y matrículas de SUS grupos", { skip: !env.ACADEMIX_PRUEBA_DOCENTE_CORREO && "Sin cuenta docente de prueba" }, async () => {
    const s = (await sesion(env.ACADEMIX_PRUEBA_DOCENTE_CORREO, env.ACADEMIX_PRUEBA_DOCENTE_CLAVE))!
    const { data: grupos } = await s.cliente.from("grupos").select("id").eq("docente_id", s.id)
    const propios = new Set((grupos ?? []).map((g) => g.id as string))
    for (const tabla of ["calificaciones", "matriculas"]) {
      const { data, error } = await s.cliente.from(tabla).select("grupo_id").limit(1000)
      assert.equal(error, null, tabla)
      for (const fila of data ?? []) assert.ok(propios.has(fila.grupo_id as string), `${tabla}: fila de un grupo ajeno`)
    }
    const { data: pagos } = await s.cliente.from("pagos").select("id").limit(1)
    assert.equal((pagos ?? []).length, 0, "el docente no debe ver pagos")
    await s.cliente.auth.signOut()
  })

  it("estudiante: solo ve sus matrículas y sus calificaciones", { skip: !env.ACADEMIX_PRUEBA_ESTUDIANTE_CORREO && "Sin cuenta estudiante de prueba" }, async () => {
    const s = (await sesion(env.ACADEMIX_PRUEBA_ESTUDIANTE_CORREO, env.ACADEMIX_PRUEBA_ESTUDIANTE_CLAVE))!
    const { data: mats, error } = await s.cliente.from("matriculas").select("id, estudiante_id").limit(1000)
    assert.equal(error, null)
    for (const m of mats ?? []) assert.equal(m.estudiante_id, s.id)
    const propias = new Set((mats ?? []).map((m) => m.id as string))
    const { data: notas } = await s.cliente.from("calificaciones").select("matricula_id, evaluacion_id").limit(1000)
    for (const n of notas ?? []) assert.ok(propias.has(n.matricula_id as string), "calificación de otra matrícula")
    // Con aula_academica_v5: ninguna nota visible puede ser de una evaluación sin publicar.
    const evIds = [...new Set((notas ?? []).map((n) => n.evaluacion_id as string))]
    if (evIds.length) {
      const { data: evs, error: evError } = await s.cliente.from("evaluaciones").select("id, publicada_en").in("id", evIds)
      if (!evError) for (const e of evs ?? []) assert.ok(e.publicada_en, "el estudiante ve una nota en borrador")
    }
    // Materiales: solo de grupos con matrícula activa propia.
    const { data: mats2 } = await s.cliente.from("matriculas").select("grupo_id, estado").eq("estudiante_id", s.id)
    const grupos = new Set((mats2 ?? []).filter((m) => m.estado === "activa").map((m) => m.grupo_id as string))
    const { data: materiales, error: matError } = await s.cliente.from("materiales_curso").select("grupo_id").limit(1000)
    if (!matError) for (const m of materiales ?? []) assert.ok(grupos.has(m.grupo_id as string), "material de un grupo ajeno")
    await s.cliente.auth.signOut()
  })
})
