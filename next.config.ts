import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary; keep it out of the bundle.
  serverExternalPackages: ["ffmpeg-static"],
  output: "standalone",
};

export default nextConfig;
