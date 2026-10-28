/* Academix · Creative Tech — punto de entrada público del kit */

// Tipos y constantes
export * from './types';
export { defaultRoutes, buildHref } from './config/routes';

// Utilidades
export { cn } from './lib/cn';
export { getCategoryVisual, getInstitutionAccent, getInitials } from './lib/visuals';
export * from './lib/filters';

// Contexto y tema (cliente)
export { AcademixUIProvider, useAcademixUI, AnchorLink, PlainImage } from './context/AcademixUIProvider';
export { PublicShell, useAcademixTheme } from './components/layout/PublicShell';
export { useDebouncedValue } from './hooks/useDebouncedValue';

// Layout
export { SiteHeader } from './components/layout/SiteHeader';
export { SiteFooter } from './components/layout/SiteFooter';
export { PageIntro } from './components/layout/PageIntro';

// UI base
export { Button, ButtonLink, buttonClasses } from './components/ui/Button';
export { ModalityBadge, DemoTag, AreaTag, MonoLabel } from './components/ui/Tags';
export { CategoryIcon } from './components/ui/CategoryIcon';
export { StatePanel } from './components/ui/StatePanel';
export { SearchField, SelectField, FieldLabel } from './components/ui/Fields';
export { AcademixMark } from './components/ui/Logo';
export { Skeleton } from './components/ui/Skeleton';

// Inicio
export { HomeHero } from './components/home/HomeHero';
export { CatalogPreview } from './components/home/CatalogPreview';
export { InstitutionalSection } from './components/home/InstitutionalSection';

// Cursos
export { CourseCard, CourseCardSkeleton } from './components/courses/CourseCard';
export { CourseCover } from './components/courses/CourseCover';
export { CourseResults } from './components/courses/CourseResults';
export { CourseFiltersPanel } from './components/courses/CourseFiltersPanel';
export { CoursesToolbar } from './components/courses/CoursesToolbar';

// Instituciones
export { InstitutionCard, InstitutionCardSkeleton } from './components/institutions/InstitutionCard';
export { InstitutionResults } from './components/institutions/InstitutionResults';
export { InstitutionsCta } from './components/institutions/InstitutionsCta';

// Páginas completas (cliente)
export { HomeView } from './views/HomeView';
export { CoursesView } from './views/CoursesView';
export { InstitutionsView } from './views/InstitutionsView';
