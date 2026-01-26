// next.config.ts
import type { NextConfig } from 'next'

const r2Base = process.env.R2_PUBLIC_BASE_URL ?? ''
let r2Hostname = ''
try {
  if (r2Base) r2Hostname = new URL(r2Base).hostname
} catch {}

// ✅ ép kiểu để TS hiểu đúng RemotePattern (protocol phải là literal)
const dynamicPatterns = r2Hostname
  ? [
      {
        protocol: 'https' as const,
        hostname: r2Hostname,
        pathname: '/**',
      },
    ]
  : []

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...dynamicPatterns,

      // (tuỳ chọn) nếu sau này đổi bucket/account mà không muốn sửa code:
      // {
      //   protocol: 'https' as const,
      //   hostname: '*.r2.cloudflarestorage.com',
      //   pathname: '/**',
      // },
    ],
  },

  experimental: {
  proxyClientMaxBodySize: '50mb',
  serverActions: {
    bodySizeLimit: '50mb',
  },
},

}

export default nextConfig
