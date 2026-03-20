/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',      // ← genera la carpeta /out estática
    trailingSlash: true,
    images: {
        unoptimized: true,   // ← necesario para export estático
    },
};
module.exports = nextConfig;
