"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { obtenerContexto } from "@/lib/auth/contexto"
import { BUCKET_COMPROBANTES, TAMANO_MAX_COMPROBANTE, TIPOS_COMPROBANTE, tipoPorFirma } from "@/lib/pagos/config"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { ETIQUETA_TIPO_MEDIO, TIPOS_MEDIO } from "@/lib/validations/medio-cobro"

/**
 * El ESTUDIANTE presenta un comprobante con la RPC V5 presentar_comprobante.
 *
 * 1. El navegador sube el archivo con la sesión del estudiante a
 *    comprobantes-cursos-v5/<auth.uid()>/<uuid>.<ext> (política "v5 subir mis
 *    comprobantes": solo su carpeta; bucket privado, 5 MB, JPG/PNG/PDF).
 * 2. Esta acción comprueba la sesión, la ruta y la FIRMA real del archivo
 *    (descargándolo con la misma sesión), y llama a la RPC.
 * 3. La RPC vuelve a validar todo con bloqueos: rol estudiante, archivo en su
 *    carpeta y existente, solicitud/cuota propia y abierta, importe exacto o
 *    hasta el saldo, y un solo comprobante pendiente por destino.
 *
 * Presentar un comprobante NO aprueba nada: queda 'pendiente' hasta que el
 * administrador verifique el ingreso con revisar_pago.
 */

export type ResultadoEnvio = { ok: true; pagoId: string | null } | { ok: false; mensaje: string; gravedad: "error" | "advertencia"; campo?: "monto" | "referencia" | "archivo" }
type Fallo = Extract<ResultadoEnvio, { ok: false }>

const envioSchema = z.object({
  destino: z.enum(["solicitud", "cuota", "certificado"]),
  id: z.uuid(),
  monto: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Introduce un monto válido, por ejemplo 150 o 150.50.")
    .refine((v) => Number(v) > 0, "El monto debe ser mayor que 0."),
  metodo: z.enum(TIPOS_MEDIO, { error: "Elige cómo pagaste." }),
  referencia: z
    .string()
    .trim()
    .min(4, "Introduce el número de operación (mínimo 4 caracteres).")
    .max(40, "Máximo 40 caracteres.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ./#-]*$/, "Usa solo letras, números, espacios y . / # -"),
  ruta: z.string().max(200),
  confirmado: z.literal(true, { error: "Confirma los datos antes de enviar." }),
})

export type EnvioComprobante = z.input<typeof envioSchema>

const EXTENSIONES = Object.values(TIPOS_COMPROBANTE).join("|")

export async function presentarComprobante(datos: unknown): Promise<ResultadoEnvio> {
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil" || !ctx.perfil.activo || ctx.rolActivo !== "estudiante") {
    return { ok: false, gravedad: "advertencia", mensaje: "Para enviar comprobantes necesitas entrar con tu rol de estudiante activo." }
  }
  const v = envioSchema.safeParse(datos)
  if (!v.success) {
    const i = v.error.issues[0]
    const campo = i?.path[0] === "monto" || i?.path[0] === "referencia" ? i.path[0] : undefined
    return { ok: false, gravedad: "error", mensaje: i?.message ?? "Revisa los datos del comprobante.", campo }
  }
  const d = v.data

  // La ruta debe ser un archivo de SU carpeta con el nombre que genera la app.
  const ruta = new RegExp(`^${ctx.userId}/[0-9a-f-]{36}\\.(${EXTENSIONES})$`)
  if (!ruta.test(d.ruta)) return { ok: false, gravedad: "error", campo: "archivo", mensaje: "El archivo adjunto no es válido. Vuelve a adjuntarlo." }

  const supabase = await createClient()

  // Firma real del archivo: un .pdf renombrado o un archivo vacío se rechaza.
  const { data: archivo, error: descargaError } = await supabase.storage.from(BUCKET_COMPROBANTES).download(d.ruta)
  if (descargaError || !archivo) {
    if (descargaError && esErrorDeRed(descargaError)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
    return { ok: false, gravedad: "error", campo: "archivo", mensaje: "No se encontró el archivo subido. Vuelve a adjuntarlo." }
  }
  const extension = d.ruta.split(".").pop()
  const firma = tipoPorFirma(new Uint8Array(await archivo.slice(0, 8).arrayBuffer()))
  if (archivo.size === 0 || archivo.size > TAMANO_MAX_COMPROBANTE || !firma || TIPOS_COMPROBANTE[firma] !== extension) {
    return { ok: false, gravedad: "error", campo: "archivo", mensaje: "El archivo no es una imagen JPG/PNG ni un PDF válido de hasta 5 MB." }
  }

  // Certificados: RPC propia (certificados_v5). Solicitudes y cuotas: la de V5.
  const { data, error } =
    d.destino === "certificado"
      ? await supabase.rpc("presentar_comprobante_certificado", {
          p_solicitud: d.id,
          p_monto: Number(d.monto),
          p_metodo: ETIQUETA_TIPO_MEDIO[d.metodo],
          p_referencia: d.referencia.replace(/\s+/g, " "),
          p_comprobante_path: d.ruta,
        })
      : await supabase.rpc("presentar_comprobante", {
          p_solicitud_id: d.destino === "solicitud" ? d.id : null,
          p_cuota_id: d.destino === "cuota" ? d.id : null,
          p_monto: Number(d.monto),
          p_metodo: ETIQUETA_TIPO_MEDIO[d.metodo],
          p_referencia: d.referencia.replace(/\s+/g, " "),
          p_comprobante_path: d.ruta,
        })
  if (error) return fallo(error)

  revalidatePath("/estudiante/pagos", "layout")
  revalidatePath("/estudiante/solicitudes")
  revalidatePath("/estudiante/certificados")
  revalidatePath("/estudiante")
  return { ok: true, pagoId: typeof data === "string" ? data : null }
}

/** Traduce los mensajes de RAISE EXCEPTION de presentar_comprobante (V5). */
function fallo(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[pagos-estudiante] presentar_comprobante", error.code, error.message)
  const m = error.message
  const aviso = (mensaje: string, campo?: Fallo["campo"]): Fallo => ({ ok: false, gravedad: "advertencia", mensaje, campo })
  if (/comprobante pendiente/i.test(m)) return aviso("Ya enviaste un comprobante para este pago y está en revisión. Espera la respuesta de la institución.")
  if (/coincidir con el importe/i.test(m)) return aviso("El monto debe ser exactamente el importe indicado.", "monto")
  if (/Solicitud de certificado no disponible/i.test(m)) return aviso("La solicitud del certificado ya no está pendiente de pago. Recarga la página.")
  if (/fuera del saldo/i.test(m)) return aviso("El monto no puede superar el saldo pendiente.", "monto")
  if (/Solicitud no disponible/i.test(m)) return aviso("La solicitud ya no está pendiente de pago (fue cancelada, confirmada o venció). Recarga la página.")
  if (/matrícula activa/i.test(m)) return aviso("La cuota ya no está abierta o la matrícula no está activa. Recarga la página.")
  if (/No se encontró el comprobante|carpeta privada/i.test(m)) return aviso("No se encontró el archivo subido. Vuelve a adjuntarlo.", "archivo")
  if (/obligatorios/i.test(m)) return aviso("Completa el método, el número de operación y el comprobante.")
  if (/Solo estudiantes/i.test(m)) return { ok: false, gravedad: "error", mensaje: "Solo una cuenta con rol estudiante activo puede enviar comprobantes." }
  if (error.code === "PGRST202") return { ok: false, gravedad: "error", mensaje: "El envío de comprobantes no está disponible en este momento." }
  return { ok: false, gravedad: "error", mensaje: "No se pudo enviar el comprobante. Inténtalo de nuevo en unos minutos." }
}
