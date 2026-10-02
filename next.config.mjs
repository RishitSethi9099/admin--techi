/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Poster and billboard uploads go through server actions (default limit 1 MB).
    // Vercel rejects request bodies over 4.5 MB, so stay just under it.
    serverActions: {
      bodySizeLimit: "4mb"
    }
  }
};

export default nextConfig;
