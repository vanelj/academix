import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { enlaceInterno, haceCuanto, textoContador } from "@/lib/avisos/formato"
import { duracionGrupo } from "@/lib/cursos/duracion"
import { agruparPorDia, enlaceSeguro, grupoVigente, hayCruce } from "@/lib/horarios/semana"
import { rutaQrDeMedio, urlQrSegura } from "@/lib/pagos/qr"

describe("Horario semanal", () => {
  const base = { curso: "Python", grupo: "G1" }
  it("agrupa por día, ordena por hora y omite días sin clases (no inventa sesiones)", () => {
    const dias = agruparPorDia([
      { ...base, dia_semana: 3, hora_inicio: "19:00:00", hora_fin: "21:00:00" },
      { ...base, dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" },
      { ...base, dia_semana: 1, hora_inicio: "08:00", hora_fin: "10:00" },
    ])
    assert.deepEqual(dias.map((d) => d.nombre), ["Lunes", "Miércoles"])
    assert.deepEqual(dias[0].sesiones.map((s) => s.hora_inicio), ["08:00", "19:00"])
    assert.equal(dias[1].sesiones[0].hora_fin, "21:00")
  })
  it("detecta cruces solo en el mismo día y con solapamiento real", () => {
    assert.equal(hayCruce({ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }, { dia_semana: 1, hora_inicio: "20:00", hora_fin: "22:00" }), true)
    assert.equal(hayCruce({ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }, { dia_semana: 1, hora_inicio: "21:00", hora_fin: "22:00" }), false)
    assert.equal(hayCruce({ dia_semana: 1, hora_inicio: "19:00", hora_fin: "21:00" }, { dia_semana: 2, hora_inicio: "19:00", hora_fin: "21:00" }), false)
  })
  it("solo muestra enlaces de clase https", () => {
    assert.equal(enlaceSeguro("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij")
    assert.equal(enlaceSeguro("http://zoom.us/j/1"), null)
    assert.equal(enlaceSeguro("javascript:alert(1)"), null)
    assert.equal(enlaceSeguro("sala 3"), null)
    assert.equal(enlaceSeguro(null), null)
  })
  it("grupos vigentes: programado, abierto y en curso", () => {
    assert.deepEqual(["programado", "abierto", "en_curso", "cerrado", "cancelado"].map(grupoVigente), [true, true, true, false, false])
  })
  it("duración del grupo en semanas o días", () => {
    assert.equal(duracionGrupo("2026-01-05", "2026-03-29"), "12 semanas")
    assert.equal(duracionGrupo("2026-01-05", "2026-01-09"), "5 días")
    assert.equal(duracionGrupo("2026-01-09", "2026-01-05"), null)
  })
})

describe("Centro de notificaciones", () => {
  it("solo sigue enlaces internos de Academix", () => {
    assert.equal(enlaceInterno("/estudiante/pagos/pagar?solicitud=0b6f5c1e-1d1f-4f0a-9a43-1c2b3d4e5f60"), "/estudiante/pagos/pagar?solicitud=0b6f5c1e-1d1f-4f0a-9a43-1c2b3d4e5f60")
    assert.equal(enlaceInterno("//evil.example"), null)
    assert.equal(enlaceInterno("https://evil.example"), null)
    assert.equal(enlaceInterno("/\\evil"), null)
    assert.equal(enlaceInterno("/a<script>"), null)
    assert.equal(enlaceInterno(null), null)
  })
  it("tiempo relativo y contador compacto", () => {
    const ahora = Date.parse("2026-11-12T12:00:00Z")
    assert.equal(haceCuanto("2026-11-12T11:59:30Z", ahora), "hace un momento")
    assert.match(haceCuanto("2026-11-12T11:55:00Z", ahora), /5 minutos/)
    assert.equal(haceCuanto("2026-11-11T12:00:00Z", ahora), "ayer")
    assert.equal(textoContador(7), "7")
    assert.equal(textoContador(150), "99+")
  })
})

describe("QR de Yape/Plin", () => {
  const base = "https://proyecto.supabase.co"
  const inst = "11111111-1111-4111-8111-111111111111"
  const medio = "22222222-2222-4222-8222-222222222222"
  const url = `${base}/storage/v1/object/public/qr-medios-cobro/${inst}/${medio}/qr-1-abc.png`
  it("solo borra imágenes de la misma institución y del mismo medio", () => {
    assert.equal(rutaQrDeMedio(url, inst, medio, base), `${inst}/${medio}/qr-1-abc.png`)
    assert.equal(rutaQrDeMedio(url, "33333333-3333-4333-8333-333333333333", medio, base), null)
    assert.equal(rutaQrDeMedio(`${base}/storage/v1/object/public/portadas-cursos/${inst}/${medio}/x.png`, inst, medio, base), null)
    assert.equal(rutaQrDeMedio(`${base}/storage/v1/object/public/qr-medios-cobro/${inst}/${medio}/../../otro.png`, inst, medio, base), null)
    assert.equal(rutaQrDeMedio(null, inst, medio, base), null)
  })
  it("solo muestra imágenes https del bucket de QR", () => {
    assert.equal(urlQrSegura(url), url)
    assert.equal(urlQrSegura("http://proyecto.supabase.co/storage/v1/object/public/qr-medios-cobro/x.png"), null)
    assert.equal(urlQrSegura("https://otro.example/qr.png"), null)
    assert.equal(urlQrSegura(null), null)
  })
})
