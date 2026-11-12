"use client"

import { useId, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { asignarDocente } from "@/lib/grupos/acciones"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Ejecuta la acción ÚNICA de asignación y muestra el resultado (incluido el aviso de cruce). */
async function ejecutar(grupoId: string, docenteId: string | null): Promise<boolean> {
  try {
    const r = await asignarDocente(grupoId, docenteId)
    if (!r.ok) {
      ;(r.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo asignar", { descripcion: r.mensaje })
      return false
    }
    if (r.aviso) notificar.advertencia(docenteId ? "Docente asignado, con una advertencia" : "Docente retirado", { descripcion: r.aviso })
    else notificar.exito(docenteId ? "Docente asignado" : "Docente retirado del grupo")
    return true
  } catch {
    notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    return false
  }
}

export type DocenteElegible = { id: string; nombre: string; habilitado: boolean }

/** Desde el grupo: Asignar docente → buscar → confirmar. */
export function AsignarDocenteGrupo({ grupoId, actualId, docentes, bloqueado }: { grupoId: string; actualId: string | null; docentes: DocenteElegible[]; bloqueado?: boolean }) {
  const id = useId()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const [elegido, setElegido] = useState<string | null>(actualId)
  const [enviando, setEnviando] = useState(false)
  const lista = docentes.filter((d) => d.habilitado && (!texto.trim() || normalizar(d.nombre).includes(normalizar(texto.trim()))))

  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    const ok = await ejecutar(grupoId, elegido)
    setEnviando(false)
    if (ok) {
      setAbierto(false)
      router.refresh()
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={bloqueado} onClick={() => { setElegido(actualId); setTexto(""); setAbierto(true) }}>
        <UserRoundPlus aria-hidden />
        {actualId ? "Cambiar docente" : "Asignar docente"}
      </Button>
      <Dialog open={abierto} onOpenChange={(a) => { if (!enviando) setAbierto(a) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actualId ? "Cambiar docente" : "Asignar docente"}</DialogTitle>
            <DialogDescription>Solo aparecen docentes habilitados de tu institución.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <label htmlFor={`${id}-q`} className="sr-only">Buscar docente</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${id}-q`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre" className="pl-9" autoFocus />
          </div>
          <div role="radiogroup" aria-label="Docente" className="max-h-72 space-y-1 overflow-y-auto">
            {[{ id: "", nombre: "Sin docente (por asignar)", habilitado: true }, ...lista].map((d) => {
              const valor = d.id || null
              return (
                <label key={d.id || "ninguno"} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", elegido === valor && "border-primary bg-primary/5")}>
                  <input type="radio" name={`${id}-docente`} checked={elegido === valor} onChange={() => setElegido(valor)} className="accent-primary" />
                  <span className={cn("min-w-0 break-words", !d.id && "text-muted-foreground")}>{d.nombre}</span>
                  {d.id === actualId && <span className="ml-auto text-xs text-muted-foreground">Actual</span>}
                </label>
              )
            })}
            {lista.length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">{docentes.length ? "Ningún docente coincide." : "No hay docentes habilitados: regístralos en «Docentes»."}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={enviando || elegido === actualId}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type GrupoAsignable = {
  id: string
  codigo: string
  estado: string
  fecha_inicio: string
  fecha_fin: string
  curso: { id: string; nombre: string } | null
  docente: { id: string; nombre: string } | null
}

/** Desde el docente: Asignar grupo → curso → grupo → confirmar. */
export function AsignarGrupoDocente({ docenteId, docenteNombre, grupos, bloqueado }: { docenteId: string; docenteNombre: string; grupos: GrupoAsignable[]; bloqueado?: boolean }) {
  const id = useId()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [curso, setCurso] = useState("")
  const [grupo, setGrupo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const elegibles = useMemo(() => grupos.filter((g) => g.estado !== "cerrado" && g.estado !== "cancelado" && g.docente?.id !== docenteId), [grupos, docenteId])
  const cursos = useMemo(
    () => [...new Map(elegibles.filter((g) => g.curso).map((g) => [g.curso!.id, g.curso!.nombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
    [elegibles]
  )
  const delCurso = elegibles.filter((g) => g.curso?.id === curso)
  const g = elegibles.find((x) => x.id === grupo)
  const select = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  async function confirmar() {
    if (enviando || !grupo) return
    setEnviando(true)
    const ok = await ejecutar(grupo, docenteId)
    setEnviando(false)
    if (ok) {
      setAbierto(false)
      router.refresh()
    }
  }

  return (
    <>
      <Button size="sm" disabled={bloqueado} onClick={() => { setCurso(""); setGrupo(""); setAbierto(true) }}>
        <UserRoundPlus aria-hidden />
        Asignar grupo
      </Button>
      <Dialog open={abierto} onOpenChange={(a) => { if (!enviando) setAbierto(a) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar grupo a {docenteNombre}</DialogTitle>
            <DialogDescription>Elige el curso y el grupo. Si el grupo ya tiene docente, se reemplazará.</DialogDescription>
          </DialogHeader>
          {elegibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay grupos vigentes disponibles para asignar.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor={`${id}-c`} className="text-xs font-medium text-muted-foreground">1. Curso</label>
                <select id={`${id}-c`} value={curso} onChange={(e) => { setCurso(e.target.value); setGrupo("") }} className={select}>
                  <option value="">Elige un curso</option>
                  {cursos.map(([cid, nombre]) => <option key={cid} value={cid}>{nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${id}-g`} className="text-xs font-medium text-muted-foreground">2. Grupo</label>
                <select id={`${id}-g`} value={grupo} onChange={(e) => setGrupo(e.target.value)} className={select} disabled={!curso}>
                  <option value="">{curso ? "Elige un grupo" : "Primero elige el curso"}</option>
                  {delCurso.map((x) => <option key={x.id} value={x.id}>Grupo {x.codigo}{x.docente ? ` — hoy: ${x.docente.nombre}` : " — sin docente"}</option>)}
                </select>
              </div>
              {g?.docente && (
                <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                  {g.docente.nombre} dejará de ser el docente de este grupo.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={enviando || !grupo}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Retira al docente de un grupo concreto (desde su ficha). */
export function RetirarDeGrupo({ grupoId, codigo }: { grupoId: string; codigo: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    const ok = await ejecutar(grupoId, null)
    setEnviando(false)
    if (ok) {
      setAbierto(false)
      router.refresh()
    }
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>Retirar</Button>
      <Dialog open={abierto} onOpenChange={(a) => { if (!enviando) setAbierto(a) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Retirar del grupo {codigo}?</DialogTitle>
            <DialogDescription>El grupo quedará con «Docente por asignar». No afecta a otros grupos, notas ni matrículas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmar} disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Retirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
