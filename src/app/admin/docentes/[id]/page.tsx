import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarRange, Info } from "lucide-react"

import { AsignarGrupoDocente, RetirarDeGrupo, type GrupoAsignable } from "@/components/admin/asignacion-docente"
import { DocenteAcciones } from "@/components/admin/docentes/docente-acciones"
import {
  ETIQUETA_ESTADO_GRUPO,
  EstadoCuenta,
  EstadoRol,
  formatoFechaDocente,
  formatoFechaHoraDocente,
} from "@/components/admin/docentes/docente-ui"
import { CalendarioAcademico } from "@/components/horarios/calendario-academico"
import { Pestanas, seccionValida } from "@/components/layout/pestanas"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { roleConfig } from "@/config/navigation"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerDocente } from "@/lib/docentes/datos"
import { obtenerGrupos, type GrupoResumen } from "@/lib/grupos/datos"
import { ahoraAcademico, crucesSemanales, DIAS_LARGOS, type GrupoCalendario } from "@/lib/horarios/calendario"
import { cuentasConfiguradas } from "@/lib/supabase/admin"
import { cn } from "@/lib/utils"
import { idPerfilSchema } from "@/lib/validations/docente"

export const metadata: Metadata = {
  title: "Docente · Academix",
}

const fechaCorta = (iso: string) => formatoFechaDocente.format(new Date(`${iso}T00:00:00`))

const SECCIONES = ["informacion", "grupos", "horario"] as const

export default async function DocentePage({ params, searchParams }: PageProps<"/admin/docentes/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const seccion = seccionValida((await searchParams).seccion, SECCIONES)
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idPerfilSchema.safeParse(id).success) notFound()

  // Un perfil de otra institución, o sin rol docente, se trata como inexistente.
  const docente = await obtenerDocente(institucionId, id)
  if (!docente) notFound()
  const configuradas = cuentasConfiguradas()
  const base = `/admin/docentes/${docente.id}`

  // Grupos de la institución (para asignar y para el horario). RLS + filtro por institución.
  let grupos: GrupoResumen[] = []
  try {
    if (seccion !== "informacion") grupos = await obtenerGrupos(institucionId)
  } catch {
    grupos = []
  }
  const asignables: GrupoAsignable[] = grupos.map((g) => ({
    id: g.id,
    codigo: g.codigo,
    estado: g.estado,
    fecha_inicio: g.fecha_inicio,
    fecha_fin: g.fecha_fin,
    curso: g.curso ? { id: g.curso.id, nombre: g.curso.nombre } : null,
    docente: g.docente,
  }))
  const calendario: GrupoCalendario[] = grupos
    .filter((g) => g.docente?.id === docente.id && g.estado !== "cancelado" && g.estado !== "cerrado")
    .map((g) => ({
      clave: g.id,
      curso: g.curso?.nombre ?? "Curso",
      grupo: g.codigo,
      estado: g.estado,
      desde: g.fecha_inicio.slice(0, 10),
      hasta: g.fecha_fin.slice(0, 10),
      franjas: g.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      accesos: [{ etiqueta: "Abrir grupo", href: `/admin/grupos/${g.id}` }],
    }))
  const cruces = crucesSemanales(calendario)
  const habilitado = docente.rolActivo && docente.perfilActivo

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/docentes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a docentes
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">
                {docente.nombres} {docente.apellidos}
              </h2>
              <EstadoRol docente={docente} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Docente desde el {formatoFechaDocente.format(new Date(docente.asignadoEn))}
              {docente.otrosRoles.length > 0 &&
                ` · también ${docente.otrosRoles.map((r) => roleConfig[r].label.toLowerCase()).join(", ")}`}
            </p>
          </div>
          <DocenteAcciones docente={docente} cuentasConfiguradas={configuradas} />
        </div>
      </div>

      <Pestanas
        etiqueta="Secciones del docente"
        activa={seccion}
        pestanas={[
          { valor: "informacion", etiqueta: "Información", href: base },
          { valor: "grupos", etiqueta: "Cursos y grupos", href: `${base}?seccion=grupos`, contador: docente.gruposAsignados.length },
          { valor: "horario", etiqueta: "Horario semanal", href: `${base}?seccion=horario` },
        ]}
      />

      {seccion === "informacion" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Datos personales</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Dato etiqueta="Documento">{docente.dni ?? <Vacio />}</Dato>
                <Dato etiqueta="Teléfono">{docente.telefono ?? <Vacio />}</Dato>
              </dl>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Cuenta de acceso</CardTitle>
            </CardHeader>
            <CardContent>
              {docente.cuenta ? (
                <dl className="space-y-3">
                  <Dato etiqueta="Correo">{docente.cuenta.correo ?? <Vacio />}</Dato>
                  <Dato etiqueta="Estado"><EstadoCuenta cuenta={docente.cuenta} /></Dato>
                  {docente.cuenta.invitadoEn && !docente.cuenta.activada && (
                    <Dato etiqueta="Invitado el">{formatoFechaHoraDocente.format(new Date(docente.cuenta.invitadoEn))}</Dato>
                  )}
                  <Dato etiqueta="Último acceso">
                    {docente.cuenta.ultimoAcceso ? formatoFechaHoraDocente.format(new Date(docente.cuenta.ultimoAcceso)) : <Vacio texto="Nunca" />}
                  </Dato>
                </dl>
              ) : (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {configuradas
                    ? "No se pudo consultar la cuenta de acceso."
                    : "El correo y el estado de la cuenta se muestran cuando el servidor tiene configurada SUPABASE_SECRET_KEY."}
                </p>
              )}
            </CardContent>
          </Card>
          <Card size="sm" className="md:col-span-2">
            <CardContent className="flex gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Los datos personales de esta ficha son los del perfil del docente en tu institución. El correo de acceso y la
              contraseña los gestiona el propio docente (activación por invitación y «¿Olvidaste tu contraseña?»): la institución no puede cambiarlos.
            </CardContent>
          </Card>
        </div>
      )}

      {seccion === "grupos" && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Cursos y grupos asignados</CardTitle>
              <CardDescription>Asigna o retira grupos sin salir de la ficha. Cada grupo tiene un docente responsable.</CardDescription>
            </div>
            <AsignarGrupoDocente docenteId={docente.id} docenteNombre={`${docente.nombres} ${docente.apellidos}`} grupos={asignables} bloqueado={!habilitado} />
          </CardHeader>
          <CardContent>
            {!habilitado && <p className="mb-3 text-sm text-warning">El docente está deshabilitado: habilítalo para asignarle grupos.</p>}
            {docente.gruposAsignados.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                <CalendarRange className="size-5" aria-hidden />
                Aún no tiene grupos asignados.
              </div>
            ) : (
              <ul className="divide-y">
                {docente.gruposAsignados.map((g) => (
                  <li key={g.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        {g.curso ? (
                          <Link href={`/admin/cursos/${g.curso.id}`} className="hover:underline">{g.curso.nombre}</Link>
                        ) : (
                          "Curso no disponible"
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/admin/grupos/${g.id}`} className="hover:underline">Grupo {g.codigo}</Link> · {fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{ETIQUETA_ESTADO_GRUPO[g.estado] ?? g.estado}</span>
                      {g.estado !== "cerrado" && g.estado !== "cancelado" && <RetirarDeGrupo grupoId={g.id} codigo={g.codigo} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {seccion === "horario" && (
        <div className="space-y-4">
          {cruces.length > 0 && (
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              Cruce de horario: {cruces.map((c) => `${c.a.curso} (${c.a.grupo}) y ${c.b.curso} (${c.b.grupo}) el ${DIAS_LARGOS[c.dia - 1].toLowerCase()}`).join("; ")}.
            </p>
          )}
          {calendario.some((g) => g.franjas.length) ? (
            <CalendarioAcademico grupos={calendario} ahoraInicial={ahoraAcademico()} />
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin clases programadas en sus grupos vigentes.</CardContent></Card>
          )}
        </div>
      )}
    </>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function Vacio({ texto = "Sin especificar" }: { texto?: string }) {
  return <span className="font-normal text-muted-foreground">{texto}</span>
}
