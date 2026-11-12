/**
 * Aula académica: calendario, notas visibles del estudiante, «Mis cursos» y
 * materiales. Funciones puras (sin red ni base de datos).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { gruposCalendarioDocente } from "@/lib/docente/calendario"
import type { GrupoDocente } from "@/lib/docente/datos"
import type { MiCurso } from "@/lib/estudiantes/mis-cursos"
import { resumenNotasAlumno } from "@/lib/estudiantes/notas"
import { estadoAcademico, filtrarCursos, ordenarTarjetas, tarjetasMisCursos } from "@/lib/estudiantes/tarjetas"
import {
  ahoraAcademico,
  clasesEnRango,
  crucesSemanales,
  diaSemana,
  estadoClase,
  horaLegible,
  modalidadSesion,
  proximaClase,
  puedeUnirseAhora,
  semanasDelMes,
  type GrupoCalendario,
} from "@/lib/horarios/calendario"
import { agruparPorTema, enlaceMaterialValido, nombreArchivoSeguro, rutaDeGrupo, rutaMaterial, tipoMaterial } from "@/lib/materiales/reglas"

const INST = "11111111-1111-4111-8111-111111111111"
const GRUPO = "22222222-2222-4222-8222-222222222222"

// Noviembre de 2026: lunes 2, 9, 16, 23, 30.
const python: GrupoCalendario = {
  clave: "m-python",
  curso: "Programación con Python",
  grupo: "PY-01",
  institucion: "Academia Virtual Nova",
  estado: "en_curso",
  desde: "2026-11-02",
  hasta: "2026-11-27",
  franjas: [
    { dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00", enlace: "https://meet.google.com/abc-defg-hij" },
    { dia_semana: 5, hora_inicio: "19:00", hora_fin: "21:00", enlace: "javascript:alert(1)" },
  ],
}
const excel: GrupoCalendario = {
  clave: "m-excel",
  curso: "Excel Avanzado",
  grupo: "EX-02",
  institucion: "Instituto Horizonte",
  estado: "abierto",
  desde: "2026-11-10",
  hasta: "2026-12-10",
  franjas: [
    { dia_semana: 2, hora_inicio: "08:00", hora_fin: "10:00", ubicacion: "Sede Centro, aula 204" },
    { dia_semana: 4, hora_inicio: "08:00", hora_fin: "10:00" },
  ],
}

describe("Calendario académico (fechas)", () => {
  it("días de la semana y semanas del mes empiezan en lunes", () => {
    assert.equal(diaSemana("2026-11-02"), 1)
    assert.equal(diaSemana("2026-11-08"), 7)
    const semanas = semanasDelMes("2026-11-15")
    assert.equal(semanas[0][0], "2026-10-26")
    assert.ok(semanas.every((s) => s.length === 7 && diaSemana(s[0]) === 1))
    assert.ok(semanas.flat().includes("2026-11-30"))
  })
  it("hora legible en formato peruano", () => {
    assert.equal(horaLegible("19:00"), "7:00 p. m.")
    assert.equal(horaLegible("08:05"), "8:05 a. m.")
    assert.equal(horaLegible("12:00"), "12:00 p. m.")
    assert.equal(horaLegible("00:30"), "12:30 a. m.")
  })
  it("la hora actual se calcula en la zona de Lima (UTC-5), no en la del servidor", () => {
    assert.deepEqual(ahoraAcademico(new Date("2026-11-13T03:30:00Z")), { fecha: "2026-11-12", hora: "22:30" })
  })
})

describe("Calendario semanal y mensual", () => {
  it("lunes y viernes generan clases solo esos días y dentro del periodo del grupo", () => {
    const clases = clasesEnRango([python], "2026-10-01", "2026-12-31")
    assert.ok(clases.every((c) => c.dia_semana === 1 || c.dia_semana === 5))
    assert.ok(clases.every((c) => c.fecha >= "2026-11-02" && c.fecha <= "2026-11-27"))
    assert.equal(clases.filter((c) => c.dia_semana === 1).length, 4) // 2, 9, 16, 23
    assert.equal(clases.filter((c) => c.dia_semana === 5).length, 4) // 6, 13, 20, 27
  })
  it("varios cursos e instituciones se representan cada uno en su día", () => {
    const semana = clasesEnRango([python, excel], "2026-11-16", "2026-11-22")
    assert.deepEqual(semana.map((c) => `${c.fecha} ${c.grupo.curso}`), [
      "2026-11-16 Programación con Python",
      "2026-11-17 Excel Avanzado",
      "2026-11-19 Excel Avanzado",
      "2026-11-20 Programación con Python",
    ])
  })
  it("un grupo cancelado o sin fechas válidas no genera clases", () => {
    assert.equal(clasesEnRango([{ ...python, estado: "cancelado" }], "2026-11-01", "2026-11-30").length, 0)
    assert.equal(clasesEnRango([{ ...python, desde: "2026-13-40" }], "2026-11-01", "2026-11-30").length, 0)
  })
  it("solo acepta enlaces https y deduce la modalidad por sesión", () => {
    const [lunes, viernes] = clasesEnRango([python], "2026-11-02", "2026-11-06")
    assert.equal(lunes.enlace, "https://meet.google.com/abc-defg-hij")
    assert.equal(viernes.enlace, null)
    assert.equal(lunes.modalidad, "virtual")
    const [martes] = clasesEnRango([excel], "2026-11-10", "2026-11-10")
    assert.equal(martes.modalidad, "presencial")
    assert.equal(martes.ubicacion, "Sede Centro, aula 204")
    assert.equal(modalidadSesion({ dia_semana: 1, hora_inicio: "08:00", hora_fin: "09:00" }, "mixta"), null)
    assert.equal(modalidadSesion({ dia_semana: 1, hora_inicio: "08:00", hora_fin: "09:00", enlace: "https://x.y", ubicacion: "Aula 1" }), "virtual_presencial")
  })
})

describe("Cruces de horario", () => {
  const otro: GrupoCalendario = { ...excel, clave: "m-otro", curso: "Análisis de Datos", franjas: [{ dia_semana: 1, hora_inicio: "20:00", hora_fin: "22:00" }] }
  it("marca las clases que se superponen el mismo día", () => {
    const clases = clasesEnRango([python, otro], "2026-11-16", "2026-11-16")
    assert.equal(clases.length, 2)
    assert.ok(clases.every((c) => c.cruce))
  })
  it("clases contiguas no son cruce", () => {
    const contiguo = { ...otro, franjas: [{ dia_semana: 1, hora_inicio: "21:00", hora_fin: "22:00" }] }
    assert.ok(clasesEnRango([python, contiguo], "2026-11-16", "2026-11-16").every((c) => !c.cruce))
  })
  it("cruces semanales solo si los periodos de los grupos se superponen", () => {
    assert.equal(crucesSemanales([python, otro]).length, 1)
    assert.equal(crucesSemanales([python, { ...otro, desde: "2027-01-01", hasta: "2027-02-01" }]).length, 0)
  })
})

describe("Próxima clase y «Unirse a clase»", () => {
  it("encuentra la próxima clase real o la que está en curso", () => {
    const p = proximaClase([python], { fecha: "2026-11-16", hora: "20:00" })
    assert.equal(p?.fecha, "2026-11-16")
    assert.equal(estadoClase(p!, { fecha: "2026-11-16", hora: "20:00" }), "en_curso")
    const despues = proximaClase([python], { fecha: "2026-11-16", hora: "21:00" })
    assert.equal(despues?.fecha, "2026-11-20")
    assert.equal(proximaClase([python], { fecha: "2026-11-28", hora: "08:00" }), null)
  })
  it("el botón se activa 15 minutos antes y hasta el final, solo con enlace", () => {
    const c = { fecha: "2026-11-16", hora_inicio: "19:00", hora_fin: "21:00", enlace: "https://meet.google.com/x" }
    assert.equal(puedeUnirseAhora(c, { fecha: "2026-11-16", hora: "18:44" }), false)
    assert.equal(puedeUnirseAhora(c, { fecha: "2026-11-16", hora: "18:45" }), true)
    assert.equal(puedeUnirseAhora(c, { fecha: "2026-11-16", hora: "21:00" }), false)
    assert.equal(puedeUnirseAhora({ ...c, enlace: null }, { fecha: "2026-11-16", hora: "19:30" }), false)
  })
})

describe("Docente con varios cursos", () => {
  const base = { evaluaciones: [], pesoTotal: 0, estudiantes: 0, notasRegistradas: 0, notasEsperadas: 0, resultadosCerrados: 0, publicacionActiva: false }
  const grupos = [
    { ...base, id: "g1", codigo: "A", estado: "en_curso", fecha_inicio: "2026-11-02", fecha_fin: "2026-11-30", curso: { id: "c1", nombre: "Python", notaAprobatoria: 11, modalidad: "virtual" }, horarios: [{ id: "h1", dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00", enlace_clase: null }] },
    { ...base, id: "g2", codigo: "B", estado: "abierto", fecha_inicio: "2026-11-02", fecha_fin: "2026-11-30", curso: { id: "c2", nombre: "Excel", notaAprobatoria: 11, modalidad: "presencial" }, horarios: [{ id: "h2", dia_semana: 2, hora_inicio: "08:00", hora_fin: "10:00", enlace_clase: null }] },
    { ...base, id: "g3", codigo: "C", estado: "cancelado", fecha_inicio: "2026-11-02", fecha_fin: "2026-11-30", curso: null, horarios: [] },
  ] as GrupoDocente[]
  it("cada grupo es un elemento distinto con accesos a estudiantes y notas; los cancelados no aparecen", () => {
    const cal = gruposCalendarioDocente(grupos, "Nova")
    assert.deepEqual(cal.map((g) => g.clave), ["g1", "g2"])
    assert.ok(cal[0].accesos?.some((a) => a.href === "/docente/calificaciones/g1"))
    assert.ok(cal[1].accesos?.some((a) => a.href === "/docente/estudiantes?grupo=g2"))
    assert.equal(clasesEnRango(cal, "2026-11-16", "2026-11-22").length, 2)
  })
})

describe("Notas visibles del estudiante (publicación progresiva)", () => {
  const evaluaciones = [
    { id: "e1", nombre: "Examen 1", peso: 25, fecha: "2026-11-05", publicada_en: "2026-11-06T10:00:00Z" },
    { id: "e2", nombre: "Práctica 1", peso: 20, fecha: "2026-11-10", publicada_en: "2026-11-11T10:00:00Z" },
    { id: "e3", nombre: "Examen 2", peso: 25, fecha: "2026-11-20", publicada_en: null },
    { id: "e4", nombre: "Examen final", peso: 30, fecha: "2026-11-27", publicada_en: null },
  ]
  const notas = [
    { evaluacion_id: "e1", nota: 16 },
    { evaluacion_id: "e2", nota: 18 },
    { evaluacion_id: "e3", nota: 5 }, // borrador: nunca debe contar ni verse
  ]

  it("solo muestra notas de evaluaciones publicadas; lo demás es «Pendiente», nunca cero", () => {
    const r = resumenNotasAlumno(evaluaciones, notas, { publicacionActiva: true, notaAprobatoria: 11 })
    assert.deepEqual(r.tarjetas.map((t) => [t.nombre, t.nota, t.estado]), [
      ["Examen 1", 16, "calificado"],
      ["Práctica 1", 18, "calificado"],
      ["Examen 2", null, "pendiente"],
      ["Examen final", null, "pendiente"],
    ])
    assert.equal(r.pesoCalificado, 45)
  })
  it("promedio parcial ponderado y provisional: (16×25 + 18×20) / 45 = 16,89", () => {
    const r = resumenNotasAlumno(evaluaciones, notas, { publicacionActiva: true, notaAprobatoria: 11 })
    assert.equal(r.calculo.parcial, 16.89)
    assert.equal(r.calculo.promedio, null)
    assert.equal(r.resultadoPrevisto, null)
  })
  it("con todo publicado hay promedio final: 16×.25 + 18×.20 + 12×.25 + 10×.30 = 13,60", () => {
    const todas = evaluaciones.map((e) => ({ ...e, publicada_en: "2026-11-28T10:00:00Z" }))
    const r = resumenNotasAlumno(todas, [...notas.slice(0, 2), { evaluacion_id: "e3", nota: 12 }, { evaluacion_id: "e4", nota: 10 }], { publicacionActiva: true, notaAprobatoria: 11 })
    assert.equal(r.calculo.promedio, 13.6)
    assert.equal(r.resultadoPrevisto, "aprobado")
  })
  it("sin la migración se conserva la regla anterior (toda nota registrada es visible)", () => {
    const r = resumenNotasAlumno(evaluaciones.map(({ publicada_en, ...e }) => (void publicada_en, e)), notas, { publicacionActiva: false })
    assert.equal(r.tarjetas.filter((t) => t.estado === "calificado").length, 3)
  })
})

describe("«Mis cursos» del estudiante", () => {
  const curso = (over: Partial<MiCurso>): MiCurso => ({
    matriculaId: "m1",
    estado: "activa",
    estadoFinal: "en_curso",
    fechaMatricula: "2026-10-01",
    institucion: "Academia Virtual Nova",
    curso: { id: "c-py", nombre: "Programación con Python" },
    grupoId: "g1",
    grupo: { codigo: "PY-01", estado: "en_curso", fechaInicio: "2026-11-02", fechaFin: "2026-11-27" },
    docente: "Ana Pérez",
    horarios: [{ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }],
    modalidad: "virtual",
    notaAprobatoria: 11,
    portadaUrl: null,
    descripcion: null,
    ...over,
  })
  const cursos = [
    curso({}),
    curso({ matriculaId: "m2", curso: { id: "c-ex", nombre: "Excel Avanzado" }, grupoId: "g2", grupo: { codigo: "EX-01", estado: "abierto", fechaInicio: "2026-12-01", fechaFin: "2026-12-20" } }),
    curso({ matriculaId: "m3", institucion: "Instituto Horizonte", curso: { id: "c-dg", nombre: "Diseño Gráfico" }, grupoId: "g3", docente: null }),
    curso({ matriculaId: "m4", grupoId: "g4", grupo: { codigo: "PY-02", estado: "en_curso", fechaInicio: "2026-11-02", fechaFin: "2026-11-27" } }),
    curso({ matriculaId: "m5", estado: "anulada", curso: { id: "c-x", nombre: "Curso anulado" } }),
  ]
  const ahora = { fecha: "2026-11-16", hora: "10:00" }
  const tarjetas = tarjetasMisCursos(cursos, null, ahora)

  it("una tarjeta por matrícula, de varias instituciones, sin duplicar por docente", () => {
    assert.equal(tarjetas.length, 5)
    assert.deepEqual([...new Set(tarjetas.map((t) => t.institucion))].sort(), ["Academia Virtual Nova", "Instituto Horizonte"])
  })
  it("dos matrículas del mismo curso en grupos distintos se diferencian", () => {
    const py = tarjetas.filter((t) => t.curso === "Programación con Python")
    assert.deepEqual(py.map((t) => t.grupo).sort(), ["PY-01", "PY-02"])
    assert.ok(py.every((t) => t.repetido))
    assert.ok(!tarjetas.find((t) => t.curso === "Excel Avanzado")!.repetido)
  })
  it("estado académico y próxima clase", () => {
    assert.equal(estadoAcademico(cursos[1]), "por_iniciar")
    assert.equal(estadoAcademico(cursos[4]), "anulada")
    assert.equal(estadoAcademico({ ...cursos[0], estadoFinal: "aprobado" }), "aprobado")
    assert.equal(estadoAcademico({ ...cursos[0], grupo: { ...cursos[0].grupo!, estado: "cancelado" } }), "cancelado")
    assert.deepEqual(tarjetas[0].proxima, { fecha: "2026-11-16", hora_inicio: "19:00", hora_fin: "21:00", enCurso: false })
  })
  it("buscador y filtros por institución y estado; los activos primero", () => {
    assert.deepEqual(filtrarCursos(tarjetas, { texto: "horizonte", institucion: "", estado: "" }).map((t) => t.matriculaId), ["m3"])
    assert.deepEqual(filtrarCursos(tarjetas, { texto: "", institucion: "Instituto Horizonte", estado: "" }).map((t) => t.matriculaId), ["m3"])
    assert.ok(!filtrarCursos(tarjetas, { texto: "", institucion: "", estado: "activos" }).some((t) => t.estado === "anulada"))
    assert.equal(filtrarCursos(tarjetas, { texto: "ana perez", institucion: "", estado: "" }).length, 4)
    assert.equal(ordenarTarjetas(tarjetas).at(-1)?.estado, "anulada")
  })
})

describe("Materiales del curso", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0x41)].slice(0, 16))
  it("el tipo se confirma por la firma binaria, no solo por la extensión", () => {
    assert.equal(tipoMaterial("guia.pdf", bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), "application/pdf")
    assert.equal(tipoMaterial("guia.pdf", bytes(0x4d, 0x5a)), null) // ejecutable renombrado
    assert.equal(tipoMaterial("clase.docx", bytes(0x50, 0x4b, 0x03, 0x04)), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert.equal(tipoMaterial("video.mp4", bytes(0, 0, 0, 0x18)), null) // sin vídeos pesados
    assert.equal(tipoMaterial("notas.txt", new Uint8Array([0x48, 0x00, 0x41])), null)
  })
  it("la ruta del archivo queda dentro de la carpeta <institución>/<grupo>/", () => {
    const ruta = rutaMaterial(INST, GRUPO, "33333333-3333-4333-8333-333333333333", "application/pdf")
    assert.equal(ruta, `${INST}/${GRUPO}/33333333-3333-4333-8333-333333333333.pdf`)
    assert.ok(rutaDeGrupo(ruta, INST, GRUPO))
    assert.ok(!rutaDeGrupo(ruta, INST, "44444444-4444-4444-8444-444444444444"))
    assert.ok(!rutaDeGrupo(`${INST}/${GRUPO}/../otro.pdf`, INST, GRUPO))
    assert.ok(!rutaDeGrupo(`${INST}/${GRUPO}/x/y.pdf`, INST, GRUPO))
  })
  it("enlaces externos solo https y sin credenciales; nombres sin rutas", () => {
    assert.equal(enlaceMaterialValido("https://drive.google.com/file/d/1"), "https://drive.google.com/file/d/1")
    assert.equal(enlaceMaterialValido("http://inseguro.com"), null)
    assert.equal(enlaceMaterialValido("javascript:alert(1)"), null)
    assert.equal(enlaceMaterialValido("https://usuario:clave@sitio.com"), null)
    assert.equal(nombreArchivoSeguro("C:\\\\temp\\\\..\\\\guía.pdf"), "guía.pdf")
  })
  it("se agrupan por tema o semana en orden natural", () => {
    const m = (id: string, tema: string | null) => ({ id, tema, titulo: id, creado_en: "2026-11-01" })
    const temas = agruparPorTema([m("a", "Semana 10"), m("b", null), m("c", "Semana 2"), m("d", "Semana 2")]).map((g) => [g.tema, g.materiales.length])
    assert.deepEqual(temas, [["Semana 2", 2], ["Semana 10", 1], [null, 1]])
  })
})
