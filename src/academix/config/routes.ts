import type { PublicRoutes } from '../types';

/** Rutas por defecto. Sobrescríbelas en <AcademixUIProvider routes={…}>. */
export const defaultRoutes: PublicRoutes = {
  home: '/',
  courses: '/cursos',
  institutions: '/instituciones',
  login: '/login',
  // Rutas reales de Academix: el registro de institución es /registro y la ficha
  // pública del curso se identifica por id (oferta_cursos no tiene slug).
  registerInstitution: '/registro',
  courseDetail: '/cursos/:id',
  institutionCourses: '/cursos?institucion=:id',
};

/** Sustituye `:param` en un patrón de ruta. */
export function buildHref(pattern: string, params: Record<string, string | null | undefined>): string {
  return pattern.replace(/:([a-zA-Z_]+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ''));
}
