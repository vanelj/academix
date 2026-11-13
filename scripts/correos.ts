/**
 * Herramienta de correos de Academix (SOLO desarrollo; no forma parte de la app).
 *
 *   npm run correos:plantillas          genera docs/correos/supabase/* y las vistas previas
 *   npm run correos:vista-previa        igual, y muestra dónde abrirlas
 *   npm run correos:verificar           comprueba plantillas, variables y (si hay token) compara con Supabase SIN cambiar nada
 *   npm run correos:sincronizar         vista previa de lo que cambiaría en Supabase (no envía nada)
 *   npm run correos:sincronizar -- --aplicar   aplica SOLO las plantillas que difieren (con respaldo previo)
 *
 * Credenciales de herramientas: archivo .env.herramientas (ignorado por Git):
 *   SUPABASE_ACCESS_TOKEN=sbp_…   token de acceso personal de Supabase
 *   SUPABASE_PROJECT_REF=…        opcional; si falta se deduce de NEXT_PUBLIC_SUPABASE_URL (.env.local)
 * Nunca se imprime el token ni ningún secreto.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { plantillasAuth } from "@/lib/correos/auth"
import { configuracionCorreo } from "@/lib/correos/config"
import { ejemplosCorreos } from "@/lib/correos/ejemplos"
import {
  actualizarConfigAuth,
  copiaGestionada,
  cuerpoParche,
  huella,
  leerConfigAuth,
  planSincronizacion,
  referenciaProyecto,
  resumenConservado,
  type Cambio,
} from "@/lib/correos/gestion-supabase"
import { renderizarGo, validarSintaxisGo } from "@/lib/correos/plantilla-go"
import { renderizarCorreo } from "@/lib/correos/plantillas"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dirAuth = path.join(raiz, "docs", "correos", "supabase")
const dirVista = path.join(raiz, "docs", "correos", "vista-previa")
const rel = (p: string) => path.relative(raiz, p)

// ---------------------------------------------------------------------------
// Entorno: .env.local (app) + .env.herramientas (solo desarrollo) + variables del sistema.
function cargarEntorno(): Record<string, string | undefined> {
  const leer = (archivo: string) => {
    const ruta = path.join(raiz, archivo)
    if (!existsSync(ruta)) return {}
    return Object.fromEntries(
      readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => /^\s*[A-Z0-9_]+\s*=/.test(l)).map((l) => {
        const i = l.indexOf("=")
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
      })
    )
  }
  return { ...leer(".env.local"), ...leer(".env.herramientas"), ...process.env }
}

// Datos de ejemplo de invitación (los reales los escribe el servidor al invitar).
const DATOS_GO = {
  docente: { Email: "docente@ejemplo.pe", RedirectTo: "https://academix.mundosubs.net.pe/auth/activar", TokenHash: "TOKEN_DE_EJEMPLO", Data: { nombres: "Lucía", invitacion_institucion: "Academia Virtual Nova", invitacion_admin: false } },
  administrador: { Email: "admin@ejemplo.pe", RedirectTo: "https://academix.mundosubs.net.pe/auth/activar", TokenHash: "TOKEN_DE_EJEMPLO", Data: { nombres: "Carlos", invitacion_institucion: "Academia Virtual Nova", invitacion_admin: true, invitacion_nivel: "Administrador secundario · Pagos" } },
  recuperacion: { Email: "persona@ejemplo.pe", RedirectTo: "https://academix.mundosubs.net.pe/auth/restablecer", TokenHash: "TOKEN_DE_EJEMPLO", Data: {} },
}

// ---------------------------------------------------------------------------
function generar() {
  mkdirSync(dirAuth, { recursive: true })
  mkdirSync(dirVista, { recursive: true })
  const auth = plantillasAuth()
  const filas = ["| Plantilla del panel | Archivo | Asunto | Uso |", "|---|---|---|---|"]
  for (const p of auth) {
    writeFileSync(path.join(dirAuth, p.archivo), p.html + "\n")
    filas.push(`| ${p.panel} | \`${p.archivo}\` | \`${p.asunto.replace(/\|/g, "\\|")}\` | ${p.uso} |`)
  }
  writeFileSync(
    path.join(dirAuth, "ASUNTOS.md"),
    ["# Plantillas de Supabase Auth", "", "Generadas con `npm run correos:plantillas` y aplicadas con `npm run correos:sincronizar -- --aplicar`. **No editar a mano ni en el panel de Supabase:** se editan en `src/lib/correos/auth.ts` y `src/lib/correos/diseno.ts`.", "", ...filas, ""].join("\n")
  )

  const indice: string[] = []
  const inv = auth.find((p) => p.archivo === "invitacion.html")!
  const rec = auth.find((p) => p.archivo === "recuperacion.html")!
  for (const [nombre, plantilla, datos] of [
    ["auth-invitacion-docente", inv, DATOS_GO.docente],
    ["auth-invitacion-administrador", inv, DATOS_GO.administrador],
    ["auth-recuperacion", rec, DATOS_GO.recuperacion],
  ] as const) {
    writeFileSync(path.join(dirVista, `${nombre}.html`), renderizarGo(plantilla.html, datos) + "\n")
    indice.push(`<li><a href="${nombre}.html">${nombre}</a> — <em>${escaparTexto(renderizarGo(plantilla.asunto, datos, { escapar: false }))}</em></li>`)
  }
  for (const [tipo, datos] of Object.entries(ejemplosCorreos())) {
    const c = renderizarCorreo(tipo, datos)
    if (!c) continue
    writeFileSync(path.join(dirVista, `${tipo}.html`), c.html + "\n")
    indice.push(`<li><a href="${tipo}.html">${tipo}</a> — <em>${escaparTexto(c.asunto)}</em></li>`)
  }
  writeFileSync(path.join(dirVista, "index.html"), `<!doctype html><html lang="es"><meta charset="utf-8"><title>Correos de Academix · vista previa</title><body style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:32px auto;padding:0 16px"><h1>Correos de Academix</h1><p>Datos de ejemplo. Supabase Auth: invitación (docente y administrador) y recuperación. El resto: correos de la app (Resend).</p><ul>${indice.join("")}</ul></body></html>\n`)
  return { auth: auth.length, vistas: indice.length }
}

const escaparTexto = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// ---------------------------------------------------------------------------
function verificarLocal(): string[] {
  const problemas: string[] = []
  for (const p of plantillasAuth()) {
    try { validarSintaxisGo(p.html); validarSintaxisGo(p.asunto) } catch (e) { problemas.push(`${p.archivo}: ${e instanceof Error ? e.message : e}`) }
    const archivo = path.join(dirAuth, p.archivo)
    if (!existsSync(archivo) || readFileSync(archivo, "utf8").trimEnd() !== p.html.trimEnd()) problemas.push(`${rel(archivo)} está desactualizado: ejecuta npm run correos:plantillas`)
  }
  const inv = plantillasAuth().find((p) => p.archivo === "invitacion.html")!
  for (const [rol, datos, esperado] of [["docente", DATOS_GO.docente, "como docente"], ["administrador", DATOS_GO.administrador, "equipo administrativo"]] as const) {
    const asunto = renderizarGo(inv.asunto, datos, { escapar: false })
    const html = renderizarGo(inv.html, datos)
    if (!asunto.includes(esperado) || !asunto.includes("Academia Virtual Nova")) problemas.push(`Asunto de invitación (${rol}) incorrecto: ${asunto}`)
    if (html.includes("<no value>") || asunto.includes("<no value>")) problemas.push(`Invitación (${rol}) con variables inexistentes`)
    if (!html.includes("/auth/activar?token_hash=TOKEN_DE_EJEMPLO&amp;type=invite") && !html.includes("/auth/activar?token_hash=TOKEN_DE_EJEMPLO&type=invite")) problemas.push(`Invitación (${rol}) sin el enlace seguro de activación`)
  }
  return problemas
}

function estadoVariables(e: Record<string, string | undefined>): string[] {
  const hay = (k: string) => (e[k]?.trim() ? "presente" : "AUSENTE")
  return [
    `RESEND_API_KEY: ${hay("RESEND_API_KEY")}`,
    `RESEND_FROM_EMAIL / CORREO_REMITENTE: ${e.RESEND_FROM_EMAIL || e.CORREO_REMITENTE ? (configuracionCorreo(e) ? "presente y válido" : "presente pero NO válido") : "AUSENTE"}`,
    `CRON_SECRET: ${e.CRON_SECRET ? (e.CRON_SECRET.length >= 16 ? "presente" : "demasiado corto (mín. 16)") : "AUSENTE"}`,
    `NEXT_PUBLIC_SITE_URL: ${hay("NEXT_PUBLIC_SITE_URL")}`,
    `SUPABASE_SECRET_KEY: ${hay("SUPABASE_SECRET_KEY")}`,
    `SUPABASE_ACCESS_TOKEN (herramientas): ${hay("SUPABASE_ACCESS_TOKEN")}`,
    `Proyecto Supabase: ${referenciaProyecto(e) ? "identificado" : "no identificado (define SUPABASE_PROJECT_REF)"}`,
  ]
}

function mostrarPlan(cambios: Cambio[]) {
  if (cambios.length === 0) { console.log("  ✓ Supabase ya tiene exactamente las plantillas del repositorio."); return }
  for (const c of cambios) {
    if (c.tipo === "asunto") console.log(`  • ${c.panel} · asunto\n      antes:   ${c.antes || "(predeterminado de Supabase)"}\n      después: ${c.despues}`)
    else console.log(`  • ${c.panel} · contenido  ${c.antes ? `${huella(c.antes)} (${c.antes.length} car.)` : "(predeterminado de Supabase)"} → ${huella(c.despues)} (${c.despues.length} car.)`)
  }
}

async function remoto(e: Record<string, string | undefined>) {
  const ref = referenciaProyecto(e)
  const token = e.SUPABASE_ACCESS_TOKEN?.trim()
  if (!ref || !token) return null
  const r = await leerConfigAuth(ref, token)
  if (!r.ok) { console.error(`✗ ${r.error.mensaje}`); process.exitCode = 1; return "error" as const }
  return { ref, token, datos: r.datos }
}

// ---------------------------------------------------------------------------
async function main() {
  const [comando, ...args] = process.argv.slice(2)
  const e = cargarEntorno()

  if (comando === "generar" || comando === "vista-previa") {
    const r = generar()
    console.log(`✓ ${r.auth} plantillas de Supabase en ${rel(dirAuth)}`)
    console.log(`✓ ${r.vistas} vistas previas en ${rel(dirVista)}`)
    if (comando === "vista-previa") console.log(`  Abre ${rel(path.join(dirVista, "index.html"))} en el navegador (o con «Open in Default Browser» en VS Code).`)
    return
  }

  if (comando === "verificar") {
    const problemas = verificarLocal()
    console.log("Plantillas:", problemas.length ? "" : "✓ sintaxis, roles, enlaces y archivos al día")
    for (const p of problemas) console.log(`  ✗ ${p}`)
    console.log("\nVariables (sin mostrar valores):")
    for (const l of estadoVariables(e)) console.log(`  · ${l}`)
    const r = await remoto(e)
    if (r && r !== "error") {
      console.log("\nSupabase (solo lectura, no se cambió nada):")
      for (const l of resumenConservado(r.datos)) console.log(`  · ${l}`)
      console.log("\nDiferencias con el repositorio:")
      mostrarPlan(planSincronizacion(plantillasAuth(), r.datos))
    } else if (r === null) console.log("\n(Sin SUPABASE_ACCESS_TOKEN: no se comparó con Supabase.)")
    if (problemas.length) process.exitCode = 1
    return
  }

  if (comando === "sincronizar") {
    const aplicar = args.includes("--aplicar")
    const problemas = verificarLocal()
    if (problemas.length) { for (const p of problemas) console.error(`✗ ${p}`); console.error("Corrige las plantillas antes de sincronizar."); process.exitCode = 1; return }
    const r = await remoto(e)
    if (r === null) { console.error("✗ Falta SUPABASE_ACCESS_TOKEN (y/o la referencia del proyecto) en .env.herramientas. Ver docs/correos/CONFIGURACION.md."); process.exitCode = 1; return }
    if (r === "error") return
    console.log("Se conservan (no se envían):")
    for (const l of resumenConservado(r.datos)) console.log(`  · ${l}`)
    const cambios = planSincronizacion(plantillasAuth(), r.datos)
    console.log("\nCambios:")
    mostrarPlan(cambios)
    if (cambios.length === 0) return
    if (!aplicar) { console.log("\nVista previa: no se envió nada. Para aplicar: npm run correos:sincronizar -- --aplicar"); return }

    const dirRespaldo = path.join(raiz, ".correos-respaldo")
    mkdirSync(dirRespaldo, { recursive: true })
    const respaldo = path.join(dirRespaldo, `auth-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
    writeFileSync(respaldo, JSON.stringify(copiaGestionada(r.datos), null, 2))
    console.log(`\nRespaldo de las plantillas remotas actuales: ${rel(respaldo)}`)

    const res = await actualizarConfigAuth(r.ref, r.token, cuerpoParche(cambios))
    if (!res.ok) { console.error(`✗ ${res.error.mensaje} No se cambió nada.`); process.exitCode = 1; return }
    const despues = await leerConfigAuth(r.ref, r.token)
    if (!despues.ok) { console.error(`✗ Aplicado, pero no se pudo comprobar: ${despues.error.mensaje}`); process.exitCode = 1; return }
    const pendientes = planSincronizacion(plantillasAuth(), despues.datos)
    if (pendientes.length) { console.error("✗ Tras aplicar, Supabase aún difiere en:"); mostrarPlan(pendientes); process.exitCode = 1; return }
    console.log(`✓ ${new Set(cambios.map((c) => c.panel)).size} plantilla(s) actualizada(s) y comprobada(s) en Supabase.`)
    return
  }

  console.log("Uso: npm run correos:plantillas | correos:vista-previa | correos:verificar | correos:sincronizar [-- --aplicar]")
  process.exitCode = 1
}

void main()
