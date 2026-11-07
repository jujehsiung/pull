import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "framerusercontent.com" },
    ],
  },
  // Dev-only: the harness opens the app on 127.0.0.1 while Next calls itself
  // localhost, and Next 16 blocks that as cross-origin — which silently stops the
  // client from hydrating. Allowing the loopback host keeps both URLs working.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // The demo keeps heavy work out of the request path; no extra flags needed.
  },
}

export default nextConfig
