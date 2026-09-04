import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function readYaml(relativePath) {
  return parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

test("Vercel deploys the web workspace as Next.js", () => {
  const vercel = readJson("apps/web/vercel.json");

  assert.equal(vercel.framework, "nextjs");
});

test("Render builds the API from the complete npm workspace", () => {
  const blueprint = readYaml("render.yaml");
  const api = blueprint.services.find((service) => service.name === "juntos-api");

  assert.equal(api.rootDir, undefined);
  assert.equal(
    api.buildCommand,
    "npm ci && npm --workspace @juntos/api run build",
  );
  assert.equal(api.startCommand, "npm --workspace @juntos/api run start");
  assert.equal(api.healthCheckPath, "/health");
  assert.equal(api.plan, "free");
});

test("Render injects PostgreSQL and generated secrets without literal values", () => {
  const blueprint = readYaml("render.yaml");
  const api = blueprint.services.find((service) => service.name === "juntos-api");
  const databaseUrl = api.envVars.find((variable) => variable.key === "DATABASE_URL");
  const internalKey = api.envVars.find(
    (variable) => variable.key === "INTERNAL_PROXY_KEY",
  );

  assert.deepEqual(databaseUrl.fromDatabase, {
    name: "juntos-db",
    property: "connectionString",
  });
  assert.equal(internalKey.generateValue, true);
  assert.equal("value" in internalKey, false);
  assert.deepEqual(blueprint.databases[0], {
    name: "juntos-db",
    databaseName: "juntos",
    user: "juntos",
    plan: "free",
  });
});
