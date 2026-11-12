import Link from "next/link"
import { BookCheck, ClipboardPen, LibraryBig, UsersRound } from "lucide-react"

import { BienvenidaPanel, Indicadores, ModulosPanel } from "@/components/layout/panel-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGruposDocente, type GrupoDocente } from "@/lib/docente/datos"
import { resumenDocente } from "@/lib/paneles/resumen"

export default async function DocentePage() {
  const sesion = await requerirPanel("docente")
  const institucion = sesion.institucion ?? "tu institución"
  const [r, grupos] = await Promise.all([
    resumenDocente(sesion.userId),
    sesion.perfil.institucionId
      ? obtenerGruposDocente(sesion.userId, sesion.perfil.institucionId).catch(() => null as GrupoDocente[] | null)
      : Promise.resolve([] as GrupoDocente[]),
  ])
  // Lo que requiere acción: grupos vigentes con notas por registrar.
  const pendientes = (grupos ?? []).filter((g) => g.estado !== "cancelado" && g.estado !== "cerrado" && g.notasEsperadas > g.notasRegistradas)

  return (
    <>
      <BienvenidaPanel
        saludo={`Hola, ${sesion.perfil.nombres}`}
        descripcion={`Organiza tus grupos, evaluaciones y calificaciones en ${institucion}.`}
        contexto={["Docente", institucion]}
      />

      <Indicadores
        items={[
          { icono: LibraryBig, titulo: "Mis grupos", valor: r.grupos, descripcion: "Programados, abiertos o en curso.", href: "/docente/grupos" },
          { icono: UsersRound, titulo: "Mis estudiantes", valor: r.estudiantes, descripcion: "Matrículas activas en tus grupos.", href: "/docente/estudiantes" },
          { icono: ClipboardPen, titulo: "Evaluaciones", valor: r.evaluaciones, descripcion: "Configuradas en tus grupos vigentes.", href: "/docente/calificaciones" },
        ]}
      />

      {r.grupos === 0 && (
        <p className="-mt-4 mb-8 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
          Aún no tienes grupos asignados. Cuando el administrador de tu institución te
          asigne uno, aparecerá aquí con sus estudiantes y evaluaciones.
        </p>
      )}

      {pendientes.length > 0 && (
        <section className="mb-8 space-y-3" aria-labelledby="pendientes">
          <h3 id="pendientes" className="font-semibold">Notas por registrar</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {pendientes.map((g) => (
              <li key={g.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium break-words">{g.curso?.nombre ?? "Curso"} · {g.codigo}</p>
                      <p className="text-xs text-warning">Faltan {g.notasEsperadas - g.notasRegistradas} de {g.notasEsperadas} notas</p>
                    </div>
                    <Link href={`/docente/calificaciones/${g.id}`} className={buttonVariants({ size: "sm" })}>
                      <BookCheck aria-hidden />
                      Registrar
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="mb-4 font-semibold">Mis herramientas</h3>
      <ModulosPanel rol="docente" />
    </>
  )
}
