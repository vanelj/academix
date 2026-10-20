import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El logotipo institucional (máx. 2 MB) se valida y sube mediante una acción
      // de servidor; el límite por defecto es 1 MB. Se deja margen para la
      // sobrecarga de multipart/form-data. La validación real del tamaño (2 MB)
      // la hacen la acción y el bucket de Storage.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
