/**
 * Correos (plantillas, configuración, proveedor simulado) y eliminación segura
 * de cursos y grupos. Sin red: Resend se simula con un fetch falso.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { datosInvitacion } from "@/lib/auth/activacion"
import { ENLACE_INVITACION, ENLACE_RECUPERACION, plantillasAuth } from "@/lib/correos/auth"
import { configuracionCorreo, remitenteValido } from "@/lib/correos/config"
import { ejemplosCorreos } from "@/lib/correos/ejemplos"
import { renderizarCorreo, TIPOS_CORREO } from "@/lib/correos/plantillas"
import { enviarConResend } from "@/lib/correos/proveedor"
import { archivosLimpiables, bloqueos, confirmacionCoincide, normalizarDiagnostico, seEliminara } from "@/lib/cursos/eliminacion"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

describe("Plantillas transaccionales (Resend)", () => {
  it("cada tipo tiene plantilla en español con HTML, texto plano y botón a Academix", () => {
    const ejemplos = ejemplosCorreos()
    for (const tipo of TIPOS_CORREO) {
      const c = renderizarCorreo(tipo, ejemplos[tipo])
      assert.ok(c, tipo)
      assert.match(c.html, /<html lang="es">/)
      assert.ok(c.texto.length > 40, tipo)
      assert.ok(c.asunto.length > 5 && c.asunto.length <= 200, tipo)
      assert.doesNotMatch(c.html, /undefined|null|\[object Object\]/, tipo)
      for (const href of c.html.match(/href="([^"]+)"/g) ?? []) assert.match(href, /href="https:\/\/academix\.mundosubs\.net\.pe\//, `${tipo}: ${href}`)
    }
  })
  it("tipo desconocido → null (el procesador lo marca como fallido sin reintentar)", () => {
    assert.equal(renderizarCorreo("enviar_a_todos", {}), null)
  })
  it("escapa los datos (sin inyección de HTML)", () => {
    const c = renderizarCorreo("solicitud_recibida", { ...ejemplosCorreos().solicitud_recibida, curso: "<script>alert(1)</script>", nombre: "Ana \"<b>\"" })!
    assert.doesNotMatch(c.html, /<script>/)
    assert.match(c.html, /&lt;script&gt;/)
  })
  it("comprobante recibido no dice aprobado; resultado final no incluye la nota", () => {
    const rec = renderizarCorreo("comprobante_recibido", ejemplosCorreos().comprobante_recibido)!
    assert.match(rec.texto, /no la aprobación/)
    const res = renderizarCorreo("resultado_final", { ...ejemplosCorreos().resultado_final, promedio: 17.5 })!
    assert.doesNotMatch(res.texto, /17[.,]5/)
    assert.match(res.html, /seccion=notas/)
  })
  it("matrícula confirmada muestra institución, curso, grupo y horario, y lleva al aula", () => {
    const c = renderizarCorreo("matricula_confirmada", ejemplosCorreos().matricula_confirmada)!
    for (const t of ["Institución de ejemplo", "PY-01", "Lunes y viernes", "/estudiante/cursos/00000000-0000-4000-8000-000000000001"]) assert.ok(c.html.includes(t), t)
  })
})

describe("Plantillas de Supabase Auth", () => {
  const auth = plantillasAuth()
  const inv = auth.find((p) => p.panel === "Invite user")!
  it("la invitación distingue docente y administrador e incluye institución y nivel", () => {
    assert.match(inv.html, /\{\{ if \.Data\.invitacion_admin \}\}/)
    assert.match(inv.html, /como <strong>docente<\/strong>/)
    assert.match(inv.html, /equipo administrativo/)
    assert.match(inv.html, /\.Data\.invitacion_institucion/)
    assert.match(inv.html, /\.Data\.invitacion_nivel/)
    assert.match(inv.asunto, /Has sido invitado como docente a .* — Academix/)
    assert.match(inv.asunto, /Invitación al equipo administrativo de .* — Academix/)
  })
  it("conserva el enlace seguro de activación y de recuperación (rutas existentes)", () => {
    assert.equal(ENLACE_INVITACION, "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite")
    assert.ok(inv.html.includes(ENLACE_INVITACION))
    assert.ok(auth.find((p) => p.panel === "Reset password")!.html.includes(ENLACE_RECUPERACION))
  })
  it("los archivos versionados coinciden con el generador (npm run correos:plantillas)", () => {
    for (const p of auth) {
      const archivo = readFileSync(path.join(raiz, "docs", "correos", "supabase", p.archivo), "utf8")
      assert.equal(archivo.trimEnd(), p.html.trimEnd(), `${p.archivo} desactualizado: ejecuta npm run correos:plantillas`)
    }
  })
  it("los datos de la invitación los fija el servidor y no conceden roles", () => {
    assert.deepEqual(datosInvitacion("docente", "Academia Nova"), { invitacion_institucion: "Academia Nova", invitacion_admin: false, invitacion_nivel: null })
    assert.deepEqual(datosInvitacion("admin", "Academia Nova", "Pagos"), { invitacion_institucion: "Academia Nova", invitacion_admin: true, invitacion_nivel: "Pagos" })
  })
})

describe("Configuración y proveedor Resend (simulado)", () => {
  const fetchOriginal = globalThis.fetch
  afterEach(() => { globalThis.fetch = fetchOriginal })
  const cfg = { apiKey: "re_prueba", remitente: "Academix <no-reply@notificaciones.academix.mundosubs.net.pe>" }
  const msg = { para: "a@b.pe", asunto: "Hola", html: "<p>x</p>", texto: "x", clave: "matricula_confirmada:1" }

  it("remitente: RESEND_FROM_EMAIL (o CORREO_REMITENTE) con formato válido", () => {
    assert.deepEqual(configuracionCorreo({ RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: cfg.remitente }), { apiKey: "re_x", remitente: cfg.remitente })
    assert.deepEqual(configuracionCorreo({ RESEND_API_KEY: "re_x", CORREO_REMITENTE: "no-reply@x.pe" })?.remitente, "no-reply@x.pe")
    assert.equal(configuracionCorreo({ RESEND_API_KEY: "re_x" }), null)
    assert.equal(configuracionCorreo({ RESEND_FROM_EMAIL: cfg.remitente }), null)
    assert.ok(!remitenteValido("Academix <no-reply>"))
    assert.ok(!remitenteValido("a@b.pe\r\nBcc: x@y.pe"))
  })
  it("envía con Idempotency-Key = clave del evento y un único destinatario", async () => {
    let peticion: { headers: Record<string, string>; body: { to: string[] } } | null = null
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      peticion = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 })
    }) as typeof fetch
    assert.deepEqual(await enviarConResend(msg, cfg), { ok: true, id: "em_1" })
    assert.equal(peticion!.headers["Idempotency-Key"], "matricula_confirmada:1")
    assert.deepEqual(peticion!.body.to, ["a@b.pe"])
  })
  it("clasifica errores: clave inválida detiene el lote; 422 no se reintenta; 429/5xx sí", async () => {
    const con = (status: number, body: object = {}) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch }
    con(401); const r401 = await enviarConResend(msg, cfg)
    assert.ok(!r401.ok && r401.reintentable && r401.detener)
    con(422, { name: "validation_error" }); const r422 = await enviarConResend(msg, cfg)
    assert.ok(!r422.ok && !r422.reintentable)
    con(429); const r429 = await enviarConResend(msg, cfg)
    assert.ok(!r429.ok && r429.reintentable)
    con(503); const r503 = await enviarConResend(msg, cfg)
    assert.ok(!r503.ok && r503.reintentable)
    globalThis.fetch = (async () => { throw new TypeError("red") }) as typeof fetch
    const red = await enviarConResend(msg, cfg)
    assert.ok(!red.ok && red.reintentable)
  })
})

describe("Eliminación segura: clasificación", () => {
  const vacio = { grupos: 2, horarios: 5, evaluaciones: 3, materiales: 1, plan_cuotas: 1, condiciones: 1, certificacion: 1, portada: 1 }
  it("curso con grupos vacíos, horarios, evaluaciones sin notas, materiales y plan → eliminable", () => {
    const d = normalizarDiagnostico({ ...vacio, eliminable: true })
    assert.ok(d.eliminable)
    const l = seEliminara(d, "curso")
    for (const t of ["1 curso", "2 grupos sin estudiantes", "5 horarios", "3 evaluaciones sin notas", "1 material compartido", "Portada"]) assert.ok(l.some((x) => x.startsWith(t)), t)
  })
  for (const [campo, etiqueta] of [
    ["matriculas", "Ver matrículas"], ["solicitudes", "Ver solicitudes"], ["pagos", "Ver pagos"], ["cuotas", "Ver cuotas"],
    ["calificaciones", "Ver evaluaciones"], ["resultados", "Ver evaluaciones"], ["certificados", "Ver certificados"],
  ] as const) {
    it(`con ${campo} → NO eliminable, con enlace «${etiqueta}»`, () => {
      const d = normalizarDiagnostico({ ...vacio, [campo]: 2, eliminable: true })
      assert.equal(d.eliminable, false, "no se confía en el booleano de la respuesta")
      assert.ok(bloqueos(d, { matriculas: "g1", solicitudes: "g1" }).some((b) => b.etiqueta === etiqueta))
    })
  }
  it("matrículas anuladas también son historial", () => {
    const d = normalizarDiagnostico({ matriculas: 1, matriculas_anuladas: 1 })
    assert.ok(!d.eliminable)
    assert.match(bloqueos(d, { matriculas: "g1" })[0].texto, /1 anulada/)
    assert.equal(bloqueos(d, { matriculas: "g1" })[0].href, "/admin/matriculas?grupo=g1")
  })
  it("dependencias no previstas bloquean", () => {
    const d = normalizarDiagnostico({ inesperadas: [{ tabla: "asistencias", filas: 4 }], eliminable: true })
    assert.ok(!d.eliminable)
    assert.match(bloqueos(d)[0].texto, /asistencias/)
  })
  it("confirmación: nombre exacto (espacios a los extremos se ignoran; mayúsculas cuentan)", () => {
    assert.ok(confirmacionCoincide("Excel Avanzado", "  Excel Avanzado "))
    assert.ok(!confirmacionCoincide("Excel Avanzado", "excel avanzado"))
    assert.ok(!confirmacionCoincide("Excel Avanzado", "Excel"))
    assert.ok(!confirmacionCoincide("", ""))
  })
  it("limpieza de Storage solo en carpetas de los grupos eliminados de la institución", () => {
    const inst = "11111111-1111-4111-8111-111111111111"
    const g = "22222222-2222-4222-8222-222222222222"
    const ok = `${inst}/${g}/33333333-3333-4333-8333-333333333333.pdf`
    const ajena = `${inst}/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.pdf`
    assert.deepEqual(archivosLimpiables([ok, ajena, `../${ok}`, 5, ok], inst, [g]), [ok])
    assert.deepEqual(archivosLimpiables("x", inst, [g]), [])
  })
})
