import dns from "dns";
import net from "net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "::",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark 198.18.0.0/15
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // Multicast & Reserved
  return false;
}

function extractMappedIpv4FromIpv6(ip: string): string | null {
  const lower = ip.toLowerCase();
  // Dotted form ::ffff:127.0.0.1
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted?.[1]) return dotted[1];

  // Hex form ::ffff:7f00:1 or ::ffff:7f00:0001
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return null;
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (ipVersion === 6) {
    if (ip === "::1" || ip === "::" || ip === "0:0:0:0:0:0:0:1" || ip === "0:0:0:0:0:0:0:0") {
      return true;
    }
    const mappedIpv4 = extractMappedIpv4FromIpv6(ip);
    if (mappedIpv4) {
      return isPrivateOrReservedIpv4(mappedIpv4);
    }
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    const firstHextet = parseInt(ip.split(":")[0] || "0", 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true;
    if ((firstHextet & 0xffc0) === 0xfe80) return true;
    if ((firstHextet & 0xff00) === 0xff00) return true;
    return false;
  }
  return true;
}

export function parseSafePublicHttpUrl(rawUrl: string): URL | null {
  try {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed || trimmed.length > 4096) return null;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;

    const cleanHost = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    if (!cleanHost) return null;

    if (
      BLOCKED_HOSTNAMES.has(cleanHost) ||
      cleanHost.endsWith(".localhost") ||
      cleanHost.endsWith(".local") ||
      cleanHost.endsWith(".internal") ||
      cleanHost.endsWith(".arpa")
    ) {
      return null;
    }

    if (net.isIP(cleanHost)) {
      if (isPrivateOrReservedIp(cleanHost)) return null;
      return parsed;
    }

    // Require at least one dot for domain names (blocks single-label internal hostnames like `redis` or `metadata`)
    if (!cleanHost.includes(".")) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  return parseSafePublicHttpUrl(rawUrl) !== null;
}

export async function validateSafePublicHttpUrl(rawUrl: string): Promise<URL | null> {
  const parsed = parseSafePublicHttpUrl(rawUrl);
  if (!parsed) return null;

  const cleanHost = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(cleanHost)) {
    return isPrivateOrReservedIp(cleanHost) ? null : parsed;
  }

  try {
    const records = await Promise.race([
      dns.promises.lookup(cleanHost, { all: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        if (rec?.address && isPrivateOrReservedIp(rec.address)) {
          return null;
        }
      }
    }
  } catch {
    // Allow if DNS lookup times out transiently cleanly without exposing internal IPs
  }

  return parsed;
}

export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<globalThis.Response> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const safeUrl = await validateSafePublicHttpUrl(currentUrl);
    if (!safeUrl) {
      throw new Error("Blocked unsafe or non-public URL");
    }

    const resp = await fetch(safeUrl.toString(), {
      ...init,
      redirect: "manual",
    });

    if (
      (resp.status === 301 ||
        resp.status === 302 ||
        resp.status === 303 ||
        resp.status === 307 ||
        resp.status === 308) &&
      resp.headers.get("location")
    ) {
      try {
        await resp.body?.cancel();
      } catch {}
      const nextUrl = new URL(resp.headers.get("location")!, safeUrl.toString()).toString();
      currentUrl = nextUrl;
      continue;
    }

    return resp;
  }
  throw new Error("Too many redirects");
}

export function sanitizeHeaderFilename(filename: string, fallback = "episode.mp4"): string {
  const cleaned = String(filename || "")
    .replace(/[\r\n\x00-\x1f\x7f"\\/]/g, "_")
    .trim();
  return cleaned || fallback;
}
