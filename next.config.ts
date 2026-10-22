import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // The ffmpeg binary (AAC copies of WebM recordings for iPhones): kept as a
  // file next to the package, and bundled with the route that runs it
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/meetings/[id]/recordings/[idx]": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
