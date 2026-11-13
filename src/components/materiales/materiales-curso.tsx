"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, ExternalLink, FileText, Link2, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { abrirDocumento } from "@/lib/abrir-documento"
import { abrirMaterial, crearMaterial, editarMaterial, retirarMaterial } from "@/lib/materiales/acciones"
import type { Material } from "@/lib/materiales/datos"
import {
  ACEPTA_MATERIAL,
  agruparPorTema,
  BUCKET_MATERIALES,
  enlaceMaterialValido,
  MATERIAL_MAX_BYTES,
  modoApertura,
  rutaMaterial,
  tamanoLegible,
  TIPOS_MATERIAL,
  tipoMaterial,
  type TipoMaterial,
} from "@/lib/materiales/reglas"
import { notificar } from "@/lib/notificaciones"
import { createClient } from "@/lib/supabase/client"

const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" })

type Gestion = { grupoId: string; institucionId: string; userId: string; esAdmin: boolean }

/**
 * Materiales de un grupo, agrupados por tema o semana. Sin `gestion` es de
 * solo lectura (estudiante). Con `gestion`, el docente comparte archivos o
 * enlaces y edita o retira los suyos (el administrador, todos).
 */
export function MaterialesCurso({ materiales, gestion }: { materiales: Material[]; gestion?: Gestion }) {
  const router = useRouter()
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [editando, setEditando] = useState<Material | "nuevo" | null>(null)
  const [retirando, setRetirando] = useState<Material | null>(null)
  const temas = useMemo(() => agruparPorTema(materiales), [materiales])
  const temasExistentes = useMemo(() => [...new Set(materiales.map((m) => m.tema).filter(Boolean))] as string[], [materiales])

  async function abrir(m: Material, descargar: boolean) {
    if (abriendo) return
    setAbriendo(m.id)
    try {
      // Ver lib/abrir-documento.ts: causa y corrección del «documento en blanco».
      const r = await abrirDocumento(modoApertura(m, descargar), () => abrirMaterial(m.id, descargar))
      if (r.ok && r.modo === "descarga") {
        notificar.exito("Descarga iniciada", { descripcion: "Los documentos de Word, Excel y PowerPoint se abren con su programa." })
      } else if (!r.ok) {
        notificar.error("No se pudo abrir el material", { descripcion: r.mensaje, accion: { etiqueta: "Reintentar", alPulsar: () => void abrir(m, descargar) } })
      }
    } finally {
      setAbriendo(null)
    }
  }

  const puedeEditar = (m: Material) => Boolean(gestion && (gestion.esAdmin || m.creado_por === gestion.userId))

  return (
    <div className="space-y-4">
      {gestion && (
        <div className="flex justify-end">
          <Button onClick={() => setEditando("nuevo")}>
            <Plus aria-hidden />
            Compartir material
          </Button>
        </div>
      )}
      {materiales.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {gestion
              ? "Aún no compartiste materiales. Sube un PDF o comparte un enlace para tus estudiantes."
              : "Tu docente aún no ha compartido materiales para este curso."}
          </CardContent>
        </Card>
      ) : (
        temas.map(({ tema, materiales: lista }) => (
          <section key={tema ?? "__sin_tema"} className="space-y-2" aria-label={tema ?? "Otros materiales"}>
            <h4 className="text-sm font-semibold text-muted-foreground">{tema ?? "Otros materiales"}</h4>
            <ul className="divide-y rounded-xl border">
              {lista.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                      {m.tipo === "enlace" ? <Link2 className="size-4" /> : <FileText className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium break-words">{m.titulo}</p>
                      {m.descripcion && <p className="text-sm break-words text-muted-foreground">{m.descripcion}</p>}
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{m.tipo === "enlace" ? "Enlace externo" : `${TIPOS_MATERIAL[m.archivo_tipo as TipoMaterial]?.etiqueta ?? "Archivo"} · ${tamanoLegible(m.archivo_bytes)}`}</span>
                        <span>{fecha.format(new Date(m.creado_en))}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => abrir(m, false)} disabled={abriendo === m.id}>
                      {abriendo === m.id ? <Loader2 className="animate-spin" aria-hidden /> : modoApertura(m) === "descarga" ? <Download aria-hidden /> : <ExternalLink aria-hidden />}
                      {modoApertura(m) === "descarga" ? "Descargar" : "Abrir"}
                    </Button>
                    {modoApertura(m) === "vista" && (
                      <Button variant="outline" size="sm" onClick={() => abrir(m, true)} disabled={abriendo === m.id} aria-label={`Descargar ${m.titulo}`}>
                        <Download aria-hidden />
                      </Button>
                    )}
                    {puedeEditar(m) && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditando(m)} aria-label={`Editar ${m.titulo}`}><Pencil aria-hidden /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setRetirando(m)} aria-label={`Retirar ${m.titulo}`}><Trash2 aria-hidden /></Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {gestion && (
        <FormularioMaterial
          gestion={gestion}
          material={editando}
          temas={temasExistentes}
          onCerrar={(cambio) => { setEditando(null); if (cambio) router.refresh() }}
        />
      )}

      <Dialog open={retirando !== null} onOpenChange={(a) => { if (!a) setRetirando(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Retirar «{retirando?.titulo}»?</DialogTitle>
            <DialogDescription>Los estudiantes dejarán de verlo. {retirando?.tipo === "archivo" ? "El archivo se eliminará." : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetirando(null)}>Cancelar</Button>
            <BotonRetirar material={retirando} onListo={() => { setRetirando(null); router.refresh() }} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BotonRetirar({ material, onListo }: { material: Material | null; onListo: () => void }) {
  const [enviando, setEnviando] = useState(false)
  async function retirar() {
    if (!material || enviando) return
    setEnviando(true)
    try {
      const r = await retirarMaterial(material.id)
      if (r.ok) {
        notificar.exito("Material retirado")
        onListo()
      } else notificar.error("No se pudo retirar", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo retirar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Button variant="destructive" onClick={retirar} disabled={enviando}>
      {enviando && <Loader2 className="animate-spin" aria-hidden />}
      Retirar
    </Button>
  )
}

type Errores = Partial<Record<"titulo" | "enlace" | "archivo", string>>

function FormularioMaterial({
  gestion,
  material,
  temas,
  onCerrar,
}: {
  gestion: Gestion
  material: Material | "nuevo" | null
  temas: string[]
  onCerrar: (cambio: boolean) => void
}) {
  const nuevo = material === "nuevo"
  const existente = material && material !== "nuevo" ? material : null
  const [tipo, setTipo] = useState<"archivo" | "enlace">("archivo")
  const [titulo, setTitulo] = useState("")
  const [tema, setTema] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [enlace, setEnlace] = useState("")
  const [archivo, setArchivo] = useState<{ file: File; tipo: TipoMaterial } | null>(null)
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const [abiertoPara, setAbiertoPara] = useState<Material | "nuevo" | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  // Carga los valores al abrir (sin efectos: se compara con el material anterior).
  if (material !== abiertoPara) {
    setAbiertoPara(material)
    setTipo(existente?.tipo ?? "archivo")
    setTitulo(existente?.titulo ?? "")
    setTema(existente?.tema ?? "")
    setDescripcion(existente?.descripcion ?? "")
    setEnlace(existente?.enlace ?? "")
    setArchivo(null)
    setErrores({})
  }

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const error = (m: string) => {
      setArchivo(null)
      setErrores((x) => ({ ...x, archivo: m }))
      if (entrada.current) entrada.current.value = ""
    }
    if (f.size === 0) return error("El archivo está vacío.")
    if (f.size > MATERIAL_MAX_BYTES) return error("El archivo supera 20 MB. Para vídeos, comparte un enlace.")
    const t = tipoMaterial(f.name, new Uint8Array(await f.slice(0, 16).arrayBuffer()))
    if (!t) return error("Formato no admitido o archivo dañado. Usa PDF, Word, Excel, PowerPoint, texto o imagen.")
    setArchivo({ file: f, tipo: t })
    setErrores((x) => ({ ...x, archivo: undefined }))
    if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, "").slice(0, 160))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    const errs: Errores = {}
    if (!titulo.trim()) errs.titulo = "Escribe un título."
    if ((nuevo && tipo === "enlace") || existente?.tipo === "enlace") {
      if (!enlaceMaterialValido(enlace)) errs.enlace = "Escribe un enlace que empiece por https://."
    }
    if (nuevo && tipo === "archivo" && !archivo) errs.archivo = "Elige un archivo."
    setErrores(errs)
    if (Object.keys(errs).length) return

    setEnviando(true)
    const comunes = { titulo: titulo.trim(), tema: tema.trim(), descripcion: descripcion.trim() }
    let rutaSubida: string | null = null
    try {
      let r
      if (existente) {
        r = await editarMaterial(existente.id, { ...comunes, ...(existente.tipo === "enlace" ? { enlace: enlace.trim() } : {}) })
      } else if (tipo === "enlace") {
        r = await crearMaterial(gestion.grupoId, { tipo: "enlace", enlace: enlace.trim(), ...comunes })
      } else {
        const a = archivo!
        const ruta = rutaMaterial(gestion.institucionId, gestion.grupoId, crypto.randomUUID(), a.tipo)
        const { error } = await createClient().storage.from(BUCKET_MATERIALES).upload(ruta, a.file, { contentType: a.tipo, upsert: false, cacheControl: "0" })
        if (error) {
          const m = error.message ?? ""
          notificar.error("No se pudo subir el archivo", {
            descripcion: /bucket/i.test(m) ? "Los materiales aún no están habilitados (falta la actualización «aula_academica_v5»)." : /size|exceed|large/i.test(m) ? "El archivo supera 20 MB." : "Revisa tu conexión e inténtalo de nuevo.",
          })
          return
        }
        rutaSubida = ruta
        r = await crearMaterial(gestion.grupoId, { tipo: "archivo", ruta, nombre: a.file.name, mime: a.tipo, bytes: a.file.size, ...comunes })
      }
      if (r.ok) {
        rutaSubida = null
        notificar.exito(existente ? "Material actualizado" : "Material compartido", { descripcion: existente ? undefined : "Tus estudiantes ya pueden verlo en su aula." })
        onCerrar(true)
      } else {
        notificar.error("No se pudo guardar", { descripcion: r.mensaje })
      }
    } catch {
      notificar.error("No se pudo guardar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      // Si el registro falló, no se deja el archivo huérfano en el bucket.
      if (rutaSubida) await createClient().storage.from(BUCKET_MATERIALES).remove([rutaSubida]).catch(() => undefined)
      setEnviando(false)
    }
  }

  const id = "material"
  return (
    <Dialog open={material !== null} onOpenChange={(a) => { if (!a && !enviando) onCerrar(false) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existente ? "Editar material" : "Compartir material"}</DialogTitle>
          <DialogDescription>Solo lo verán los estudiantes matriculados en este grupo.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={guardar} className="space-y-4" aria-busy={enviando}>
          <fieldset disabled={enviando} className="min-w-0 space-y-4">
            {nuevo && (
              <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Tipo de material">
                {(["archivo", "enlace"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tipo === t}
                    onClick={() => setTipo(t)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tipo === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    {t === "archivo" ? <Upload className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
                    {t === "archivo" ? "Archivo" : "Enlace"}
                  </button>
                ))}
              </div>
            )}
            {nuevo && tipo === "archivo" && (
              <Field data-invalid={Boolean(errores.archivo)}>
                <FieldLabel htmlFor={`${id}-archivo`}>Archivo</FieldLabel>
                <Input ref={entrada} id={`${id}-archivo`} type="file" accept={ACEPTA_MATERIAL} onChange={elegir} aria-invalid={Boolean(errores.archivo)} />
                <FieldDescription>PDF, Word, Excel, PowerPoint, texto o imagen. Máximo 20 MB.</FieldDescription>
                {archivo && <Badge variant="secondary">{archivo.file.name} · {tamanoLegible(archivo.file.size)}</Badge>}
                <FieldError>{errores.archivo}</FieldError>
              </Field>
            )}
            {((nuevo && tipo === "enlace") || existente?.tipo === "enlace") && (
              <Field data-invalid={Boolean(errores.enlace)}>
                <FieldLabel htmlFor={`${id}-enlace`}>Enlace</FieldLabel>
                <Input id={`${id}-enlace`} type="url" inputMode="url" placeholder="https://" value={enlace} onChange={(e) => setEnlace(e.target.value)} aria-invalid={Boolean(errores.enlace)} />
                <FieldDescription>Documento compartido, vídeo (YouTube, Drive…) u otro recurso https.</FieldDescription>
                <FieldError>{errores.enlace}</FieldError>
              </Field>
            )}
            <Field data-invalid={Boolean(errores.titulo)}>
              <FieldLabel htmlFor={`${id}-titulo`}>Título</FieldLabel>
              <Input id={`${id}-titulo`} value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} aria-invalid={Boolean(errores.titulo)} />
              <FieldError>{errores.titulo}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-tema`}>Tema o semana (opcional)</FieldLabel>
              <Input id={`${id}-tema`} list={`${id}-temas`} placeholder="Semana 1" value={tema} maxLength={80} onChange={(e) => setTema(e.target.value)} />
              <datalist id={`${id}-temas`}>{temas.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-descripcion`}>Indicaciones (opcional)</FieldLabel>
              <Textarea id={`${id}-descripcion`} rows={2} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Field>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onCerrar(false)} disabled={enviando}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {enviando ? "Guardando…" : existente ? "Guardar cambios" : "Compartir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
