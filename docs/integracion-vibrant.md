# Integración del diseño público «Creative Tech»

Rama: `feat/creative-tech`. Afecta solo a Inicio (`/`), Cursos (`/cursos`) e Instituciones (`/instituciones`).
El kit visual está en `src/academix/`; el envoltorio de página está en `src/components/public/academix-publico.tsx`.

## Pendientes antes de publicar

### 1. Licencia de la fotografía del hero (bloqueante)

`public/academix/hero-estudiantes-biblioteca.jpg` llegó con el diseño sin metadatos de autoría ni licencia.
**Solo se usa en pruebas locales.**

Antes de desplegar hay dos opciones:

- acreditar la licencia de uso;
- o sustituirla por otra fotografía con licencia adecuada. Basta con cambiar `FOTO_HERO` en
  `src/components/public/academix-secciones.tsx`; el recorte usa `object-position: 72% 40%`.

### 2. Carga del catálogo cuando crezca el volumen de cursos

Hoy, Inicio y Cursos leen **toda** la vista `oferta_cursos` en cada petición:

- **Inicio** la envía completa al navegador para que los chips de categoría filtren sobre toda la oferta. Muestra 4 cursos.
- **Cursos** filtra y ordena en el servidor con `filtrarCursos` y `ordenarCursos`. La búsqueda en nombre, descripción,
  categoría e institución, sin distinguir tildes, es la del catálogo anterior.

Con decenas de cursos esto es adecuado. Cuando la oferta llegue a cientos de cursos conviene:

- **En Inicio:** enviar solo los cursos visibles por categoría (por ejemplo, 4 por categoría) en lugar de toda la oferta.
- **En Cursos:**
  - llevar los filtros a la consulta (`.eq('categoria_id')`, `.eq('institucion_id')`, `.order('precio')`);
  - añadir paginación con `.range()` y `totalCount` en `CoursesView`;
  - la búsqueda sin tildes requeriría `unaccent` o una RPC.
- **Conteos de categorías:** calcularlos con una vista o RPC agregada.

Estos cambios no son necesarios todavía y algunos requieren migraciones, por lo que quedan solo documentados.

### 3. Orden del catálogo

- **Por defecto:** Nombre A–Z.
- **Por precio:** de menor a mayor y de mayor a menor. `cursos.precio` es `numeric(10,2) not null check (precio >= 0)`.
- **«Más recientes» no se ofrece:** `oferta_cursos` no expone fecha de publicación.

## Parámetros de URL de `/cursos`

| Parámetro | Valor |
|---|---|
| `q` | Texto de búsqueda |
| `categoria` | Id de la categoría |
| `institucion` | Id de la institución |
| `orden` | Se omite para A–Z; `precio` o `precio-desc` para ordenar por precio |

## Parámetros de URL de `/instituciones`

| Parámetro | Valor |
|---|---|
| `q` | Búsqueda por nombre, sin distinguir tildes |
| `area` | Nombre de una categoría de sus cursos publicados; si ya no existe, se ignora |
| `orden` | Se omite para A–Z; `cursos` ordena por número real de cursos publicados |

El directorio solo muestra instituciones activas con al menos un curso publicado, porque los datos salen de `oferta_cursos`.
No se muestran descripción, siglas ni acreditaciones, porque la vista no las expone.

## Historial del navegador (Cursos e Instituciones)

`src/components/public/usar-filtros-url.ts` gestiona el historial:

- Cada cambio confirmado de filtro, orden o «Limpiar» crea una entrada, así que «Atrás» los recorre uno a uno.
- La búsqueda escrita crea una sola entrada por búsqueda. Las siguientes pulsaciones la reemplazan y vaciarla crea una entrada nueva.

Mientras llegan los datos, el respaldo de carga de `<Suspense>` es `inert`. Es otra instancia de la vista, y lo que se escribiera en ella se perdería.
