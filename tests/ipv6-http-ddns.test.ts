import { randomBytes, sign, verify } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { HOST_INVITE_ROUTES_PATH, HOST_ROUTES_PATH, hostRoutesViewSchema } from "../src/client-protocol/host-routes.js";
import { sharedRoutesSchema } from "../src/client-protocol/private-network.js";
import { IPV6_DDNS_LABEL, routeSchema } from "../src/client-protocol/routes.js";
import { hostPairingLink } from "../src/host-cli/pairing.js";
import { deviceProof, parsePublicKey, serverProof } from "../src/hub/auth.js";
import { hubConfigSchema } from "../src/hub/config.js";
import { HubServer } from "../src/hub/server.js";
import { enrollTrusted, invitedPairing, issueInvite, loginFor, pairingRequestId, testDevice } from "./helpers/pairing-invite.js";

it("requires an explicit IPv6 DDNS HTTP configuration and retains HTTPS-only sharing defaults", () => {
  const url = "http://hub.example.test:8443";
  const route = { name: "Direct" as const, label: IPV6_DDNS_LABEL, url };
  expect(hubConfigSchema.safeParse({ ipv6Ddns: { url } }).success).toBe(false);
  expect(hubConfigSchema.safeParse({ ipv6Ddns: { url, allowPlainHttp: true } }).success).toBe(true);
  expect(hubConfigSchema.safeParse({ ipv6Ddns: { url: "bogus" } }).success).toBe(false);
  expect(hubConfigSchema.safeParse({ ipv6Ddns: { url: "http://[::1]:8443", allowPlainHttp: true } }).success).toBe(false);
  expect(routeSchema.safeParse({ name: "Direct", url }).success).toBe(false);
  expect(routeSchema.safeParse({ ...route, name: "VPS" }).success).toBe(false);
  expect(routeSchema.parse(route)).toEqual(route);
  expect(sharedRoutesSchema.safeParse([route]).success).toBe(false);
});

it("pairs and authenticates over the dedicated IPv6 HTTP listener without exposing the instance API", async () => {
  const probe = createServer().listen(0, "::1");
  await once(probe, "listening");
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://[::1]:${port}`, url = `http://hub.example.test:${port}`;
  const route = { name: "Direct" as const, label: IPV6_DDNS_LABEL, url };
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "ipv6-http-ddns-"));
  let hub: HubServer | undefined, socket: WebSocket | undefined;
  try {
    hub = await HubServer.start({ stateDir, ipv6Ddns: { url, allowPlainHttp: true } });
    const owner = testDevice("ddns_http_owner");
    await enrollTrusted(hub.auth, owner);
    const login = await loginFor(hub.auth, owner);
    const headers = { Authorization: `Bearer ${login.token}` };
    const legacy = await fetch(hub.url + HOST_ROUTES_PATH, { headers });
    const selection = await fetch(hub.url + HOST_INVITE_ROUTES_PATH, { headers });
    expect(hostRoutesViewSchema.parse(await legacy.json()).routes).toEqual([]);
    expect(hostRoutesViewSchema.parse(await selection.json()).routes).toEqual([{ source: "managed", route }]);
    const health = await fetch(origin + "/health");
    expect(await health.json()).toMatchObject({ publicKey: hub.auth.publicKey });
    expect((await fetch(origin + "/api/instance/workbench")).status).toBe(401);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();

    const phone = testDevice("ddns_http_phone");
    const { invite } = await issueInvite(hub.auth, login.session);
    const qr = new URL(hostPairingLink(hub.auth.publicKey, [route], invite));
    expect(JSON.parse(qr.searchParams.get("data")!).routes).toEqual([route]);
    const pairing = await fetch(origin + "/api/pair", {
      method: "POST", body: JSON.stringify(invitedPairing(phone, invite, pairingRequestId())),
    });
    expect(pairing.status).toBe(201);
    const { code } = await pairing.json() as { code: string };
    await hub.auth.approve(code, "local-owner");
    socket = new WebSocket(origin.replace(/^http:/, "ws:") + "/ws");
    await once(socket, "open");
    const nonce = randomBytes(32).toString("base64url"), challengeReply = once(socket, "message");
    socket.send(JSON.stringify({ v: 1, type: "hello", deviceId: phone.deviceId, nonce, protocolVersions: [1], capabilities: [], cursors: {} }));
    const challenge = JSON.parse(String((await challengeReply)[0]));
    expect(challenge.type).toBe("challenge");
    expect(verify(null, serverProof(phone.deviceId, challenge.nonce, nonce), parsePublicKey(hub.auth.publicKey), Buffer.from(challenge.signature, "base64"))).toBe(true);
    const ready = once(socket, "message");
    socket.send(JSON.stringify({ v: 1, type: "auth", signature: sign(null, deviceProof(phone.deviceId, challenge.nonce, nonce), phone.privateKey).toString("base64") }));
    expect(JSON.parse(String((await ready)[0]))).toMatchObject({ type: "ready" });
  } finally {
    socket?.terminate();
    await hub?.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
