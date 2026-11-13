/**
 * Gestión de correos desde el repositorio: renderizado por rol de las plantillas
 * de Supabase Auth y sincronización con la Management API (respuestas simuladas;
 * nunca se contacta a Supabase).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { plantillasAuth } from "@/lib/correos/auth"
import {
  actualizarConfigAuth,
  CLAVES_PERMITIDAS,
  copiaGestionada,
  cuerpoParche,
  leerConfigAuth,
  planSincronizacion,
  referenciaProyecto,
  resumenConservado,
} from "@/lib/correos/gestion-supabase"
import { renderizarGo, validarSintaxisGo } from "@/lib/correos/plantilla-go"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const auth = plantillasAuth()
const inv = auth.find((p) => p.archivo === "invitacion.html")!
const rec = auth.find((p) => p.archivo === "recuperacion.html")!
const base = { Email: "x@ejemplo.pe", RedirectTo: "https://academix.mundosubs.net.pe/auth/activar", TokenHash: "TK" }

describe("Invitación según el rol (intérprete local de plantillas Go)", () => {
  it("docente: asunto, rol, institución y enlace seguro", () => {
    const d = { ...base, Data: { nombres: "Lucía", invitacion_institucion: "Academia Virtual Nova", invitacion_admin: false } }
    assert.equal(renderizarGo(inv.asunto, d, { escapar: false }), "Has sido invitado como docente a Academia Virtual Nova — Academix")
    const html = renderizarGo(inv.html, d)
    assert.match(html, /como <strong>docente<\/strong>/)
    assert.match(html, /Hola, Lucía:/)
    assert.ok(html.includes("https://academix.mundosubs.net.pe/auth/activar?token_hash=TK&type=invite"))
    assert.doesNotMatch(html, /equipo administrativo|<no value>/)
  })
  it("administrador: asunto, equipo administrativo y nivel de acceso", () => {
    const d = { ...base, Data: { invitacion_institucion: "Academia Virtual Nova", invitacion_admin: true, invitacion_nivel: "Administrador secundario · Pagos" } }
    assert.equal(renderizarGo(inv.asunto, d, { escapar: false }), "Invitación al equipo administrativo de Academia Virtual Nova — Academix")
    const html = renderizarGo(inv.html, d)
    assert.match(html, /Tu acceso:<\/strong> Administrador secundario · Pagos/)
    assert.match(html, /Hola:/)
    assert.doesNotMatch(html, /como <strong>docente|<no value>/)
  })
  it("invitación antigua sin datos: textos genéricos, nunca «<no value>»", () => {
    const d = { ...base, Data: {} }
    assert.equal(renderizarGo(inv.asunto, d, { escapar: false }), "Has sido invitado como docente a tu institución — Academix")
    assert.doesNotMatch(renderizarGo(inv.html, d), /<no value>/)
  })
  it("los datos se escapan en el HTML", () => {
    const html = renderizarGo(inv.html, { ...base, Data: { invitacion_institucion: "<img src=x onerror=alert(1)>" } })
    assert.doesNotMatch(html, /<img src=x/)
  })
  it("recuperación conserva su enlace seguro", () => {
    const html = renderizarGo(rec.html, { ...base, RedirectTo: "https://academix.mundosubs.net.pe/auth/restablecer", Data: {} })
    assert.ok(html.includes("/auth/restablecer?token_hash=TK&type=recovery"))
  })
  it("las plantillas solo usan construcciones documentadas por Supabase (if/else, variables)", () => {
    for (const p of auth) {
      validarSintaxisGo(p.html)
      validarSintaxisGo(p.asunto)
      assert.doesNotMatch(p.html + p.asunto, /\{\{\s*(with|range|define|template|block)\b/, p.archivo)
    }
    assert.throws(() => validarSintaxisGo("{{ printf \"%s\" .Email }}"))
    assert.throws(() => validarSintaxisGo("{{ if .Data.x }}sin cerrar"))
  })
  it("las vistas previas versionadas están al día", () => {
    const vista = readFileSync(path.join(raiz, "docs", "correos", "vista-previa", "auth-invitacion-administrador.html"), "utf8")
    assert.match(vista, /equipo administrativo/)
  })
})

describe("Sincronización con la Management API (simulada)", () => {
  const remotoIgual = Object.fromEntries(auth.flatMap((p) => {
    const c = { "invitacion.html": ["mailer_subjects_invite", "mailer_templates_invite_content"], "recuperacion.html": ["mailer_subjects_recovery", "mailer_templates_recovery_content"], "confirmacion.html": ["mailer_subjects_confirmation", "mailer_templates_confirmation_content"], "cambio-correo.html": ["mailer_subjects_email_change", "mailer_templates_email_change_content"] }[p.archivo]!
    return [[c[0], p.asunto], [c[1], p.html.replace(/\n/g, "\r\n") + "\n"]]
  }))

  it("sin diferencias (ignorando finales de línea) no hay nada que enviar", () => {
    assert.deepEqual(planSincronizacion(auth, remotoIgual), [])
  })
  it("solo se envían las plantillas que difieren", () => {
    const remoto = { ...remotoIgual, mailer_subjects_invite: "You have been invited", mailer_templates_recovery_content: "<h2>Reset Password</h2>" }
    const cambios = planSincronizacion(auth, remoto)
    assert.deepEqual(cambios.map((c) => c.clave).sort(), ["mailer_subjects_invite", "mailer_templates_recovery_content"])
    assert.deepEqual(Object.keys(cuerpoParche(cambios)).sort(), ["mailer_subjects_invite", "mailer_templates_recovery_content"])
  })
  it("lista blanca: nunca SMTP, confirmación obligatoria ni URLs", () => {
    for (const k of CLAVES_PERMITIDAS) assert.match(k, /^mailer_(subjects|templates)_[a-z_]+$/)
    assert.equal(CLAVES_PERMITIDAS.size, 8)
    assert.throws(() => cuerpoParche([{ archivo: "x", panel: "x", clave: "smtp_pass", tipo: "asunto", antes: "", despues: "x" }]))
    assert.throws(() => actualizarConfigAuth("a".repeat(20), "sbp_x", { mailer_autoconfirm: "false" }))
    assert.deepEqual(Object.keys(copiaGestionada({ ...remotoIgual, smtp_pass: "secreto" })).sort(), [...CLAVES_PERMITIDAS].sort())
  })
  it("PATCH parcial al endpoint oficial con el token como Bearer", async () => {
    let llamada: { url: string; init: RequestInit } | null = null
    const f = (async (url: string, init: RequestInit) => {
      llamada = { url, init }
      return new Response("{}", { status: 200 })
    }) as typeof fetch
    const r = await actualizarConfigAuth("abcdefghijklmnopqrst", "sbp_token", { mailer_subjects_invite: "Hola" }, f)
    assert.ok(r.ok)
    assert.equal(llamada!.url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth")
    assert.equal(llamada!.init.method, "PATCH")
    assert.deepEqual(JSON.parse(String(llamada!.init.body)), { mailer_subjects_invite: "Hola" })
    assert.equal((llamada!.init.headers as Record<string, string>).Authorization, "Bearer sbp_token")
  })
  it("errores de autenticación, permisos, proyecto, límite y red, sin filtrar el token", async () => {
    for (const [status, tipo] of [[401, "autenticacion"], [403, "permisos"], [404, "no_encontrado"], [429, "limite"], [500, "servidor"]] as const) {
      const r = await leerConfigAuth("abcdefghijklmnopqrst", "sbp_SECRETO", (async () => new Response("x", { status })) as typeof fetch)
      assert.ok(!r.ok && r.error.tipo === tipo, String(status))
      assert.ok(!r.ok && !r.error.mensaje.includes("sbp_SECRETO"))
    }
    const red = await leerConfigAuth("abcdefghijklmnopqrst", "t", (async () => { throw new TypeError("x") }) as typeof fetch)
    assert.ok(!red.ok && red.error.tipo === "red")
  })
  it("referencia del proyecto desde la URL pública o la variable explícita", () => {
    assert.equal(referenciaProyecto({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }), "abcdefghijklmnopqrst")
    assert.equal(referenciaProyecto({ SUPABASE_PROJECT_REF: "zyxwvutsrqponmlkjihg" }), "zyxwvutsrqponmlkjihg")
    assert.equal(referenciaProyecto({ SUPABASE_PROJECT_REF: "../otro" }), null)
    assert.equal(referenciaProyecto({ NEXT_PUBLIC_SUPABASE_URL: "https://evil.com" }), null)
  })
  it("el resumen de lo que se conserva no muestra secretos", () => {
    const l = resumenConservado({ smtp_host: "smtp.resend.com", smtp_pass: "re_SECRETO", smtp_admin_email: "no-reply@x.pe", mailer_autoconfirm: true }).join("\n")
    assert.doesNotMatch(l, /re_SECRETO/)
    assert.match(l, /desactivada/)
  })
})
