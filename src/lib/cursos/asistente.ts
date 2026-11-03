import { obtenerCertificacionCurso } from "@/lib/certificados/datos"
import { obtenerCategoriasParaCurso, obtenerCurso, obtenerPlanCuotas, type CategoriaOpcion, type CursoDetalle, type CuotaPlan } from "@/lib/cursos/datos"
import { obtenerGrupo, obtenerGrupos, opcionesDocentes, type GrupoDetalle, type OpcionDocente } from "@/lib/grupos/datos"
import { createClient } from "@/lib/supabase/server"
import { CONDICIONES_INICIALES, CURSO_INICIAL, type CursoValues } from "@/lib/validations/curso"

/**
 * Datos del asistente de creación y configuración de cursos (SOLO servidor).
 * Reutiliza los cargadores existentes; todo se filtra por la institución del
 * administrador (además de RLS). No escribe nada.
 */

export type DatosAsistente = {
  categorias: CategoriaOpcion[]
  curso: CursoDetalle | null
  valores: CursoValues
  /** Portada actual; `disponible` = la columna cursos.portada_url ya existe. */
  portada: { disponible: boolean; url: string | null }
  plan: CuotaPlan[] | null
  grupos: GrupoDetalle[]
  /** null = no se pudieron leer los grupos. */
  gruposError: boolean
  docentes: OpcionDocente[]
  certificacion: Awaited<ReturnType<typeof obtenerCertificacionCurso>>
}

const texto = (n: number) => String(n)

/** Valores del formulario a partir del curso guardado (misma conversión que «Editar curso»). */
export function valoresDeCurso(curso: CursoDetalle): CursoValues {
  const c = curso.condiciones
  return {
    nombre: curso.nombre,
    categoria_id: curso.categoria?.id ?? "",
    descripcion: curso.descripcion ?? "",
    precio: texto(curso.precio),
    nota_aprobatoria: texto(curso.nota_aprobatoria),
    configurarCondiciones: c !== null,
    condiciones: c
      ? {
          tipo_cobro: c.tipo_cobro,
          matricula_importe: texto(c.matricula_importe),
          importe_curso: texto(c.importe_curso),
          permite_reserva: c.permite_reserva,
          reserva_importe: texto(c.reserva_importe),
          reserva_plazo_horas: c.reserva_plazo_horas == null ? "" : texto(c.reserva_plazo_horas),
          reserva_descuenta_matricula: c.reserva_descuenta_matricula,
          requisitos: c.requisitos ?? "",
          condiciones_especiales: c.condiciones_especiales ?? "",
        }
      : CONDICIONES_INICIALES,
  }
}

/** Portada del curso; si la migración no está aplicada, `disponible: false`. */
async function leerPortada(institucionId: string, cursoId: string | null) {
  const supabase = await createClient()
  const consulta = supabase.from("cursos").select("portada_url").eq("institucion_id", institucionId).limit(1)
  const { data, error } = cursoId ? await consulta.eq("id", cursoId) : await consulta
  if (error) {
    if (error.code !== "42703") console.error("[asistente] portada", error.code, error.message)
    return { disponible: false, url: null }
  }
  const fila = (data as { portada_url: string | null }[] | null)?.[0]
  return { disponible: true, url: cursoId ? (fila?.portada_url ?? null) : null }
}

export async function obtenerDatosAsistente(institucionId: string, cursoId: string | null): Promise<DatosAsistente | null> {
  const [categoriasBase, curso] = await Promise.all([
    obtenerCategoriasParaCurso(institucionId),
    cursoId ? obtenerCurso(institucionId, cursoId) : Promise.resolve(null),
  ])
  if (cursoId && !curso) return null

  // Conserva la categoría actual aunque esté inactiva (igual que «Editar curso»).
  const categorias =
    curso?.categoria && !categoriasBase.some((c) => c.id === curso.categoria!.id)
      ? await obtenerCategoriasParaCurso(institucionId, curso.categoria.id)
      : categoriasBase

  if (!curso) {
    const portada = await leerPortada(institucionId, null)
    return {
      categorias,
      curso: null,
      valores: CURSO_INICIAL,
      portada,
      plan: null,
      grupos: [],
      gruposError: false,
      docentes: [],
      certificacion: { disponible: false },
    }
  }

  const [portada, plan, todos, docentes, certificacion] = await Promise.all([
    leerPortada(institucionId, curso.id),
    curso.condiciones?.tipo_cobro === "cuotas" ? obtenerPlanCuotas(institucionId, curso.id) : Promise.resolve(null),
    obtenerGrupos(institucionId).then(
      (g) => g.filter((x) => x.curso?.id === curso.id),
      () => null
    ),
    opcionesDocentes(institucionId).catch(() => [] as OpcionDocente[]),
    obtenerCertificacionCurso(institucionId, curso.id).catch(() => ({ disponible: false as const })),
  ])

  // Detalle (horarios con enlace y dependencias) de los grupos de ESTE curso.
  const detalles = todos ? await Promise.all(todos.map((g) => obtenerGrupo(institucionId, g.id).catch(() => null))) : []

  return {
    categorias,
    curso,
    valores: valoresDeCurso(curso),
    portada,
    plan,
    grupos: detalles.filter((g): g is GrupoDetalle => g !== null),
    gruposError: todos === null || detalles.some((g) => g === null),
    docentes,
    certificacion,
  }
}
