/**
 * Intérprete LOCAL del subconjunto de plantillas Go que usan los correos de
 * Supabase Auth de Academix (puro). Sirve para previsualizar y probar en VS Code
 * cómo quedarán la invitación de docente y la de administrador SIN enviar nada.
 *
 * Soporta exactamente lo que usamos: {{ .Campo.Sub }}, {{ . }},
 * {{ if X }}…{{ else }}…{{ end }} y {{ with X }}…{{ else }}…{{ end }}.
 * Cualquier otra sintaxis lanza un error, para no usar algo que no se haya
 * verificado. Igual que Go: una clave inexistente imprime «<no value>» (así las
 * pruebas detectan variables mal escritas) y los valores del cuerpo se escapan
 * como en html/template.
 *
 * NO es el motor real de Supabase: la verificación definitiva es la prueba real
 * controlada (docs/correos/CONFIGURACION.md).
 */

type Nodo =
  | { t: "texto"; v: string }
  | { t: "valor"; ruta: string[] }
  | { t: "if" | "with"; ruta: string[]; si: Nodo[]; no: Nodo[] }

const ACCION = /\{\{\s*(.*?)\s*\}\}/g

function ruta(expr: string): string[] {
  if (expr === ".") return []
  if (!/^(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(expr)) throw new Error(`Sintaxis no admitida en la plantilla: «${expr}»`)
  return expr.slice(1).split(".")
}

function analizar(tpl: string): Nodo[] {
  const fichas: { tipo: "texto" | "accion"; v: string }[] = []
  let ultimo = 0
  for (const m of tpl.matchAll(ACCION)) {
    if (m.index! > ultimo) fichas.push({ tipo: "texto", v: tpl.slice(ultimo, m.index) })
    fichas.push({ tipo: "accion", v: m[1] })
    ultimo = m.index! + m[0].length
  }
  if (ultimo < tpl.length) fichas.push({ tipo: "texto", v: tpl.slice(ultimo) })

  let i = 0
  const bloque = (hasta: string[]): { nodos: Nodo[]; fin: string } => {
    const nodos: Nodo[] = []
    while (i < fichas.length) {
      const f = fichas[i++]
      if (f.tipo === "texto") { nodos.push({ t: "texto", v: f.v }); continue }
      if (hasta.includes(f.v)) return { nodos, fin: f.v }
      const m = /^(if|with)\s+(.+)$/.exec(f.v)
      if (m) {
        const si = bloque(["else", "end"])
        const no = si.fin === "else" ? bloque(["end"]) : { nodos: [], fin: "end" }
        if (no.fin !== "end") throw new Error("Bloque sin {{ end }}")
        nodos.push({ t: m[1] as "if" | "with", ruta: ruta(m[2].trim()), si: si.nodos, no: no.nodos })
        continue
      }
      if (f.v === "else" || f.v === "end") throw new Error(`{{ ${f.v} }} sin bloque abierto`)
      nodos.push({ t: "valor", ruta: ruta(f.v) })
    }
    if (hasta.length) throw new Error("Bloque sin cerrar")
    return { nodos, fin: "" }
  }
  return bloque([]).nodos
}

const NO_VALUE = Symbol("no value")

function resolver(ctx: unknown, r: string[]): unknown {
  let v: unknown = ctx
  for (const k of r) {
    if (v === null || typeof v !== "object") return NO_VALUE
    if (!(k in (v as Record<string, unknown>))) return NO_VALUE
    v = (v as Record<string, unknown>)[k]
  }
  return v
}

/** Veracidad de Go: false, 0, "", nil, colecciones vacías y claves inexistentes son falsas. */
function verdadero(v: unknown): boolean {
  if (v === NO_VALUE || v === null || v === undefined || v === false || v === 0 || v === "") return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v as object).length > 0
  return true
}

const escaparHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;").replace(/'/g, "&#39;")

export function renderizarGo(tpl: string, datos: Record<string, unknown>, opciones: { escapar: boolean } = { escapar: true }): string {
  const salida = (nodos: Nodo[], ctx: unknown): string =>
    nodos
      .map((n) => {
        if (n.t === "texto") return n.v
        if (n.t === "valor") {
          const v = resolver(ctx, n.ruta)
          const s = v === NO_VALUE ? "<no value>" : v === null || v === undefined ? "" : String(v)
          return opciones.escapar ? escaparHtml(s) : s
        }
        const v = resolver(ctx, n.ruta)
        if (!verdadero(v)) return salida(n.no, ctx)
        return salida(n.si, n.t === "with" ? v : ctx)
      })
      .join("")
  return salida(analizar(tpl), datos)
}

/** Lanza si la plantilla usa sintaxis no admitida o bloques mal cerrados. */
export function validarSintaxisGo(tpl: string): void {
  analizar(tpl)
}
