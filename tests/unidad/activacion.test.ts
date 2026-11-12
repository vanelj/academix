/**
 * Activación de cuentas invitadas (docentes): reglas puras de lib/auth/activacion.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  activacionPendiente,
  leerFragmentoInvitacion,
  MINUTOS_SESION_INVITACION,
  origenPublico,
  sesionDeInvitacion,
} from "@/lib/auth/activacion"

describe("Marca de activación pendiente", () => {
  it("solo cuenta si app_metadata.activacion_pendiente es exactamente true", () => {
    assert.equal(activacionPendiente({ app_metadata: { activacion_pendiente: true } }), true)
    assert.equal(activacionPendiente({ app_metadata: { activacion_pendiente: "true" } }), false)
    assert.equal(activacionPendiente({ app_metadata: { activacion_pendiente: null } }), false)
    // user_metadata la puede escribir el propio usuario: nunca se toma en cuenta.
    assert.equal(activacionPendiente({ user_metadata: { activacion_pendiente: true } }), false)
    assert.equal(activacionPendiente(null), false)
  })
})

describe("Sesión abierta por un enlace de invitación", () => {
  const ahora = 1_800_000_000
  it("acepta amr invite reciente", () => {
    assert.equal(sesionDeInvitacion({ amr: [{ method: "invite", timestamp: ahora - 30 }] }, ahora), true)
  })
  it("rechaza amr invite antiguo, contraseña u OTP", () => {
    const viejo = ahora - MINUTOS_SESION_INVITACION * 60 - 1
    assert.equal(sesionDeInvitacion({ amr: [{ method: "invite", timestamp: viejo }] }, ahora), false)
    assert.equal(sesionDeInvitacion({ amr: [{ method: "password", timestamp: ahora }] }, ahora), false)
    assert.equal(sesionDeInvitacion({ amr: [{ method: "otp", timestamp: ahora }] }, ahora), false)
    assert.equal(sesionDeInvitacion({ amr: "invite" }, ahora), false)
    assert.equal(sesionDeInvitacion({}, ahora), false)
  })
})

describe("Origen de los enlaces de invitación", () => {
  it("usa NEXT_PUBLIC_SITE_URL en producción (solo el origen)", () => {
    assert.equal(origenPublico("https://academix.ejemplo.pe/ruta/", { host: "otro.com" }), "https://academix.ejemplo.pe")
  })
  it("en local usa el host de la petición con http", () => {
    assert.equal(origenPublico(undefined, { host: "localhost:3000" }), "http://localhost:3000")
    assert.equal(origenPublico("", { host: "127.0.0.1:3000", proto: "http" }), "http://127.0.0.1:3000")
  })
  it("un dominio público siempre va por https", () => {
    assert.equal(origenPublico(undefined, { host: "academix.vercel.app", proto: "http" }), "https://academix.vercel.app")
  })
  it("ignora hosts manipulados o una URL configurada sin https", () => {
    assert.equal(origenPublico(undefined, { host: "evil.com/@x" }), null)
    assert.equal(origenPublico(undefined, { host: "a.com\@b.com" }), null)
    assert.equal(origenPublico(undefined, { host: "" }), null)
    assert.equal(origenPublico("javascript:alert(1)", { host: null }), null)
    assert.equal(origenPublico("http://inseguro.com", { host: "localhost:3000" }), "http://localhost:3000")
  })
})

describe("Fragmento del enlace (plantilla predeterminada)", () => {
  it("lee la sesión solo si type=invite", () => {
    assert.deepEqual(leerFragmentoInvitacion("#access_token=a&refresh_token=r&type=invite"), {
      tipo: "sesion",
      accessToken: "a",
      refreshToken: "r",
    })
    assert.deepEqual(leerFragmentoInvitacion("#access_token=a&refresh_token=r&type=recovery"), { tipo: "nada" })
    assert.deepEqual(leerFragmentoInvitacion("#access_token=a&type=invite"), { tipo: "nada" })
    assert.deepEqual(leerFragmentoInvitacion(""), { tipo: "nada" })
  })
  it("distingue enlace vencido o usado de enlace inválido", () => {
    assert.deepEqual(leerFragmentoInvitacion("#error=access_denied&error_code=otp_expired"), { tipo: "error", vencido: true })
    assert.deepEqual(leerFragmentoInvitacion("#error=server_error"), { tipo: "error", vencido: false })
  })
})
