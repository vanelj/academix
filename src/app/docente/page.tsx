import { ClipboardPen, LibraryBig, UsersRound } from "lucide-react"

import { BienvenidaPanel, Indicadores, ModulosPanel } from "@/components/layout/panel-ui"
import { requerirPanel } from "@/lib/auth/contexto"
import { resumenDocente } from "@/lib/paneles/resumen"

export default async function DocentePage() {
  const sesion = await requerirPanel("docente")
  const r = await resumenDocente(sesion.userId)
  const institucion = sesion.institucion ?? "tu institución"

  return (
    <>
      <BienvenidaPanel
        saludo={`Hola, ${sesion.perfil.nombres}`}
        descripcion={`Organiza tus grupos, evaluaciones y calificaciones en ${institucion}.`}
        contexto={["Docente", institucion]}
      />

      <Indicadores
        items={[
          { icono: LibraryBig, titulo: "Mis grupos", valor: r.grupos, descripcion: "Programados, abiertos o en curso." },
          { icono: UsersRound, titulo: "Mis estudiantes", valor: r.estudiantes, descripcion: "Matrículas activas en tus grupos." },
          { icono: ClipboardPen, titulo: "Evaluaciones", valor: r.evaluaciones, descripcion: "Creadas en tus grupos vigentes." },
        ]}
      />

      {r.grupos === 0 && (
        <p className="-mt-4 mb-8 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
          Aún no tienes grupos asignados. Cuando el administrador de tu institución te
          asigne uno, aparecerá aquí con sus estudiantes y evaluaciones.
        </p>
      )}

      <h3 className="mb-4 font-semibold">Mis herramientas</h3>
      <ModulosPanel rol="docente" />
    </>
  )
}
