import {
  Award,
  BookCheck,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardPen,
  Compass,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  Presentation,
  Receipt,
  ScrollText,
  Tags,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

export type Role = "admin" | "docente" | "estudiante"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  description?: string
  /** Módulo interno ya implementado (los demás se muestran como «En preparación»). */
  disponible?: boolean
  /** Sección ya disponible donde, mientras tanto, se consulta esa información. */
  mientras?: { titulo: string; href: string }
}

export type NavSection = {
  title?: string
  items: NavItem[]
}

export type RoleConfig = {
  label: string
  basePath: `/${string}`
  sections: NavSection[]
}

export const roleConfig: Record<Role, RoleConfig> = {
  admin: {
    label: "Administrador",
    basePath: "/admin",
    sections: [
      {
        items: [
          {
            title: "Resumen institucional",
            href: "/admin",
            icon: LayoutDashboard,
            description: "Estado general de la institución.",
          },
        ],
      },
      {
        title: "Oferta académica",
        items: [
          {
            title: "Categorías",
            href: "/admin/categorias",
            icon: Tags,
            description: "Organiza los cursos por áreas temáticas.",
            disponible: true,
          },
          {
            title: "Cursos",
            href: "/admin/cursos",
            icon: BookOpen,
            description: "Administra la oferta de cursos virtuales y sus condiciones.",
            disponible: true,
          },
          {
            title: "Docentes",
            href: "/admin/docentes",
            icon: Presentation,
            description: "Gestiona el personal docente de la institución.",
            disponible: true,
          },
          {
            title: "Grupos y horarios",
            href: "/admin/grupos",
            icon: CalendarRange,
            description: "Abre grupos, asigna docentes y define sus horarios.",
            disponible: true,
          },
          {
            title: "Calendario académico",
            href: "/admin/calendario",
            icon: CalendarDays,
            description: "Malla semanal de todos los grupos de la institución.",
            disponible: true,
          },
        ],
      },
      {
        title: "Inscripciones",
        items: [
          {
            title: "Estudiantes",
            href: "/admin/estudiantes",
            icon: Users,
            description: "Consulta a los estudiantes de la institución.",
            disponible: true,
          },
          {
            title: "Solicitudes y reservas",
            href: "/admin/solicitudes",
            icon: Inbox,
            description: "Revisa las solicitudes de inscripción y las reservas de vacantes.",
            disponible: true,
          },
          {
            title: "Matrículas",
            href: "/admin/matriculas",
            icon: ClipboardCheck,
            description: "Controla las matrículas de cada grupo.",
            disponible: true,
          },
          {
            title: "Pagos",
            href: "/admin/pagos",
            icon: CreditCard,
            description: "Verifica los comprobantes de las compras de cursos y certificados.",
            disponible: true,
          },
        ],
      },
      {
        title: "Seguimiento académico",
        items: [
          {
            title: "Evaluaciones",
            href: "/admin/evaluaciones",
            icon: ClipboardPen,
            description: "Supervisa las evaluaciones de los grupos.",
            disponible: true,
          },
          {
            title: "Certificados",
            href: "/admin/certificados",
            icon: Award,
            description: "Emite los certificados de los cursos aprobados.",
            disponible: true,
          },
        ],
      },
      {
        title: "Configuración institucional",
        items: [
          {
            title: "Mi institución",
            href: "/admin/institucion",
            icon: Building2,
            description: "Nombre, RUC y datos de contacto de la institución.",
            disponible: true,
          },
          {
            title: "Políticas institucionales",
            href: "/admin/politicas",
            icon: ScrollText,
            description: "Define los textos de matrícula, reservas, pagos y devoluciones.",
            disponible: true,
          },
          {
            title: "Equipo administrativo",
            href: "/admin/equipo",
            icon: ShieldCheck,
            description: "Administradores de la institución y sus permisos.",
            disponible: true,
          },
        ],
      },
    ],
  },
  docente: {
    label: "Docente",
    basePath: "/docente",
    sections: [
      {
        items: [
          {
            title: "Inicio",
            href: "/docente",
            icon: LayoutDashboard,
            description: "Resumen de tus grupos.",
          },
        ],
      },
      {
        title: "Enseñanza",
        items: [
          {
            title: "Mis grupos",
            href: "/docente/grupos",
            icon: LibraryBig,
            description: "Grupos asignados, con horarios, estudiantes y avance de notas.",
            disponible: true,
          },
          {
            title: "Mis horarios",
            href: "/docente/horarios",
            icon: CalendarClock,
            description: "Tus clases de la semana y sus enlaces.",
            disponible: true,
          },
          {
            title: "Mis estudiantes",
            href: "/docente/estudiantes",
            icon: UsersRound,
            description: "Estudiantes matriculados en tus grupos.",
            disponible: true,
          },
        ],
      },
      {
        title: "Evaluación",
        items: [
          {
            title: "Evaluaciones y notas",
            href: "/docente/calificaciones",
            icon: BookCheck,
            description: "Evaluaciones de tus grupos y registro de calificaciones.",
            disponible: true,
          },
        ],
      },
    ],
  },
  estudiante: {
    label: "Estudiante",
    basePath: "/estudiante",
    sections: [
      {
        items: [
          {
            title: "Inicio",
            href: "/estudiante",
            icon: LayoutDashboard,
            description: "Resumen de tu aprendizaje.",
          },
        ],
      },
      {
        title: "Mi aprendizaje",
        items: [
          {
            title: "Mis cursos",
            href: "/estudiante/cursos",
            icon: LibraryBig,
            description: "Cursos en los que estás matriculado, de cualquier institución.",
            disponible: true,
          },
          {
            // Catálogo único (/cursos): conserva la sesión, marca los cursos propios y
            // su cabecera ofrece «Inicio» y «Mi panel».
            title: "Explorar cursos",
            href: "/cursos",
            icon: Compass,
            description: "Descubre la oferta de cursos de las instituciones.",
            disponible: true,
          },
          {
            title: "Mis horarios",
            href: "/estudiante/horarios",
            icon: CalendarClock,
            description: "Tus clases de la semana, de todas tus instituciones.",
            disponible: true,
          },
          {
            title: "Evaluaciones y notas",
            href: "/estudiante/evaluaciones",
            icon: BookCheck,
            description: "Tus evaluaciones, notas y resultados.",
            disponible: true,
          },
          {
            title: "Mis certificados",
            href: "/estudiante/certificados",
            icon: Award,
            description: "Certificados de los cursos que aprobaste.",
            disponible: true,
          },
        ],
      },
      {
        title: "Inscripciones y pagos",
        items: [
          {
            title: "Mis solicitudes",
            href: "/estudiante/solicitudes",
            icon: Inbox,
            description: "Compras e inscripciones en trámite (y reservas anteriores).",
            disponible: true,
          },
          {
            title: "Mis compras y pagos",
            href: "/estudiante/pagos",
            icon: Receipt,
            description: "Cursos comprados, pagos pendientes y comprobantes.",
            disponible: true,
          },
        ],
      },
    ],
  },
}

/** Títulos de páginas del panel que no están en el menú lateral. */
export const extraPageTitles: Record<string, string> = {
  perfil: "Mi perfil",
}

export function getNavItems(role: Role): NavItem[] {
  return roleConfig[role].sections.flatMap((section) => section.items)
}

/** La raíz del rol solo se activa con coincidencia exacta; el resto por prefijo. */
export function isNavItemActive(
  item: NavItem,
  pathname: string,
  role: Role
): boolean {
  if (item.href === roleConfig[role].basePath) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function getActiveNavItem(
  role: Role,
  pathname: string
): NavItem | undefined {
  return getNavItems(role).find((item) => isNavItemActive(item, pathname, role))
}
