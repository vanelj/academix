import type { Metadata } from "next"
import Link from "next/link"
import { Building2, CalendarDays, Clock, Compass, Search } from "lucide-react"

import { CategoryIcon } from "@/academix/components/ui/CategoryIcon"
import { getCategoryVisual } from "@/academix/lib/visuals"
import { FiltrosExplorarForm } from "@/components/estudiante/filtros-explorar"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { opcionesDeOferta, obtenerOfertaCursos } from "@/lib/oferta/cursos"
import { coincideEstado, disponibilidadCurso, type DisponibilidadCurso } from "@/lib/oferta/disponibilidad"
import { enlaceFichaDesdePanel, leerFiltrosExplorar } from "@/lib/oferta/explorar"
import { obtenerGruposOferta } from "@/lib/oferta/grupos"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { DIAS_SEMANA } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Explorar cursos · Academix",
}

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
const fecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const f = (iso: string) => fecha.format(new Date(`${iso}T00:00:00Z`))
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

const VARIANTE: Record<DisponibilidadCurso["estado"], "success" | "warning" | "secondary" | "outline"> = {
  abiertas: "success",
  proximamente: "warning",
  en_curso: "secondary",
  sin_vacantes: "outline",
  sin_inscripciones: "outline",
}

const ORDEN: DisponibilidadCurso["estado"][] = ["abiertas", "proximamente", "en_curso", "sin_vacantes", "sin_inscripciones"]

/**
 * Catálogo DENTRO del panel del estudiante: no sale de la sesión ni del panel.
 * Lee las mismas vistas públicas que /cursos; la inscripción se hace en la
 * ficha del curso, donde el servidor y la BD validan grupo, vacantes y pagos.
 */
export default async function ExplorarCursosPage({ searchParams }: PageProps<"/estudiante/explorar">) {
  await requerirPanel("estudiante")
  const filtros = leerFiltrosExplorar(await searchParams)
  const [oferta, grupos] = await Promise.all([obtenerOfertaCursos(), obtenerGruposOferta().catch(() => null)])

  const encabezado = (
    <PageHeader
      title="Explorar cursos"
      description="Cursos publicados por las instituciones. Inscríbete en los grupos con inscripciones abiertas; los grupos en curso ya no reciben matrículas."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/estudiante/cursos" className={buttonVariants({ variant: "outline" })}>Mis cursos</Link>
          <Link href="/cursos" className={buttonVariants({ variant: "ghost" })}>Catálogo público</Link>
        </div>
      }
    />
  )
  if (!oferta.ok) {
    return (
      <>
        {encabezado}
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No pudimos cargar el catálogo. Recarga la página en unos minutos.</CardContent></Card>
      </>
    )
  }

  const disp = new Map(oferta.cursos.map((c) => [c.id, grupos ? disponibilidadCurso(grupos.filter((g) => g.curso_id === c.id)) : null]))

  // Horarios del grupo recomendado de cada curso (vista pública oferta_horarios).
  const idsGrupo = [...disp.values()].flatMap((d) => (d?.grupo ? [d.grupo.id] : []))
  const horarios = new Map<string, string>()
  if (idsGrupo.length) {
    const supabase = await createClient()
    const { data } = await supabase.from("oferta_horarios").select("grupo_id, dia_semana, hora_inicio, hora_fin").in("grupo_id", idsGrupo).order("dia_semana").order("hora_inicio")
    for (const h of (data ?? []) as { grupo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[]) {
      const t = `${DIAS_SEMANA[h.dia_semana - 1]} ${h.hora_inicio.slice(0, 5)}–${h.hora_fin.slice(0, 5)}`
      horarios.set(h.grupo_id, horarios.has(h.grupo_id) ? `${horarios.get(h.grupo_id)} · ${t}` : t)
    }
  }

  const termino = normalizar(filtros.q)
  const visibles = oferta.cursos
    .filter((c) => {
      const d = disp.get(c.id)
      return (
        (!filtros.categoria || c.categoria_id === filtros.categoria) &&
        (!filtros.institucion || c.institucion_id === filtros.institucion) &&
        (!termino || [c.nombre, c.descripcion ?? "", c.categoria, c.institucion].some((x) => normalizar(x).includes(termino))) &&
        (!d || coincideEstado(d, filtros.estado))
      )
    })
    // Primero lo que admite inscripción.
    .sort(
      (a, b) =>
        ORDEN.indexOf(disp.get(a.id)?.estado ?? "sin_inscripciones") - ORDEN.indexOf(disp.get(b.id)?.estado ?? "sin_inscripciones") ||
        a.nombre.localeCompare(b.nombre, "es")
    )
  const { instituciones, categorias } = opcionesDeOferta(oferta.cursos)

  return (
    <>
      {encabezado}
      <FiltrosExplorarForm filtros={filtros} categorias={categorias} instituciones={instituciones} />
      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {visibles.length === 1 ? "1 curso" : `${visibles.length} cursos`}
        {grupos === null && " · No se pudo consultar el estado de los grupos."}
      </p>
      {visibles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Search className="size-5 text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground">Ningún curso coincide con los filtros.</p>
            <Link href="/estudiante/explorar" className={buttonVariants({ variant: "outline", size: "sm" })}>Quitar filtros</Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const d = disp.get(c.id)
            const visual = getCategoryVisual({ slug: "", name: c.categoria })
            return (
              <li key={c.id} id={`curso-${c.id}`} className="scroll-mt-24">
                <Card className="h-full gap-0 overflow-hidden py-0">
                  {c.portada_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.portada_url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                  ) : (
                    <div aria-hidden className={`ax-cover ax-cover--${visual} aspect-video w-full`}>
                      <span className="ax-cover-icon"><CategoryIcon visual={visual} size={26} /></span>
                    </div>
                  )}
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-primary">{c.categoria}</span>
                      {d && <Badge variant={VARIANTE[d.estado]} className="ml-auto">{d.etiqueta}</Badge>}
                    </div>
                    <h2 className="text-base leading-snug font-semibold text-balance">{c.nombre}</h2>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5 shrink-0" aria-hidden />{c.institucion}</p>
                    {d?.grupo && (
                      <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0" aria-hidden />Grupo {d.grupo.codigo} · {f(d.grupo.fecha_inicio)} – {f(d.grupo.fecha_fin)}</p>
                        {horarios.get(d.grupo.id) && <p className="flex items-start gap-1.5"><Clock className="mt-px size-3.5 shrink-0" aria-hidden />{horarios.get(d.grupo.id)}</p>}
                        {d.abiertos > 1 && <p>{d.abiertos} grupos con inscripciones abiertas</p>}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <span className="font-semibold tabular-nums">{Number(c.precio) > 0 ? soles.format(Number(c.precio)) : "Gratuito"}</span>
                      <Link
                        href={enlaceFichaDesdePanel(c.id, filtros)}
                        className={cn(buttonVariants({ variant: d?.estado === "abiertas" ? "default" : "outline", size: "sm" }), "ml-auto")}
                      >
                        {d?.estado === "abiertas" ? "Ver e inscribirme" : "Ver curso"}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Compass className="size-3.5" aria-hidden />
        Los precios y las vacantes se confirman en la ficha del curso antes de inscribirte.
      </p>
    </>
  )
}
