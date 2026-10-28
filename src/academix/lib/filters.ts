/**
 * Utilidades puras de filtrado y orden.
 * - Sirven para filtrar en el cliente (datos demo o listas pequeñas).
 * - Con Supabase, aplica los mismos filtros en la consulta (ver docs) y
 *   usa solo los helpers de parámetros de URL.
 */
import {
  ALL,
  type CourseFilters,
  type CourseSort,
  type CourseSummary,
  type FilterOption,
  type InstitutionFilters,
  type InstitutionSummary,
} from '../types';

export const defaultCourseFilters: CourseFilters = { q: '', category: ALL, institution: ALL, sort: 'az' };
export const defaultInstitutionFilters: InstitutionFilters = { q: '', area: ALL, sort: 'az' };

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filterCourses(courses: CourseSummary[], f: CourseFilters): CourseSummary[] {
  const q = norm(f.q.trim());
  const list = courses.filter(
    (c) =>
      (f.category === ALL || c.category.slug === f.category) &&
      (f.institution === ALL || c.institution.id === f.institution) &&
      (!q || norm(`${c.title} ${c.institution.name}`).includes(q)),
  );
  const az = (a: CourseSummary, b: CourseSummary) => a.title.localeCompare(b.title, 'es');
  const precio = (c: CourseSummary) => c.price ?? 0;
  if (f.sort === 'precio-asc') return [...list].sort((a, b) => precio(a) - precio(b) || az(a, b));
  if (f.sort === 'precio-desc') return [...list].sort((a, b) => precio(b) - precio(a) || az(a, b));
  return [...list].sort(az);
}

/** Opciones de categoría con conteo (respeta búsqueda e institución, no la categoría). */
export function courseCategoryOptions(courses: CourseSummary[], f: CourseFilters): FilterOption[] {
  const base = filterCourses(courses, { ...f, category: ALL, sort: 'az' });
  const map = new Map<string, FilterOption>();
  courses.forEach((c) => {
    if (!map.has(c.category.slug)) {
      map.set(c.category.slug, { value: c.category.slug, label: c.category.name, count: 0, visual: c.category.visual });
    }
  });
  base.forEach((c) => {
    const o = map.get(c.category.slug);
    if (o) o.count = (o.count ?? 0) + 1;
  });
  return [{ value: ALL, label: 'Todas', count: base.length }, ...map.values()];
}

export function courseInstitutionOptions(courses: CourseSummary[]): FilterOption[] {
  const map = new Map<string, FilterOption>();
  courses.forEach((c) => map.set(c.institution.id, { value: c.institution.id, label: c.institution.name }));
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function filterInstitutions(list: InstitutionSummary[], f: InstitutionFilters): InstitutionSummary[] {
  const q = norm(f.q.trim());
  const res = list.filter((i) => (f.area === ALL || i.areas.includes(f.area)) && (!q || norm(i.name).includes(q)));
  return [...res].sort(
    f.sort === 'courses'
      ? (a, b) => b.publishedCoursesCount - a.publishedCoursesCount || a.name.localeCompare(b.name, 'es')
      : (a, b) => a.name.localeCompare(b.name, 'es'),
  );
}

export function institutionAreaOptions(list: InstitutionSummary[]): FilterOption[] {
  const areas = [...new Set(list.flatMap((i) => i.areas))].sort((a, b) => a.localeCompare(b, 'es'));
  return areas.map((a) => ({ value: a, label: a }));
}

/* ---------------- Parámetros de URL (para Server Components) ---------------- */

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Lee ?q=&categoria=&institucion=&orden= */
export function parseCourseSearchParams(sp: SearchParams): CourseFilters {
  const orden = first(sp.orden);
  const sort: CourseSort = orden === 'precio' ? 'precio-asc' : orden === 'precio-desc' ? 'precio-desc' : 'az';
  return {
    q: first(sp.q),
    category: first(sp.categoria) || ALL,
    institution: first(sp.institucion) || ALL,
    sort,
  };
}

export function courseFiltersToSearchParams(f: CourseFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.category !== ALL) p.set('categoria', f.category);
  if (f.institution !== ALL) p.set('institucion', f.institution);
  if (f.sort === 'precio-asc') p.set('orden', 'precio');
  if (f.sort === 'precio-desc') p.set('orden', 'precio-desc');
  return p;
}

/** Lee ?q=&area=&orden= */
export function parseInstitutionSearchParams(sp: SearchParams): InstitutionFilters {
  return { q: first(sp.q), area: first(sp.area) || ALL, sort: first(sp.orden) === 'cursos' ? 'courses' : 'az' };
}

export function institutionFiltersToSearchParams(f: InstitutionFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.area !== ALL) p.set('area', f.area);
  if (f.sort === 'courses') p.set('orden', 'cursos');
  return p;
}
