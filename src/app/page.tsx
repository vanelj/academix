import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Award,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Layers,
  MonitorPlay,
  Presentation,
  Search,
  Users,
} from "lucide-react"

import { CatalogoCursos, CatalogoCursosSkeleton } from "@/components/public/catalogo-cursos"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicHeader } from "@/components/public/public-header"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Academix · Oferta de cursos virtuales",
  description:
    "Explora la oferta de cursos virtuales de distintas instituciones desde una sola plataforma.",
}

const CURSOS_DESTACADOS = 6

// Página principal pública: no requiere sesión ni usa el layout privado de /admin.
export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-1 flex-col bg-background">
      <PublicHeader />
      <main className="flex-1">
        <Hero />
        <section
          id="cursos"
          aria-labelledby="cursos-titulo"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h2 id="cursos-titulo" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Cursos disponibles
              </h2>
              <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                Cursos publicados por las instituciones de la plataforma.
              </p>
            </div>
            <Link
              href="/cursos"
              className={cn(buttonVariants({ variant: "ghost" }), "-ml-2.5 self-start text-primary sm:ml-0 sm:self-auto")}
            >
              Ver todos los cursos
              <ArrowRight aria-hidden />
            </Link>
          </div>

          <div className="mt-8">
            <Suspense fallback={<CatalogoCursosSkeleton />}>
              <CatalogoCursos
                limite={CURSOS_DESTACADOS}
                descripcionVacio="Las instituciones todavía no han publicado cursos. Vuelve pronto para descubrir la nueva oferta."
                accionVacio={
                  <Link href="/registro" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
                    ¿Representas a una institución? Publica tus cursos
                  </Link>
                }
              />
            </Suspense>
          </div>
        </section>
        <ParaInstituciones />
      </main>
      <PublicFooter />
    </div>
  )
}

function Hero() {
  const destacados = [
    { icon: Layers, texto: "Oferta de distintas instituciones" },
    { icon: MonitorPlay, texto: "Cursos 100 % virtuales" },
    { icon: ClipboardList, texto: "Matrícula en línea" },
  ]

  return (
    <section className="relative isolate overflow-hidden border-b border-border/70">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-primary/10 via-primary/5 to-transparent dark:from-primary/15 dark:via-primary/5"
      />
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/10"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1 text-xs font-medium text-primary">
          <BookOpen className="size-3.5" aria-hidden />
          Oferta académica virtual
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Encuentra tu próximo curso y sigue aprendiendo
        </h1>
        <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          Explora en un solo lugar los cursos virtuales que ofrecen distintas
          instituciones y elige el que mejor se adapte a tus metas.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/cursos" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
            <Search aria-hidden />
            Explorar cursos
          </Link>
          <Link
            href="/registro"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
          >
            Registrar institución
          </Link>
        </div>

        <ul className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
          {destacados.map(({ icon: Icon, texto }) => (
            <li key={texto} className="flex items-center gap-2">
              <Icon className="size-4 text-primary" aria-hidden />
              {texto}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ParaInstituciones() {
  const modulos = [
    { icon: BookOpen, titulo: "Cursos", texto: "Crea y publica tu oferta académica." },
    { icon: Presentation, titulo: "Docentes", texto: "Asigna docentes a cada grupo." },
    { icon: Users, titulo: "Estudiantes", texto: "Gestiona a tus estudiantes." },
    { icon: ClipboardList, titulo: "Matrículas", texto: "Controla vacantes y matrículas." },
    { icon: ClipboardCheck, titulo: "Evaluaciones", texto: "Organiza evaluaciones y notas." },
    { icon: Award, titulo: "Certificados", texto: "Emite certificados a quienes aprueban." },
  ]

  return (
    <section aria-labelledby="instituciones-titulo" className="border-t border-border/70 bg-muted/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-14">
        <div className="space-y-4">
          <p className="text-sm font-medium text-primary">Para instituciones</p>
          <h2 id="instituciones-titulo" className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Gestiona tu oferta académica en un solo lugar
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Registra tu institución y administra todo el ciclo de tus cursos
            virtuales: desde la publicación hasta la entrega de certificados.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              Registrar institución
              <ArrowRight aria-hidden />
            </Link>
            <Link
              href="/instituciones"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-4 text-base")}
            >
              Ver instituciones
            </Link>
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {modulos.map(({ icon: Icon, titulo, texto }) => (
            <li
              key={titulo}
              className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">{titulo}</span>
                <span className="block text-sm text-muted-foreground">{texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
