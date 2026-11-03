import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Compass } from "lucide-react"

import { buttonClasses } from "@/academix/components/ui/Button"
import { AcademixPublico } from "@/components/public/academix-publico"
import { AxCabecera, AxPie } from "@/components/public/academix-secciones"

export const metadata: Metadata = {
  title: "Página no encontrada · Academix",
  robots: { index: false },
}

// Página 404 con la identidad Academix Vibrant (también para notFound() de los paneles).
export default function NoEncontrada() {
  return (
    <AcademixPublico>
      <AxCabecera />
      <main className="relative overflow-hidden px-5 py-20">
        <div aria-hidden className="absolute -right-16 top-10 h-44 w-44 rounded-full border-[26px] border-ax-yellow opacity-90 max-[620px]:hidden" />
        <div aria-hidden className="absolute bottom-10 left-[8%] h-6 w-6 rounded-full bg-ax-mint" />
        <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-5 text-center">
          <span className="inline-flex -rotate-2 items-center gap-2 rounded-full bg-ax-yellow px-4 py-2 text-sm font-bold text-ax-indigo">
            <Compass aria-hidden size={16} />
            Error 404
          </span>
          <h1 className="font-ax-display text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance">
            No encontramos esta página
          </h1>
          <p className="max-w-[480px] text-lg text-ax-muted text-pretty">
            Es posible que el enlace esté incompleto o que el contenido ya no esté disponible.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/" className={buttonClasses("primary", "md")}>
              Ir al inicio
            </Link>
            <Link href="/cursos" className={buttonClasses("outline", "md")}>
              Explorar cursos
              <ArrowRight aria-hidden size={18} />
            </Link>
          </div>
        </div>
      </main>
      <AxPie />
    </AcademixPublico>
  )
}
