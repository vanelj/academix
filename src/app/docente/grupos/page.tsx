import type { Metadata } from "next"

import { ErrorCarga, SinGrupos, TarjetaGrupoDocente } from "@/components/docente/docente-ui"
import { PageHeader } from "@/components/layout/page-header"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGruposDocente, type GrupoDocente } from "@/lib/docente/datos"

export const metadata: Metadata = { title: "Mis grupos · Academix" }

export default async function DocenteGruposPage() {
  const sesion = await requerirPanel("docente")
  const encabezado = <PageHeader title="Mis grupos" description="Tus grupos organizados por curso: horario, estudiantes, materiales y avance de notas." />
  if (!sesion.perfil.institucionId) return <>{encabezado}<SinGrupos /></>

  let grupos: GrupoDocente[]
  try {
    grupos = await obtenerGruposDocente(sesion.userId, sesion.perfil.institucionId)
  } catch {
    return <>{encabezado}<ErrorCarga texto="No se pudieron cargar tus grupos. Recarga la página en unos minutos." /></>
  }
  const vigentes = grupos.filter((g) => g.estado !== "cerrado" && g.estado !== "cancelado")
  const anteriores = grupos.filter((g) => !vigentes.includes(g))

  return (
    <>
      {encabezado}
      {grupos.length === 0 ? <SinGrupos /> : (
        <>
          {vigentes.length > 0 ? <PorCurso grupos={vigentes} institucion={sesion.institucion} /> : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No tienes grupos vigentes en este momento.</p>
          )}
          {anteriores.length > 0 && (
            <section className="mt-10 space-y-3" aria-labelledby="anteriores">
              <h3 id="anteriores" className="text-sm font-semibold text-muted-foreground">Grupos cerrados o cancelados</h3>
              <PorCurso grupos={anteriores} institucion={sesion.institucion} />
            </section>
          )}
        </>
      )}
    </>
  )
}

/** Un bloque por curso: si dictas varios cursos, cada uno con sus grupos. */
function PorCurso({ grupos, institucion }: { grupos: GrupoDocente[]; institucion: string | null }) {
  const cursos = new Map<string, GrupoDocente[]>()
  for (const g of grupos) cursos.set(g.curso?.id ?? g.id, [...(cursos.get(g.curso?.id ?? g.id) ?? []), g])
  const lista = [...cursos.values()].sort((a, b) => (a[0].curso?.nombre ?? "").localeCompare(b[0].curso?.nombre ?? "", "es"))
  return (
    <div className="space-y-8">
      {lista.map((delCurso) => (
        <section key={delCurso[0].curso?.id ?? delCurso[0].id} className="space-y-3" aria-label={delCurso[0].curso?.nombre ?? "Curso"}>
          <h3 className="flex items-baseline gap-2 text-base font-semibold">
            {delCurso[0].curso?.nombre ?? "Curso"}
            <span className="text-xs font-normal text-muted-foreground">{delCurso.length} {delCurso.length === 1 ? "grupo" : "grupos"}</span>
          </h3>
          <ul className="grid gap-4 lg:grid-cols-2">
            {delCurso.map((g) => <li key={g.id}><TarjetaGrupoDocente grupo={g} institucion={institucion} conCurso={false} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
