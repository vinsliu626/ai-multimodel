// prisma.config.cjs
require('dotenv/config');

const { defineConfig, env } = require('prisma/config');

module.exports = defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    // 从环境变量里拿 DATABASE_URL，没有就用本地 sqlite 文件，方便本地开发
    url: env('DATABASE_URL') || 'file:./dev.db',
  },
});
