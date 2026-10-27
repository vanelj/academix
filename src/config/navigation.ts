import {
  Award,
  BookCheck,
  BookOpen,
  Bookmark,
  Building2,
  CalendarClock,
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
  /** Módulo interno ya implementado (los demás se muestran como "Pendiente"). */
  disponible?: boolean
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
            title: "Pagos y mensualidades",
            href: "/admin/pagos",
            icon: CreditCard,
            description: "Verifica comprobantes, pagos y cuotas.",
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
            description: "Grupos que tienes asignados.",
          },
          {
            title: "Mis horarios",
            href: "/docente/horarios",
            icon: CalendarClock,
            description: "Sesiones y enlaces de clase de tus grupos.",
          },
          {
            title: "Mis estudiantes",
            href: "/docente/estudiantes",
            icon: UsersRound,
            description: "Estudiantes matriculados en tus grupos.",
          },
        ],
      },
      {
        title: "Evaluación",
        items: [
          {
            title: "Evaluaciones",
            href: "/docente/evaluaciones",
            icon: ClipboardPen,
            description: "Crea y organiza las evaluaciones de tus grupos.",
          },
          {
            title: "Calificaciones",
            href: "/docente/calificaciones",
            icon: BookCheck,
            description: "Registra las notas de tus estudiantes.",
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
          },
          {
            // Catálogo público: fuera del panel, con la oferta de todas las instituciones.
            title: "Explorar cursos",
            href: "/cursos",
            icon: Compass,
            description: "Descubre la oferta de cursos de las instituciones.",
          },
          {
            title: "Mis horarios",
            href: "/estudiante/horarios",
            icon: CalendarClock,
            description: "Sesiones de tus cursos.",
          },
          {
            title: "Evaluaciones y notas",
            href: "/estudiante/evaluaciones",
            icon: BookCheck,
            description: "Tus evaluaciones y calificaciones.",
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
            description: "Solicitudes de inscripción que enviaste.",
            disponible: true,
          },
          {
            title: "Mis reservas",
            href: "/estudiante/reservas",
            icon: Bookmark,
            description: "Vacantes reservadas y su fecha de vencimiento.",
          },
          {
            title: "Mis matrículas",
            href: "/estudiante/matriculas",
            icon: ClipboardCheck,
            description: "Matrículas confirmadas en cada institución.",
          },
          {
            title: "Mis pagos y cuotas",
            href: "/estudiante/pagos",
            icon: Receipt,
            description: "Pagos presentados y cuotas pendientes.",
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
