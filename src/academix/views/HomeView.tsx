'use client';

import { CatalogPreview, type CatalogPreviewProps } from '../components/home/CatalogPreview';
import { HomeHero } from '../components/home/HomeHero';
import { InstitutionalSection } from '../components/home/InstitutionalSection';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { useAcademixUI } from '../context/AcademixUIProvider';
import type { CourseSummary, FilterOption, LoadStatus } from '../types';

export interface HomeViewProps {
  featuredCourses: CourseSummary[];
  featuredStatus?: LoadStatus;
  categories?: FilterOption[];
  heroImage?: { src: string; alt: string };
  /** Nota bajo el catálogo (p. ej. aviso de datos de demostración). */
  catalogFootnote?: string;
  onCategoryChange?: CatalogPreviewProps['onCategoryChange'];
  selectedCategory?: string;
}

/** Página de Inicio completa (header + 3 secciones + footer). */
export function HomeView({
  featuredCourses,
  featuredStatus = 'ready',
  categories,
  heroImage = { src: '/academix/hero-estudiantes-biblioteca.jpg', alt: 'Estudiantes trabajando con sus laptops en una biblioteca' },
  catalogFootnote,
  onCategoryChange,
  selectedCategory,
}: HomeViewProps) {
  const { Link, Image, routes } = useAcademixUI();
  return (
    <>
      <SiteHeader routes={routes} active="home" linkComponent={Link} />
      <main>
        <HomeHero
          image={heroImage}
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
        <InstitutionalSection registerHref={routes.registerInstitution} linkComponent={Link} />
      </main>
      <SiteFooter routes={routes} linkComponent={Link} />
    </>
  );
}
