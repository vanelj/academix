'use client';

/**
 * Inyecta Link, Image y rutas sin acoplar los componentes a Next.js.
 * En la app: <AcademixUIProvider LinkComponent={Link} ImageComponent={NextImage} routes={…}>
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultRoutes } from '../config/routes';
import type { ImageComponent, ImageLikeProps, LinkComponent, LinkLikeProps, PublicRoutes } from '../types';

export function AnchorLink({ href, className, children, ...rest }: LinkLikeProps) {
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

export function PlainImage({ src, alt, className, priority }: ImageLikeProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={priority ? 'eager' : 'lazy'} decoding="async" />;
}

interface AcademixUIValue {
  Link: LinkComponent;
  Image: ImageComponent;
  routes: PublicRoutes;
}

const Ctx = createContext<AcademixUIValue>({ Link: AnchorLink, Image: PlainImage, routes: defaultRoutes });

export interface AcademixUIProviderProps {
  children: ReactNode;
  LinkComponent?: LinkComponent;
  ImageComponent?: ImageComponent;
  routes?: Partial<PublicRoutes>;
}

export function AcademixUIProvider({ children, LinkComponent, ImageComponent, routes }: AcademixUIProviderProps) {
  const value = useMemo<AcademixUIValue>(
    () => ({
      Link: LinkComponent ?? AnchorLink,
      Image: ImageComponent ?? PlainImage,
      routes: { ...defaultRoutes, ...routes },
    }),
    [LinkComponent, ImageComponent, routes],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAcademixUI(): AcademixUIValue {
  return useContext(Ctx);
}
