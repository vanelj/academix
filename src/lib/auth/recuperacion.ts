/**
 * Marca de "sesión de recuperación de contraseña".
 *
 * La pone /auth/restablecer (servidor, cookie httpOnly) solo después de verificar
 * un enlace de recuperación válido, y guarda el id del usuario para que no sirva
 * con otra cuenta. /restablecer-contrasena y su acción exigen sesión + esta marca,
 * así la pantalla no queda disponible para cualquier sesión normal.
 */
export const COOKIE_RECUPERACION = "cv-recuperacion"

/** Minutos que la marca permanece válida tras abrir el enlace. */
export const MINUTOS_RECUPERACION = 15
