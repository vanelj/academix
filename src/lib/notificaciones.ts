import type { ReactNode } from "react"
import { Toast } from "@base-ui/react/toast"

/**
 * Notificaciones globales de la plataforma (USO EN EL NAVEGADOR).
 *
 * Usa el Toast de Base UI (ya incluido en @base-ui/react, sin dependencias
 * nuevas) con un gestor global: se puede llamar desde cualquier componente
 * cliente o manejador de eventos, en los tres paneles y en la zona pública.
 * El único proveedor visual es <Notificaciones /> en el layout raíz.
 *
 *   notificar.exito("Cambios guardados")
 *   notificar.error("No se pudo guardar", { descripcion: "Inténtalo de nuevo." })
 *
 *   const op = notificar.operacion("Guardando cambios…")   // "procesando"
 *   op.exito("Guardado")  |  op.error("Falló")  |  op.advertencia("Conflicto")
 *
 * Regla: el éxito solo se notifica cuando el servidor lo confirma.
 */

export type TipoNotificacion = "exito" | "error" | "advertencia" | "info" | "procesando"

export type OpcionesNotificacion = {
  descripcion?: ReactNode
  /** ms antes de cerrarse sola; 0 = no se cierra sola. */
  duracion?: number
  /** Botón de acción opcional (p. ej. "Deshacer"). Cierra la notificación al pulsarlo. */
  accion?: { etiqueta: string; alPulsar: () => void }
}

export type DatosNotificacion = { tipo: TipoNotificacion }

export const gestorNotificaciones = Toast.createToastManager<DatosNotificacion>()

const DURACION: Record<TipoNotificacion, number> = {
  exito: 5000,
  info: 5000,
  advertencia: 8000,
  error: 8000,
  procesando: 0, // se sustituye por el resultado de la operación
}

let contador = 0

function mostrar(tipo: TipoNotificacion, titulo: string, opciones: OpcionesNotificacion = {}, id?: string): string {
  const clave = id ?? `notificacion-${++contador}`
  const { accion } = opciones
  // Con un id existente, add() la reemplaza en su sitio y reinicia su temporizador.
  gestorNotificaciones.add({
    id: clave,
    type: tipo,
    title: titulo,
    description: opciones.descripcion,
    timeout: opciones.duracion ?? DURACION[tipo],
    // Errores y advertencias se anuncian de inmediato a lectores de pantalla.
    priority: tipo === "error" || tipo === "advertencia" ? "high" : "low",
    actionProps: accion
      ? {
          children: accion.etiqueta,
          onClick: () => {
            accion.alPulsar()
            gestorNotificaciones.close(clave)
          },
        }
      : undefined,
    data: { tipo },
  })
  return clave
}

type Resultado = (titulo: string, opciones?: OpcionesNotificacion) => void

export type OperacionNotificada = {
  exito: Resultado
  error: Resultado
  advertencia: Resultado
  info: Resultado
  cerrar: () => void
}

export const notificar = {
  exito: (titulo: string, opciones?: OpcionesNotificacion) => mostrar("exito", titulo, opciones),
  error: (titulo: string, opciones?: OpcionesNotificacion) => mostrar("error", titulo, opciones),
  advertencia: (titulo: string, opciones?: OpcionesNotificacion) => mostrar("advertencia", titulo, opciones),
  info: (titulo: string, opciones?: OpcionesNotificacion) => mostrar("info", titulo, opciones),
  cerrar: (id?: string) => gestorNotificaciones.close(id),

  /**
   * Operación en curso: muestra "procesando" y luego la misma notificación se
   * sustituye por el resultado (éxito, error, advertencia o información).
   */
  operacion(titulo: string, opciones?: OpcionesNotificacion): OperacionNotificada {
    const id = mostrar("procesando", titulo, opciones)
    return {
      exito: (t, o) => void mostrar("exito", t, o, id),
      error: (t, o) => void mostrar("error", t, o, id),
      advertencia: (t, o) => void mostrar("advertencia", t, o, id),
      info: (t, o) => void mostrar("info", t, o, id),
      cerrar: () => gestorNotificaciones.close(id),
    }
  },
}
