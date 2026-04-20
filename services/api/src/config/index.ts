import { env } from "./env";

export const config = {
  env: env.nodeEnv,
  isDev: env.nodeEnv === "development",
  isProd: env.nodeEnv === "production",
  port: env.port,
  dataProvider: env.dataProvider,
  jwtSecret: env.jwtSecret,
  corsOrigins: env.corsOrigins,
};

