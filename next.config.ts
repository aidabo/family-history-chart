const path = require('path');

module.exports = {
  output: "standalone",
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*/",
        destination: `http://localhost:3001/:path*/`,
      },
    ];
  },

  webpack: (config: any) => {
    config.resolve.alias['@'] = path.resolve("src/*"); // 设置 @ 为根目录
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"]
    });
    return config;
  },
  
  experimental: {
    serverActions: {
      logRequests: true,
    },
  },


};



