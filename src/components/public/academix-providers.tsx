"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"

import { AcademixUIProvider } from "@/academix/context/AcademixUIProvider"
import type { ImageComponent, LinkComponent, PublicRoutes } from "@/academix/types"

// Adaptadores de Next para el kit Academix Vibrant: los componentes de src/academix
// no importan next/link ni next/image, los reciben de aquí.
const NextLink: LinkComponent = ({ href, children, ...rest }) => (
  <Link href={href} {...rest}>
    {children}
  </Link>
)

// Next 16 reemplaza `priority` (obsoleto) por `preload`.
const NextImage: ImageComponent = ({ src, alt, className, sizes, priority, fill = true }) => (
  <Image src={src} alt={alt} className={className} sizes={sizes} preload={priority} fill={fill} />
)

// Rutas reales de la plataforma (las mismas que usa la cabecera pública actual).
const routes: PublicRoutes = {
  home: "/",
  courses: "/cursos",
  institutions: "/instituciones",
  login: "/login",
  registerInstitution: "/registro",
  courseDetail: "/cursos/:id",
  institutionCourses: "/cursos?institucion=:id",
}

export function AcademixProviders({ children }: { children: ReactNode }) {
  return (
    <AcademixUIProvider LinkComponent={NextLink} ImageComponent={NextImage} routes={routes}>
      {children}
    </AcademixUIProvider>
  )
}
