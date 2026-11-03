import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent, PublicRoutes } from '../../types';
import { ButtonLink } from '../ui/Button';
import { AcademixLogo } from '../ui/Logo';

export interface SiteFooterProps {
  routes: PublicRoutes;
  linkComponent?: LinkComponent;
}

// Año en la zona horaria de la plataforma: servidor y navegador calculan lo mismo,
// así que no hay diferencias de hidratación (salvo el instante exacto de Año Nuevo,
// cubierto con suppressHydrationWarning).
const anioActual = () => new Intl.DateTimeFormat('es-PE', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date());

const titulo = 'text-sm font-bold uppercase tracking-[0.08em] text-ax-yellow';
const enlace = 'inline-flex min-h-8 items-center text-[15.5px] font-semibold text-ax-band-text no-underline transition-colors hover:text-white';

/**
 * Pie de página Vibrant: banda índigo (como «Para instituciones») en los dos
 * temas, con identidad, enlaces reales, llamado para instituciones y derechos.
 * Sin enlaces legales: Academix aún no tiene páginas de privacidad ni de términos.
 */
export function SiteFooter({ routes, linkComponent: L = AnchorLink }: SiteFooterProps) {
  const explorar = [
    { label: 'Inicio', href: routes.home },
    { label: 'Cursos', href: routes.courses },
    { label: 'Instituciones', href: routes.institutions },
    { label: 'Iniciar sesión', href: routes.login },
  ];

  return (
    <footer className="ax-footer relative overflow-hidden bg-ax-band text-white">
      <div aria-hidden className="absolute -right-[70px] -top-[70px] h-[180px] w-[180px] rounded-full border-[24px] border-ax-yellow opacity-90 max-[620px]:hidden" />

      <div className="relative mx-auto max-w-[1240px] px-5 pb-8 pt-14">
        <div className="grid grid-cols-1 gap-10 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-[1.3fr_0.7fr_1fr] min-[1000px]:gap-14">
          {/* Identidad */}
          <div className="flex flex-col gap-3.5 min-[640px]:col-span-2 min-[1000px]:col-span-1">
            <L href={routes.home} aria-label="Academix, ir al inicio" className="self-start text-white no-underline">
              <AcademixLogo />
            </L>
            <p className="font-bold text-ax-yellow">Plataforma de Oferta y Gestión de Cursos Virtuales</p>
            <p className="max-w-[380px] text-[15.5px] text-ax-band-text text-pretty">
              Conectamos instituciones, docentes y estudiantes en un entorno digital de formación.
            </p>
          </div>

          {/* Explorar */}
          <nav aria-labelledby="ax-footer-explorar" className="flex flex-col gap-3">
            <h2 id="ax-footer-explorar" className={titulo}>
              Explorar
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
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
            <h2 className={titulo}>Para instituciones</h2>
            <p className="max-w-[360px] text-[15.5px] text-ax-band-text text-pretty">
              Organiza tus cursos virtuales, docentes, estudiantes e inscripciones desde un solo lugar.
            </p>
            <ButtonLink href={routes.registerInstitution} variant="yellow" size="sm" linkComponent={L} className="mt-1">
              Registrar institución
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 border-t border-white/15 pt-6 text-sm text-ax-band-text">
          <p>
            © <span suppressHydrationWarning>{anioActual()}</span> Academix. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
