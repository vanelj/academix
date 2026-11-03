/* Academix · Vibrant — punto de entrada público del kit (Inicio, Cursos, Instituciones) */

// Tipos y constantes
export * from './types';
export { defaultRoutes, buildHref } from './config/routes';

// Utilidades
export { cn } from './lib/cn';
export { getCategoryVisual, getCategoryDotColor, getInstitutionAccent, getInitials } from './lib/visuals';
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
export { ModalityBadge, DemoTag, AreaTag, FieldLabel, Highlight, Sparkle } from './components/ui/Tags';
export { CategoryIcon } from './components/ui/CategoryIcon';
export { StatePanel } from './components/ui/StatePanel';
export { SearchField, SelectField } from './components/ui/Fields';
export { AcademixMark, AcademixLogo } from './components/ui/Logo';
export { Skeleton } from './components/ui/Skeleton';

// Inicio
export { HomeHero, type HeroImage } from './components/home/HomeHero';
export { CatalogPreview } from './components/home/CatalogPreview';
export { InstitutionalSection, defaultInstitutionalFeatures, type InstitutionalFeature } from './components/home/InstitutionalSection';

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
export { HomeView, defaultHeroImages } from './views/HomeView';
export { CoursesView } from './views/CoursesView';
export { InstitutionsView } from './views/InstitutionsView';
