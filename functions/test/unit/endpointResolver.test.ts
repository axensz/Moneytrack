import { describe, it, expect } from 'vitest';
import {
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateAddress,
  createEndpointResolver,
  type LookupAll,
} from '../../src/notifications/endpointResolver.js';

describe('isPrivateIpv4', () => {
  it('flags private and reserved ranges', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(isPrivateIpv4(ip)).toBe(true);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '142.250.72.196']) {
      expect(isPrivateIpv4(ip)).toBe(false);
    }
  });
});

describe('isPrivateIpv6', () => {
  it('flags loopback, link-local, unique-local, and mapped-private', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:10.0.0.1']) {
      expect(isPrivateIpv6(ip)).toBe(true);
    }
  });
  it('allows public v6 and mapped-public', () => {
    expect(isPrivateIpv6('2607:f8b0:4005:80a::200e')).toBe(false);
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('isPrivateAddress', () => {
  it('routes by family', () => {
    expect(isPrivateAddress('10.0.0.1', 4)).toBe(true);
    expect(isPrivateAddress('fe80::1', 6)).toBe(true);
    expect(isPrivateAddress('8.8.8.8', 4)).toBe(false);
  });
});

describe('createEndpointResolver', () => {
  const url = (u: string) => new URL(u);

  it('accepts a host resolving only to public addresses', async () => {
    const lookup: LookupAll = async () => [{ address: '142.250.72.196', family: 4 }];
    const resolver = createEndpointResolver(lookup);
    await expect(resolver.assertPubliclyRoutable(url('https://fcm.googleapis.com/x'))).resolves.toBeUndefined();
  });

  it('rejects a host that resolves to a private address', async () => {
    const lookup: LookupAll = async () => [{ address: '127.0.0.1', family: 4 }];
    const resolver = createEndpointResolver(lookup);
    await expect(resolver.assertPubliclyRoutable(url('https://evil.example.com/x'))).rejects.toThrow(/private/);
  });

  it('rejects when ANY answer is private (rebinding defense)', async () => {
    const lookup: LookupAll = async () => [
      { address: '142.250.72.196', family: 4 },
      { address: '10.1.2.3', family: 4 },
    ];
    const resolver = createEndpointResolver(lookup);
    await expect(resolver.assertPubliclyRoutable(url('https://mixed.example.com/x'))).rejects.toThrow(/private/);
  });

  it('rejects when the host does not resolve', async () => {
    const lookup: LookupAll = async () => [];
    const resolver = createEndpointResolver(lookup);
    await expect(resolver.assertPubliclyRoutable(url('https://nope.example.com/x'))).rejects.toThrow(/resolve/);
  });

  it('rejects when DNS lookup throws', async () => {
    const lookup: LookupAll = async () => { throw new Error('ENOTFOUND'); };
    const resolver = createEndpointResolver(lookup);
    await expect(resolver.assertPubliclyRoutable(url('https://broken.example.com/x'))).rejects.toThrow(/DNS/);
  });
});
