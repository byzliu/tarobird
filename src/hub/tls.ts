import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSecureContext } from "node:tls";
import type { ServerOptions } from "node:https";
import { z } from "zod";

const certificateFiles = z.object({ cert: z.string().min(1), key: z.string().min(1) }).strict();
export const tlsFilesSchema = certificateFiles.extend({ sni: z.record(z.string().regex(/^[a-z0-9.-]+$/i), certificateFiles).optional() }).strict();
const readCertificateFiles = async (files: z.infer<typeof certificateFiles>) => ({ cert: await readFile(files.cert), key: await readFile(files.key) });

export async function loadHubTls(files: z.infer<typeof tlsFilesSchema>): Promise<ServerOptions> {
  const base = await readCertificateFiles(files); const names = new Map<string, ReturnType<typeof createSecureContext>>();
  for (const [name, pair] of Object.entries(files.sni ?? {})) names.set(name.toLowerCase(), createSecureContext({ ...await readCertificateFiles(pair), minVersion: "TLSv1.2" }));
  return { ...base, minVersion: "TLSv1.2", ...(names.size ? { SNICallback: (name, done) => { const context = names.get(name.toLowerCase()); if (!context) done(new Error("unknown_server_name")); else done(null, context); } } : {}) };
}

export async function loadIpv6DdnsTls(directory: string, url: string, files: z.infer<typeof certificateFiles>): Promise<ServerOptions> {
  const pair = await readCertificateFiles({ cert: path.resolve(directory, files.cert), key: path.resolve(directory, files.key) });
  const leaf = new X509Certificate(pair.cert);
  if (!leaf.checkHost(new URL(url).hostname, { subject: "never" })) {
    throw new Error("The IPv6 DDNS TLS certificate must cover the configured hostname");
  }
  // Validate the key and certificate together before acquiring the Hub lock.
  const tls = { ...pair, minVersion: "TLSv1.2" as const };
  createSecureContext(tls);
  return tls;
}
