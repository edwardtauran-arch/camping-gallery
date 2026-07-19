// Fix DNS resolution for local dev behind restrictive DNS (e.g., ISP/router issues)
// This only runs on the dev machine, NOT on Vercel/production
// if (process.env.NODE_ENV !== 'production') {
//   const dns = require('dns');
//   dns.setServers(['8.8.8.8', '8.8.4.4']);
// }

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

module.exports = nextConfig;
