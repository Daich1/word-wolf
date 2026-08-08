// ワードウルフの全ゲーム操作をまとめたサーバーレス関数。
// ITO / SANRENTAN と同じ流儀。

const { createRoom, joinRoom, processAction, getView, storageEnabled } = require('../lib/wolf-store');

const NOT_FOUND = 'ルームが見つかりません';
function fail(res, result) {
  return res.status(result.error === NOT_FOUND ? 404 : 400).json(result);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET' && req.query.health !== undefined) {
      return res.status(200).json({ ok: true, storage: storageEnabled ? 'redis' : 'memory' });
    }

    if (req.method === 'GET') {
      const { code, playerId } = req.query;
      if (!code || !playerId) return res.status(400).json({ error: 'code and playerId required' });
      const view = await getView(code.toUpperCase(), playerId);
      if (view.error) return fail(res, view);
      return res.status(200).json(view);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { action } = body;

      if (action === 'create') {
        const name = (body.name || '').trim();
        if (!name) return res.status(400).json({ error: '名前を入力してください' });
        const result = await createRoom(name, {
          discussSeconds: body.discussSeconds,
          wolfCount: body.wolfCount,
          totalRounds: body.totalRounds,
          deckCode: body.deckCode || null,
        }, body.roomCode || null);
        if (result.error) return fail(res, result);
        return res.status(200).json(result);
      }

      if (action === 'join') {
        const code = (body.code || '').toUpperCase();
        const name = (body.name || '').trim();
        if (!code || !name) return res.status(400).json({ error: 'code and name required' });
        const result = await joinRoom(code, name);
        if (result.error) return fail(res, result);
        const view = await getView(code, result.playerId);
        return res.status(200).json({ playerId: result.playerId, view: view.error ? null : view });
      }

      const code = (body.code || '').toUpperCase();
      const { playerId } = body;
      if (!code || !playerId || !action) return res.status(400).json({ error: 'code, playerId, action required' });
      const result = await processAction(code, playerId, action, body);
      if (result.error) return fail(res, result);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[api/wolf]', e);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};
