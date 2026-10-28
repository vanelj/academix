import { BookOpen, ChartLine, Code, GraduationCap, Languages, LayoutGrid, PenLine, type LucideProps } from 'lucide-react';
import type { CategoryVisual } from '../../types';

/** Icono asociado a cada variante visual de categoría. `all` = «Todas». */
export function CategoryIcon({ visual, ...props }: { visual: CategoryVisual | 'all' } & LucideProps) {
  const p = { 'aria-hidden': true, strokeWidth: 2, ...props } as LucideProps;
  switch (visual) {
    case 'all':
      return <LayoutGrid {...p} />;
    case 'tecnologia':
      return <Code {...p} />;
    case 'idiomas':
      return <Languages {...p} />;
    case 'gestion':
      return <ChartLine {...p} />;
    case 'diseno':
      return <PenLine {...p} />;
    case 'educacion':
      return <GraduationCap {...p} />;
    default:
      return <BookOpen {...p} />;
  }
}
