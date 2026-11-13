/**
 * Programación automática de clases, malla semanal y permisos del equipo
 * administrativo. Funciones puras (sin red ni base de datos).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ACCESO_COMPLETO,
  areaDeRuta,
  dejaSinPrincipal,
  motivoNoPuedeGestionar,
  normalizarModulos,
  puede,
  type AccesoAdmin,
} from "@/lib/admin/permisos"
import { clasesEnRango } from "@/lib/horarios/calendario"
import { carrilesDelDia, rangoHorasMalla } from "@/lib/horarios/malla"
import { duracionLegible, horasAcademicas, programar, validarFranjas } from "@/lib/horarios/programacion"

const lunesViernes = [
  { dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" },
  { dia_semana: 5, hora_inicio: "19:00", hora_fin: "21:00" },
]

describe("Programación automática por semanas", () => {
  it("ejemplo: inicio 16/11/2026, 8 semanas, lunes y viernes 7–9 p. m.", () => {
    const r = programar("2026-11-16", lunesViernes, { tipo: "semanas", valor: 8 })
    assert.ok(r.ok)
    const p = r.programacion
    assert.equal(p.totalSesiones, 16)
    assert.equal(p.horasReloj, 32)
    assert.equal(p.fechaFin, "2027-01-10") // 8 semanas cruzando de año
    assert.equal(p.sesiones[0].fecha, "2026-11-16")
    assert.equal(p.sesiones.at(-1)?.fecha, "2027-01-08")
    assert.ok(p.sesiones.every((s) => s.dia_semana === 1 || s.dia_semana === 5))
    assert.equal(p.semanas, 8)
  })
  it("no genera clases antes del inicio aunque empiece a mitad de semana", () => {
    const r = programar("2026-11-18", lunesViernes, { tipo: "semanas", valor: 1 }) // miércoles
    assert.ok(r.ok)
    assert.deepEqual(r.programacion.sesiones.map((s) => s.fecha), ["2026-11-20", "2026-11-23"])
    assert.equal(r.programacion.fechaFin, "2026-11-24")
  })
})

describe("Programación por sesiones y por horas", () => {
  it("por sesiones calcula la fecha de fin con la última sesión", () => {
    const r = programar("2026-11-16", lunesViernes, { tipo: "sesiones", valor: 5 })
    assert.ok(r.ok)
    assert.equal(r.programacion.totalSesiones, 5)
    assert.equal(r.programacion.fechaFin, "2026-11-30")
  })
  it("horarios distintos por día y horas reloj (sin equivalencias inventadas)", () => {
    const franjas = [
      { dia_semana: 2, hora_inicio: "08:00", hora_fin: "10:00" }, // 2 h
      { dia_semana: 4, hora_inicio: "18:30", hora_fin: "19:30" }, // 1 h
    ]
    const r = programar("2026-12-28", franjas, { tipo: "horas", valor: 10 })
    assert.ok(r.ok)
    // mar 29/12, jue 31/12, mar 5/1, jue 7/1, mar 12/1, jue 14/1, mar 19/1: 2+1+2+1+2+1+2 = 11 ≥ 10 (la última clase no se corta).
    assert.equal(r.programacion.totalSesiones, 7)
    assert.equal(r.programacion.minutosReloj, 660)
    assert.equal(r.programacion.excedenteMinutos, 60)
    assert.equal(r.programacion.fechaFin, "2027-01-19")
    assert.equal(horasAcademicas(r.programacion.minutosReloj, null), null)
    assert.equal(horasAcademicas(r.programacion.minutosReloj, 45), 14.67)
    assert.equal(horasAcademicas(600, 5), null) // valor absurdo: no se calcula
    assert.equal(duracionLegible(90), "1 h 30 min")
  })
  it("valida datos y cruces dentro del mismo grupo", () => {
    assert.ok(!programar("2026-11-16", [], { tipo: "semanas", valor: 4 }).ok)
    assert.ok(!programar("2026-02-30", lunesViernes, { tipo: "semanas", valor: 4 }).ok)
    assert.ok(!programar("2026-11-16", lunesViernes, { tipo: "sesiones", valor: 2.5 }).ok)
    assert.ok(!programar("2026-11-16", lunesViernes, { tipo: "semanas", valor: 0 }).ok)
    assert.deepEqual(validarFranjas([{ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }, { dia_semana: 1, hora_inicio: "20:00", hora_fin: "22:00" }]), ["Dos horarios del mismo día se cruzan."])
    assert.ok(validarFranjas([{ dia_semana: 3, hora_inicio: "10:00", hora_fin: "09:00" }]).length > 0)
  })
  it("las clases del calendario coinciden con la programación (sin duplicar)", () => {
    const r = programar("2026-11-16", lunesViernes, { tipo: "semanas", valor: 8 })
    assert.ok(r.ok)
    const clases = clasesEnRango([{ clave: "g", curso: "Python", grupo: "A", desde: r.programacion.fechaInicio, hasta: r.programacion.fechaFin, franjas: lunesViernes }], "2026-11-01", "2027-02-28")
    assert.deepEqual(clases.map((c) => c.fecha), r.programacion.sesiones.map((s) => s.fecha))
  })
})

describe("Malla semanal", () => {
  it("rango de horas cubre todas las clases", () => {
    assert.deepEqual(rangoHorasMalla([]), { desde: 8, hasta: 20 })
    assert.deepEqual(rangoHorasMalla([{ id: "a", hora_inicio: "07:30", hora_fin: "21:15" }]), { desde: 7, hasta: 22 })
  })
  it("clases simultáneas van en carriles distintos; las contiguas comparten carril", () => {
    const m = carrilesDelDia([
      { id: "a", hora_inicio: "19:00", hora_fin: "21:00" },
      { id: "b", hora_inicio: "20:00", hora_fin: "22:00" },
      { id: "c", hora_inicio: "08:00", hora_fin: "10:00" },
      { id: "d", hora_inicio: "10:00", hora_fin: "11:00" },
    ])
    assert.deepEqual(m.get("a"), { carril: 0, total: 2 })
    assert.deepEqual(m.get("b"), { carril: 1, total: 2 })
    assert.deepEqual(m.get("c"), { carril: 0, total: 1 })
    assert.deepEqual(m.get("d"), { carril: 0, total: 1 })
  })
})

describe("Equipo administrativo: permisos por módulo", () => {
  const secundario: AccesoAdmin = { principal: false, total: false, modulos: ["pagos"] }
  it("el principal puede todo, incluido el equipo; el secundario solo sus módulos", () => {
    assert.ok(puede(ACCESO_COMPLETO, "equipo"))
    assert.ok(puede(secundario, "pagos"))
    assert.ok(!puede(secundario, "cursos"))
    assert.ok(!puede(secundario, "equipo"))
    assert.ok(!puede({ principal: false, total: true, modulos: [] }, "equipo"), "acceso completo no incluye gestionar el equipo")
    assert.ok(!puede(null, "pagos"))
  })
  it("cada ruta del panel pertenece a su módulo", () => {
    assert.equal(areaDeRuta("/admin/pagos/cuotas"), "pagos")
    assert.equal(areaDeRuta("/admin/grupos/123"), "docentes")
    assert.equal(areaDeRuta("/admin/calendario"), "docentes")
    assert.equal(areaDeRuta("/admin/politicas"), "institucion")
    assert.equal(areaDeRuta("/admin/equipo"), "equipo")
    assert.equal(areaDeRuta("/admin"), null)
    assert.equal(areaDeRuta("/admin/pagosx"), null)
  })
  it("sin escalamiento: nadie cambia sus propios permisos y solo el principal gestiona", () => {
    const yo = { id: "a", acceso: ACCESO_COMPLETO }
    assert.match(motivoNoPuedeGestionar(yo, { id: "a", principal: true })!, /propios/)
    assert.match(motivoNoPuedeGestionar({ id: "b", acceso: secundario }, { id: "c", principal: false })!, /principal/)
    assert.match(motivoNoPuedeGestionar({ id: "b", acceso: { ...secundario, total: true } }, { id: "c", principal: false })!, /principal/)
    assert.equal(motivoNoPuedeGestionar(yo, { id: "c", principal: false }), null)
  })
  it("la institución nunca queda sin principal activo", () => {
    const equipo = [{ id: "a", principal: true, activo: true }, { id: "b", principal: false, activo: true }]
    assert.ok(dejaSinPrincipal(equipo, "a"))
    assert.ok(!dejaSinPrincipal([...equipo, { id: "c", principal: true, activo: true }], "a"))
  })
  it("los módulos se normalizan (sin inventados ni repetidos)", () => {
    assert.deepEqual(normalizarModulos(["pagos", "pagos", "superadmin", "cursos", 3]), ["cursos", "pagos"])
    assert.deepEqual(normalizarModulos("pagos"), [])
  })
})
