import Link from "next/link"
import { BookOpen, ClipboardCheck, CreditCard, Inbox, Presentation, ScrollText } from "lucide-react"

import {
  BienvenidaPanel,
  Indicadores,
  ModulosPanel,
  PrimerosPasos,
} from "@/components/layout/panel-ui"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { resumenAdmin } from "@/lib/paneles/resumen"

export default async function AdminDashboardPage() {
  // Cada página vuelve a comprobar el acceso: el layout no se re-ejecuta al navegar entre páginas.
  const sesion = await requerirPanel("admin")
  const institucion = sesion.institucion ?? "tu institución"
  const r = sesion.perfil.institucionId ? await resumenAdmin(sesion.perfil.institucionId) : null

  const hay = (n: number | null | undefined) => (n == null ? null : n > 0)

  return (
    <>
      <BienvenidaPanel
        saludo={`Hola, ${sesion.perfil.nombres}`}
        descripcion={`Gestiona la oferta académica, las inscripciones y los pagos de ${institucion}.`}
        contexto={["Administrador", institucion]}
        acciones={
          <Link href="/cursos" className={buttonVariants({ variant: "outline" })}>
            Ver catálogo público
          </Link>
        }
      />

      <Indicadores
        items={[
          { icono: BookOpen, titulo: "Cursos publicados", valor: r?.cursosPublicados ?? null, descripcion: "Visibles en el catálogo público." },
          { icono: Presentation, titulo: "Docentes activos", valor: r?.docentes ?? null, descripcion: "Con el rol docente habilitado." },
          { icono: ClipboardCheck, titulo: "Matrículas activas", valor: r?.matriculasActivas ?? null, descripcion: "En todos los grupos de la institución." },
          { icono: Inbox, titulo: "Solicitudes pendientes", valor: r?.solicitudesPendientes ?? null, descripcion: "Inscripciones por revisar." },
        ]}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Atajo icono={CreditCard} titulo="Pagos por revisar" valor={r?.pagosPorRevisar ?? null} texto="Comprobantes presentados que esperan verificación." />
        <Atajo icono={ScrollText} titulo="Políticas institucionales" valor={null} estado={hay(r?.politicas)} texto="Textos de matrícula, reservas, pagos y devoluciones." />
      </div>

      <PrimerosPasos
        titulo="Primeros pasos de la institución"
        pasos={[
          { titulo: "Crear categorías", descripcion: "Organiza la oferta por áreas temáticas.", hecho: hay(r?.categorias) },
          { titulo: "Registrar docentes", descripcion: "Asigna el rol docente a tu personal.", hecho: hay(r?.docentes) },
          { titulo: "Publicar un curso", descripcion: "Aparecerá en el catálogo público.", hecho: hay(r?.cursosPublicados) },
          { titulo: "Definir políticas", descripcion: "Condiciones que el estudiante acepta al inscribirse.", hecho: hay(r?.politicas) },
        ]}
      />

      <h3 className="mb-4 font-semibold">Módulos de gestión</h3>
      <ModulosPanel rol="admin" />
    </>
  )
}

function Atajo({
  icono: Icono,
  titulo,
  valor,
  estado,
  texto,
}: {
  icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  titulo: string
  valor: number | null
  /** Para indicadores de sí/no (p. ej. políticas configuradas). */
  estado?: boolean | null
  texto: string
}) {
  const detalle =
    estado !== undefined
      ? estado === null
        ? "—"
        : estado
          ? "Configuradas"
          : "Sin configurar"
      : valor === null
        ? "—"
        : valor.toLocaleString("es-PE")

  return (
    <div className="flex items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
        <Icono className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{texto}</p>
      </div>
      <p className="text-lg font-semibold tabular-nums">{detalle}</p>
    </div>
  )
}
