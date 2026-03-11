/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'interaktprodmediastorage.blob.core.windows.net' },
      { protocol: 'https', hostname: 'scontent.whatsapp.net' },
    ],
  },
}

export default nextConfig
