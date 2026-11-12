import type { GrupoDocente } from "@/lib/docente/datos"
import type { GrupoCalendario } from "@/lib/horarios/calendario"

/**
 * Grupos del docente para el calendario académico (puro). Solo los grupos que
 * ya devolvió obtenerGruposDocente (filtrados por docente_id e institución);
 * los cancelados no generan clases. Accesos rápidos al grupo, estudiantes y notas.
 */
export function gruposCalendarioDocente(grupos: GrupoDocente[], institucion: string | null): GrupoCalendario[] {
  return grupos
    .filter((g) => g.estado !== "cancelado")
    .map((g) => ({
      clave: g.id,
      curso: g.curso?.nombre ?? "Curso",
      grupo: g.codigo,
      institucion,
      modalidad: g.curso?.modalidad ?? null,
      estado: g.estado,
      desde: g.fecha_inicio.slice(0, 10),
      hasta: g.fecha_fin.slice(0, 10),
      franjas: g.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, enlace: h.enlace_clase, ubicacion: h.ubicacion ?? null })),
      accesos: [
        { etiqueta: "Abrir grupo", href: `/docente/grupos/${g.id}` },
        { etiqueta: "Estudiantes", href: `/docente/estudiantes?grupo=${g.id}` },
        { etiqueta: "Registrar notas", href: `/docente/calificaciones/${g.id}` },
      ],
    }))
}
