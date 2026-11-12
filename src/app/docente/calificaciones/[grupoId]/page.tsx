import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { EstadoGrupoBadge } from "@/components/admin/grupos/grupo-ui"
import { ErrorCarga } from "@/components/docente/docente-ui"
import { RegistroNotas } from "@/components/docente/registro-notas"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerRegistroGrupo, type RegistroGrupo } from "@/lib/docente/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = { title: "Registro de notas · Academix" }

export default async function RegistroNotasPage({ params }: PageProps<"/docente/calificaciones/[grupoId]">) {
  const sesion = await requerirPanel("docente")
  const { grupoId } = await params
  if (!sesion.perfil.institucionId || !idSchema.safeParse(grupoId).success) notFound()

  let registro: RegistroGrupo | null
  try {
    registro = await obtenerRegistroGrupo(sesion.userId, sesion.perfil.institucionId, grupoId)
  } catch {
    return <ErrorCarga texto="No se pudo cargar el registro de notas. Recarga la página en unos minutos." />
  }
  // Un grupo ajeno se trata como inexistente.
  if (!registro) notFound()
  const g = registro.grupo

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href={`/docente/grupos/${g.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver al grupo
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight break-words">{g.curso?.nombre ?? "Curso"} · Grupo {g.codigo}</h2>
          <EstadoGrupoBadge estado={g.estado} />
        </div>
        <p className="text-sm text-muted-foreground">
          Escribe las notas (0 a 20) y guarda una sola vez. Una casilla vacía es una nota pendiente, no un cero.
          {g.publicacionActiva && " Las notas guardadas son un borrador: publica cada evaluación cuando esté lista."}
          Nota aprobatoria del curso: {g.curso?.notaAprobatoria ?? 11}. El resultado final lo cierra la institución.
        </p>
      </div>
      <RegistroNotas
        grupoId={g.id}
        evaluaciones={g.evaluaciones.map((e) => ({ id: e.id, nombre: e.nombre, peso: e.peso, publicada_en: e.publicada_en }))}
        filas={registro.filas}
        notaAprobatoria={g.curso?.notaAprobatoria ?? 11}
        editable={registro.editable}
        motivoNoEditable={registro.motivoNoEditable}
        publicacionActiva={g.publicacionActiva}
      />
    </>
  )
}
