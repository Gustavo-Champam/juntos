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

function envValue(relativePath, key) {
  const line = readFileSync(path.join(repositoryRoot, relativePath), "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}=`));
  assert.ok(line, `${key} must be documented in ${relativePath}`);
  return line.slice(key.length + 1);
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
    "npm ci --include=dev --workspace @juntos/api --workspace @juntos/contracts && npm --workspace @juntos/api run build",
  );
  assert.equal(
    api.startCommand,
    "npm --workspace @juntos/api run db:migrate && npm --workspace @juntos/api run start",
  );
  assert.equal(api.preDeployCommand, undefined);
  assert.equal(api.healthCheckPath, "/health");
  assert.equal(api.plan, "free");
});

test("Render injects PostgreSQL without tracking its connection value", () => {
  const blueprint = readYaml("render.yaml");
  const api = blueprint.services.find((service) => service.name === "juntos-api");
  const databaseUrl = api.envVars.find((variable) => variable.key === "DATABASE_URL");
  assert.deepEqual(databaseUrl.fromDatabase, {
    name: "juntos-db",
    property: "connectionString",
  });
  assert.deepEqual(blueprint.databases[0], {
    name: "juntos-db",
    databaseName: "juntos",
    user: "juntos",
    plan: "free",
  });
});

test("Render requires manually configured identity values so Vercel and Render can share the proxy key", () => {
  const blueprint = readYaml("render.yaml");
  const api = blueprint.services.find((service) => service.name === "juntos-api");
  const variables = new Map(api.envVars.map((variable) => [variable.key, variable]));

  for (const key of [
    "INTERNAL_PROXY_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "WEB_ORIGIN",
  ]) {
    const variable = variables.get(key);
    assert.ok(variable, `${key} must be present`);
    assert.equal(variable.sync, false, `${key} must be configured outside the repository`);
    assert.equal("value" in variable, false, `${key} must not be tracked`);
    assert.equal("generateValue" in variable, false, `${key} must not diverge from Vercel`);
  }
});

test("tracked environment examples cannot be mistaken for a deployable internal proxy key", () => {
  const canonicalKey = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
  for (const file of [".env.example", "apps/api/.env.example", "apps/web/.env.example"]) {
    const value = envValue(file, "INTERNAL_PROXY_KEY");
    assert.match(value, /generate/i);
    assert.equal(canonicalKey.test(value), false, `${file} must contain an invalid instructional placeholder`);
  }
});
