import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent, PublicRoutes } from '../../types';
import { ButtonLink } from '../ui/Button';
import { AcademixMark } from '../ui/Logo';

export interface SiteFooterProps {
  routes: PublicRoutes;
  linkComponent?: LinkComponent;
}

// Año en la zona horaria de la plataforma: servidor y navegador calculan lo mismo,
// así que no hay diferencias de hidratación (salvo el instante exacto de Año Nuevo,
// cubierto con suppressHydrationWarning).
const anioActual = () => new Intl.DateTimeFormat('es-PE', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date());

const titulo = 'font-ax-mono text-[13px] tracking-[0.02em] text-ax-periwinkle';
const enlace = 'inline-flex min-h-8 items-center text-[15px] text-ax-band-text no-underline transition-colors hover:text-white';

/**
 * Pie de página Creative Tech: banda oscura (como la sección institucional) en
 * los dos temas, con identidad, enlaces, llamado para instituciones y derechos.
 * Sin enlaces legales: Academix aún no tiene páginas de privacidad ni de términos.
 */
export function SiteFooter({ routes, linkComponent: L = AnchorLink }: SiteFooterProps) {
  const explorar = [
    { label: 'Inicio', href: routes.home },
    { label: 'Cursos virtuales', href: routes.courses },
    { label: 'Instituciones', href: routes.institutions },
    { label: 'Iniciar sesión', href: routes.login },
  ];

  return (
    <footer className="ax-footer relative overflow-hidden bg-ax-night text-[#E9ECFA]">
      <div aria-hidden className="ax-band-grid ax-band-grid--fade" />
      <div aria-hidden className="ax-band-glow -top-[60%] left-[8%] h-[90%] w-[45%] opacity-60" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--ax-blue)_30%,var(--ax-violet)_70%,transparent)]"
      />

      <div className="relative mx-auto max-w-[1240px] px-5 pb-8 pt-14">
        <div className="grid grid-cols-1 gap-10 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-[1.3fr_0.7fr_1fr] min-[1000px]:gap-14">
          {/* Identidad */}
          <div className="flex flex-col gap-3.5 min-[640px]:col-span-2 min-[1000px]:col-span-1">
            <L href={routes.home} aria-label="Academix, ir al inicio" className="flex items-center gap-2.5 self-start text-white no-underline">
              <AcademixMark />
              <span className="font-ax-display text-xl font-bold tracking-[-0.03em]">Academix</span>
            </L>
            <p className={titulo}>Plataforma de Oferta y Gestión de Cursos Virtuales</p>
            <p className="max-w-[380px] text-[15px] text-ax-band-text text-pretty">
              Conectamos instituciones, docentes y estudiantes en un entorno digital de formación.
            </p>
          </div>

          {/* Explorar */}
          <nav aria-labelledby="ax-footer-explorar" className="flex flex-col gap-3">
            <h2 id="ax-footer-explorar" className={titulo}>
              explorar
            </h2>
            <ul className="flex flex-col gap-1">
              {explorar.map((e) => (
                <li key={e.label}>
                  <L href={e.href} className={enlace}>
                    {e.label}
                  </L>
                </li>
              ))}
            </ul>
          </nav>

          {/* Para instituciones */}
          <div className="flex flex-col items-start gap-3">
            <h2 className={titulo}>para instituciones</h2>
            <p className="max-w-[360px] text-[15px] text-ax-band-text text-pretty">
              Organiza tus cursos virtuales, docentes, estudiantes e inscripciones desde un solo lugar.
            </p>
            <ButtonLink href={routes.registerInstitution} size="sm" linkComponent={L} className="mt-1">
              Registrar institución
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-sm text-ax-band-muted">
          <p>
            © <span suppressHydrationWarning>{anioActual()}</span> Academix. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
