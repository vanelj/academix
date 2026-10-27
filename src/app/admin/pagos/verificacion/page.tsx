import type { Metadata } from "next"
import { CircleAlert, CircleCheck, CircleMinus, CircleX, Info, ShieldCheck } from "lucide-react"

import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { verificarModuloPagos, type Comprobacion, type Resultado } from "@/lib/pagos/diagnostico"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Verificación de pagos · Academix",
}

const ICONO: Record<Resultado, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  ok: CircleCheck,
  falla: CircleX,
  aviso: CircleAlert,
  info: Info,
  omitido: CircleMinus,
}
const COLOR: Record<Resultado, string> = {
  ok: "text-success",
  falla: "text-destructive",
  aviso: "text-warning",
  info: "text-muted-foreground",
  omitido: "text-muted-foreground",
}
const ETIQUETA: Record<Resultado, string> = { ok: "Correcto", falla: "Falla", aviso: "Revisar", info: "Información", omitido: "Omitido" }

// Verificación con la sesión real del administrador. Se ejecuta en cada visita (no se guarda nada).
export default async function VerificacionPagosPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <>
      <PageHeader title="Pagos y mensualidades" description="Comprobantes presentados por los estudiantes y cuotas de las matrículas de tu institución." />
      <PagosTabs actual="verificacion" />
    </>
  )
  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No se encontró la institución asociada a tu cuenta.</CardContent></Card>
      </>
    )
  }

  const resultados = await verificarModuloPagos(institucionId)
  const grupos = [...new Set(resultados.map((c) => c.grupo))]
  const cuenta = (r: Resultado) => resultados.filter((c) => c.resultado === r).length

  return (
    <>
      {encabezado}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Comprobaciones con tu sesión contra la base de datos real. Son de solo lectura o intentos sobre registros inexistentes que la base
            debe rechazar: no modifican datos. Se repiten cada vez que abres esta página.
          </p>
          <p className="shrink-0 text-sm font-medium tabular-nums">
            <span className="text-success">{cuenta("ok")} correctas</span>
            {cuenta("falla") > 0 && <span className="text-destructive"> · {cuenta("falla")} fallas</span>}
            {cuenta("aviso") > 0 && <span className="text-warning"> · {cuenta("aviso")} por revisar</span>}
          </p>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {grupos.map((g) => (
          <Card key={g} size="sm">
            <CardHeader>
              <CardTitle>{g}</CardTitle>
              <CardDescription>{DESCRIPCION[g] ?? ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {resultados.filter((c) => c.grupo === g).map((c) => <Fila key={c.id} c={c} />)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

const DESCRIPCION: Record<string, string> = {
  "Sesión": "Tu cuenta e institución.",
  RLS: "Lo que tu sesión puede leer.",
  "Escritura directa": "Cambios que solo deben hacerse mediante las funciones de V5.",
  Funciones: "Las funciones de negocio existen y rechazan operaciones no autorizadas.",
  Comprobantes: "Bucket privado comprobantes-cursos-v5.",
  Integridad: "Coherencia entre pagos, cuotas, solicitudes y matrículas de tu institución.",
  Cobro: "Medios de cobro y planes de cuotas: lo que el estudiante necesita para pagar.",
}

function Fila({ c }: { c: Comprobacion }) {
  const Icono = ICONO[c.resultado]
  return (
    <li className="flex gap-3 py-2.5">
      <Icono className={cn("mt-0.5 size-4 shrink-0", COLOR[c.resultado])} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          <span className="mr-1.5 text-xs tabular-nums text-muted-foreground">{c.id}</span>
          {c.titulo}
          <span className={cn("sr-only")}> — {ETIQUETA[c.resultado]}</span>
        </p>
        <p className="text-muted-foreground break-words">{c.detalle}</p>
      </div>
    </li>
  )
}
