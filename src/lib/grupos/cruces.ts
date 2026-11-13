import { crucesDocente, type CruceDocente, type Franja, type OtroGrupoDocente } from "@/lib/horarios/calendario"
import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>
type Propuesta = { desde: string; hasta: string; franjas: Pick<Franja, "dia_semana" | "hora_inicio" | "hora_fin">[] }

const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])
const VIGENTES = ["programado", "abierto", "en_curso"]

/**
 * Cruces REALES del docente con sus otros grupos vigentes (SOLO servidor).
 *
 * 1. Con la migración revision_funcional_v5: la función franjas_ocupadas_docente
 *    (SECURITY DEFINER) devuelve también las franjas del docente en OTRAS
 *    instituciones, pero sin curso, grupo ni nombre de esa institución.
 * 2. Sin ella: solo los grupos de la institución del administrador (RLS).
 * La comparación de fechas y horas es la función pura compartida crucesDocente.
 */
export async function buscarCrucesDocente(
  supabase: Supabase,
  institucionId: string,
  docenteId: string,
  propuesta: Propuesta,
  excluirGrupoId: string | null
): Promise<CruceDocente[] | "error"> {
  if (propuesta.franjas.length === 0) return []
  const rpc = await supabase.rpc("franjas_ocupadas_docente", {
    p_docente: docenteId, p_desde: propuesta.desde, p_hasta: propuesta.hasta, p_excluir: excluirGrupoId,
  })
  if (!rpc.error) {
    type Fila = { grupo_id: string; curso: string | null; codigo: string | null; institucion: string | null; propia: boolean; estado: string; fecha_inicio: string; fecha_fin: string; dia_semana: number; hora_inicio: string; hora_fin: string }
    const porGrupo = new Map<string, OtroGrupoDocente>()
    for (const f of (rpc.data ?? []) as Fila[]) {
      const g = porGrupo.get(f.grupo_id) ?? {
        curso: f.propia ? (f.curso ?? "otro curso") : "otro curso",
        grupo: f.propia ? (f.codigo ?? "—") : "—",
        institucion: f.propia ? f.institucion : null,
        otraInstitucion: !f.propia,
        estado: f.estado,
        desde: f.fecha_inicio,
        hasta: f.fecha_fin,
        franjas: [],
      }
      g.franjas.push({ dia_semana: f.dia_semana, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin })
      porGrupo.set(f.grupo_id, g)
    }
    return crucesDocente(propuesta, [...porGrupo.values()])
  }
  if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) {
    console.error("[grupos] cruces del docente", rpc.error.code, rpc.error.message)
    return "error"
  }

  // Sin la migración: solo la institución propia.
  let consulta = supabase
    .from("grupos")
    .select("id, codigo, fecha_inicio, fecha_fin, estado, curso_id")
    .eq("institucion_id", institucionId)
    .eq("docente_id", docenteId)
    .in("estado", VIGENTES)
    .lte("fecha_inicio", propuesta.hasta)
    .gte("fecha_fin", propuesta.desde)
  if (excluirGrupoId) consulta = consulta.neq("id", excluirGrupoId)
  const { data: grupos, error } = await consulta
  if (error) return "error"
  if (!grupos?.length) return []
  const [horarios, cursos, inst] = await Promise.all([
    supabase.from("horarios").select("grupo_id, dia_semana, hora_inicio, hora_fin").eq("institucion_id", institucionId).in("grupo_id", grupos.map((g) => g.id)),
    supabase.from("cursos").select("id, nombre").eq("institucion_id", institucionId).in("id", [...new Set(grupos.map((g) => g.curso_id))]),
    supabase.from("instituciones").select("nombre").eq("id", institucionId).maybeSingle(),
  ])
  if (horarios.error || cursos.error) return "error"
  const nombreCurso = new Map((cursos.data ?? []).map((c) => [c.id as string, c.nombre as string]))
  const otros: OtroGrupoDocente[] = grupos.map((g) => ({
    curso: nombreCurso.get(g.curso_id as string) ?? "otro curso",
    grupo: g.codigo as string,
    institucion: (inst.data?.nombre as string | undefined) ?? null,
    otraInstitucion: false,
    estado: g.estado as string,
    desde: g.fecha_inicio as string,
    hasta: g.fecha_fin as string,
    franjas: (horarios.data ?? []).filter((h) => h.grupo_id === g.id).map((h) => ({ dia_semana: h.dia_semana as number, hora_inicio: h.hora_inicio as string, hora_fin: h.hora_fin as string })),
  }))
  return crucesDocente(propuesta, otros)
}
