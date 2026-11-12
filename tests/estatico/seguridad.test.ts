/**
 * Pruebas estáticas del código fuente (sin red ni base de datos):
 * rutas del menú existentes, límites servidor/cliente, acciones de servidor
 * con autorización, claves privadas fuera del navegador y migraciones
 * preparadas con RLS y permisos mínimos.
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { getNavItems, roleConfig } from "@/config/navigation"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const src = path.join(raiz, "src")

function archivos(dir: string, filtro: RegExp): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, filtro))
    else if (filtro.test(nombre)) salida.push(ruta)
  }
  return salida
}
const leer = (r: string) => readFileSync(r, "utf8")
const fuente = archivos(src, /\.(ts|tsx)$/)
const esCliente = (codigo: string) => /^\s*["']use client["']/.test(codigo)
const esAccion = (codigo: string) => /^\s*["']use server["']/.test(codigo)

describe("Rutas del menú", () => {
  it("cada sección interna del menú tiene su página", () => {
    for (const rol of ["admin", "docente", "estudiante"] as const) {
      for (const item of getNavItems(rol)) {
        if (!item.href.startsWith(roleConfig[rol].basePath)) continue
        const pagina = path.join(src, "app", ...item.href.split("/").filter(Boolean), "page.tsx")
        const dinamica = path.join(src, "app", roleConfig[rol].basePath.slice(1), "[seccion]", "page.tsx")
        assert.ok(existsSync(pagina) || (rol === "admin" && existsSync(dinamica)), `${rol}: falta ${item.href}`)
      }
    }
  })
  it("Docente y Estudiante ya no usan la pantalla «Módulo en preparación»", () => {
    assert.ok(!existsSync(path.join(src, "app", "docente", "[seccion]")))
    assert.ok(!existsSync(path.join(src, "app", "estudiante", "[seccion]")))
  })
})

describe("Límites servidor / cliente", () => {
  it("ningún componente de cliente importa el cliente de Supabase del servidor ni la clave de servicio", () => {
    for (const f of fuente) {
      const c = leer(f)
      if (!esCliente(c)) continue
      assert.ok(!/@\/lib\/supabase\/(server|admin)["']/.test(c), `${path.relative(raiz, f)} importa Supabase de servidor`)
      // Se busca el USO (process.env.X); mencionar el nombre en un texto de ayuda no expone nada.
      assert.ok(!/process\.env\.(\w*SERVICE_ROLE\w*|SUPABASE_SECRET\w*|RESEND_API_KEY|CRON_SECRET)/.test(c), `${path.relative(raiz, f)} lee un secreto`)
    }
  })
  it("la clave de servicio solo se usa en módulos de servidor", () => {
    for (const f of fuente) {
      const c = leer(f)
      if (/process\.env\.(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)/.test(c)) assert.ok(!esCliente(c), path.relative(raiz, f))
    }
  })
  it("las páginas de servidor no llaman funciones exportadas por módulos «use client»", () => {
    const exportsCliente = new Map<string, Set<string>>()
    for (const f of fuente) {
      const c = leer(f)
      if (!esCliente(c)) continue
      const nombres = new Set([...c.matchAll(/export (?:async )?(?:function|const) ([a-z]\w*)/g)].map((m) => m[1]))
      if (nombres.size) exportsCliente.set(f, nombres)
    }
    for (const f of fuente) {
      const c = leer(f)
      if (esCliente(c) || esAccion(c)) continue
      for (const m of c.matchAll(/import \{([^}]+)\} from "@\/([^"]+)"/g)) {
        const destino = [".tsx", ".ts"].map((e) => path.join(src, m[2] + e)).find(existsSync)
        const prohibidos = destino ? exportsCliente.get(destino) : undefined
        if (!prohibidos) continue
        for (const nombre of m[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(" as ")[0])) {
          // Componentes (Mayúscula) sí se pueden renderizar; funciones utilitarias (minúscula) no.
          assert.ok(!prohibidos.has(nombre), `${path.relative(raiz, f)} usa ${nombre} de un módulo de cliente`)
        }
      }
    }
  })
})

describe("Acciones de servidor con autorización", () => {
  const acciones = fuente.filter((f) => esAccion(leer(f)))
  it("las acciones nuevas (docente, QR y notificaciones) comprueban la sesión en el servidor", () => {
    const nuevas = ["lib/docente/acciones.ts", "lib/pagos/qr-acciones.ts", "lib/avisos/acciones.ts"].map((r) => path.join(src, r))
    for (const f of nuevas) {
      assert.ok(acciones.includes(f), `${f} debe ser «use server»`)
      assert.match(leer(f), /docenteActual\(\)|institucionDelAdmin\(\)|obtenerContexto\(\)/, path.relative(raiz, f))
    }
  })
  it("el registro de notas no usa la clave de servicio ni actualiza columnas distintas de nota", () => {
    const c = leer(path.join(src, "lib/docente/acciones.ts"))
    assert.ok(!/supabase\/admin/.test(c))
    for (const m of c.matchAll(/\.update\(\{([^}]*)\}\)/g)) assert.match(m[1].trim(), /^nota: /)
  })
})

describe("Migraciones preparadas (no ejecutadas)", () => {
  const sql = (n: string) => leer(path.join(raiz, "docs", "migraciones", n))
  it("notificaciones_v5: RLS activa, sin INSERT/DELETE para usuarios y solo leida_en editable", () => {
    const s = sql("notificaciones_v5.sql")
    assert.match(s, /alter table public\.notificaciones enable row level security/)
    assert.match(s, /revoke all on table public\.notificaciones from public, anon, authenticated/)
    assert.match(s, /grant update \(leida_en\) on table public\.notificaciones to authenticated/)
    assert.ok(!/grant (insert|delete|all)[^;]*notificaciones[^;]*to authenticated/i.test(s))
    assert.match(s, /destinatario_id = auth\.uid\(\) and rol = privado\.mi_rol_activo\(\)/)
    // Un aviso nunca bloquea la operación real (7 disparadores; ninguno por nota guardada).
    assert.equal((s.match(/exception when others then/g) ?? []).length, 7)
    assert.ok(!/create trigger aviso_calificacion/i.test(s), "una nota guardada (borrador) no debe avisar al estudiante")
  })
  it("aula_academica_v5: notas en borrador privadas, publicación por RPC y materiales en bucket privado", () => {
    const s = sql("aula_academica_v5.sql")
    // El estudiante solo lee notas de evaluaciones publicadas; admin/docente igual que en V5.
    assert.match(s, /privado\.es_mi_matricula\(matricula_id\)\s+and privado\.evaluacion_publicada\(evaluacion_id\)/)
    assert.match(s, /privado\.mi_rol_activo\(\) = 'admin' or privado\.es_docente_del_grupo\(grupo_id\)/)
    // publicada_en solo cambia con la RPC (sin GRANT UPDATE directo) y nace sin publicar.
    assert.ok(!/^\s*grant update[^;]*publicada_en/im.test(s))
    assert.match(s, /before insert on public\.evaluaciones/)
    assert.match(s, /create or replace function public\.publicar_evaluacion\(p_evaluacion uuid, p_publicar boolean default true\)/)
    assert.match(s, /revoke all on function public\.publicar_evaluacion\(uuid, boolean\) from public, anon;/)
    // La RPC exige docente del grupo (rol activo) o administrador de la institución.
    assert.match(s, /privado\.es_docente_del_grupo\(v_e\.grupo_id\)[\s\S]*privado\.admin_de_institucion\(v_e\.institucion_id\)/)
    // Materiales: bucket PRIVADO, ruta <institución>/<grupo>/, lectura solo matriculados activos, docente o admin.
    assert.match(s, /'materiales-curso', 'materiales-curso', false/)
    assert.match(s, /privado\.estoy_matriculado_en\(p_grupo\)/)
    assert.match(s, /archivo_path like institucion_id::text \|\| '\/' \|\| grupo_id::text \|\| '\/%'/)
    assert.match(s, /alter table public\.materiales_curso enable row level security/)
    assert.ok(!/policy "v5 materiales[^"]*" on storage\.objects for update/i.test(s), "los archivos no se sobrescriben")
    // No modifica ni borra notas: solo un UPDATE opcional comentado sobre evaluaciones.
    assert.ok(!/^\s*(update|delete from) public\.calificaciones/im.test(s))
    assert.ok(!/^update public\.evaluaciones/im.test(s), "la publicación masiva opcional debe quedar comentada")
  })
  it("qr_medios_cobro_v5: escritura solo en la carpeta de la propia institución", () => {
    const s = sql("qr_medios_cobro_v5.sql")
    for (const p of ["admin sube", "admin reemplaza", "admin elimina"]) assert.match(s, new RegExp(`qr medios: ${p}`))
    assert.equal((s.match(/\(storage\.foldername\(name\)\)\[1\] = privado\.mi_institucion\(\)::text/g) ?? []).length, 5)
    assert.match(s, /tipo in \('yape', 'plin'\)/)
  })
})

describe("Activación de cuentas docentes", () => {
  const docentes = leer(path.join(src, "lib", "docentes", "acciones.ts"))
  const auth = leer(path.join(src, "lib", "auth", "acciones.ts"))

  it("toda invitación indica el destino /auth/activar (redirectTo)", () => {
    const llamadas = docentes.match(/inviteUserByEmail\([^)]*\)/g) ?? []
    assert.ok(llamadas.length >= 2)
    for (const l of llamadas) assert.match(l, /opcionesInvitacion\(\)/, l)
    assert.match(docentes, /RUTA_ACTIVACION/)
  })

  it("las cuentas nuevas nacen con la activación pendiente en app_metadata", () => {
    assert.match(docentes, /app_metadata:\s*\{\s*\[MARCA_ACTIVACION\]:\s*true/)
  })

  it("crear la contraseña exige sesión de activación y solo quita la marca de la propia cuenta", () => {
    assert.match(auth, /const userId = await usuarioEnActivacion\(\)/)
    assert.match(auth, /updateUserById\(userId,/)
    assert.doesNotMatch(auth, /updateUserById\((?!userId)/)
  })

  it("los paneles redirigen a /activar-cuenta mientras la activación esté pendiente", () => {
    const ctx = leer(path.join(src, "lib", "auth", "contexto.ts"))
    assert.match(ctx, /if \(ctx\.activacionPendiente\) redirect\("\/activar-cuenta"\)/)
  })

  it("ningún componente de cliente registra tokens en la consola", () => {
    for (const ruta of fuente) {
      const codigo = leer(ruta)
      if (esCliente(codigo) && /access_token|accessToken/.test(codigo)) {
        assert.doesNotMatch(codigo, /console\.(log|info|warn|error)/, path.relative(raiz, ruta))
      }
    }
  })
})

describe("Aula académica: límites de seguridad en el código", () => {
  it("los materiales se abren con URL firmada y nunca con URL pública", () => {
    const acciones = leer(path.join(src, "lib", "materiales", "acciones.ts"))
    assert.match(acciones, /createSignedUrl\(/)
    assert.doesNotMatch(acciones, /getPublicUrl\(/)
    assert.doesNotMatch(acciones, /clienteAdministrativo/)
  })
  it("publicar notas comprueba docente del grupo o administrador antes de la RPC", () => {
    const pub = leer(path.join(src, "lib", "evaluaciones", "publicacion.ts"))
    assert.match(pub, /docenteActual\(\)/)
    assert.match(pub, /institucionDelAdmin\(\)/)
    assert.match(pub, /\.eq\("docente_id", docente\.userId\)/)
    assert.doesNotMatch(pub, /clienteAdministrativo/)
  })
  it("la asignación de docentes es una sola acción usada desde el grupo y desde el docente", () => {
    const comp = leer(path.join(src, "components", "admin", "asignacion-docente.tsx"))
    assert.equal((comp.match(/asignarDocente\(/g) ?? []).length, 1)
    const acciones = leer(path.join(src, "lib", "grupos", "acciones.ts"))
    assert.match(acciones, /export async function asignarDocente\(grupoId: unknown, docenteId: unknown\)/)
    assert.match(acciones, /institucionDelAdmin\(\)/)
  })
  it("el aula del estudiante solo usa sus matrículas y el docente no ve DNI ni teléfono", () => {
    const aula = leer(path.join(src, "app", "estudiante", "cursos", "[matriculaId]", "page.tsx"))
    assert.match(aula, /obtenerMisCursos\(sesion\.userId\)/)
    assert.match(aula, /notFound\(\)/)
    const docente = leer(path.join(src, "lib", "docente", "datos.ts"))
    assert.doesNotMatch(docente, /select\([^)]*\b(dni|telefono)\b/)
  })
  it("los enlaces de clase del calendario solo se aceptan con https", () => {
    const cal = leer(path.join(src, "lib", "horarios", "calendario.ts"))
    assert.match(cal, /u\.protocol === "https:"/)
  })
})
