"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlignCenter, AlignLeft, AlignRight, Eye, EyeOff, FileDown, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react"

import { LienzoCertificado, type FondoLienzo } from "@/components/certificados/lienzo-certificado"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { guardarDiseno } from "@/lib/certificados/acciones"
import {
  camposPredeterminados,
  campoNuevo,
  disenoSchema,
  MARCADORES,
  type BasePlantilla,
  type Campo,
  type Marcador,
  type ValoresCertificado,
} from "@/lib/certificados/diseno"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

type Props = {
  plantillaId: string
  base: BasePlantilla
  inicial: Campo[]
  fondo: FondoLienzo
  logoUrl: string | null
  valores: ValoresCertificado
}

const pct = (v: number) => Math.round(v * 1000) / 10

/**
 * Editor visual de una plantilla. Las posiciones se guardan como datos (cajas
 * relativas 0–1), no como imagen. Todo se previsualiza con datos ficticios.
 */
export function EditorPlantilla({ plantillaId, base, inicial, fondo, logoUrl, valores }: Props) {
  const router = useRouter()
  const [campos, setCampos] = useState<Campo[]>(inicial)
  const [sel, setSel] = useState<string | null>(inicial.find((c) => c.id === "estudiante")?.id ?? null)
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const actual = campos.find((c) => c.id === sel) ?? null

  const cambiar = (id: string, cambios: Partial<Campo>) => {
    setCampos((cs) => cs.map((c) => (c.id === id ? { ...c, ...cambios } : c)))
    setSucio(true)
  }

  // Avisa al salir con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", aviso)
    return () => window.removeEventListener("beforeunload", aviso)
  }, [sucio])

  // Flechas: mueven el campo seleccionado (Mayús = pasos mayores).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (!actual || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return
      const paso = e.shiftKey ? 0.02 : 0.005
      const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key]
      if (!d) return
      e.preventDefault()
      cambiar(actual.id, {
        x: Math.round(Math.min(Math.max(0, actual.x + d[0]), 1 - actual.w) * 1000) / 1000,
        y: Math.round(Math.min(Math.max(0, actual.y + d[1]), 1 - actual.h) * 1000) / 1000,
      })
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [actual])

  const validacion = disenoSchema.safeParse({ version: 1, campos })

  async function guardar() {
    if (guardando) return
    if (!validacion.success) {
      notificar.advertencia("El diseño no se puede guardar", { descripcion: validacion.error.issues[0]?.message })
      return
    }
    setGuardando(true)
    const op = notificar.operacion("Guardando diseño…")
    try {
      const r = await guardarDiseno(plantillaId, validacion.data)
      if (r.ok) {
        op.exito("Diseño guardado", { descripcion: "Se usará en los próximos certificados. Los ya emitidos no cambian." })
        setSucio(false)
        router.refresh()
      } else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo guardar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setGuardando(false)
    }
  }

  function insertarMarcador(m: Marcador) {
    if (!actual || actual.tipo !== "texto") return
    cambiar(actual.id, { texto: `${actual.texto}${actual.texto && !actual.texto.endsWith(" ") ? " " : ""}{${m}}` })
  }

  const numero = (k: "x" | "y" | "w" | "h", etiqueta: string) =>
    actual && (
      <Field>
        <FieldLabel htmlFor={`campo-${k}`}>{etiqueta}</FieldLabel>
        <Input
          id={`campo-${k}`}
          type="number"
          step={0.5}
          min={0}
          max={100}
          value={pct(actual[k])}
          onChange={(e) => {
            const v = Math.min(Math.max(Number(e.target.value) / 100, k === "w" || k === "h" ? 0.005 : 0), 1)
            if (Number.isFinite(v)) cambiar(actual.id, { [k]: v })
          }}
        />
      </Field>
    )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={guardar} disabled={guardando || !sucio}>
            {guardando ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Guardar diseño
          </Button>
          <a
            href={`/admin/certificados/vista-previa?plantilla=${plantillaId}`}
            target="_blank"
            rel="noopener"
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted", sucio && "pointer-events-none opacity-50")}
            aria-disabled={sucio}
            title={sucio ? "Guarda el diseño para verlo en PDF" : "Abre un PDF de demostración"}
          >
            <FileDown className="size-4" aria-hidden />
            Vista previa PDF
          </a>
          <Button variant="outline" onClick={() => { const n = campoNuevo(campos); setCampos((cs) => [...cs, n]); setSel(n.id); setSucio(true) }}>
            <Plus aria-hidden />
            Añadir texto
          </Button>
          <Button variant="ghost" onClick={() => { setCampos(camposPredeterminados(base)); setSucio(true) }}>
            <RotateCcw aria-hidden />
            Restablecer
          </Button>
          {sucio && <Badge variant="warning">Cambios sin guardar</Badge>}
        </div>
        <div className="overflow-hidden rounded-xl border bg-muted/30 p-2">
          <LienzoCertificado
            fondo={fondo}
            campos={campos}
            valores={valores}
            logoUrl={logoUrl}
            demostracion
            seleccionado={sel}
            alSeleccionar={setSel}
            alMover={(id, caja) => cambiar(id, caja)}
            className="h-auto w-full rounded-md bg-white shadow-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Arrastra un campo para moverlo y su esquina azul para cambiar su tamaño. Con un campo seleccionado, las flechas lo mueven (Mayús = más rápido).
          Los datos mostrados son ficticios. Si tu fondo trae textos impresos (nombres, fechas), no se pueden editar: cubre esa zona o usa un fondo limpio.
        </p>
        {!validacion.success && <p className="text-sm text-warning" role="alert">{validacion.error.issues[0]?.message}</p>}
      </div>

      <div className="space-y-4">
        <Card size="sm">
          <CardHeader><CardTitle>Campos</CardTitle></CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {campos.map((c) => (
                <li key={c.id} className={cn("flex items-center gap-1 rounded-md px-1", sel === c.id && "bg-primary/10")}>
                  <button type="button" className="min-w-0 flex-1 truncate py-1.5 text-left text-sm" onClick={() => setSel(c.id)}>
                    {c.etiqueta}
                  </button>
                  <Button size="icon-xs" variant="ghost" aria-label={c.visible ? `Ocultar ${c.etiqueta}` : `Mostrar ${c.etiqueta}`} onClick={() => cambiar(c.id, { visible: !c.visible })}>
                    {c.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {actual && (
          <Card size="sm">
            <CardHeader><CardTitle>{actual.etiqueta}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field>
                <FieldLabel htmlFor="campo-etiqueta">Nombre en el editor</FieldLabel>
                <Input id="campo-etiqueta" value={actual.etiqueta} maxLength={60} onChange={(e) => cambiar(actual.id, { etiqueta: e.target.value })} />
              </Field>
              {actual.tipo === "texto" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="campo-texto">Texto</FieldLabel>
                    <Textarea id="campo-texto" rows={3} maxLength={300} value={actual.texto} onChange={(e) => cambiar(actual.id, { texto: e.target.value })} />
                  </Field>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Insertar dato automático:</p>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(MARCADORES) as Marcador[]).map((m) => (
                        <button key={m} type="button" title={MARCADORES[m]} onClick={() => insertarMarcador(m)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                          {`{${m}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                {numero("x", "Horizontal (%)")}
                {numero("y", "Vertical (%)")}
                {numero("w", "Ancho (%)")}
                {numero("h", "Alto (%)")}
              </div>
              {(actual.tipo === "texto" || actual.tipo === "linea") && (
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel htmlFor="campo-tamano">{actual.tipo === "texto" ? "Tamaño (pt)" : "Grosor (pt)"}</FieldLabel>
                    <Input id="campo-tamano" type="number" min={actual.tipo === "texto" ? 6 : 0.5} max={96} step={0.5} value={actual.tamano}
                      onChange={(e) => { const v = Number(e.target.value); if (v >= 0.5 && v <= 96) cambiar(actual.id, { tamano: v }) }} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="campo-color">Color</FieldLabel>
                    <Input id="campo-color" type="color" value={actual.color} onChange={(e) => cambiar(actual.id, { color: e.target.value.toUpperCase() })} className="h-8 p-1" />
                  </Field>
                </div>
              )}
              {actual.tipo === "texto" && (
                <>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Alineación">
                    {([["izquierda", AlignLeft], ["centro", AlignCenter], ["derecha", AlignRight]] as const).map(([a, Icono]) => (
                      <Button key={a} size="icon-sm" variant={actual.alineacion === a ? "default" : "outline"} aria-label={`Alinear ${a}`} aria-pressed={actual.alineacion === a} onClick={() => cambiar(actual.id, { alineacion: a })}>
                        <Icono aria-hidden />
                      </Button>
                    ))}
                    <Button size="sm" variant={actual.fuente === "serif" ? "default" : "outline"} onClick={() => cambiar(actual.id, { fuente: "serif" })} aria-pressed={actual.fuente === "serif"}>Serif</Button>
                    <Button size="sm" variant={actual.fuente === "sans" ? "default" : "outline"} onClick={() => cambiar(actual.id, { fuente: "sans" })} aria-pressed={actual.fuente === "sans"}>Sans</Button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {([["negrita", "Negrita"], ["cursiva", "Cursiva"], ["mayusculas", "Mayúsculas"]] as const).map(([k, t]) => (
                      <label key={k} className="flex items-center gap-1.5">
                        <input type="checkbox" className="size-4 accent-primary" checked={actual[k]} onChange={(e) => cambiar(actual.id, { [k]: e.target.checked })} />
                        {t}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {actual.id.startsWith("texto_") && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCampos((cs) => cs.filter((c) => c.id !== actual.id)); setSel(null); setSucio(true) }}>
                  <Trash2 aria-hidden />
                  Eliminar campo
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
