import type { CategoryVisual, CourseCategory, InstitutionAccent } from '../types';

const normalize = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Deduce la portada generada a partir del slug o nombre de la categoría. */
export function getCategoryVisual(category: Pick<CourseCategory, 'slug' | 'name' | 'visual'>): CategoryVisual {
  if (category.visual) return category.visual;
  const key = normalize(`${category.slug} ${category.name}`);
  if (/tecno|program|datos|software|inform|sistem/.test(key)) return 'tecnologia';
  if (/idiom|ingles|portug|lengua|frances/.test(key)) return 'idiomas';
  if (/gesti|negoc|admin|empres|finanz|contab/.test(key)) return 'gestion';
  if (/disen|arte|grafic|creativ|ux|ui/.test(key)) return 'diseno';
  if (/educa|docen|pedag|ensen/.test(key)) return 'educacion';
  return 'general';
}

/** Asigna una franja de color estable a una institución según su id. */
export function getInstitutionAccent(id: string, accent?: InstitutionAccent): InstitutionAccent {
  if (accent) return accent;
  const list: InstitutionAccent[] = ['a', 'b', 'c', 'd'];
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/** Siglas para el mini logotipo cuando no hay imagen. */
export function getInitials(name: string, shortName?: string | null): string {
  if (shortName) return shortName.slice(0, 3);
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]$/.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || name.slice(0, 2)).toUpperCase();
}

/** Color del punto de cada categoría (chips y filtros, estilo Vibrant). */
export function getCategoryDotColor(visual: CategoryVisual | 'all'): string {
  switch (visual) {
    case 'tecnologia':
      return '#6C3BF5';
    case 'idiomas':
      return '#FF6B5B';
    case 'gestion':
      return '#2EC4A0';
    case 'diseno':
      return '#FFC93C';
    case 'educacion':
      return '#2EC4A0';
    case 'all':
      return '#8A82B8';
    default:
      return '#8A82B8';
  }
}
