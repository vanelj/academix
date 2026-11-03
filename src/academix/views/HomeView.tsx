'use client';

import { CatalogPreview, type CatalogPreviewProps } from '../components/home/CatalogPreview';
import { HomeHero, type HeroImage } from '../components/home/HomeHero';
import { InstitutionalSection, type InstitutionalFeature } from '../components/home/InstitutionalSection';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { useAcademixUI } from '../context/AcademixUIProvider';
import type { CourseSummary, FilterOption, LoadStatus } from '../types';

export const defaultHeroImages: { arch: HeroImage; circle: HeroImage } = {
  arch: { src: '/academix/estudiante-en-casa.jpg', alt: 'Estudiante con audífonos toma apuntes frente a su laptop' },
  circle: { src: '/academix/estudiantes-biblioteca.jpg', alt: 'Estudiante trabajando con su laptop en una biblioteca' },
};

export interface HomeViewProps {
  featuredCourses: CourseSummary[];
  featuredStatus?: LoadStatus;
  categories?: FilterOption[];
  /** Fotos de la portada: arco grande y círculo pequeño. */
  heroImages?: { arch: HeroImage; circle: HeroImage };
  /** Etiqueta junto a «Cursos para empezar» (p. ej. «Datos de demostración»). */
  catalogFootnote?: string;
  onCategoryChange?: CatalogPreviewProps['onCategoryChange'];
  selectedCategory?: string;
  institutionalFeatures?: InstitutionalFeature[];
}

/** Página de Inicio completa (header + portada + catálogo + franja institucional + footer). */
export function HomeView({
  featuredCourses,
  featuredStatus = 'ready',
  categories,
  heroImages = defaultHeroImages,
  catalogFootnote,
  onCategoryChange,
  selectedCategory,
  institutionalFeatures,
}: HomeViewProps) {
  const { Link, Image, routes } = useAcademixUI();
  return (
    <>
      <SiteHeader routes={routes} active="home" linkComponent={Link} />
      <main>
        <HomeHero
          archImage={heroImages.arch}
          circleImage={heroImages.circle}
          coursesHref={routes.courses}
          registerHref={routes.registerInstitution}
          linkComponent={Link}
          imageComponent={Image}
        />
        <CatalogPreview
          courses={featuredCourses}
          categories={categories}
          status={featuredStatus}
          routes={routes}
          footnote={catalogFootnote}
          onCategoryChange={onCategoryChange}
          selectedCategory={selectedCategory}
          linkComponent={Link}
          imageComponent={Image}
        />
        <InstitutionalSection registerHref={routes.registerInstitution} features={institutionalFeatures} linkComponent={Link} />
      </main>
      <SiteFooter routes={routes} linkComponent={Link} />
    </>
  );
}
