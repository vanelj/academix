// Resuelve el alias "@/..." (tsconfig) a src/ y completa la extensión .ts
// para ejecutar los módulos de TypeScript con --experimental-strip-types.
import { existsSync, statSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const src = path.join(raiz, "src")

function conExtension(base) {
  for (const c of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, path.join(base, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

export async function resolve(especificador, contexto, siguiente) {
  if (especificador.startsWith("@/")) {
    const archivo = conExtension(path.join(src, especificador.slice(2)))
    if (archivo) return { url: pathToFileURL(archivo).href, shortCircuit: true }
  }
  if ((especificador.startsWith("./") || especificador.startsWith("../")) && contexto.parentURL?.startsWith("file:")) {
    const archivo = conExtension(path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador))
    if (archivo) return { url: pathToFileURL(archivo).href, shortCircuit: true }
  }
  return siguiente(especificador, contexto)
}
