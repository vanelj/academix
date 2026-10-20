import Link from "next/link"
import { Award, Bookmark, ClipboardCheck, Compass, Inbox, Receipt } from "lucide-react"

import { BienvenidaPanel, Indicadores, ModulosPanel } from "@/components/layout/panel-ui"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { resumenEstudiante } from "@/lib/paneles/resumen"

export default async function EstudiantePage() {
  const sesion = await requerirPanel("estudiante")
  const r = await resumenEstudiante(sesion.userId)

  return (
    <>
      <BienvenidaPanel
        saludo={`Hola, ${sesion.perfil.nombres}`}
        descripcion="Sigue tus cursos, solicitudes y pagos. Puedes estudiar en cursos de distintas instituciones."
        contexto={["Estudiante"]}
        acciones={
          <Link href="/cursos" className={buttonVariants()}>
            <Compass aria-hidden />
            Explorar cursos
          </Link>
        }
      />

      <Indicadores
        items={[
          { icono: ClipboardCheck, titulo: "Matrículas activas", valor: r.matriculas, descripcion: "Cursos en los que estás matriculado." },
          { icono: Inbox, titulo: "Solicitudes pendientes", valor: r.solicitudes, descripcion: "En revisión por la institución." },
          { icono: Bookmark, titulo: "Reservas vigentes", valor: r.reservas, descripcion: "Vacantes reservadas aún no vencidas." },
          { icono: Receipt, titulo: "Cuotas por pagar", valor: r.cuotas, descripcion: "Pendientes o con pago parcial." },
        ]}
      />

      {r.matriculas === 0 && r.solicitudes === 0 && (
        <div className="-mt-4 mb-8 flex flex-col gap-3 rounded-xl border border-dashed bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Todavía no tienes matrículas ni solicitudes. Explora el catálogo para
            encontrar un curso que te interese.
          </p>
          <Link href="/cursos" className={buttonVariants({ variant: "outline" })}>
            Ver cursos disponibles
          </Link>
        </div>
      )}

      {r.certificados !== null && r.certificados > 0 && (
        <p className="-mt-4 mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Award className="size-4 text-primary" aria-hidden />
          Tienes {r.certificados === 1 ? "1 certificado" : `${r.certificados} certificados`}.
        </p>
      )}

      <h3 className="mb-4 font-semibold">Mi espacio de estudiante</h3>
      <ModulosPanel rol="estudiante" />
    </>
  )
}
