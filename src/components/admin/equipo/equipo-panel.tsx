"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Crown, Loader2, MailPlus, Search, ShieldCheck, UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ETIQUETA_MODULO, MODULOS_ADMIN, type ModuloAdmin } from "@/lib/admin/permisos"
import {
  actualizarPermisos,
  anadirAdministrador,
  cambiarAccesoAdministrador,
  cambiarNivelAdministrador,
  invitarAdministrador,
  reenviarInvitacionAdministrador,
  type ResultadoEquipo,
} from "@/lib/equipo/acciones"
import type { MiembroEquipo } from "@/lib/equipo/datos"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

type Permisos = { accesoTotal: boolean; modulos: ModuloAdmin[] }

/**
 * Equipo administrativo de la institución. Todos usan el mismo panel; el
 * principal decide si cada secundario tiene acceso completo o módulos concretos.
 * Las reglas (no autoescalar, no dejar la institución sin principal) las
 * aplica también la base de datos.
 */
export function EquipoPanel({ miembros, candidatos, yo, cuentasConfiguradas }: { miembros: MiembroEquipo[]; candidatos: { id: string; nombre: string }[]; yo: string; cuentasConfiguradas: boolean }) {
  const router = useRouter()
  const [texto, setTexto] = useState("")
  const [editando, setEditando] = useState<MiembroEquipo | null>(null)
  const [invitar, setInvitar] = useState(false)
  const [anadir, setAnadir] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)

  const visibles = miembros.filter((m) => !texto.trim() || normalizar(`${m.nombre} ${m.cuenta?.correo ?? ""}`).includes(normalizar(texto.trim())))

  async function ejecutar(clave: string, accion: () => Promise<ResultadoEquipo>, exito: string) {
    if (procesando) return false
    setProcesando(clave)
    try {
      const r = await accion()
      if (r.ok) {
        if (r.aviso) notificar.advertencia(exito, { descripcion: r.aviso })
        else notificar.exito(exito)
        router.refresh()
        return true
      }
      notificar.error("No se pudo completar", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
    return false
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar administradores" className="pl-9" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setAnadir(true)} disabled={candidatos.length === 0} title={candidatos.length === 0 ? "No hay otras personas de tu institución sin acceso administrativo." : undefined}>
            <UserPlus aria-hidden />
            Añadir a un miembro
          </Button>
          <Button onClick={() => setInvitar(true)} disabled={!cuentasConfiguradas}>
            <MailPlus aria-hidden />
            Invitar colaborador
          </Button>
        </div>
      </div>

      <ul className="divide-y rounded-2xl border bg-card">
        {visibles.map((m) => {
          const soyYo = m.id === yo
          return (
            <li key={m.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="break-words">{m.nombre}</span>
                  {soyYo && <span className="text-xs font-normal text-muted-foreground">(tú)</span>}
                  {m.principal ? <Badge><Crown className="size-3" aria-hidden />Principal</Badge> : <Badge variant="secondary">Secundario</Badge>}
                  {!m.activo && <Badge variant="outline">Desactivado</Badge>}
                  {m.cuenta && !m.cuenta.activada && <Badge variant="warning">Invitación pendiente</Badge>}
                </p>
                <p className="text-xs break-all text-muted-foreground">{m.cuenta?.correo ?? "Correo no disponible"}</p>
                <p className="text-xs text-muted-foreground">
                  {m.accesoTotal ? "Acceso completo" : m.modulos.length ? m.modulos.map((x) => ETIQUETA_MODULO[x].titulo).join(" · ") : "Sin módulos"}
                </p>
              </div>
              {!soyYo && (
                <div className="flex flex-wrap gap-2">
                  {!m.principal && m.activo && (
                    <Button size="sm" variant="outline" onClick={() => setEditando(m)}>
                      <ShieldCheck aria-hidden />
                      Permisos
                    </Button>
                  )}
                  {m.cuenta && !m.cuenta.activada && (
                    <Button size="sm" variant="ghost" disabled={procesando !== null} onClick={() => ejecutar(`inv-${m.id}`, () => reenviarInvitacionAdministrador(m.id), "Invitación reenviada")}>
                      Reenviar invitación
                    </Button>
                  )}
                  {m.activo && (
                    <Button size="sm" variant="ghost" disabled={procesando !== null}
                      onClick={() => ejecutar(`niv-${m.id}`, () => cambiarNivelAdministrador(m.id, !m.principal), m.principal ? "Ahora es administrador secundario" : "Ahora es administrador principal")}>
                      {m.principal ? "Quitar principal" : "Nombrar principal"}
                    </Button>
                  )}
                  <Button size="sm" variant={m.activo ? "ghost" : "outline"} disabled={procesando !== null}
                    onClick={() => ejecutar(`act-${m.id}`, () => cambiarAccesoAdministrador(m.id, !m.activo), m.activo ? "Acceso desactivado" : "Acceso activado")}>
                    {procesando === `act-${m.id}` && <Loader2 className="animate-spin" aria-hidden />}
                    {m.activo ? "Desactivar acceso" : "Activar acceso"}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
        {visibles.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nadie coincide con la búsqueda.</li>}
      </ul>

      <DialogoPermisos
        titulo={editando ? `Permisos de ${editando.nombre}` : ""}
        abierto={editando !== null}
        inicial={editando ? { accesoTotal: editando.accesoTotal, modulos: editando.modulos } : { accesoTotal: false, modulos: [] }}
        onCerrar={() => setEditando(null)}
        onGuardar={async (p) => (editando ? ejecutar(`per-${editando.id}`, () => actualizarPermisos(editando.id, p), "Permisos actualizados") : false)}
      />
      <DialogoInvitar abierto={invitar} onCerrar={() => setInvitar(false)} onListo={() => { setInvitar(false); router.refresh() }} />
      <DialogoAnadir abierto={anadir} candidatos={candidatos} onCerrar={() => setAnadir(false)}
        onGuardar={async (id, p) => ejecutar(`add-${id}`, () => anadirAdministrador(id, p), "Administrador añadido")} />
    </div>
  )
}

function SelectorPermisos({ valor, onChange }: { valor: Permisos; onChange: (p: Permisos) => void }) {
  const id = useId()
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Acceso</legend>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", valor.accesoTotal && "border-primary bg-primary/5")}>
        <input type="radio" name={`${id}-n`} checked={valor.accesoTotal} onChange={() => onChange({ ...valor, accesoTotal: true })} className="mt-0.5 accent-primary" />
        <span><span className="font-medium">Acceso completo</span><span className="block text-xs text-muted-foreground">Todos los módulos, excepto gestionar el equipo.</span></span>
      </label>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", !valor.accesoTotal && "border-primary bg-primary/5")}>
        <input type="radio" name={`${id}-n`} checked={!valor.accesoTotal} onChange={() => onChange({ ...valor, accesoTotal: false })} className="mt-0.5 accent-primary" />
        <span className="font-medium">Solo los módulos elegidos</span>
      </label>
      {!valor.accesoTotal && (
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULOS_ADMIN.map((m) => {
            const marcado = valor.modulos.includes(m)
            return (
              <label key={m} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm">
                <input type="checkbox" checked={marcado} className="mt-0.5 accent-primary"
                  onChange={() => onChange({ ...valor, modulos: marcado ? valor.modulos.filter((x) => x !== m) : [...valor.modulos, m] })} />
                <span><span className="font-medium">{ETIQUETA_MODULO[m].titulo}</span><span className="block text-xs text-muted-foreground">{ETIQUETA_MODULO[m].descripcion}</span></span>
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

function DialogoPermisos({ titulo, abierto, inicial, onCerrar, onGuardar }: { titulo: string; abierto: boolean; inicial: Permisos; onCerrar: () => void; onGuardar: (p: Permisos) => Promise<boolean> }) {
  const [valor, setValor] = useState(inicial)
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  const [enviando, setEnviando] = useState(false)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) setValor(inicial)
  }
  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a && !enviando) onCerrar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>El cambio se aplica en su próxima acción; no puede ampliar sus propios permisos.</DialogDescription>
        </DialogHeader>
        <SelectorPermisos valor={valor} onChange={setValor} />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button disabled={enviando || (!valor.accesoTotal && valor.modulos.length === 0)}
            onClick={async () => { setEnviando(true); const ok = await onGuardar(valor); setEnviando(false); if (ok) onCerrar() }}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            Guardar permisos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoInvitar({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const id = useId()
  const [nombres, setNombres] = useState("")
  const [apellidos, setApellidos] = useState("")
  const [correo, setCorreo] = useState("")
  const [permisos, setPermisos] = useState<Permisos>({ accesoTotal: false, modulos: [] })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await invitarAdministrador({ nombres, apellidos, correo, ...permisos })
      if (r.ok) {
        if (r.aviso) notificar.advertencia("Colaborador registrado", { descripcion: r.aviso })
        else notificar.exito("Invitación enviada", { descripcion: "Recibirá un correo para crear su contraseña." })
        setNombres(""); setApellidos(""); setCorreo(""); setPermisos({ accesoTotal: false, modulos: [] })
        onListo()
      } else setError(r.mensaje)
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const campo = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a && !enviando) onCerrar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar colaborador</DialogTitle>
          <DialogDescription>Será administrador secundario de tu institución. Creará su propia contraseña desde el correo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <fieldset disabled={enviando} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm" htmlFor={`${id}-n`}>Nombres<input id={`${id}-n`} className={campo} value={nombres} onChange={(e) => setNombres(e.target.value)} maxLength={80} required /></label>
            <label className="space-y-1 text-sm" htmlFor={`${id}-a`}>Apellidos<input id={`${id}-a`} className={campo} value={apellidos} onChange={(e) => setApellidos(e.target.value)} maxLength={80} required /></label>
            <label className="space-y-1 text-sm sm:col-span-2" htmlFor={`${id}-c`}>Correo<input id={`${id}-c`} type="email" className={campo} value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={254} required /></label>
          </fieldset>
          <SelectorPermisos valor={permisos} onChange={setPermisos} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
            <Button type="submit" disabled={enviando || !nombres.trim() || !apellidos.trim() || !correo.trim() || (!permisos.accesoTotal && permisos.modulos.length === 0)}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Enviar invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoAnadir({ abierto, candidatos, onCerrar, onGuardar }: { abierto: boolean; candidatos: { id: string; nombre: string }[]; onCerrar: () => void; onGuardar: (id: string, p: Permisos) => Promise<boolean> }) {
  const id = useId()
  const [persona, setPersona] = useState("")
  const [permisos, setPermisos] = useState<Permisos>({ accesoTotal: false, modulos: [] })
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (!a && !enviando) onCerrar() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir a un miembro</DialogTitle>
          <DialogDescription>Una persona que ya pertenece a tu institución (por ejemplo, un docente) recibe acceso administrativo.</DialogDescription>
        </DialogHeader>
        <label htmlFor={`${id}-p`} className="text-sm font-medium">Persona</label>
        <select id={`${id}-p`} value={persona} onChange={(e) => setPersona(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
          <option value="">Elige una persona</option>
          {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <SelectorPermisos valor={permisos} onChange={setPermisos} />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button disabled={enviando || !persona || (!permisos.accesoTotal && permisos.modulos.length === 0)}
            onClick={async () => { setEnviando(true); const ok = await onGuardar(persona, permisos); setEnviando(false); if (ok) { setPersona(""); onCerrar() } }}>
            {enviando && <Loader2 className="animate-spin" aria-hidden />}
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
