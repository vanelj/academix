import { PlainImage } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import { getCategoryVisual } from '../../lib/visuals';
import type { CourseCategory, ImageComponent } from '../../types';
import { CategoryIcon } from '../ui/CategoryIcon';

export interface CourseCoverProps {
  category: CourseCategory;
  coverUrl?: string | null;
  alt?: string;
  imageComponent?: ImageComponent;
  /** Alto en px (Inicio 150, catálogo 140). */
  height?: number;
  className?: string;
}

/**
 * Portada del curso. Con `coverUrl` muestra la imagen real; sin ella dibuja
 * la portada generada de su categoría (fondo pastel + formas + icono).
 */
export function CourseCover({ category, coverUrl, alt = '', imageComponent: Img = PlainImage, height = 140, className }: CourseCoverProps) {
  const visual = getCategoryVisual(category);
  if (coverUrl) {
    return (
      <div className={cn('relative overflow-hidden rounded-2xl bg-ax-surface-2', className)} style={{ height }}>
        <Img src={coverUrl} alt={alt} fill sizes="(max-width: 900px) 100vw, 320px" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div aria-hidden className={cn('ax-cover rounded-2xl', `ax-cover--${visual}`, className)} style={{ height }}>
      <span className="ax-cover-icon">
        <CategoryIcon visual={visual} size={26} />
      </span>
    </div>
  );
}
