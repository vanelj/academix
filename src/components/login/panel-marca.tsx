import Link from "next/link"
import { Award, CalendarDays, CreditCard, GraduationCap, Users } from "lucide-react"

import { LogoAcademix, NOMBRE_MARCA } from "@/components/marca/logo-academix"
import { cn } from "@/lib/utils"

const TITULO = "Aprende, enseña y gestiona en un solo lugar"
const DESCRIPCION =
  "Cursos virtuales, grupos y horarios, matrículas, pagos, evaluaciones y certificados para instituciones educativas."

/**
 * Panel de marca del login (escritorio). Fondo azul con degradados suaves; la
 * ilustración es decorativa (aria-hidden) y está hecha con elementos HTML, sin
 * imágenes externas. Se ve igual en modo claro y oscuro (identidad de marca).
 */
export function PanelMarca({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "relative isolate flex-col justify-between overflow-hidden bg-[#0b3a8f] px-10 py-10 text-white xl:px-14",
        className
      )}
    >
      <Fondo />

      <Link href="/" className="flex w-fit items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-white/60">
        <LogoAcademix className="size-10 shadow-lg shadow-blue-950/30" />
        <span className="text-xl font-semibold tracking-tight">{NOMBRE_MARCA}</span>
      </Link>

      <div className="my-10 max-w-lg space-y-4">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">{TITULO}</h2>
        <p className="text-base leading-relaxed text-blue-100/90">{DESCRIPCION}</p>
      </div>

      <Ilustracion />

      <p className="mt-10 text-sm text-blue-100/70">© 2026 {NOMBRE_MARCA}</p>
    </aside>
  )
}

/** Versión compacta para móvil y tableta, encima del formulario. */
export function CabeceraMarcaMovil({ className }: { className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-[#0b3a8f] px-5 pt-5 pb-7 text-white sm:px-8", className)}>
      <Fondo />
      <Link href="/" className="flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-white/60">
        <LogoAcademix className="size-8" />
        <span className="text-lg font-semibold tracking-tight">{NOMBRE_MARCA}</span>
      </Link>
      <p className="mt-4 max-w-md text-lg leading-snug font-semibold text-balance">{TITULO}</p>
      <p className="mt-1 max-w-md text-sm text-blue-100/85">{DESCRIPCION}</p>
    </div>
  )
}

function Fondo() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-linear-to-br from-[#2563eb] via-[#1d4ed8] to-[#0a2a6b]" />
      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-sky-400/25 blur-3xl" />
      <div className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-indigo-500/30 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  )
}

/** Panel académico de ejemplo (decorativo). */
function Ilustracion() {
  const barras = [42, 64, 50, 78, 58, 88, 70]
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg select-none">
      <div className="rounded-2xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-blue-950/40 backdrop-blur-md">
        {/* Barra de ventana */}
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="size-2.5 rounded-full bg-white/30" />
          <span className="ml-3 h-2 w-32 rounded-full bg-white/15" />
        </div>
        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          {/* Barra lateral */}
          <div className="space-y-2 rounded-xl bg-blue-950/30 p-2">
            <span className="block h-2 w-10 rounded-full bg-white/50" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={cn("block h-2 rounded-full", i === 1 ? "w-12 bg-sky-300/80" : "w-9 bg-white/20")} />
            ))}
          </div>
          <div className="space-y-3">
            {/* Indicadores */}
            <div className="grid grid-cols-3 gap-2">
              <Indicador icono={Users} valor="248" etiqueta="Estudiantes" />
              <Indicador icono={GraduationCap} valor="12" etiqueta="Cursos" />
              <Indicador icono={CreditCard} valor="96%" etiqueta="Pagos al día" />
            </div>
            {/* Gráfico */}
            <div className="rounded-xl bg-white/10 p-3">
              <span className="mb-2 block h-2 w-20 rounded-full bg-white/40" />
              <div className="flex h-20 items-end gap-1.5">
                {barras.map((alto, i) => (
                  <span
                    key={i}
                    className={cn("flex-1 rounded-t-md", i === 5 ? "bg-sky-300" : "bg-white/35")}
                    style={{ height: `${alto}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas flotantes */}
      <div className="absolute -bottom-6 -left-4 flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/95 px-3 py-2 text-slate-800 shadow-xl xl:-left-8">
        <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <Award className="size-4" />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-semibold">Certificado emitido</span>
          <span className="text-slate-500">Diseño web · Grupo A</span>
        </span>
      </div>
      <div className="absolute -top-5 -right-3 flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/95 px-3 py-2 text-slate-800 shadow-xl xl:-right-6">
        <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
          <CalendarDays className="size-4" />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-semibold">Clase en vivo</span>
          <span className="text-slate-500">Hoy · 7:00 p. m.</span>
        </span>
      </div>
    </div>
  )
}

function Indicador({
  icono: Icono,
  valor,
  etiqueta,
}: {
  icono: React.ComponentType<{ className?: string }>
  valor: string
  etiqueta: string
}) {
  return (
    <div className="rounded-xl bg-white/10 p-2.5">
      <Icono className="mb-1.5 size-3.5 text-sky-200" />
      <p className="text-base leading-none font-semibold">{valor}</p>
      <p className="mt-1 truncate text-[10px] text-blue-100/80">{etiqueta}</p>
    </div>
  )
}
