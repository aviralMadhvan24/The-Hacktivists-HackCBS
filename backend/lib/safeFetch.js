// Fetching user-supplied URLs safely (company investor-relations pages, PDFs).
//  - http/https only, standard ports only
//  - every hop's host is DNS-resolved and rejected if private, loopback,
//    link-local, CGNAT, multicast or reserved (SSRF protection)
//  - redirects followed manually (max 4), each re-checked
//  - robots.txt honoured for our user agent
//  - size and time limits; per-host politeness delay
const dns = require('dns').promises;
const dnsCb = require('dns');
const net = require('net');
const { Agent, fetch } = require('undici');

const USER_AGENT = 'FinSight-ResearchBot/1.0 (+contact: site administrator)';
const lastHit = new Map();
const MIN_INTERVAL_MS = Number(process.env.RESEARCH_MIN_INTERVAL_MS || 2000);

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

// Re-validates the address at connect time, closing the DNS-rebinding gap
// between the pre-check and the actual connection.
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, cb) {
      dnsCb.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err);
        const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
        if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(new FetchBlocked('That address points to a private or reserved network.'));
        return options.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
      });
    },
  },
});

class FetchBlocked extends Error {
  constructor(message) { super(message); this.code = 'FETCH_BLOCKED'; }
}

async function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new FetchBlocked('Not a valid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new FetchBlocked('Only http and https URLs are allowed.');
  if (u.username || u.password) throw new FetchBlocked('URLs with credentials are not allowed.');
  if (u.port && !['80', '443'].includes(u.port)) throw new FetchBlocked('Only standard ports are allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new FetchBlocked(`Cannot resolve ${host}.`); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlocked('That address points to a private or reserved network.');
  return u;
}

const robotsCache = new Map();
async function allowedByRobots(u) {
  const origin = u.origin;
  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = { disallow: [], fetchedAt: Date.now() };
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000), redirect: 'follow', dispatcher: guardedAgent });
      if (res.ok) {
        let applies = false;
        for (const line of (await res.text()).split(/\r?\n/)) {
          const [k, ...rest] = line.split(':');
          const key = k.trim().toLowerCase(); const val = rest.join(':').trim();
          if (key === 'user-agent') applies = val === '*' || /finsight/i.test(val);
          else if (applies && key === 'disallow' && val) rules.disallow.push(val);
        }
      }
    } catch { /* no robots.txt reachable → allowed */ }
    robotsCache.set(origin, rules);
  }
  return !rules.disallow.some((p) => u.pathname.startsWith(p.replace(/\*.*$/, '')));
}

async function politeness(host) {
  const wait = (lastHit.get(host) || 0) + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/**
 * Fetches a URL safely. Returns { url, status, contentType, buffer }.
 * @param {string} raw
 * @param {{maxBytes?: number, accept?: string}} opts
 */
async function safeFetch(raw, { maxBytes = 15 * 1024 * 1024, accept = '*/*' } = {}) {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    if (!(await allowedByRobots(url))) throw new FetchBlocked(`${url.hostname}'s robots.txt does not allow fetching ${url.pathname}.`);
    await politeness(url.hostname);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(20000), dispatcher: guardedAgent });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new FetchBlocked(`${url.hostname} refused access (HTTP ${res.status}). Download the document yourself and upload it instead.`);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.hostname}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new FetchBlocked(`File is larger than ${Math.round(maxBytes / 1048576)}MB.`);
    const chunks = []; let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new FetchBlocked(`File is larger than ${Math.round(maxBytes / 1048576)}MB.`);
      chunks.push(chunk);
    }
    return { url: url.toString(), status: res.status, contentType: res.headers.get('content-type') || '', buffer: Buffer.concat(chunks) };
  }
  throw new FetchBlocked('Too many redirects.');
}

module.exports = { safeFetch, checkUrl, isPrivateIp, allowedByRobots, FetchBlocked, USER_AGENT };
