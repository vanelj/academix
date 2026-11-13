"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Link2, Loader2, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { actualizarEnlaceDocente, aplicarEnlaceGrupo, cambiarEnlacesDocentes, type ResultadoEnlace } from "@/lib/enlaces/acciones"
import { enlaceHttps } from "@/lib/horarios/calendario"
import { notificar } from "@/lib/notificaciones"

async function ejecutar(accion: () => Promise<ResultadoEnlace>, exito: string): Promise<boolean> {
  try {
    const r = await accion()
    if (r.ok) {
      notificar.exito(exito)
      return true
    }
    notificar.error("No se pudo guardar", { descripcion: r.mensaje })
  } catch {
    notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
  }
  return false
}

const AYUDA = "Google Meet, Zoom, Microsoft Teams u otra plataforma. Debe empezar por https://"

/** Administrador: el mismo enlace para todos los horarios del grupo. */
export function EnlaceGrupoAdmin({ grupoId, deshabilitado }: { grupoId: string; deshabilitado?: boolean }) {
  const id = useId()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState("")
  const [enviando, setEnviando] = useState(false)
  const valido = valor.trim() === "" || Boolean(enlaceHttps(valor))

  async function guardar() {
    if (enviando || !valido) return
    setEnviando(true)
    const ok = await ejecutar(() => aplicarEnlaceGrupo(grupoId, valor.trim() || null), valor.trim() ? "Enlace aplicado a todos los horarios" : "Enlaces retirados")
    setEnviando(false)
    if (ok) {
      setAbierto(false)
      router.refresh()
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => { setValor(""); setAbierto(true) }}>
        <Video aria-hidden />
        Enlace para todos
      </Button>
      <Dialog open={abierto} onOpenChange={(a) => { if (!enviando) setAbierto(a) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mismo enlace para todos los horarios</DialogTitle>
            <DialogDescription>Reemplaza el enlace de cada horario del grupo. Déjalo vacío para retirarlos. Solo lo ven el docente y los matriculados.</DialogDescription>
          </DialogHeader>
          <label htmlFor={`${id}-e`} className="text-sm font-medium">Enlace de la clase virtual</label>
          <Input id={`${id}-e`} type="url" inputMode="url" placeholder="https://meet.google.com/…" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={!valido} />
          <p className={valido ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{valido ? AYUDA : "El enlace debe empezar por https://"}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={guardar} disabled={enviando || !valido}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {valor.trim() ? "Aplicar a todos" : "Retirar enlaces"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type HorarioEnlace = { id: string; etiqueta: string; enlace: string | null }

/** Docente autorizado: enlace por horario o uno para todos. */
export function EditorEnlacesDocente({ grupoId, horarios }: { grupoId: string; horarios: HorarioEnlace[] }) {
  const router = useRouter()
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(horarios.map((h) => [h.id, h.enlace ?? ""])))
  const [enviando, setEnviando] = useState<string | null>(null)

  async function guardar(horarioId: string | null) {
    if (enviando) return
    const valor = (horarioId ? valores[horarioId] : valores[horarios[0]?.id ?? ""])?.trim() ?? ""
    if (valor && !enlaceHttps(valor)) {
      notificar.advertencia("Enlace no válido", { descripcion: "Debe empezar por https://" })
      return
    }
    setEnviando(horarioId ?? "todos")
    const ok = await ejecutar(() => actualizarEnlaceDocente(grupoId, horarioId, valor || null), horarioId ? "Enlace guardado" : "Enlace aplicado a todas las sesiones")
    setEnviando(null)
    if (ok) router.refresh()
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {horarios.map((h) => (
          <li key={h.id} className="space-y-1.5 rounded-xl border p-3">
            <label htmlFor={`enlace-${h.id}`} className="text-sm font-medium">{h.etiqueta}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={`enlace-${h.id}`} type="url" inputMode="url" placeholder="https://meet.google.com/…" value={valores[h.id] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [h.id]: e.target.value }))} />
              <Button size="sm" variant="outline" disabled={enviando !== null || (valores[h.id] ?? "") === (h.enlace ?? "")} onClick={() => guardar(h.id)}>
                {enviando === h.id ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                Guardar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {horarios.length > 1 && (
        <Button size="sm" variant="ghost" disabled={enviando !== null} onClick={() => guardar(null)}>
          {enviando === "todos" && <Loader2 className="animate-spin" aria-hidden />}
          Usar el enlace del primer horario en todas las sesiones
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{AYUDA}. Déjalo vacío y guarda para retirarlo.</p>
    </div>
  )
}

/** Administrador: autoriza a los docentes a gestionar los enlaces de sus grupos. */
export function InterruptorEnlacesDocentes({ valor }: { valor: boolean }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={valor} disabled={enviando}
        onChange={async (e) => {
          setEnviando(true)
          const ok = await ejecutar(() => cambiarEnlacesDocentes(e.target.checked), e.target.checked ? "Los docentes ya pueden gestionar sus enlaces" : "Solo la institución gestiona los enlaces")
          setEnviando(false)
          if (ok) router.refresh()
        }} />
      <span>
        <span className="font-medium">Los docentes pueden gestionar el enlace de sus clases</span>
        <span className="block text-xs text-muted-foreground">Cada docente solo podrá cambiar los enlaces de los grupos que tiene asignados.</span>
      </span>
    </label>
  )
}
