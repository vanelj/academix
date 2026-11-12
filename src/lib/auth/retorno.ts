/**
 * Ruta de retorno tras iniciar sesión (p. ej. volver al curso que el estudiante
 * eligió). Solo se aceptan rutas internas del catálogo, con un formato exacto:
 * así no puede usarse como redirección abierta hacia otros sitios.
 */
const RETORNO = /^\/cursos(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/

export function retornoSeguro(valor: unknown): string | null {
  return typeof valor === "string" && RETORNO.test(valor) ? valor : null
}
