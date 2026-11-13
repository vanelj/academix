import { obtenerMisCursos } from "@/lib/estudiantes/mis-cursos"
import { obtenerMisSolicitudes } from "@/lib/inscripcion/datos"

/**
 * Cursos en los que el estudiante YA está (SOLO servidor, con su sesión: RLS
 * solo devuelve lo propio). Sirve para que el catálogo los marque y los ponga al
 * final, con un acceso directo a su curso o a su pago. Si algo falla, devuelve
 * un mapa vacío: el catálogo sigue funcionando sin marcas.
 */
export type InscripcionPropia = { etiqueta: string; href: string; accion: string }

export async function inscripcionesPropias(estudianteId: string): Promise<Map<string, InscripcionPropia>> {
  const [cursos, solicitudes] = await Promise.all([
    obtenerMisCursos(estudianteId).then((r) => r.cursos).catch(() => []),
    obtenerMisSolicitudes(estudianteId).catch(() => []),
  ])
  const propios = new Map<string, InscripcionPropia>()
  for (const m of cursos) {
    if (m.estado === "activa" && m.curso) propios.set(m.curso.id, { etiqueta: "Matrícula activa", href: `/estudiante/cursos/${m.matriculaId}`, accion: "Ir a mi curso" })
  }
  for (const s of solicitudes) {
    if (!s.curso || propios.has(s.curso.id) || s.reservaVencida || (s.estado !== "pendiente" && s.estado !== "reservada")) continue
    propios.set(
      s.curso.id,
      s.pagoPendiente
        ? { etiqueta: "Pago en revisión", href: "/estudiante/solicitudes", accion: "Ver mi solicitud" }
        : s.importe_esperado > 0
          ? { etiqueta: "Pago pendiente", href: `/estudiante/pagos/pagar?solicitud=${s.id}`, accion: "Completar pago" }
          : { etiqueta: "Inscripción en trámite", href: "/estudiante/solicitudes", accion: "Ver mi solicitud" }
    )
  }
  return propios
}
