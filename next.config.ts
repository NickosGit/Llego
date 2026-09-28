import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // El PACKET (T1) nombra la ruta en inglés; la app usa /corredor.
    return [{ source: "/corridor", destination: "/corredor", permanent: false }];
  },
};

export default nextConfig;
