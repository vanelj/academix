import { PlainImage } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import { getCategoryVisual } from '../../lib/visuals';
import type { CourseCategory, ImageComponent } from '../../types';
import { CategoryIcon } from '../ui/CategoryIcon';

export interface CourseCoverProps {
  category: CourseCategory;
  coverUrl?: string | null;
  /** Texto alternativo si hay imagen real. */
  alt?: string;
  imageComponent?: ImageComponent;
  className?: string;
}

/**
 * Portada del curso. Con `coverUrl` muestra la imagen real;
 * sin ella dibuja la portada generada de la categoría (degradado + retícula + icono).
 */
export function CourseCover({ category, coverUrl, alt = '', imageComponent: Img = PlainImage, className }: CourseCoverProps) {
  const visual = getCategoryVisual(category);
  if (coverUrl) {
    return (
      <div className={cn('relative h-[140px] overflow-hidden bg-ax-surface-2', className)}>
        <Img src={coverUrl} alt={alt} fill sizes="(max-width: 900px) 100vw, 320px" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div aria-hidden className={cn('ax-cover h-[140px]', `ax-cover--${visual}`, className)}>
      <span className="absolute left-[18px] top-[18px] z-[1] flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-white/95 text-[#2F4BE0]">
        <CategoryIcon visual={visual} size={22} />
      </span>
      <span className="absolute bottom-3.5 left-[18px] z-[1] font-ax-mono text-[12.5px] text-white/90">
        {category.name.toLowerCase()}
      </span>
    </div>
  );
}
