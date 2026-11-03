# Integración del diseño público «Academix Vibrant»

Rama: `feat/vibrant-ui`. Afecta solo a Inicio (`/`), Cursos (`/cursos`) e Instituciones (`/instituciones`).
El kit visual está en `src/academix/` (origen: `CURSOS-VIRTUALES/academix-ui-vibrant`); el envoltorio de página
está en `src/components/public/academix-publico.tsx`.

El diseño anterior (Creative Tech) se conserva en la rama `feat/creative-tech`, etiqueta `creative-tech-v1`
(commit `ba586d1`), y en `Desktop/respaldos/academix-creative-tech-2026-10-28.zip`.

## Identidad

- Nombre comercial: **Academix** (no «academix» en minúsculas).
- Denominación: **Plataforma de Oferta y Gestión de Cursos Virtuales**.
- Logotipo: el oficial de la plataforma (`src/components/marca/logo-academix.tsx`), también en favicon e iconos.
  El símbolo propio del kit Vibrant no se usa; `src/academix/components/ui/Logo.tsx` solo adopta su tamaño.

## Pendientes antes de publicar

### 1. Licencia de las fotografías (bloqueante)

Las dos fotografías llegaron con el diseño sin metadatos de autoría ni licencia.
**Solo se usan en pruebas locales.**

| Archivo | Uso | Recorte |
|---|---|---|
| `public/academix/estudiante-en-casa.jpg` | Arco amarillo del hero de Inicio | `66% 50%` |
| `public/academix/estudiantes-biblioteca.jpg` | Círculo del hero de Inicio y cabecera de Cursos | `74% 40%` / `76% 40%` |

`estudiantes-biblioteca.jpg` es la misma imagen que se usaba en Creative Tech (mismo hash).
Las versiones WebP del kit no se copian: `next/image` ya sirve AVIF y WebP optimizados a partir del JPG.

Antes de desplegar hay dos opciones:

- acreditar la licencia de uso de ambas;
- o sustituirlas por fotografías con licencia adecuada. Basta con cambiar `FOTOS_HERO` en
  `src/components/public/academix-secciones.tsx` (y `introImage` en Cursos).

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
