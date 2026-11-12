import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getNavItems, roleConfig } from "@/config/navigation"
import { retornoSeguro } from "@/lib/auth/retorno"
import { resumenSemanal } from "@/lib/cursos/asistente-logica"
import { importeAlInscribirse } from "@/lib/inscripcion/precio"

describe("Inscripción y compra", () => {
  it("importe al inscribirse: gratuito 0, pago único = matrícula + curso, cuotas = matrícula", () => {
    assert.equal(importeAlInscribirse({ tipo_cobro: "gratuito", matricula_importe: 50, importe_curso: 300 }), 0)
    assert.equal(importeAlInscribirse({ tipo_cobro: "unico", matricula_importe: 30, importe_curso: 150 }), 180)
    assert.equal(importeAlInscribirse({ tipo_cobro: "cuotas", matricula_importe: 50, importe_curso: 600 }), 50)
  })
  it("después de iniciar sesión solo vuelve a rutas internas del catálogo", () => {
    assert.equal(retornoSeguro("/cursos"), "/cursos")
    assert.equal(retornoSeguro("/cursos/0b6f5c1e-1d1f-4f0a-9a43-1c2b3d4e5f60"), "/cursos/0b6f5c1e-1d1f-4f0a-9a43-1c2b3d4e5f60")
    for (const malo of ["//evil.example", "https://evil.example", "/admin", "/cursos/../admin", "/cursos/x", 42, null]) {
      assert.equal(retornoSeguro(malo), null, String(malo))
    }
  })
  it("resumen semanal agrupa los días con la misma franja", () => {
    assert.equal(
      resumenSemanal([
        { dia_semana: "5", hora_inicio: "19:00", hora_fin: "21:00" },
        { dia_semana: "1", hora_inicio: "19:00", hora_fin: "21:00" },
        { dia_semana: "3", hora_inicio: "08:00", hora_fin: "10:00" },
      ]),
      "Lun y Vie · 19:00–21:00; Mié · 08:00–10:00"
    )
    assert.equal(resumenSemanal([]), "Sin horarios")
  })
})

describe("Navegación de los tres perfiles", () => {
  it("Docente y Estudiante no tienen secciones «En preparación»", () => {
    for (const rol of ["docente", "estudiante"] as const) {
      const base = roleConfig[rol].basePath
      const pendientes = getNavItems(rol).filter((i) => i.href.startsWith(`${base}/`) && !i.disponible)
      assert.deepEqual(pendientes.map((i) => i.href), [], rol)
    }
  })
  it("el estudiante ya no ve secciones duplicadas (Mis reservas / Mis matrículas)", () => {
    const hrefs = getNavItems("estudiante").map((i) => i.href)
    assert.ok(!hrefs.includes("/estudiante/reservas"))
    assert.ok(!hrefs.includes("/estudiante/matriculas"))
    for (const h of ["/estudiante/cursos", "/estudiante/horarios", "/estudiante/evaluaciones", "/estudiante/solicitudes", "/estudiante/pagos", "/estudiante/certificados"]) {
      assert.ok(hrefs.includes(h), h)
    }
  })
  it("el docente tiene grupos, horarios, estudiantes y notas", () => {
    const hrefs = getNavItems("docente").map((i) => i.href)
    for (const h of ["/docente", "/docente/grupos", "/docente/horarios", "/docente/estudiantes", "/docente/calificaciones"]) assert.ok(hrefs.includes(h), h)
  })
})
