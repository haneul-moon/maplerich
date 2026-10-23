// Cloudflare Worker for MapleStory character lookup.
// NEXON_API_KEY is a Cloudflare encrypted secret, never a client-side value.
const NEXON_ORIGIN = 'https://open.api.nexon.com';
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });

async function nexon(endpoint, apiKey) {
  const response = await fetch(NEXON_ORIGIN + endpoint, {
    headers: { 'x-nxopen-api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`NEXON API ${response.status}`);
  return response.json();
}

async function character(request, env, ctx, url) {
  const nickname = (url.searchParams.get('nickname') || '').trim();
  if (!nickname || [...nickname].length > 24 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    return reply(400, { error: '캐릭터 이름을 확인해 주세요.' });
  }
  const apiKey = env.NEXON_API_KEY?.trim();
  if (!apiKey) return reply(503, { error: 'Cloudflare에 NEXON_API_KEY 비밀 환경변수를 설정해 주세요.' });

  // Cache successful lookups for 5 minutes at Cloudflare's edge to save NEXON quota.
  const cacheKey = new Request(`https://maplerich-cache.invalid/character?nickname=${encodeURIComponent(nickname)}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const id = await nexon(`/maplestory/v1/id?character_name=${encodeURIComponent(nickname)}`, apiKey);
    if (!id?.ocid) return reply(404, { error: '캐릭터를 찾지 못했습니다.' });
    const basic = await nexon(`/maplestory/v1/character/basic?ocid=${encodeURIComponent(id.ocid)}`, apiKey);
    const data = {
      character_name: basic.character_name || nickname,
      character_level: basic.character_level ?? null,
      character_class: basic.character_class || '',
      world_name: basic.world_name || '',
      character_image: basic.character_image || '',
    };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        'cache-control': 'public, max-age=0, s-maxage=300',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    const info = String(err?.message || '');
    if (info.includes('NEXON API 400') || info.includes('NEXON API 404'))
      return reply(400, { error: '캐릭터를 찾지 못했거나 API 요청이 올바르지 않습니다.' });
    if (info.includes('NEXON API 401') || info.includes('NEXON API 403'))
      return reply(403, { error: '넥슨 API 키가 유효하지 않거나 권한이 없습니다.' });
    if (info.includes('NEXON API 429'))
      return reply(429, { error: '넥슨 API 호출 횟수 제한입니다. 잠시 후 다시 시도해 주세요.' });
    return reply(502, { error: '넥슨 캐릭터 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

async function portrait(url) {
  const raw = url.searchParams.get('url') || '';
  let remote;
  try { remote = new URL(raw); } catch { return reply(400, { error: '잘못된 초상화 주소입니다.' }); }
  if (remote.protocol !== 'https:' || remote.hostname !== 'open.api.nexon.com' ||
      !remote.pathname.startsWith('/static/') || remote.username || remote.password || remote.port) {
    return reply(400, { error: '넥슨 공식 정적 이미지 주소만 허용합니다.' });
  }
  try {
    const response = await fetch(remote.href, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !['image/png', 'image/webp', 'image/jpeg'].includes(mime))
      return reply(502, { error: '이미지를 읽을 수 없습니다.' });
    const length = Number(response.headers.get('content-length'));
    if (length > 2_500_000) return reply(413, { error: '이미지가 너무 큽니다.' });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_500_000) return reply(413, { error: '이미지가 너무 큽니다.' });
    return new Response(bytes, {
      headers: {
        'content-type': mime,
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch { return reply(502, { error: '캐릭터 초상화 연결에 실패했습니다.' }); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return reply(405, { error: 'GET만 허용합니다.' });
      if (url.pathname === '/api/health')
        return reply(200, { ok: true, characterApiConfigured: !!env.NEXON_API_KEY });
      if (url.pathname === '/api/character') return character(request, env, ctx, url);
      if (url.pathname === '/api/portrait') return portrait(url);
      return reply(404, { error: '찾을 수 없는 API입니다.' });
    }
    // Static files (HTML and item images) are served from Cloudflare Assets.
    return env.ASSETS.fetch(request);
  },
};
