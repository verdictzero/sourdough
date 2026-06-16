// OpenAPI spec parsing + validation. Server-only (uses swagger-parser + fetch).
// Never import this from a Client Component.

import SwaggerParser from "@apidevtools/swagger-parser";
import { parse as parseYaml } from "yaml";
import type { Validated } from "./validation";
import type { SpecFormat } from "./db/types";

export const SPEC_MAX_BYTES = 2_000_000; // 2 MB

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

export interface ParsedSpec {
  doc: string; // normalized, bundled OpenAPI document as a JSON string
  format: SpecFormat;
  title: string;
  openapiVersion: string;
  opCount: number;
}

function firstLine(e: unknown): string {
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

/**
 * Parse (JSON or YAML), bundle external $refs, validate against the OpenAPI
 * schema, and extract metadata. Returns the canonical JSON string to store.
 */
export async function parseAndValidate(raw: string): Promise<Validated<ParsedSpec>> {
  if (!raw || !raw.trim()) return { ok: false, errors: ["Spec is empty"] };
  if (Buffer.byteLength(raw) > SPEC_MAX_BYTES)
    return { ok: false, errors: [`Spec exceeds the ${SPEC_MAX_BYTES / 1e6} MB limit`] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  let format: SpecFormat;
  try {
    parsed = JSON.parse(raw);
    format = "json";
  } catch {
    try {
      parsed = parseYaml(raw);
      format = "yaml";
    } catch {
      return { ok: false, errors: ["Could not parse as JSON or YAML"] };
    }
  }
  if (!parsed || typeof parsed !== "object")
    return { ok: false, errors: ["Spec is not an object"] };

  if (typeof parsed.openapi !== "string" || !parsed.openapi.startsWith("3.")) {
    return {
      ok: false,
      errors: ["Only OpenAPI 3.x is supported (missing or unsupported `openapi` field)"],
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bundled: any;
  try {
    bundled = await SwaggerParser.bundle(parsed);
  } catch (e) {
    return { ok: false, errors: [`Could not resolve spec references: ${firstLine(e)}`] };
  }
  try {
    // validate() dereferences in place — validate a clone so we persist the
    // ref-preserving bundled form.
    await SwaggerParser.validate(structuredClone(bundled));
  } catch (e) {
    return { ok: false, errors: [`Invalid OpenAPI: ${firstLine(e)}`] };
  }

  const title = typeof bundled.info?.title === "string" ? bundled.info.title : "";
  const openapiVersion = String(bundled.openapi);
  let opCount = 0;
  const paths = bundled.paths ?? {};
  for (const key of Object.keys(paths)) {
    const item = paths[key] ?? {};
    for (const m of METHODS) if (item[m]) opCount++;
  }

  const doc = JSON.stringify(bundled);
  if (Buffer.byteLength(doc) > SPEC_MAX_BYTES)
    return { ok: false, errors: ["Bundled spec exceeds the size limit"] };

  return { ok: true, value: { doc, format, title, openapiVersion, opCount } };
}

/**
 * Fetch a spec by URL (server-side). Mirrors the reachability check in
 * app/api/ingest/test: 5s timeout, manual redirects, relative URLs resolved
 * against `origin`. NOTE: like that endpoint, this can reach internal hosts —
 * a production hardening pass should block private/loopback ranges (SSRF).
 */
export async function fetchSpecFromUrl(url: string, origin: string): Promise<Validated<string>> {
  if (!/^(https?:\/\/|\/)/i.test(url))
    return { ok: false, errors: ["URL must start with http(s):// or /"] };
  const target = url.startsWith("/") ? origin + url : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(target, { redirect: "manual", signal: controller.signal });
    if (!res.ok) return { ok: false, errors: [`Fetch failed: HTTP ${res.status}`] };
    const text = await res.text();
    if (Buffer.byteLength(text) > SPEC_MAX_BYTES)
      return { ok: false, errors: ["Fetched spec exceeds the size limit"] };
    return { ok: true, value: text };
  } catch (e) {
    const reason =
      e instanceof Error && e.name === "AbortError" ? "Timed out after 5s" : "Could not fetch URL";
    return { ok: false, errors: [reason] };
  } finally {
    clearTimeout(timer);
  }
}
