import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bibliothèques de génération de rapports, chargées telles quelles côté serveur
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  experimental: {
    // Fichiers envoyés un par un : 4 Mo max + marge pour l’encodage multipart
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
