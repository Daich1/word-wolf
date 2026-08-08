// ワードペア管理API（ワードリスト画面専用）

const {
  getWordPairs, saveWordPairs, getDeck, saveDeck,
  WORD_PAIRS, WLIST_MAX,
} = require('../lib/wolf-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const code = (req.query.code || '').trim();
      if (code) {
        const deck = await getDeck(code);
        if (deck.error) return res.status(400).json(deck);
        return res.status(200).json(deck);
      }
      return res.status(200).json({
        pairs: await getWordPairs(),
        builtinCount: WORD_PAIRS.length,
        limits: { max: WLIST_MAX },
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      switch (body.action) {
        case 'save_deck': {
          const result = await saveDeck(body.code || null, body.name, body.pairs);
          if (result.error) return res.status(400).json(result);
          return res.status(200).json(result);
        }
        case 'load_deck': {
          const result = await getDeck(body.code);
          if (result.error) return res.status(400).json(result);
          return res.status(200).json(result);
        }
        default:
          return res.status(400).json({ error: '不明な操作です' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[api/wordlist]', e);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};
