export type Theme = "light" | "dark"

export const THEME_STORAGE_KEY = "theme"

/**
 * Se ejecuta en <head> antes del primer pintado: aplica la clase `dark` según la
 * preferencia guardada o, si no existe, según la preferencia del sistema operativo.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`

export function getDocumentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // localStorage no disponible (p. ej. navegación privada): el tema aplica solo a esta sesión.
  }
}
