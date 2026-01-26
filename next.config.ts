// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase (giữ lại nếu còn dùng)
      {
        protocol: 'https',
        hostname: 'scjzycloubqarxxvqohu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },

      // ✅ Cloudflare R2 (thêm)
      {
        protocol: 'https',
        hostname: 'rooms-media.be9092fbc5b7c1f70bb28a7dab36f050.r2.cloudflarestorage.com',
        pathname: '/**',
      },

      // (tuỳ chọn) nếu sau này đổi bucket/account mà không muốn sửa code:
      // {
      //   protocol: 'https',
      //   hostname: '*.r2.cloudflarestorage.com',
      //   pathname: '/**',
      // },
    ],
  },

  experimental: {
    middlewareClientMaxBodySize: '50mb',
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
}

export default nextConfig
