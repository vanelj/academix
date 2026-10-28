"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { CatalogPreview } from "@/academix/components/home/CatalogPreview"
import { HomeHero } from "@/academix/components/home/HomeHero"
import { InstitutionalSection } from "@/academix/components/home/InstitutionalSection"
import { SiteFooter } from "@/academix/components/layout/SiteFooter"
import { SiteHeader, type PublicSection } from "@/academix/components/layout/SiteHeader"
import { ButtonLink } from "@/academix/components/ui/Button"
import { useAcademixUI } from "@/academix/context/AcademixUIProvider"
import type { CourseSummary, FilterOption, LoadStatus } from "@/academix/types"

// Secciones del kit Creative Tech conectadas a Link, Image y las rutas reales del
// proveedor. Permiten que las páginas (Server Components) compongan la vista y
// envuelvan solo la parte con datos en <Suspense>, sin ocultar el resto.

export function AxCabecera({ activa }: { activa: PublicSection }) {
  const { Link, routes } = useAcademixUI()
  return <SiteHeader routes={routes} active={activa} linkComponent={Link} />
}

export function AxPie() {
  const { Link, routes } = useAcademixUI()
  return <SiteFooter routes={routes} linkComponent={Link} />
}

// Fotografía provisional: solo para pruebas locales hasta verificar su licencia.
const FOTO_HERO = {
  src: "/academix/hero-estudiantes-biblioteca.jpg",
  alt: "Estudiantes trabajando con sus laptops en una biblioteca",
}

export function InicioHero() {
  const { Link, Image, routes } = useAcademixUI()
  return (
    <HomeHero
      image={FOTO_HERO}
      coursesHref={routes.courses}
      registerHref={routes.registerInstitution}
      linkComponent={Link}
      imageComponent={Image}
    />
  )
}

export function InicioInstitucional() {
  const { Link, routes } = useAcademixUI()
  return <InstitutionalSection registerHref={routes.registerInstitution} linkComponent={Link} />
}

export function InicioCatalogo({
  cursos,
  estado,
  categorias,
}: {
  cursos: CourseSummary[]
  estado: LoadStatus
  /** Categorías de los chips (A–Z, como en Cursos). Si faltan, se derivan de los cursos. */
  categorias?: FilterOption[]
}) {
  const { Link, Image, routes } = useAcademixUI()
  const router = useRouter()
  const [recargando, iniciar] = useTransition()

  return (
    <CatalogPreview
      courses={cursos}
      categories={categorias}
      status={recargando ? "loading" : estado}
      routes={routes}
      onRetry={() => iniciar(() => router.refresh())}
      emptyAction={
        <ButtonLink
          href={routes.registerInstitution}
          variant="ghost"
          size="sm"
          // En móvil el texto no cabe en una línea: se permite el salto (sin desbordar el panel).
          className="max-[520px]:whitespace-normal max-[520px]:py-2.5 max-[520px]:text-center max-[520px]:leading-snug"
          linkComponent={Link}
        >
          ¿Representas a una institución? Publica tus cursos
        </ButtonLink>
      }
      linkComponent={Link}
      imageComponent={Image}
    />
  )
}
