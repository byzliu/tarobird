import { eventHistoryPolicySchema } from "./event-history.js";
import { relayTunnelsSchema } from "../relay/tunnels.js";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { pushConfigSchema } from "./push/providers.js";
import { relayTunnelSchema } from "../relay/config.js";
import { tlsFilesSchema } from "./tls.js";
import { routeMonitorSchema } from "./route-monitor.js";
import { JsonStore } from "../state/json-store.js";
import { fileSizeSchema, MAX_FILE_BYTES } from "../client-protocol/index.js";
import { ipv6DdnsOriginSchema } from "../client-protocol/routes.js";

const ipv6DdnsSchema = z.object({
  url: ipv6DdnsOriginSchema,
  tls: tlsFilesSchema.omit({ sni: true }).optional(),
  allowPlainHttp: z.literal(true).optional(),
}).strict().refine(
  config => typeof config.url === "string"
    && (config.url.startsWith("https:") ? !!config.tls && !config.allowPlainHttp : config.allowPlainHttp === true && !config.tls),
  "IPv6 DDNS requires TLS for HTTPS or an explicit allowPlainHttp flag for HTTP",
);

export const hubConfigSchema = z.object({ eventHistory: eventHistoryPolicySchema.optional(), maxFileBytes: fileSizeSchema.default(MAX_FILE_BYTES), host: z.string().default("127.0.0.1"), exposure: z.enum(["private", "public"]).default("private"), port: z.number().int().min(1).max(65535).default(8788), origins: z.array(z.string().url()).default([]), tls: tlsFilesSchema.optional(), ipv6Ddns: ipv6DdnsSchema.optional(), instancePort: z.number().int().min(1).max(65535).default(8789), tlsListeners: z.array(z.object({ host: z.string(), exposure: z.enum(["private", "public"]).default("private"), port: z.number().int().min(1).max(65535), tls: tlsFilesSchema }).strict()).default([]), push: pushConfigSchema.optional(), routeMonitor: routeMonitorSchema.optional(), relay: relayTunnelSchema.optional(), relays: relayTunnelsSchema.optional(), clientDir: z.string().optional(), gdocs: z.object({ clientFile: z.string().min(1) }).optional() }).refine((config) => config.exposure !== "public" || !!config.tls, "Public Hub listeners require TLS").refine((config) => !(config.relay && config.relays), "Use relays or legacy relay, not both");
export type HubConfig = z.infer<typeof hubConfigSchema>;
export function defaultHubDirectory(): string { return path.join(os.homedir(), ".cctb", "hub"); }
export async function readHubConfig(directory: string): Promise<HubConfig> { return new JsonStore(path.join(directory, "config.json"), (value) => hubConfigSchema.parse(value)).read(hubConfigSchema.parse({})); }
