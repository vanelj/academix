import { createClient } from "@/lib/supabase/server"

/**
 * Indicadores de los paneles (SOLO servidor). Son conteos reales de tablas V5
 * leídos con la sesión del usuario: RLS limita cada consulta a lo que su rol
 * activo puede ver (su institución, sus grupos o sus propios registros).
 * Además se filtra explícitamente por institución o usuario.
 * Si una consulta falla, el valor es null y la interfaz muestra "—": nunca se
 * inventan cifras.
 */

type Consulta = PromiseLike<{ count: number | null; error: { code?: string; message: string } | null }>

async function contar(etiqueta: string, consulta: Consulta): Promise<number | null> {
  const { count, error } = await consulta
  if (error) {
    console.error(`[panel] conteo ${etiqueta}`, error.code, error.message)
    return null
  }
  return count ?? 0
}

const soloConteo = { count: "exact", head: true } as const

export async function resumenAdmin(institucionId: string) {
  const supabase = await createClient()
  const [categorias, cursosPublicados, docentes, matriculasActivas, solicitudesPendientes, pagosPorRevisar, politicas] =
    await Promise.all([
      contar("categorias", supabase.from("categorias").select("id", soloConteo).eq("institucion_id", institucionId)),
      contar("cursos", supabase.from("cursos").select("id", soloConteo).eq("institucion_id", institucionId).eq("estado", "publicado")),
      contar("docentes", supabase.from("usuario_roles").select("perfil_id", soloConteo).eq("institucion_id", institucionId).eq("rol", "docente").eq("activo", true)),
      contar("matriculas", supabase.from("matriculas").select("id", soloConteo).eq("institucion_id", institucionId).eq("estado", "activa")),
      contar("solicitudes", supabase.from("solicitudes_inscripcion").select("id", soloConteo).eq("institucion_id", institucionId).eq("estado", "pendiente")),
      contar("pagos", supabase.from("pagos").select("id", soloConteo).eq("institucion_id", institucionId).eq("estado", "pendiente")),
      contar("politicas", supabase.from("politicas_institucion").select("institucion_id", soloConteo).eq("institucion_id", institucionId)),
    ])
  return { categorias, cursosPublicados, docentes, matriculasActivas, solicitudesPendientes, pagosPorRevisar, politicas }
}

export async function resumenDocente(userId: string) {
  const supabase = await createClient()
  const { data: grupos, error } = await supabase
    .from("grupos")
    .select("id")
    .eq("docente_id", userId)
    .in("estado", ["programado", "abierto", "en_curso"])

  if (error) {
    console.error("[panel] grupos del docente", error.code, error.message)
    return { grupos: null, estudiantes: null, evaluaciones: null }
  }

  const ids = (grupos ?? []).map((g) => g.id as string)
  if (ids.length === 0) return { grupos: 0, estudiantes: 0, evaluaciones: 0 }

  const [estudiantes, evaluaciones] = await Promise.all([
    contar("matriculas del docente", supabase.from("matriculas").select("id", soloConteo).in("grupo_id", ids).eq("estado", "activa")),
    contar("evaluaciones del docente", supabase.from("evaluaciones").select("id", soloConteo).in("grupo_id", ids)),
  ])
  return { grupos: ids.length, estudiantes, evaluaciones }
}

export async function resumenEstudiante(userId: string) {
  const supabase = await createClient()
  const [matriculas, solicitudes, reservas, cuotas, certificados] = await Promise.all([
    contar("matriculas propias", supabase.from("matriculas").select("id", soloConteo).eq("estudiante_id", userId).eq("estado", "activa")),
    contar("solicitudes propias", supabase.from("solicitudes_inscripcion").select("id", soloConteo).eq("estudiante_id", userId).eq("estado", "pendiente")),
    contar("reservas propias", supabase.from("solicitudes_inscripcion").select("id", soloConteo).eq("estudiante_id", userId).eq("estado", "reservada").gt("reserva_vence_en", new Date().toISOString())),
    // cuotas no tiene estudiante_id: RLS (rol estudiante) solo devuelve las de sus matrículas.
    contar("cuotas propias", supabase.from("cuotas").select("id", soloConteo).in("estado", ["pendiente", "parcial"])),
    // certificados tampoco: RLS solo devuelve los de sus matrículas.
    contar("certificados propios", supabase.from("certificados").select("id", soloConteo)),
  ])
  return { matriculas, solicitudes, reservas, cuotas, certificados }
}
