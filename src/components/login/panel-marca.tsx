import Link from "next/link"
import { Award, BookOpen, ClipboardCheck, Presentation, Receipt, Users } from "lucide-react"

import { LogoAcademix, NOMBRE_MARCA } from "@/components/marca/logo-academix"
import { cn } from "@/lib/utils"

const TITULO = "Aprende, enseña y gestiona en un solo lugar"
const DESCRIPCION =
  "Cursos virtuales, grupos y horarios, matrículas, pagos, evaluaciones y certificados para instituciones educativas."

// Módulos reales de la plataforma (sin cifras ni actividad simulada).
const MODULOS = [
  { icono: BookOpen, texto: "Cursos virtuales", fondo: "#EEE7FF" },
  { icono: Presentation, texto: "Docentes", fondo: "#FFE2DD" },
  { icono: Users, texto: "Estudiantes", fondo: "#FFF0C7" },
  { icono: ClipboardCheck, texto: "Inscripciones", fondo: "#D7F5EC" },
  { icono: Receipt, texto: "Pagos y cuotas", fondo: "#FFF0C7" },
  { icono: Award, texto: "Certificados", fondo: "#EEE7FF" },
]

const anio = () => new Intl.DateTimeFormat("es-PE", { year: "numeric", timeZone: "America/Lima" }).format(new Date())

/**
 * Panel de marca del login (escritorio), identidad Academix Vibrant: banda índigo
 * con formas geométricas y los módulos reales. Decorativo salvo el enlace al
 * inicio; se ve igual en modo claro y oscuro (identidad de marca).
 */
export function PanelMarca({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "relative isolate flex-col justify-between overflow-hidden bg-[#1B1446] px-10 py-10 text-white xl:px-14",
        className
      )}
    >
      <Formas />

      <Link href="/" className="flex w-fit items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-[#FFC93C]">
        <LogoAcademix className="size-10" />
        <span className="font-heading text-xl font-extrabold tracking-tight">{NOMBRE_MARCA}</span>
      </Link>

      <div className="my-10 max-w-lg space-y-4">
        <p className="text-sm font-bold tracking-[0.08em] text-[#FFC93C] uppercase">
          Plataforma de Oferta y Gestión de Cursos Virtuales
        </p>
        <h2 className="text-4xl leading-[1.05] font-extrabold text-balance xl:text-5xl">{TITULO}</h2>
        <p className="text-base leading-relaxed text-[#DCD6FF]">{DESCRIPCION}</p>
      </div>

      <ul aria-label="Módulos de Academix" className="grid max-w-lg grid-cols-2 gap-3 xl:grid-cols-3">
        {MODULOS.map(({ icono: Icono, texto, fondo }) => (
          <li
            key={texto}
            className="flex items-center gap-2.5 rounded-2xl px-3 py-3 text-sm font-semibold text-[#1B1446]"
            style={{ background: fondo }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/70">
              <Icono className="size-4" aria-hidden />
            </span>
            {texto}
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-[#DCD6FF]/80">© {anio()} {NOMBRE_MARCA}</p>
    </aside>
  )
}

/** Versión compacta para móvil y tableta, encima del formulario. */
export function CabeceraMarcaMovil({ className }: { className?: string }) {
  return (
    <header className={cn("relative isolate overflow-hidden bg-[#1B1446] px-5 pt-5 pb-7 text-white sm:px-8", className)}>
      <div aria-hidden className="absolute -top-10 -right-10 -z-10 size-28 rounded-full border-[16px] border-[#FFC93C] opacity-90" />
      <Link href="/" className="flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-[#FFC93C]">
        <LogoAcademix className="size-8" />
        <span className="font-heading text-lg font-extrabold tracking-tight">{NOMBRE_MARCA}</span>
      </Link>
      <p className="mt-4 max-w-md font-heading text-xl leading-snug font-extrabold text-balance">{TITULO}</p>
      <p className="mt-1 max-w-md text-sm text-[#DCD6FF]">{DESCRIPCION}</p>
    </header>
  )
}

/** Formas Vibrant (decorativas): aro amarillo, cuarto de círculo coral y punto menta. */
function Formas() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-[#FFC93C] opacity-90" />
      <div className="absolute right-0 bottom-0 size-40 rounded-tl-full bg-[#FF6B5B]" />
      <div className="absolute top-1/2 right-24 size-6 rounded-full bg-[#2EC4A0]" />
      <svg viewBox="0 0 40 40" className="absolute top-[30%] right-[12%] w-10 text-[#8B6CFF]">
        <path d="M20 0l4.5 15.5L40 20l-15.5 4.5L20 40l-4.5-15.5L0 20l15.5-4.5z" fill="currentColor" />
      </svg>
    </div>
  )
}
