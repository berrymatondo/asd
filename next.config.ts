import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Documents jusqu’à 3 Mo + marge pour l’encodage multipart
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
