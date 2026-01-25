// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'scjzycloubqarxxvqohu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  experimental: {
    // ✅ cái đúng theo log của bạn (tăng limit cho request body client -> server)
    middlewareClientMaxBodySize: '50mb',

    // (không bắt buộc cho route handler, nhưng giữ lại cũng không sao)
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
}

export default nextConfig
