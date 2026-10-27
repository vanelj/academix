"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Award, Download, ExternalLink, FileWarning, Loader2, Search } from "lucide-react"

import { formatoFechaCert } from "@/components/admin/certificados/certificado-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { enlaceCertificado, generarPdf } from "@/lib/certificados/acciones"
import type { CertificadoEmitido } from "@/lib/certificados/datos"
import { notificar } from "@/lib/notificaciones"

const TODOS = "todos"
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

/** Certificados emitidos: inmutables; solo se descargan o se genera su PDF si faltó. */
export function EmitidosPanel({ emitidos }: { emitidos: CertificadoEmitido[] }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState("")
  const [curso, setCurso] = useState(TODOS)
  const [grupo, setGrupo] = useState(TODOS)
  const [procesando, setProcesando] = useState<string | null>(null)

  const opciones = useMemo(() => {
    const cursos = new Map<string, string>(), grupos = new Map<string, string>()
    for (const c of emitidos) {
      if (c.matricula?.curso) cursos.set(c.matricula.curso.id, c.matricula.curso.nombre)
      if (c.matricula?.grupo) grupos.set(c.matricula.grupo.id, `${c.matricula.curso?.nombre ?? "Curso"} · ${c.matricula.grupo.codigo}`)
    }
    const orden = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "es")
    return { cursos: [...cursos].map(([value, label]) => ({ value, label })).sort(orden), grupos: [...grupos].map(([value, label]) => ({ value, label })).sort(orden) }
  }, [emitidos])

  const filtrados = useMemo(() => {
    const k = normalizar(busqueda.trim())
    return emitidos.filter((c) =>
      (curso === TODOS || c.matricula?.curso?.id === curso) &&
      (grupo === TODOS || c.matricula?.grupo?.id === grupo) &&
      (k === "" || normalizar(`${c.codigo} ${c.matricula?.estudiante.nombre ?? ""}`).includes(k)))
  }, [emitidos, busqueda, curso, grupo])

  async function descargar(id: string) {
    if (procesando) return
    setProcesando(id)
    try {
      const r = await enlaceCertificado(id)
      if (r.ok && r.url) window.location.assign(r.url)
      else if (!r.ok) (r.gravedad === "advertencia" ? notificar.advertencia : notificar.error)("No se pudo descargar", { descripcion: r.mensaje })
    } catch {
      notificar.error("No se pudo descargar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  async function regenerar(id: string) {
    if (procesando) return
    setProcesando(id)
    const op = notificar.operacion("Generando PDF…")
    try {
      const r = await generarPdf(id)
      if (r.ok) { op.exito("PDF generado"); router.refresh() }
      else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo generar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo generar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  const itemsCurso = [{ value: TODOS, label: "Todos los cursos" }, ...opciones.cursos]
  const itemsGrupo = [{ value: TODOS, label: "Todos los grupos" }, ...opciones.grupos]

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar estudiante o código" aria-label="Buscar" className="pl-8" />
        </div>
        <Select items={itemsCurso} value={curso} onValueChange={(v) => { setCurso(v ? String(v) : TODOS); setGrupo(TODOS) }}>
          <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar por curso"><SelectValue /></SelectTrigger>
          <SelectContent>{itemsCurso.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select items={itemsGrupo} value={grupo} onValueChange={(v) => setGrupo(v ? String(v) : TODOS)}>
          <SelectTrigger className="w-full lg:w-64" aria-label="Filtrar por grupo"><SelectValue /></SelectTrigger>
          <SelectContent>{itemsGrupo.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Award className="size-5 text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground">{emitidos.length === 0 ? "Aún no se emitieron certificados." : "Ningún certificado coincide con los filtros."}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtrados.map((c) => (
            <li key={c.id}>
              <Card size="sm" className="h-full">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{c.matricula?.estudiante.nombre ?? "Estudiante"}</p>
                      <p className="text-sm text-muted-foreground">{c.matricula?.curso?.nombre ?? "Curso"} · Grupo {c.matricula?.grupo?.codigo ?? "—"}</p>
                    </div>
                    {c.tienePdf ? <Badge variant="success">PDF listo</Badge> : <Badge variant="warning">Sin PDF</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Código <span className="font-mono text-foreground">{c.codigo}</span> · emitido el {formatoFechaCert.format(new Date(c.fecha_emision))}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {c.tienePdf ? (
                      <Button size="sm" variant="outline" onClick={() => descargar(c.id)} disabled={procesando !== null}>
                        {procesando === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                        Descargar PDF
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => regenerar(c.id)} disabled={procesando !== null}>
                        {procesando === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <FileWarning aria-hidden />}
                        Generar PDF
                      </Button>
                    )}
                    <Link href={`/verificar/${c.codigo}`} target="_blank" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[0.8rem] font-medium hover:bg-muted">
                      <ExternalLink className="size-3.5" aria-hidden />
                      Verificación pública
                    </Link>
                    {c.matricula && <Link href={`/admin/matriculas/${c.matricula.id}`} className="inline-flex h-7 items-center rounded-md px-2 text-[0.8rem] font-medium hover:bg-muted">Matrícula</Link>}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
