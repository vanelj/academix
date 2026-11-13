"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock3, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { guardarMinutosHoraAcademica } from "@/lib/institucion/hora-academica"
import { notificar } from "@/lib/notificaciones"

/** Configuración explícita de la hora académica (minutos) de la institución. */
export function HoraAcademicaForm({ actual }: { actual: number | null | "sin_migracion" }) {
  const router = useRouter()
  const [valor, setValor] = useState(typeof actual === "number" ? String(actual) : "")
  const [enviando, setEnviando] = useState(false)
  const sinMigracion = actual === "sin_migracion"

  async function guardar() {
    if (enviando) return
    setEnviando(true)
    try {
      const r = await guardarMinutosHoraAcademica(valor.trim() === "" ? null : valor.trim())
      if (r.ok) {
        notificar.exito("Hora académica guardada", { descripcion: valor.trim() ? `1 hora académica = ${valor.trim()} minutos.` : "Solo se mostrarán horas reloj." })
        router.refresh()
      } else notificar.advertencia("No se guardó", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock3 className="size-4 text-primary" aria-hidden />Hora académica</CardTitle>
        <CardDescription>
          Cuántos minutos dura una hora académica en tu institución (por ejemplo, 45 o 50). Academix la usa para calcular las horas académicas de cada grupo; sin ella, solo muestra horas reloj.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground" htmlFor="hora-academica">
          Minutos por hora académica
          <Input id="hora-academica" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="45" className="w-28" disabled={sinMigracion || enviando} />
        </label>
        <Button onClick={guardar} disabled={sinMigracion || enviando || valor === (typeof actual === "number" ? String(actual) : "")}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar
        </Button>
        {sinMigracion && <p className="w-full text-xs text-muted-foreground">Esta opción se habilita con la actualización «revision_funcional_v5».</p>}
      </CardContent>
    </Card>
  )
}
