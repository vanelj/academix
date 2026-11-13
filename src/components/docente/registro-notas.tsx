"use client"

import { useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, Lock, Save, Search, Send, Undo2 } from "lucide-react"

import { useProtegerCambios } from "@/components/layout/proteccion-cambios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { guardarNotas } from "@/lib/docente/acciones"
import type { FilaRegistro } from "@/lib/docente/datos"
import { claveNota, leerNota, textoNota } from "@/lib/docente/notas"
import { calcular, resultadoSegun } from "@/lib/evaluaciones/calculo"
import { publicarEvaluacion } from "@/lib/evaluaciones/publicacion"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

/** publicada_en: null = borrador; undefined = publicación no habilitada (sin aula_academica_v5). */
type Evaluacion = { id: string; nombre: string; peso: number; publicada_en?: string | null }

const fechaHora = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" })

/** «15,50» → «15.5»: así se ve igual que la nota guardada. */
const normal = (v: string) => {
  const l = leerNota(v)
  return l.ok ? textoNota(l.nota) : v
}
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Registro académico: una fila por estudiante y una columna por evaluación.
 * Se escribe directamente en la tabla (sin ventanas por nota), se ve el promedio
 * al instante y se guarda todo con un solo botón. Los errores del servidor se
 * muestran en la casilla exacta (estudiante × evaluación). Enter baja a la
 * siguiente fila, como en una hoja de cálculo.
 */
export function RegistroNotas({
  grupoId,
  evaluaciones,
  filas,
  notaAprobatoria,
  editable,
  motivoNoEditable,
  publicacionActiva = false,
  publicacionPorNota = false,
}: {
  grupoId: string
  evaluaciones: Evaluacion[]
  filas: FilaRegistro[]
  notaAprobatoria: number
  editable: boolean
  motivoNoEditable: string | null
  publicacionActiva?: boolean
  /** revision_funcional_v5 aplicada: «Guardar y publicar» por nota. */
  publicacionPorNota?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const inicial = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of filas) for (const e of evaluaciones) m[claveNota(f.matriculaId, e.id)] = textoNota(f.notas[e.id]?.nota)
    return m
  }, [filas, evaluaciones])
  const [guardado, setGuardado] = useState(inicial)
  const [valores, setValores] = useState(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [texto, setTexto] = useState("")
  // Corrección o anulación de notas que el estudiante YA ve: se pide el motivo (queda en el historial).
  const [pidiendoMotivo, setPidiendoMotivo] = useState<{ publicar: boolean } | null>(null)
  const [motivo, setMotivo] = useState("")
  const bloqueo = useRef(false)
  const visible = (k: string) => {
    const [m, e] = k.split(":")
    return Boolean(filas.find((f) => f.matriculaId === m)?.notas[e]?.publicada)
  }

  const cambiadas = Object.keys(valores).filter((k) => valores[k].trim() !== (guardado[k] ?? "").trim())
  const invalidas = cambiadas.filter((k) => !leerNota(valores[k]).ok)
  useProtegerCambios(cambiadas.length > 0)

  const visibles = filas.filter((f) => !texto.trim() || normalizar(f.nombre).includes(normalizar(texto.trim())))
  const pesoTotal = Math.round(evaluaciones.reduce((s, e) => s + e.peso * 100, 0)) / 100

  function mover(fila: number, col: number) {
    document.getElementById(`${id}-${fila}-${col}`)?.focus()
  }

  /** Notas ya visibles para el estudiante que se van a corregir o anular. */
  const correccionesVisibles = cambiadas.filter((k) => (guardado[k] ?? "").trim() !== "" && visible(k))

  async function guardar(publicar = true, motivoTexto = "") {
    if (bloqueo.current || cambiadas.length === 0) return
    if (invalidas.length) {
      notificar.advertencia("Revisa las notas marcadas", { descripcion: "Usa números de 0 a 20 con hasta 2 decimales, o deja la casilla vacía." })
      return
    }
    if (publicacionPorNota && correccionesVisibles.length > 0 && motivoTexto.trim().length < 5) {
      setPidiendoMotivo({ publicar })
      return
    }
    bloqueo.current = true
    setGuardando(true)
    const enviados = Object.fromEntries(cambiadas.map((k) => [k, valores[k]]))
    try {
      const r = await guardarNotas(
        grupoId,
        cambiadas.map((k) => {
          const [matriculaId, evaluacionId] = k.split(":")
          return { matriculaId, evaluacionId, nota: valores[k] }
        }),
        { publicar, motivo: motivoTexto.trim() }
      )
      if (!r.ok) {
        notificar.error("No se guardaron las notas", { descripcion: r.mensaje })
        return
      }
      const fallidas: Record<string, string> = {}
      for (const e of r.errores) fallidas[claveNota(e.matriculaId, e.evaluacionId)] = e.mensaje
      // Lo que se guardó pasa a ser el nuevo punto de partida; lo fallido sigue marcado.
      setGuardado((g) => {
        const nuevo = { ...g }
        for (const [k, v] of Object.entries(enviados)) if (!fallidas[k]) nuevo[k] = normal(v)
        return nuevo
      })
      setValores((vals) => {
        const nuevo = { ...vals }
        for (const [k, v] of Object.entries(enviados)) if (!fallidas[k] && vals[k] === v) nuevo[k] = normal(v)
        return nuevo
      })
      setErrores(fallidas)
      setPidiendoMotivo(null)
      setMotivo("")
      if (r.errores.length === 0) {
        notificar.exito(r.publicacionDirecta && publicar ? "Notas guardadas y publicadas" : "Notas guardadas", {
          descripcion: r.publicacionDirecta && publicar
            ? `${r.guardadas} ${r.guardadas === 1 ? "cambio" : "cambios"}: tus estudiantes ya ven sus notas.`
            : `${r.guardadas} ${r.guardadas === 1 ? "cambio guardado" : "cambios guardados"}${publicacionActiva ? " como borrador (el estudiante aún no las ve)" : ""}.`,
        })
      }
      else notificar.advertencia(`Se guardaron ${r.guardadas} cambios; ${r.errores.length} con problemas`, { descripcion: "Las casillas con problemas están marcadas en rojo." })
      router.refresh()
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Tus cambios siguen en pantalla. Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  if (filas.length === 0) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Este grupo aún no tiene estudiantes con matrícula confirmada.</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      {motivoNoEditable && <p role="status" className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{motivoNoEditable}</p>}
      {pesoTotal !== 100 && evaluaciones.length > 0 && (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          Los pesos de las evaluaciones suman {pesoTotal} %. Puedes registrar notas, pero el promedio final aparecerá cuando la institución complete el 100 %.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <label htmlFor={`${id}-q`} className="sr-only">Buscar estudiante</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id={`${id}-q`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar estudiante" className="pl-9" />
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {cambiadas.length === 0 ? "Sin cambios pendientes" : `${cambiadas.length} ${cambiadas.length === 1 ? "cambio sin guardar" : "cambios sin guardar"}`}
            </span>
            <Button variant="outline" size="sm" disabled={cambiadas.length === 0 || guardando} onClick={() => { setValores(guardado); setErrores({}) }}>
              <Undo2 aria-hidden />
              Deshacer
            </Button>
            {publicacionPorNota && (
              <Button variant="outline" size="sm" disabled={cambiadas.length === 0 || guardando} onClick={() => guardar(false)} title="El estudiante no verá estas notas hasta publicarlas">
                <Save aria-hidden />
                Guardar como borrador
              </Button>
            )}
            <Button size="sm" disabled={cambiadas.length === 0 || guardando} onClick={() => guardar(true)}>
              {guardando ? <Loader2 className="animate-spin" aria-hidden /> : publicacionPorNota ? <Send aria-hidden /> : <Save aria-hidden />}
              {guardando ? "Guardando…" : publicacionPorNota ? "Guardar y publicar" : "Guardar notas"}
            </Button>
          </div>
        )}
      </div>

      {publicacionActiva && (
        <PublicacionNotas
          evaluaciones={evaluaciones}
          guardadas={(evId) => filas.filter((f) => (guardado[claveNota(f.matriculaId, evId)] ?? "").trim() !== "").length}
          conCambios={(evId) => cambiadas.some((k) => k.endsWith(`:${evId}`))}
          total={filas.length}
          bloqueado={guardando || !editable}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">Registro de notas del grupo. Filas: estudiantes; columnas: evaluaciones y resultado.</caption>
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">Estudiante</th>
              {evaluaciones.map((e) => (
                <th key={e.id} scope="col" className="px-2 py-2 text-center font-medium">
                  <span className="block max-w-36 truncate" title={e.nombre}>{e.nombre}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{e.peso} %</span>
                  {publicacionActiva && (
                    <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px] font-normal", e.publicada_en ? "text-success" : "text-muted-foreground")}>
                      {e.publicada_en ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
                      {e.publicada_en ? "Publicada" : "Borrador"}
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center font-medium">Promedio</th>
              <th scope="col" className="px-3 py-2 text-center font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const filaIdx = filas.indexOf(f)
              const cerrada = f.estadoFinal !== "en_curso"
              const notas = evaluaciones.flatMap((e) => {
                const l = leerNota(valores[claveNota(f.matriculaId, e.id)] ?? "")
                return l.ok && l.nota !== null ? [{ evaluacion_id: e.id, nota: l.nota }] : []
              })
              const calculo = calcular(evaluaciones, notas)
              const propuesto = resultadoSegun(calculo.promedio, notaAprobatoria)
              return (
                <tr key={f.matriculaId} className="border-b last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal">
                    <span className="block max-w-56 break-words">{f.nombre}</span>
                    {cerrada && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden />Resultado cerrado</span>}
                  </th>
                  {evaluaciones.map((e, col) => {
                    const k = claveNota(f.matriculaId, e.id)
                    const v = valores[k] ?? ""
                    const lectura = leerNota(v)
                    const error = errores[k] ?? (!lectura.ok ? lectura.mensaje : null)
                    const cambiada = v.trim() !== (guardado[k] ?? "").trim()
                    return (
                      <td key={e.id} className="px-2 py-1.5 text-center align-top">
                        <input
                          id={`${id}-${filaIdx}-${col}`}
                          value={v}
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={!editable || cerrada || guardando}
                          aria-label={`Nota de ${f.nombre} en ${e.nombre}${publicacionActiva && f.notas[e.id]?.publicada ? " (publicada)" : ""}`}
                          title={publicacionActiva && f.notas[e.id] ? (f.notas[e.id].publicada ? "Publicada: el estudiante la ve" : "Borrador: el estudiante aún no la ve") : undefined}
                          aria-invalid={!!error || undefined}
                          aria-describedby={error ? `${id}-${filaIdx}-${col}-e` : undefined}
                          placeholder="—"
                          onChange={(ev) => {
                            const nuevo = ev.target.value
                            setValores((s) => ({ ...s, [k]: nuevo }))
                            if (errores[k]) setErrores((s) => { const c = { ...s }; delete c[k]; return c })
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === "ArrowDown") { ev.preventDefault(); mover(filaIdx + 1, col) }
                            if (ev.key === "ArrowUp") { ev.preventDefault(); mover(filaIdx - 1, col) }
                          }}
                          className={cn(
                            "h-9 w-16 rounded-lg border border-input bg-background text-center tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                            cambiada && "border-primary bg-primary/5",
                            error && "border-destructive bg-destructive/5"
                          )}
                        />
                        {error && <span id={`${id}-${filaIdx}-${col}-e`} className="mt-1 block max-w-28 text-left text-[11px] leading-tight text-destructive">{error}</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {calculo.promedio !== null ? <span className="font-semibold">{calculo.promedio.toFixed(2)}</span>
                      : calculo.parcial !== null ? <span className="text-muted-foreground" title="Promedio de las evaluaciones con nota">{calculo.parcial.toFixed(2)}*</span>
                        : <span className="text-muted-foreground">—</span>}
                    {calculo.faltantes > 0 && <span className="block text-[11px] text-warning">Faltan {calculo.faltantes}</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {cerrada ? (
                      <Badge variant={f.estadoFinal === "aprobado" ? "success" : "destructive"}>{f.estadoFinal === "aprobado" ? "Aprobado" : "Desaprobado"}</Badge>
                    ) : propuesto ? (
                      <span className={cn("text-xs font-medium", propuesto === "aprobado" ? "text-success" : "text-destructive")}>
                        {propuesto === "aprobado" ? "Aprobaría" : "Desaprobaría"}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">Pendiente</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {visibles.length === 0 && <p className="text-center text-sm text-muted-foreground">Ningún estudiante coincide con la búsqueda.</p>}
      <Dialog open={pidiendoMotivo !== null} onOpenChange={(a) => { if (!a && !guardando) setPidiendoMotivo(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motivo de la corrección</DialogTitle>
            <DialogDescription>
              {correccionesVisibles.length === 1 ? "Vas a cambiar o anular 1 nota" : `Vas a cambiar o anular ${correccionesVisibles.length} notas`} que el estudiante ya ve. El motivo queda en el historial académico (no se borra nada del registro).
            </DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} placeholder="Ej.: error de digitación; se revisó el examen a pedido del estudiante." autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPidiendoMotivo(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={() => pidiendoMotivo && guardar(pidiendoMotivo.publicar, motivo)} disabled={guardando || motivo.trim().length < 5}>
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              Registrar corrección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">
        {publicacionActiva && !publicacionPorNota && "Guardar no publica: tus estudiantes solo ven las notas de las evaluaciones publicadas. "}
        {publicacionPorNota && "«Guardar y publicar» muestra cada nota a su estudiante al instante (solo las que guardas, nunca borradores de otros). Para corregir o anular una nota que el estudiante ya ve se pide el motivo; el cambio queda registrado. "}
        * Promedio parcial: solo con las evaluaciones que ya tienen nota. «Aprobaría» o «Desaprobaría» es una vista previa;
        el resultado oficial lo registra la institución en «Evaluaciones» cuando el grupo está en curso o cerrado.
      </p>
    </div>
  )
}

/**
 * Publicación por evaluación. Guardar deja la nota en borrador (privada);
 * publicar la muestra a los estudiantes y les envía UN aviso por evaluación.
 */
function PublicacionNotas({
  evaluaciones,
  guardadas,
  conCambios,
  total,
  bloqueado,
}: {
  evaluaciones: Evaluacion[]
  guardadas: (evaluacionId: string) => number
  conCambios: (evaluacionId: string) => boolean
  total: number
  bloqueado: boolean
}) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState<{ ev: Evaluacion; publicar: boolean } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function ejecutar() {
    if (!confirmar || enviando) return
    setEnviando(true)
    try {
      const r = await publicarEvaluacion(confirmar.ev.id, confirmar.publicar)
      if (r.ok) {
        notificar.exito(confirmar.publicar ? "Notas publicadas" : "Publicación retirada", {
          descripcion: confirmar.publicar ? `Tus estudiantes ya ven las notas de «${confirmar.ev.nombre}».` : "Los estudiantes dejaron de ver esas notas.",
        })
        setConfirmar(null)
        router.refresh()
      } else {
        notificar.error("No se pudo completar", { descripcion: r.mensaje })
      }
    } catch {
      notificar.error("No se pudo conectar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  const faltantes = confirmar ? total - guardadas(confirmar.ev.id) : 0

  return (
    <section aria-label="Publicación de notas" className="rounded-2xl border bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold">Publicación de notas</h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {evaluaciones.map((e) => {
          const n = guardadas(e.id)
          const pendiente = conCambios(e.id)
          return (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={e.nombre}>{e.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {e.publicada_en
                    ? `Publicada · ${fechaHora.format(new Date(e.publicada_en))}`
                    : n === 0 ? "Pendiente de calificar" : `Borrador · ${n} de ${total} notas guardadas`}
                </p>
              </div>
              {e.publicada_en ? (
                <Button variant="ghost" size="sm" disabled={bloqueado} onClick={() => setConfirmar({ ev: e, publicar: false })}>
                  <EyeOff aria-hidden />
                  Retirar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={n > 0 ? "default" : "outline"}
                  disabled={bloqueado || n === 0 || pendiente}
                  title={pendiente ? "Guarda primero los cambios de esta evaluación" : n === 0 ? "Aún no hay notas guardadas" : undefined}
                  onClick={() => setConfirmar({ ev: e, publicar: true })}
                >
                  <Send aria-hidden />
                  Publicar
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog open={confirmar !== null} onOpenChange={(a) => { if (!a && !enviando) setConfirmar(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmar?.publicar ? `¿Publicar «${confirmar.ev.nombre}»?` : `¿Retirar la publicación de «${confirmar?.ev.nombre}»?`}</DialogTitle>
            <DialogDescription>
              {confirmar?.publicar
                ? `Tus estudiantes verán sus notas de esta evaluación y recibirán un aviso.${faltantes > 0 ? ` ${faltantes} sin nota la verán como «Pendiente».` : ""} Podrás corregir notas después: los cambios se verán al guardarlos.`
                : "Los estudiantes dejarán de ver estas notas hasta que vuelvas a publicarlas."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={enviando} variant={confirmar?.publicar ? "default" : "destructive"}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {confirmar?.publicar ? "Publicar" : "Retirar publicación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
