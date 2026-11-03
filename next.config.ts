import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las rutas.
// La CSP es deliberadamente acotada: protege contra clickjacking, inyección de <base>,
// envío de formularios a otros dominios y plugins. No restringe scripts ni estilos
// porque Next y el script de tema del layout usan código en línea; una CSP completa
// con nonces queda documentada como pendiente (docs/auditoria-2026-10-31.md).
const cabecerasSeguridad = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  // Equivalente a frame-ancestors para navegadores antiguos.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Solo el dominio actual (sin includeSubDomains: mundosubs.net.pe tiene otros subdominios).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

// Portadas de cursos (y logotipos) servidas desde Storage del propio proyecto Supabase.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname
  } catch {
    return null
  }
})()

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: supabaseHost
    ? { remotePatterns: [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] }
    : undefined,
  experimental: {
    serverActions: {
      // El logotipo institucional (máx. 2 MB) se valida y sube mediante una acción
      // de servidor; el límite por defecto es 1 MB. Se deja margen para la
      // sobrecarga de multipart/form-data. La validación real del tamaño (2 MB)
      // la hacen la acción y el bucket de Storage.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
