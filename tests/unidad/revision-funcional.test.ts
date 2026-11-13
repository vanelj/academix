/**
 * Revisión funcional previa al despliegue (pruebas SIMULADAS: funciones puras,
 * sin red ni base de datos). Las reglas de la BD (revision_funcional_v5) se
 * comprueban en tests/estatico/seguridad.test.ts y con datos reales tras aplicarla.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { problemaFirmante } from "@/lib/certificados/firma"
import { documento, urlLogoCorreo, ORIGEN_OFICIAL } from "@/lib/correos/diseno"
import { plantillasAuth } from "@/lib/correos/auth"
import { confirmacionDobleValida, TEXTO_SEGUNDA_CONFIRMACION } from "@/lib/cursos/eliminacion"
import { nombreCopiaCurso, sinCamposDeHistorial } from "@/lib/cursos/duplicar"
import { resumenNotasAlumno } from "@/lib/estudiantes/notas"
import { enLima, fechaDeCalendario, fechaHoraLimaTexto, formatoInstante, horaLimaParaInput, hoyEnLima, instanteDesdeHoraLima } from "@/lib/fechas"
import { coincidencias, crucesDocente, crucesSemanales, fechasDelDia, mensajeCruce, nombreCortoCurso, type GrupoCalendario } from "@/lib/horarios/calendario"
import { comparaCarga, horasAcademicas, programar } from "@/lib/horarios/programacion"
import { modoApertura, visualizableEnNavegador } from "@/lib/materiales/reglas"
import { admiteInscripcion, coincideEstado, disponibilidadCurso, estadoInscripcionGrupo, type GrupoDisponible } from "@/lib/oferta/disponibilidad"
import { estadoAlumno, notaDesdePuntaje, plazoEntrega, puedeEntregar, rutaEntrega, type Entrega, type Tarea } from "@/lib/tareas/reglas"

const lunes = (hi: string, hf: string) => [{ dia_semana: 1, hora_inicio: hi, hora_fin: hf }]

describe("Cruces de horario del docente (fechas reales)", () => {
  const python = { desde: "2026-03-02", hasta: "2026-04-27", franjas: lunes("19:00", "21:00") }
  it("Python lun 19–21 y Excel lun 20–22 en el mismo periodo: cruce de 20:00 a 21:00", () => {
    const c = coincidencias(python, { desde: "2026-03-09", hasta: "2026-05-04", franjas: lunes("20:00", "22:00") })
    assert.equal(c.length, 1)
    assert.deepEqual({ dia: c[0].dia, inicio: c[0].inicio, fin: c[0].fin, desde: c[0].desde, hasta: c[0].hasta }, { dia: 1, inicio: "20:00", fin: "21:00", desde: "2026-03-09", hasta: "2026-04-27" })
  })
  it("mismo horario en meses distintos NO es cruce", () => {
    assert.deepEqual(coincidencias(python, { desde: "2026-06-01", hasta: "2026-07-27", franjas: lunes("19:00", "21:00") }), [])
  })
  it("periodos que se tocan sin ningún lunes común NO es cruce", () => {
    // Python termina el lunes 27-04; el otro grupo va del martes 28-04 al domingo 03-05.
    assert.deepEqual(coincidencias(python, { desde: "2026-04-28", hasta: "2026-05-03", franjas: lunes("19:00", "21:00") }), [])
    assert.equal(fechasDelDia("2026-04-28", "2026-05-03", 1), null)
  })
  it("horas contiguas (21:00 termina, 21:00 empieza) no se cruzan", () => {
    assert.deepEqual(coincidencias(python, { desde: "2026-03-02", hasta: "2026-04-27", franjas: lunes("21:00", "22:00") }), [])
  })
  it("mensaje comprensible con curso, día, horas y periodo", () => {
    const [c] = crucesDocente({ desde: "2026-03-09", hasta: "2026-05-04", franjas: lunes("20:00", "22:00") }, [
      { ...python, curso: "Programación con Python", grupo: "PY-01", institucion: "Academia Nova", otraInstitucion: false },
    ])
    const m = mensajeCruce(c)
    assert.match(m, /Este docente ya tiene asignado Programación con Python los lunes de 19:00 a 21:00\. Existe un cruce de horario/)
    assert.match(m, /grupo PY-01/)
    assert.match(m, /20:00 a 21:00/)
  })
  it("otra institución: no revela curso, grupo ni institución", () => {
    const [c] = crucesDocente({ desde: "2026-03-09", hasta: "2026-05-04", franjas: lunes("20:00", "22:00") }, [
      { ...python, curso: "otro curso", grupo: "—", institucion: null, otraInstitucion: true },
    ])
    const m = mensajeCruce(c)
    assert.match(m, /otra institución/)
    assert.doesNotMatch(m, /Python|PY-01/)
  })
  it("grupos cancelados o cerrados no cuentan", () => {
    assert.deepEqual(crucesDocente(python, [{ ...python, curso: "X", grupo: "G", institucion: null, otraInstitucion: false, estado: "cancelado" }]), [])
  })
  it("el aviso semanal compartido (calendarios) usa la misma regla de fechas reales", () => {
    const g = (clave: string, desde: string, hasta: string): GrupoCalendario => ({ clave, curso: clave, grupo: clave, desde, hasta, franjas: lunes("19:00", "21:00") })
    assert.equal(crucesSemanales([g("a", "2026-03-02", "2026-04-27"), g("b", "2026-06-01", "2026-07-27")]).length, 0)
    assert.equal(crucesSemanales([g("a", "2026-03-02", "2026-04-27"), g("b", "2026-04-20", "2026-07-27")]).length, 1)
  })
})

describe("Estados y disponibilidad de grupos", () => {
  const g = (estado: GrupoDisponible["estado"], vacantes: number | null, inicio = "2026-03-01"): GrupoDisponible => ({ id: `${estado}-${inicio}`, curso_id: "c", codigo: "G", estado, fecha_inicio: inicio, fecha_fin: "2026-06-01", vacantes_disponibles: vacantes })
  it("solo un grupo abierto con vacantes admite matrícula", () => {
    assert.ok(admiteInscripcion(g("abierto", 5)))
    assert.ok(!admiteInscripcion(g("abierto", 0)))
    assert.ok(!admiteInscripcion(g("en_curso", null)))
    assert.ok(!admiteInscripcion(g("programado", 10)))
    assert.equal(estadoInscripcionGrupo(g("cerrado", null)), "finalizado")
  })
  it("un grupo en curso NO desactiva el curso: otro grupo abierto sigue inscribiendo", () => {
    const d = disponibilidadCurso([g("en_curso", null), g("abierto", 3, "2026-05-01")])
    assert.equal(d.estado, "abiertas")
    assert.equal(d.grupo?.estado, "abierto")
  })
  it("todos en curso → «En curso»; nada vigente → «Sin inscripciones abiertas»", () => {
    assert.equal(disponibilidadCurso([g("en_curso", null)]).etiqueta, "En curso")
    assert.equal(disponibilidadCurso([g("cerrado", null), g("cancelado", null)]).etiqueta, "Sin inscripciones abiertas")
    assert.equal(disponibilidadCurso([]).estado, "sin_inscripciones")
  })
  it("próximamente y sin vacantes; el filtro agrupa «sin vacantes» con «sin inscripciones»", () => {
    assert.equal(disponibilidadCurso([g("programado", 10)]).estado, "proximamente")
    const sinVac = disponibilidadCurso([g("abierto", 0)])
    assert.equal(sinVac.estado, "sin_vacantes")
    assert.ok(coincideEstado(sinVac, "sin_inscripciones"))
    assert.ok(!coincideEstado(sinVac, "abiertas"))
  })
})

describe("Horas académicas automáticas", () => {
  it("no asume 60 min: sin equivalencia definida no hay horas académicas", () => {
    assert.equal(horasAcademicas(600, null), null)
    assert.equal(horasAcademicas(600, 45), 13.33)
    assert.equal(horasAcademicas(600, 50), 12)
  })
  it("sesiones, horas reloj y fin estimado desde los horarios", () => {
    const r = programar("2026-03-02", [{ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }, { dia_semana: 3, hora_inicio: "19:00", hora_fin: "21:00" }], { tipo: "sesiones", valor: 10 })
    assert.ok(r.ok)
    if (r.ok) {
      assert.equal(r.programacion.totalSesiones, 10)
      assert.equal(r.programacion.horasReloj, 20)
      assert.equal(r.programacion.fechaFin, "2026-04-01")
    }
  })
  it("carga declarada vs programada (tolerancia de media hora académica)", () => {
    assert.equal(comparaCarga(40, 26.67), "menos")
    assert.equal(comparaCarga(20, 26.67), "mas")
    assert.equal(comparaCarga(26.5, 26.67), null)
    assert.equal(comparaCarga(null, 10), null)
    assert.equal(comparaCarga(30, null), null)
  })
})

describe("Fechas y horas en America/Lima", () => {
  // 02:30 UTC del 13-11 = 21:30 del 12-11 en Lima (UTC-5). Un formateador sin zona en Vercel (UTC) mostraba 02:30 del 13.
  const instante = "2026-11-13T02:30:00Z"
  it("los instantes se muestran en hora de Lima sin importar la zona del servidor", () => {
    assert.match(fechaHoraLimaTexto(instante), /12 nov\.? 2026.*9:30/)
    assert.doesNotMatch(fechaHoraLimaTexto(instante), /2:30/)
    assert.match(formatoInstante({ timeStyle: "short" }).format(new Date(instante)), /9:30/)
  })
  it("«hoy» y el día de un registro se calculan en Lima (para filtros y vencimientos visibles)", () => {
    assert.equal(hoyEnLima(new Date(instante)), "2026-11-12")
    assert.deepEqual(enLima("2026-11-13T05:00:00Z"), { fecha: "2026-11-13", minutos: 0 })
  })
  it("las fechas de calendario (sin hora) no se desplazan un día", () => {
    assert.match(fechaDeCalendario("2026-11-13"), /13 nov/)
  })
  it("datetime-local escrito en Lima ↔ instante UTC, sin sumar horas a mano", () => {
    assert.equal(instanteDesdeHoraLima("2026-11-20T23:59"), "2026-11-21T04:59:00.000Z")
    assert.equal(horaLimaParaInput("2026-11-21T04:59:00.000Z"), "2026-11-20T23:59")
    assert.equal(instanteDesdeHoraLima("20/11/2026"), null)
  })
})

describe("Calendario mensual: nombre corto del curso", () => {
  it("«Python · 19:00» en lugar de un punto", () => {
    assert.equal(nombreCortoCurso("Programación con Python desde Cero"), "Python")
    assert.equal(nombreCortoCurso("Excel Avanzado"), "Excel")
    assert.equal(nombreCortoCurso("Curso de"), "Curso")
    assert.ok(nombreCortoCurso("Electroencefalografía clínica").length <= 14)
  })
})

describe("Eliminación segura: doble confirmación", () => {
  it("exige las dos confirmaciones explícitas (no basta una)", () => {
    assert.ok(confirmacionDobleValida({ primera: true, segunda: true }))
    assert.ok(!confirmacionDobleValida({ primera: true }))
    assert.ok(!confirmacionDobleValida("Excel Avanzado"))
    assert.ok(!confirmacionDobleValida(null))
    assert.match(TEXTO_SEGUNDA_CONFIRMACION.curso, /PERMANENTE E IRREVERSIBLE/)
  })
  it("duplicar no copia identificadores, estado, portada ni fechas", () => {
    const copia = sinCamposDeHistorial({ id: "x", institucion_id: "i", estado: "publicado", portada_url: "p", created_at: "t", nombre: "A", precio: 10 })
    assert.deepEqual(copia, { nombre: "A", precio: 10 })
    assert.equal(nombreCopiaCurso("Excel"), "Excel (copia)")
    assert.ok(nombreCopiaCurso("x".repeat(200)).length <= 150)
  })
})

describe("Documentos: vista o descarga según el tipo", () => {
  it("PDF e imágenes se ven en el navegador; Office se descarga (sin pestaña en blanco)", () => {
    assert.ok(visualizableEnNavegador("application/pdf"))
    assert.equal(modoApertura({ tipo: "archivo", archivo_tipo: "application/pdf" }), "vista")
    assert.equal(modoApertura({ tipo: "archivo", archivo_tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "descarga")
    assert.equal(modoApertura({ tipo: "archivo", archivo_tipo: null }), "descarga")
    assert.equal(modoApertura({ tipo: "archivo", archivo_tipo: "application/pdf" }, true), "descarga")
    assert.equal(modoApertura({ tipo: "enlace", archivo_tipo: null }), "enlace")
  })
})

describe("Tareas: plazos, entregas y calificación", () => {
  const base: Tarea = {
    id: "t", grupo_id: "g", institucion_id: "i", titulo: "Informe", instrucciones: null, fecha_limite: "2026-11-20T04:59:00.000Z",
    permite_tardias: false, tardias_hasta: null, max_envios: 1, puntaje_max: 10, evaluacion_id: "e", materiales: [], enlace: null, estado: "publicada", publicada_en: "2026-11-01T00:00:00Z",
  }
  const antes = new Date("2026-11-19T12:00:00Z")
  const despues = new Date("2026-11-21T12:00:00Z")
  const entrega = (cambios: Partial<Entrega> = {}): Entrega => ({
    id: "en", tarea_id: "t", matricula_id: "m", estudiante_id: "s", texto: "x", archivo_path: null, archivo_nombre: null, archivo_tipo: null, archivo_bytes: null,
    envios: 1, entregada_en: "2026-11-19T00:00:00Z", tardia: false, estado: "entregada", puntaje: null, comentario: null, calificada_en: null, ...cambios,
  })
  it("pendiente antes del plazo; vencida después si no admite tardías", () => {
    assert.equal(estadoAlumno(base, null, antes), "pendiente")
    assert.equal(estadoAlumno(base, null, despues), "vencida")
    assert.deepEqual(puedeEntregar(base, null, despues), { ok: false, motivo: "El plazo de entrega venció." })
  })
  it("entregas tardías: permitidas y marcadas; con fecha máxima", () => {
    const t = { ...base, permite_tardias: true, tardias_hasta: "2026-11-22T04:59:00.000Z" }
    assert.deepEqual(plazoEntrega(t, despues), { abierto: true, tardia: true })
    assert.equal(plazoEntrega(t, new Date("2026-11-23T00:00:00Z")).abierto, false)
    assert.equal(estadoAlumno(t, entrega({ tardia: true }), despues), "tardia")
  })
  it("reenvíos: limitados por max_envios; una entrega devuelta admite otro envío; calificada no", () => {
    assert.equal(puedeEntregar(base, entrega(), antes).ok, false)
    assert.equal(puedeEntregar({ ...base, max_envios: 2 }, entrega(), antes).ok, true)
    assert.equal(puedeEntregar(base, entrega({ estado: "devuelta" }), antes).ok, true)
    assert.equal(puedeEntregar({ ...base, max_envios: 5 }, entrega({ estado: "calificada" }), antes).ok, false)
    assert.equal(estadoAlumno(base, entrega({ estado: "calificada", puntaje: 8 }), antes), "calificada")
  })
  it("la tarea calificable alimenta su evaluación en escala 0–20 (sin otro promedio)", () => {
    assert.equal(notaDesdePuntaje(8, 10), 16)
    assert.equal(notaDesdePuntaje(17.5, 20), 17.5)
    assert.equal(notaDesdePuntaje(15, 10), 20)
  })
  it("los archivos van a la carpeta privada del propio estudiante", () => {
    assert.equal(rutaEntrega("i", "g", "t", "s", "a", "pdf"), "i/g/t/s/a.pdf")
  })
})

describe("Notas publicadas directamente", () => {
  it("el estudiante ve las notas publicadas por nota aunque la evaluación siga en borrador", () => {
    const evs = [{ id: "e1", nombre: "Examen", peso: 50, fecha: null, publicada_en: null }, { id: "e2", nombre: "Tarea", peso: 50, fecha: null, publicada_en: null }]
    const r = resumenNotasAlumno(evs, [{ evaluacion_id: "e1", nota: 15, visible: true }], { publicacionActiva: true, notaAprobatoria: 11 })
    assert.equal(r.tarjetas.find((t) => t.id === "e1")?.nota, 15)
    assert.equal(r.tarjetas.find((t) => t.id === "e2")?.nota, null)
  })
  it("sin la marca de visibilidad, una nota de evaluación no publicada no se muestra", () => {
    const evs = [{ id: "e1", nombre: "Examen", peso: 100, fecha: null, publicada_en: null }]
    const r = resumenNotasAlumno(evs, [{ evaluacion_id: "e1", nota: 15 }], { publicacionActiva: true })
    assert.equal(r.tarjetas[0].nota, null)
  })
})

describe("Firmantes del certificado", () => {
  const firmantes = [
    { id: "f1", nombre: "Ana Pérez", activo: true, firma_path: "i/firmas/a.png" },
    { id: "f2", nombre: "Luis Soto", activo: true, firma_path: null },
    { id: "f3", nombre: "Rosa Díaz", activo: false, firma_path: "i/firmas/r.png" },
  ]
  it("sin firmante es válido si el curso no lo exige", () => {
    assert.equal(problemaFirmante({ requerido: null, elegido: null, firmantes }), null)
  })
  it("si el curso exige firmante, no se emite sin él", () => {
    assert.match(problemaFirmante({ requerido: "f1", elegido: null, firmantes }) ?? "", /exige la firma de Ana Pérez/)
  })
  it("no se emite con un firmante sin firma cargada o desactivado", () => {
    assert.match(problemaFirmante({ requerido: null, elegido: "f2", firmantes }) ?? "", /no tiene firma cargada/)
    assert.match(problemaFirmante({ requerido: null, elegido: "f3", firmantes }) ?? "", /desactivado/)
    assert.equal(problemaFirmante({ requerido: "f1", elegido: "f1", firmantes }), null)
  })
})

describe("Logotipo real en los correos", () => {
  it("URL HTTPS pública del dominio oficial; nunca localhost", () => {
    assert.equal(urlLogoCorreo("http://localhost:3000"), `${ORIGEN_OFICIAL}/marca/academix-logo-correo.png`)
    assert.equal(urlLogoCorreo(undefined), `${ORIGEN_OFICIAL}/marca/academix-logo-correo.png`)
    assert.equal(urlLogoCorreo("https://academix.mundosubs.net.pe/"), "https://academix.mundosubs.net.pe/marca/academix-logo-correo.png")
  })
  it("imagen con dimensiones y texto alternativo, con alternativa si se bloquean imágenes", () => {
    const html = documento({ titulo: "t", encabezado: "e", cuerpo: "c", pie: "p" })
    assert.match(html, /<img src="https:\/\/[^"]+\/marca\/academix-logo-correo\.png" width="36" height="36" alt="Academix"/)
    assert.match(html, /background:#2563eb/)
    assert.doesNotMatch(html, />A<\/td>/)
  })
  it("las plantillas de Supabase Auth comparten el mismo logotipo", () => {
    for (const p of plantillasAuth()) assert.match(p.html, /academix-logo-correo\.png/, p.archivo)
  })
})
