import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "framerusercontent.com" },
    ],
  },
  experimental: {
    // The demo keeps heavy work out of the request path; no extra flags needed.
  },
}

export default nextConfig
