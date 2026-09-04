import "dotenv/config";

import { buildApp } from "./app.js";
import { parseConfig } from "./config.js";

const config = parseConfig(process.env);
const app = buildApp({ webOrigin: config.webOrigin });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
