import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { claveNota, leerNota, planificarNotas, textoNota, type ContextoPlan } from "@/lib/docente/notas"
import { calcular, resultadoSegun } from "@/lib/evaluaciones/calculo"

const M1 = "11111111-1111-4111-8111-111111111111"
const M2 = "22222222-2222-4222-8222-222222222222"
const M3 = "33333333-3333-4333-8333-333333333333"
const E1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const E2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

describe("Registro de notas: lectura de cada casilla", () => {
  it("acepta enteros, decimales con punto o coma y la escala 0–20", () => {
    assert.deepEqual(leerNota("15"), { ok: true, nota: 15 })
    assert.deepEqual(leerNota("15,5"), { ok: true, nota: 15.5 })
    assert.deepEqual(leerNota(" 0 "), { ok: true, nota: 0 })
    assert.deepEqual(leerNota("20"), { ok: true, nota: 20 })
    assert.deepEqual(leerNota("12.25"), { ok: true, nota: 12.25 })
  })
  it("una casilla vacía es «sin nota», nunca cero", () => {
    assert.deepEqual(leerNota(""), { ok: true, nota: null })
    assert.deepEqual(leerNota("   "), { ok: true, nota: null })
  })
  it("rechaza fuera de escala, más de 2 decimales, negativos y texto", () => {
    for (const v of ["21", "20.01", "-1", "abc", "12.345", "1e1", "100"]) assert.equal(leerNota(v).ok, false, v)
  })
  it("muestra las notas guardadas sin ceros sobrantes", () => {
    assert.equal(textoNota(15), "15")
    assert.equal(textoNota(15.5), "15.5")
    assert.equal(textoNota(null), "")
  })
})

describe("Registro de notas: plan de guardado (validación del servidor)", () => {
  const ctx: ContextoPlan = {
    evaluaciones: new Set([E1, E2]),
    matriculas: new Map([[M1, "en_curso"], [M2, "aprobado"]] as const),
    existentes: new Map([[claveNota(M1, E2), { id: "n-1", nota: 14 }]]),
  }

  it("inserta, actualiza, borra y omite lo que no cambió", () => {
    const plan = planificarNotas(
      [
        { matriculaId: M1, evaluacionId: E1, nota: "16" },
        { matriculaId: M1, evaluacionId: E2, nota: "14" },
      ],
      ctx
    )
    assert.deepEqual(plan.insertar, [{ matriculaId: M1, evaluacionId: E1, nota: 16 }])
    assert.equal(plan.sinCambio, 1)
    assert.equal(plan.errores.length, 0)

    const cambio = planificarNotas([{ matriculaId: M1, evaluacionId: E2, nota: "15,5" }], ctx)
    assert.deepEqual(cambio.actualizar, [{ id: "n-1", matriculaId: M1, evaluacionId: E2, nota: 15.5 }])

    const borrar = planificarNotas([{ matriculaId: M1, evaluacionId: E2, nota: "" }], ctx)
    assert.deepEqual(borrar.borrar, [{ id: "n-1", matriculaId: M1, evaluacionId: E2 }])
  })

  it("no permite tocar resultados cerrados, matrículas ajenas ni evaluaciones de otro grupo", () => {
    const plan = planificarNotas(
      [
        { matriculaId: M2, evaluacionId: E1, nota: "10" },
        { matriculaId: M3, evaluacionId: E1, nota: "10" },
        { matriculaId: M1, evaluacionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nota: "10" },
        { matriculaId: M1, evaluacionId: E1, nota: "25" },
      ],
      ctx
    )
    assert.equal(plan.insertar.length + plan.actualizar.length + plan.borrar.length, 0)
    assert.equal(plan.errores.length, 4)
    assert.match(plan.errores[0].mensaje, /resultado final/i)
    assert.match(plan.errores[1].mensaje, /matrícula activa/i)
    assert.match(plan.errores[2].mensaje, /evaluación/i)
    assert.match(plan.errores[3].mensaje, /entre 0 y 20/i)
  })

  it("ignora casillas repetidas en el mismo envío", () => {
    const plan = planificarNotas(
      [
        { matriculaId: M1, evaluacionId: E1, nota: "10" },
        { matriculaId: M1, evaluacionId: E1, nota: "11" },
      ],
      ctx
    )
    assert.equal(plan.insertar.length, 1)
    assert.equal(plan.insertar[0].nota, 10)
  })
})

describe("Cálculo académico (misma regla que registrar_resultado_final)", () => {
  const evs = [{ id: E1, peso: 40 }, { id: E2, peso: 60 }]
  it("promedio ponderado con 2 decimales cuando los pesos suman 100 y no faltan notas", () => {
    const c = calcular(evs, [{ evaluacion_id: E1, nota: 12 }, { evaluacion_id: E2, nota: 15.5 }])
    assert.equal(c.estado, "completo")
    assert.equal(c.promedio, 14.1)
    assert.equal(resultadoSegun(c.promedio, 11), "aprobado")
    assert.equal(resultadoSegun(c.promedio, 14.11), "desaprobado")
  })
  it("con notas pendientes no hay promedio final, solo parcial", () => {
    const c = calcular(evs, [{ evaluacion_id: E1, nota: 12 }])
    assert.equal(c.estado, "notas_pendientes")
    assert.equal(c.promedio, null)
    assert.equal(c.parcial, 12)
    assert.equal(c.faltantes, 1)
  })
  it("pesos que no suman 100 no producen promedio final", () => {
    const c = calcular([{ id: E1, peso: 40 }], [{ evaluacion_id: E1, nota: 20 }])
    assert.equal(c.estado, "pesos_incompletos")
    assert.equal(c.promedio, null)
  })
  it("redondea como la base de datos (sin errores de coma flotante)", () => {
    const c = calcular([{ id: E1, peso: 33.33 }, { id: E2, peso: 66.67 }], [{ evaluacion_id: E1, nota: 10.55 }, { evaluacion_id: E2, nota: 10.55 }])
    assert.equal(c.promedio, 10.55)
  })
})
