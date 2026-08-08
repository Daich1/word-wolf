// Redis (Upstash REST) への薄いクライアント。
// 環境変数が無い場合は enabled=false になり、store がプロセス内メモリに
// フォールバックする（ローカル開発用。本番では必ず設定すること）。

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const enabled = !!(URL_ && TOKEN);

async function cmd(args) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error('kv: ' + (body && body.error ? body.error : 'HTTP ' + res.status));
  }
  return body.result;
}

const CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur == false then
  if ARGV[2] == '' then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
    return 1
  end
  return 0
end
if cur == ARGV[2] then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0`;

module.exports = {
  enabled,
  get: key => cmd(['GET', key]),
  del: key => cmd(['DEL', key]),
  set: (key, val) => cmd(['SET', key, val]),
  async setNew(key, val, ttlSec) {
    const r = await cmd(['SET', key, val, 'NX', 'EX', String(ttlSec)]);
    return r === 'OK';
  },
  async cas(key, prev, next, ttlSec) {
    const r = await cmd(['EVAL', CAS_LUA, '1', key, next, prev === null ? '' : prev, String(ttlSec)]);
    return Number(r) === 1;
  },
};
