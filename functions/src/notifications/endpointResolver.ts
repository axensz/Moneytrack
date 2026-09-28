/**
 * Concrete EndpointResolver: DNS resolution + private-range rejection (SSRF).
 *
 * The pure `isPublicHttpsEndpoint` gate already rejects non-HTTPS URLs, IP
 * literals, and obvious private hostnames. This resolver additionally resolves
 * the hostname and rejects any answer that maps to a private, loopback,
 * link-local, or otherwise non-public address. The DNS lookup function is
 * injectable so it can be tested without real network access.
 */

import { promises as dnsPromises } from 'node:dns';
import { isIPv4 } from 'node:net';
import type { EndpointResolver } from './deviceCallables.js';

export type LookupAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/** Is an IPv4 address in a private / reserved / non-public range? */
export const isPrivateIpv4 = (address: string): boolean => {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this" network
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
};

/** Is an IPv6 address loopback, link-local, unique-local, or unspecified? */
export const isPrivateIpv6 = (address: string): boolean => {
  const addr = address.toLowerCase().split('%')[0];
  if (addr === '::1' || addr === '::') return true;
  if (addr.startsWith('fe80')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local fc00::/7
  // IPv4-mapped ::ffff:a.b.c.d — check the embedded v4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
};

export const isPrivateAddress = (address: string, family: number): boolean =>
  family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);

const defaultLookupAll: LookupAll = async (hostname) => {
  const answers = await dnsPromises.lookup(hostname, { all: true });
  return answers.map((a) => ({ address: a.address, family: a.family }));
};

/**
 * Build a resolver. Rejects when the hostname does not resolve, or when ANY
 * resolved address is private/reserved (defends against DNS-rebinding to a
 * single private answer among public ones).
 */
export const createEndpointResolver = (lookupAll: LookupAll = defaultLookupAll): EndpointResolver => ({
  async assertPubliclyRoutable(endpointUrl: URL): Promise<void> {
    const host = endpointUrl.hostname;
    let answers: Array<{ address: string; family: number }>;
    try {
      answers = await lookupAll(host);
    } catch {
      throw new Error('DNS resolution failed');
    }
    if (answers.length === 0) {
      throw new Error('Host did not resolve');
    }
    for (const { address, family } of answers) {
      if (isPrivateAddress(address, family)) {
        throw new Error(`Host resolves to a private address: ${address}`);
      }
    }
  },
});
