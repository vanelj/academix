/**
 * Apertura segura de documentos privados en el NAVEGADOR (URL firmada).
 *
 * Causa del «documento en blanco»: abrir la pestaña con la opción «noopener»
 * devuelve null por especificación; la pestaña nueva se quedaba en about:blank
 * y el documento se abría (o no) en la pestaña original. Aquí:
 *  - vista (PDF, imagen, texto): pestaña abierta en el gesto del usuario, SIN
 *    noopener en window.open, con opener = null antes de navegar;
 *  - descarga (Word, Excel, PowerPoint…): enlace de descarga directo, sin
 *    pestaña vacía;
 *  - error: la pestaña provisional se cierra y se devuelve el mensaje.
 */
export type Apertura = { ok: true; url?: string; modo?: "enlace" | "vista" | "descarga" } | { ok: false; mensaje: string }

export function descargarEnlace(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** `modoPrevisto`: lo que se espera antes de pedir la URL (decide si se abre pestaña en el gesto). */
export async function abrirDocumento(modoPrevisto: "enlace" | "vista" | "descarga", obtener: () => Promise<Apertura>): Promise<Apertura> {
  const ventana = modoPrevisto === "descarga" ? null : window.open("about:blank", "_blank")
  if (ventana) {
    try {
      ventana.opener = null
      ventana.document.title = "Abriendo documento…"
      ventana.document.body.style.cssText = "font-family:system-ui,sans-serif;color:#555;display:grid;place-items:center;height:100vh;margin:0"
      ventana.document.body.textContent = "Abriendo el documento de forma segura…"
    } catch {
      /* algunos navegadores no permiten escribir: se navega igual */
    }
  }
  try {
    const r = await obtener()
    if (!r.ok || !r.url) {
      ventana?.close()
      return r.ok ? { ok: false, mensaje: "No se recibió el enlace del documento." } : r
    }
    if (r.modo === "descarga") {
      ventana?.close()
      descargarEnlace(r.url)
    } else if (ventana && !ventana.closed) {
      ventana.location.replace(r.url)
    } else {
      window.location.assign(r.url)   // ventanas emergentes bloqueadas
    }
    return r
  } catch {
    ventana?.close()
    return { ok: false, mensaje: "Revisa tu conexión e inténtalo de nuevo." }
  }
}
