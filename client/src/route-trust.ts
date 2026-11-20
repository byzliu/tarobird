import type { Route } from "./storage.js";
import { isIpv6HttpRoute } from "../../src/client-protocol/routes.js";

type RouteTrust = { certificateAuthority?: string; ipv6Http?: true };
// Route transport choices are scoped to a specific origin and Hub key.
const trustByRoute = new Map<string, RouteTrust>();
export function rememberRouteTrust(routes: readonly Route[], hubKey: string | undefined) {
  if (!hubKey) return;
  for (const route of routes) {
    const key = `${new URL(route.url).origin}\0${hubKey}`;
    if (route.certificateAuthority) trustByRoute.set(key, { certificateAuthority: route.certificateAuthority });
    else if (isIpv6HttpRoute(route)) trustByRoute.set(key, { ipv6Http: true });
    else trustByRoute.delete(key);
  }
  while (trustByRoute.size > 128) trustByRoute.delete(trustByRoute.keys().next().value!);
}
export function routeTrust(origin: string, key: string | undefined): RouteTrust {
  return key ? trustByRoute.get(`${new URL(origin).origin}\0${key}`) ?? {} : {};
}
