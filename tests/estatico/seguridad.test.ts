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
      assert.match(leer(f), /docenteActual\(\)|institucionDelAdmin\("[a-z]+"\)|obtenerContexto\(\)/, path.relative(raiz, f))
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
    assert.match(leer(path.join(src, "lib", "auth", "invitacion.ts")), /RUTA_ACTIVACION/)
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
    assert.match(pub, /institucionDelAdmin\("evaluaciones"\)/)
    assert.match(pub, /\.eq\("docente_id", docente\.userId\)/)
    assert.doesNotMatch(pub, /clienteAdministrativo/)
  })
  it("la asignación de docentes es una sola acción usada desde el grupo y desde el docente", () => {
    const comp = leer(path.join(src, "components", "admin", "asignacion-docente.tsx"))
    assert.equal((comp.match(/asignarDocente\(/g) ?? []).length, 1)
    const acciones = leer(path.join(src, "lib", "grupos", "acciones.ts"))
    assert.match(acciones, /export async function asignarDocente\(grupoId: unknown, docenteId: unknown\)/)
    assert.match(acciones, /institucionDelAdmin\("docentes"\)/)
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

describe("Equipo administrativo y programación", () => {
  const mapa: Record<string, string> = {
    categorias: "cursos", cursos: "cursos", docentes: "docentes", grupos: "docentes", calendario: "docentes",
    estudiantes: "estudiantes", solicitudes: "estudiantes", matriculas: "estudiantes", pagos: "pagos",
    evaluaciones: "evaluaciones", certificados: "certificados", institucion: "institucion", politicas: "institucion", equipo: "equipo",
  }
  it("cada sección del panel admin exige su permiso en el servidor (layout)", () => {
    for (const [carpeta, area] of Object.entries(mapa)) {
      const layout = path.join(src, "app", "admin", carpeta, "layout.tsx")
      assert.ok(existsSync(layout), `falta ${carpeta}/layout.tsx`)
      assert.match(leer(layout), new RegExp(`requerirArea\\("${area}"\\)`), carpeta)
    }
  })
  it("ninguna acción del administrador usa institucionDelAdmin() sin módulo", () => {
    for (const ruta of fuente) {
      if (ruta.endsWith(path.join("auth", "contexto.ts"))) continue
      assert.doesNotMatch(leer(ruta), /institucionDelAdmin\(\)/, path.relative(raiz, ruta))
    }
  })
  it("las acciones del equipo exigen ser principal y no usan la clave secreta para los permisos", () => {
    const acc = leer(path.join(src, "lib", "equipo", "acciones.ts"))
    assert.match(acc, /institucionDelAdmin\("equipo"\)/)
    assert.match(acc, /rpc\("gestionar_administrador"/)
    assert.doesNotMatch(acc, /admin\.from\("administradores_institucion"\)/)
    assert.doesNotMatch(acc, /admin\.from\("usuario_roles"\)/)
  })
  it("administracion_v5: sin escrituras directas, sin autoescalar y sin quedarse sin principal", () => {
    const s = leer(path.join(raiz, "docs", "migraciones", "administracion_v5.sql"))
    assert.match(s, /grant select on table public\.administradores_institucion to authenticated;/)
    assert.ok(!/^\s*grant (insert|update|delete)[^;]*administradores_institucion/im.test(s))
    assert.match(s, /if p_perfil = auth\.uid\(\) then raise exception/)
    assert.equal((s.match(/sin un administrador principal activo/g) ?? []).length, 2)
    assert.match(s, /as restrictive for insert to authenticated/)
    assert.match(s, /rol = 'admin' and privado\.es_admin_principal\(institucion_id\)/)
    // Los administradores actuales conservan el acceso completo.
    assert.match(s, /select ur\.perfil_id, ur\.institucion_id, true, true, ur\.activo/)
    // El enlace del docente solo con autorización institucional y https.
    assert.match(s, /i\.docentes_gestionan_enlaces/)
    assert.match(s, /v_enlace !~ '\^https:\/\/\[\^\\s\]\+\$'/)
  })
  it("la programación la recalcula el servidor y solo cambia las fechas del grupo", () => {
    const acc = leer(path.join(src, "lib", "grupos", "acciones.ts"))
    const bloque = acc.slice(acc.indexOf("export async function aplicarProgramacion"), acc.indexOf("export async function cambiarEstadoGrupo"))
    assert.match(bloque, /programar\(/)
    assert.match(bloque, /\.update\(\{ fecha_inicio: r\.programacion\.fechaInicio, fecha_fin: r\.programacion\.fechaFin \}\)/)
    assert.doesNotMatch(bloque, /\.insert\(/)
  })
})

describe("Correos y eliminación segura", () => {
  it("la clave de Resend nunca es pública ni llega al navegador", () => {
    for (const ruta of fuente) {
      const codigo = leer(ruta)
      assert.doesNotMatch(codigo, /NEXT_PUBLIC_RESEND/, path.relative(raiz, ruta))
      if (esCliente(codigo)) assert.doesNotMatch(codigo, /RESEND_API_KEY|lib\/correos\/(proveedor|procesar|config)/, path.relative(raiz, ruta))
    }
  })
  it("ningún componente ni página envía correos al renderizar", () => {
    for (const ruta of fuente.filter((f) => f.includes(`${path.sep}app${path.sep}`) && f.endsWith("page.tsx"))) {
      assert.doesNotMatch(leer(ruta), /despacharCorreos|procesarCorreos|enviarConResend/, path.relative(raiz, ruta))
    }
  })
  it("eliminacion_segura_v5: una transacción, revalida bajo bloqueo, exige confirmación y nunca borra historial", () => {
    const s = leer(path.join(raiz, "docs", "migraciones", "eliminacion_segura_v5.sql"))
    const curso = s.slice(s.indexOf("create or replace function public.eliminar_curso"), s.indexOf("-- GRUPO"))
    assert.match(curso, /for update/)
    assert.ok(curso.indexOf("for update") < curso.indexOf("diagnostico_eliminar_curso(p_curso)"), "bloquea antes de revalidar")
    assert.match(curso, /btrim\(p_confirmacion\) <> btrim\(v_c\.nombre\)/)
    assert.match(curso, /privado\.admin_modulo\(v_c\.institucion_id, 'cursos'\)/)
    for (const t of ["matriculas", "solicitudes_inscripcion", "pagos", "cuotas", "calificaciones", "historial_resultados", "certificados"]) {
      assert.doesNotMatch(s, new RegExp(`delete from public\\.${t}\\b`), `no debe borrar ${t}`)
    }
    assert.match(s, /revoke all on function public\.eliminar_curso\(uuid, text\) from public, anon;/)
  })
  it("correos_academicos_v5 amplía la cola existente (sin sistema paralelo) y no avisa por cambios de enlace", () => {
    const s = leer(path.join(raiz, "docs", "migraciones", "correos_academicos_v5.sql"))
    assert.match(s, /privado\.encolar_correo\('horario_cambiado'/)
    assert.match(s, /after insert or delete or update of dia_semana, hora_inicio, hora_fin on public\.horarios/)
    assert.doesNotMatch(s, /create table/i)
  })
  it("el diálogo de eliminación usa solo acciones de servidor (sin borrados desde el navegador)", () => {
    const d = leer(path.join(src, "components", "admin", "eliminacion-dialogo.tsx"))
    assert.doesNotMatch(d, /createClient|\.delete\(|\.from\(/)
    const acc = leer(path.join(src, "lib", "cursos", "eliminacion-acciones.ts"))
    assert.match(acc, /institucionDelAdmin\("cursos"\)/)
    assert.match(acc, /institucionDelAdmin\("docentes"\)/)
  })
})

describe("Herramientas de correo (Management API)", () => {
  it("el token de administración de Supabase solo lo usan las herramientas, nunca la app", () => {
    for (const ruta of fuente) {
      const codigo = leer(ruta)
      assert.doesNotMatch(codigo, /NEXT_PUBLIC_SUPABASE_ACCESS_TOKEN/, path.relative(raiz, ruta))
      if (ruta.includes(`${path.sep}app${path.sep}`) || ruta.includes(`${path.sep}components${path.sep}`)) {
        assert.doesNotMatch(codigo, /gestion-supabase|SUPABASE_ACCESS_TOKEN|api\.supabase\.com/, path.relative(raiz, ruta))
      }
    }
  })
  it("las credenciales y respaldos de herramientas están fuera de Git", () => {
    const gi = readFileSync(path.join(raiz, ".gitignore"), "utf8")
    assert.match(gi, /^\.env\*$/m)
    assert.match(gi, /^\.correos-respaldo\/$/m)
  })
})

describe("Revisión funcional previa al despliegue", () => {
  const sql = leer(path.join(raiz, "docs", "migraciones", "revision_funcional_v5.sql"))
  const ejecutable = sql.replace(/^\s*--.*$/gm, "")

  it("ningún window.open usa «noopener» en sus opciones (devuelve null y deja la pestaña en blanco)", () => {
    for (const r of fuente) {
      for (const m of leer(r).matchAll(/window\.open\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /noopener/, path.relative(raiz, r))
    }
  })

  it("todo formateador de fecha declara su zona horaria (Lima o UTC para fechas sin hora)", () => {
    for (const r of fuente) {
      const codigo = leer(r)
      for (const m of codigo.matchAll(/new Intl\.DateTimeFormat\(/g)) {
        let i = m.index! + m[0].length
        let nivel = 1
        while (nivel && i < codigo.length) { if (codigo[i] === "(") nivel++; else if (codigo[i] === ")") nivel--; i++ }
        const llamada = codigo.slice(m.index!, i)
        assert.ok(/timeZone/.test(llamada) || /\.\.\.opciones/.test(llamada), `${path.relative(raiz, r)}: ${llamada.slice(0, 90)}`)
      }
    }
  })

  it("la migración retira la escritura directa de notas y deja todo cambio auditado", () => {
    assert.match(ejecutable, /revoke insert, update, delete on table public\.calificaciones from authenticated/)
    assert.match(ejecutable, /revoke update \(nota, observacion\) on table public\.calificaciones from authenticated/)
    assert.match(ejecutable, /create trigger historial_calificacion_v5\s+after insert or update or delete on public\.calificaciones/)
    assert.match(ejecutable, /grant select on table public\.historial_calificaciones to authenticated;/)
    assert.doesNotMatch(ejecutable, /grant (insert|update|delete)[^;]*historial_calificaciones/)
    assert.match(ejecutable, /Indica el motivo de la corrección/)
  })

  it("tareas y entregas: solo lectura directa, escritura por funciones y bucket PRIVADO", () => {
    assert.match(ejecutable, /grant select on table public\.tareas, public\.entregas_tarea to authenticated;/)
    assert.doesNotMatch(ejecutable, /grant (insert|update|delete)[^;]*(tareas|entregas_tarea)/)
    assert.match(ejecutable, /values \('entregas-tareas', 'entregas-tareas', false/)
    assert.doesNotMatch(ejecutable, /to anon[^;]*(tareas|entregas|guardar_calificaciones|franjas_ocupadas)/)
    for (const m of ejecutable.matchAll(/create or replace function (public|privado)\.(\w+)\([^]*?as \$\$/g)) {
      assert.match(m[0], /security definer set search_path = ''/, m[2])
    }
  })

  it("las acciones de tareas y la consulta de cruces validan el permiso en el servidor", () => {
    const tareas = leer(path.join(src, "lib", "tareas", "acciones.ts"))
    assert.ok(esAccion(tareas))
    for (const f of ["guardarTarea", "cambiarEstadoTarea", "calificarEntrega"]) {
      const cuerpo = tareas.slice(tareas.indexOf(`export async function ${f}`))
      assert.match(cuerpo.slice(0, 1500), /puedeGestionar\(/, f)
    }
    assert.match(tareas.slice(tareas.indexOf("export async function entregarTarea")).slice(0, 1200), /rolActivo !== "estudiante"/)
    const grupos = leer(path.join(src, "lib", "grupos", "acciones.ts"))
    assert.match(grupos.slice(grupos.indexOf("export async function revisarCruceDocente")).slice(0, 400), /institucionDelAdmin\("docentes"\)/)
    assert.doesNotMatch(grupos, /cruceDelDocente/)
  })

  it("eliminación: dos confirmaciones explícitas, sin escribir el nombre, y la BD sigue validando", () => {
    const acciones = leer(path.join(src, "lib", "cursos", "eliminacion-acciones.ts"))
    assert.equal((acciones.match(/confirmacionDobleValida\(confirmacion\)/g) ?? []).length, 2)
    assert.match(acciones, /rpc\("eliminar_curso", \{ p_curso: id\.data, p_confirmacion: curso\.nombre/)
    const dialogo = leer(path.join(src, "components", "admin", "eliminacion-dialogo.tsx"))
    assert.doesNotMatch(dialogo, /<Input/)
    assert.match(dialogo, /Sí, eliminar definitivamente/)
  })

  it("los pagos de certificado están en el módulo Pagos y cuentan en el resumen", () => {
    assert.ok(existsSync(path.join(src, "app", "admin", "pagos", "certificados", "page.tsx")))
    assert.match(leer(path.join(src, "components", "admin", "pagos", "pago-ui.tsx")), /\/admin\/pagos\/certificados/)
    assert.match(leer(path.join(src, "lib", "paneles", "resumen.ts")), /pagos_certificado/)
  })

  it("«Explorar cursos» del estudiante no sale del panel", () => {
    const item = getNavItems("estudiante").find((i) => i.title === "Explorar cursos")
    assert.equal(item?.href, "/estudiante/explorar")
  })

  it("el logotipo de los correos es un archivo público pequeño", () => {
    const logo = path.join(raiz, "public", "marca", "academix-logo-correo.png")
    assert.ok(existsSync(logo))
    assert.ok(statSync(logo).size < 20_000)
  })
})
