/**
 * Tipos públicos de la interfaz Academix · Creative Tech.
 * Los componentes reciben estos datos por props: no contienen datos internos.
 * Mapea aquí las filas de Supabase (ver docs/INTEGRACION.md).
 */
import type { ComponentType, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* Dominio                                                             */
/* ------------------------------------------------------------------ */

/** Variante visual de la portada generada cuando un curso no tiene imagen. */
export type CategoryVisual = 'tecnologia' | 'idiomas' | 'gestion' | 'diseno' | 'educacion' | 'general';

/** Modalidad. Academix gestiona cursos virtuales. */
export type CourseModality = 'virtual';

export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  /** Si no se indica, se deduce del slug (ver lib/visuals.ts). */
  visual?: CategoryVisual;
}

export interface InstitutionRef {
  id: string;
  name: string;
  /** Siglas o inicial para el mini logotipo. Si falta, se calcula. */
  shortName?: string | null;
  logoUrl?: string | null;
  slug?: string | null;
}

export interface CourseSummary {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  category: CourseCategory;
  institution: InstitutionRef;
  modality: CourseModality;
  /** Portada real del curso. Si falta se dibuja la portada generada. */
  coverUrl?: string | null;
  /** Precio real ya formateado (p. ej. «S/ 350.00»). Si falta, no se muestra. */
  priceLabel?: string | null;
  /** Precio numérico (para ordenar en el cliente). */
  price?: number | null;
  /** Muestra la etiqueta «demo». Úsalo solo con datos de demostración. */
  isDemo?: boolean;
}

/** Variante de color para la franja de la tarjeta de institución. */
export type InstitutionAccent = 'a' | 'b' | 'c' | 'd';

export interface InstitutionSummary {
  id: string;
  slug?: string | null;
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  /** Nombres de las áreas / categorías de sus cursos. */
  areas: string[];
  publishedCoursesCount: number;
  modality?: CourseModality;
  accent?: InstitutionAccent;
  isDemo?: boolean;
}

/* ------------------------------------------------------------------ */
/* Estados y filtros                                                   */
/* ------------------------------------------------------------------ */

/** Estado de una consulta. `ready` con lista vacía = estado vacío. */
export type LoadStatus = 'loading' | 'ready' | 'error';

/** Academix: oferta_cursos no tiene fecha de publicación, así que no hay «Más recientes». */
export type CourseSort = 'az' | 'precio-asc' | 'precio-desc';
export type InstitutionSort = 'az' | 'courses';

/** Valor especial para «sin filtro». */
export const ALL = 'all' as const;

export interface CourseFilters {
  q: string;
  /** slug de la categoría o 'all' */
  category: string;
  /** id de la institución o 'all' */
  institution: string;
  sort: CourseSort;
}

export interface InstitutionFilters {
  q: string;
  /** nombre del área o 'all' */
  area: string;
  sort: InstitutionSort;
}

export interface FilterOption {
  value: string;
  label: string;
  /** Cantidad de resultados para esa opción (opcional). */
  count?: number;
  visual?: CategoryVisual;
}

/* ------------------------------------------------------------------ */
/* Rutas e inyección de Link / Image (sin acoplarse a un enrutador)    */
/* ------------------------------------------------------------------ */

/**
 * Rutas configurables. Las que llevan parámetros usan `:nombre`
 * y se resuelven con `buildHref()`.
 */
export interface PublicRoutes {
  home: string;
  courses: string;
  institutions: string;
  login: string;
  registerInstitution: string;
  /** p. ej. "/cursos/:slug" — recibe { slug, id } */
  courseDetail: string;
  /** p. ej. "/cursos?institucion=:id" — recibe { id, slug } */
  institutionCourses: string;
}

export interface LinkLikeProps {
  href: string;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-current'?: 'page' | undefined;
}
/** Compatible con `next/link` o con un simple <a>. */
export type LinkComponent = ComponentType<LinkLikeProps>;

export interface ImageLikeProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Con next/image: ocupa todo el contenedor (posición relativa). */
  fill?: boolean;
}
/** Compatible con `next/image` o con un simple <img>. */
export type ImageComponent = ComponentType<ImageLikeProps>;

export type ThemeMode = 'light' | 'dark';
