// ===== Word Wolf Online Server-Side Game Store =====
// ワードウルフのオンライン版。ITO / SANRENTAN と同じ流儀。
// 部屋の状態は Redis に永続化する（serverless の複数インスタンスで共有）。

const kv = require('./kv');

const COLORS = ['#E53935','#1E88E5','#43A047','#FB8C00','#9C27B0',
                '#00897B','#F4511E','#5C6BC0'];
const TTL = 2 * 60 * 60 * 1000;
const TTL_SEC = Math.round(TTL / 1000);
const SEEN_REFRESH_MS = 5 * 1000;
const CAS_RETRIES = 6;
const DISCONNECT_MS = 20 * 1000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

// ===== 組み込みワードペア =====
const WORD_PAIRS = [
  {id:1, citizen:'いぬ', wolf:'ねこ'},
  {id:2, citizen:'ラーメン', wolf:'うどん'},
  {id:3, citizen:'海水浴', wolf:'プール'},
  {id:4, citizen:'サンタクロース', wolf:'雪だるま'},
  {id:5, citizen:'コーヒー', wolf:'紅茶'},
  {id:6, citizen:'遊園地', wolf:'動物園'},
  {id:7, citizen:'花火', wolf:'イルミネーション'},
  {id:8, citizen:'ピアノ', wolf:'ギター'},
  {id:9, citizen:'映画館', wolf:'水族館'},
  {id:10, citizen:'おにぎり', wolf:'サンドイッチ'},
  {id:11, citizen:'春', wolf:'秋'},
  {id:12, citizen:'自転車', wolf:'バイク'},
  {id:13, citizen:'りんご', wolf:'みかん'},
  {id:14, citizen:'サッカー', wolf:'バスケ'},
  {id:15, citizen:'カレーライス', wolf:'ハヤシライス'},
  {id:16, citizen:'新幹線', wolf:'飛行機'},
  {id:17, citizen:'温泉', wolf:'サウナ'},
  {id:18, citizen:'チョコレート', wolf:'キャラメル'},
  {id:19, citizen:'ハンバーガー', wolf:'ホットドッグ'},
  {id:20, citizen:'富士山', wolf:'エベレスト'},
  {id:21, citizen:'マリオ', wolf:'ソニック'},
  {id:22, citizen:'YouTube', wolf:'TikTok'},
  {id:23, citizen:'餃子', wolf:'シュウマイ'},
  {id:24, citizen:'かき氷', wolf:'アイスクリーム'},
  {id:25, citizen:'お正月', wolf:'クリスマス'},
  {id:26, citizen:'野球', wolf:'ソフトボール'},
  {id:27, citizen:'パンケーキ', wolf:'ワッフル'},
  {id:28, citizen:'カラオケ', wolf:'ボウリング'},
  {id:29, citizen:'寿司', wolf:'刺身'},
  {id:30, citizen:'図書館', wolf:'本屋'},
  {id:31, citizen:'焼肉', wolf:'しゃぶしゃぶ'},
  {id:32, citizen:'東京タワー', wolf:'スカイツリー'},
  {id:33, citizen:'ドラえもん', wolf:'アンパンマン'},
  {id:34, citizen:'キャンプ', wolf:'グランピング'},
  {id:35, citizen:'たこ焼き', wolf:'お好み焼き'},
  {id:36, citizen:'お化け屋敷', wolf:'ジェットコースター'},
  {id:37, citizen:'マクドナルド', wolf:'モスバーガー'},
  {id:38, citizen:'夏休み', wolf:'冬休み'},
  {id:39, citizen:'犬の散歩', wolf:'猫じゃらし'},
  {id:40, citizen:'納豆', wolf:'キムチ'},
  {id:41, citizen:'スマホ', wolf:'タブレット'},
  {id:42, citizen:'運動会', wolf:'文化祭'},
  {id:43, citizen:'ミルクティー', wolf:'レモンティー'},
  {id:44, citizen:'目玉焼き', wolf:'スクランブルエッグ'},
  {id:45, citizen:'ピザ', wolf:'パスタ'},
  {id:46, citizen:'バレンタイン', wolf:'ホワイトデー'},
  {id:47, citizen:'コンビニ', wolf:'スーパー'},
  {id:48, citizen:'朝', wolf:'夜'},
  {id:49, citizen:'電車', wolf:'バス'},
  {id:50, citizen:'ハロウィン', wolf:'お盆'},
  // ===== 食べ物・飲み物 =====
  {id:51, citizen:'肉まん', wolf:'あんまん'},
  {id:52, citizen:'うな重', wolf:'天丼'},
  {id:53, citizen:'味噌汁', wolf:'コーンスープ'},
  {id:54, citizen:'フライドポテト', wolf:'ポテトチップス'},
  {id:55, citizen:'牛丼', wolf:'豚丼'},
  {id:56, citizen:'クロワッサン', wolf:'メロンパン'},
  {id:57, citizen:'抹茶', wolf:'ほうじ茶'},
  {id:58, citizen:'オムライス', wolf:'チャーハン'},
  {id:59, citizen:'唐揚げ', wolf:'フライドチキン'},
  {id:60, citizen:'プリン', wolf:'ゼリー'},
  {id:61, citizen:'ドーナツ', wolf:'ベーグル'},
  {id:62, citizen:'タピオカ', wolf:'ナタデココ'},
  {id:63, citizen:'ステーキ', wolf:'ハンバーグ'},
  {id:64, citizen:'ビール', wolf:'ハイボール'},
  {id:65, citizen:'コーラ', wolf:'サイダー'},
  {id:66, citizen:'カップラーメン', wolf:'カップ焼きそば'},
  {id:67, citizen:'クレープ', wolf:'たい焼き'},
  {id:68, citizen:'ポテトサラダ', wolf:'マカロニサラダ'},
  {id:69, citizen:'豆腐', wolf:'こんにゃく'},
  {id:70, citizen:'ミートソース', wolf:'カルボナーラ'},
  {id:71, citizen:'エビフライ', wolf:'カキフライ'},
  {id:72, citizen:'チーズケーキ', wolf:'ショートケーキ'},
  {id:73, citizen:'焼き鳥', wolf:'焼きとん'},
  {id:74, citizen:'天ぷら', wolf:'フライ'},
  {id:75, citizen:'ヨーグルト', wolf:'牛乳'},
  {id:76, citizen:'グミ', wolf:'ラムネ'},
  {id:77, citizen:'おでん', wolf:'鍋'},
  {id:78, citizen:'いちご大福', wolf:'みたらし団子'},
  {id:79, citizen:'サーモン', wolf:'マグロ'},
  {id:80, citizen:'明太子', wolf:'たらこ'},
  // ===== 場所・施設 =====
  {id:81, citizen:'学校', wolf:'塾'},
  {id:82, citizen:'公園', wolf:'広場'},
  {id:83, citizen:'病院', wolf:'薬局'},
  {id:84, citizen:'空港', wolf:'駅'},
  {id:85, citizen:'美術館', wolf:'博物館'},
  {id:86, citizen:'銭湯', wolf:'ジム'},
  {id:87, citizen:'居酒屋', wolf:'バー'},
  {id:88, citizen:'ホテル', wolf:'旅館'},
  {id:89, citizen:'東京ディズニーランド', wolf:'USJ'},
  {id:90, citizen:'北海道', wolf:'沖縄'},
  {id:91, citizen:'渋谷', wolf:'新宿'},
  {id:92, citizen:'ハワイ', wolf:'グアム'},
  {id:93, citizen:'百均', wolf:'ドンキ'},
  {id:94, citizen:'屋上', wolf:'地下'},
  {id:95, citizen:'ファミレス', wolf:'フードコート'},
  // ===== 動物・自然 =====
  {id:96, citizen:'うさぎ', wolf:'ハムスター'},
  {id:97, citizen:'ペンギン', wolf:'アザラシ'},
  {id:98, citizen:'クジラ', wolf:'イルカ'},
  {id:99, citizen:'ライオン', wolf:'トラ'},
  {id:100, citizen:'パンダ', wolf:'コアラ'},
  {id:101, citizen:'カブトムシ', wolf:'クワガタ'},
  {id:102, citizen:'ひまわり', wolf:'チューリップ'},
  {id:103, citizen:'桜', wolf:'梅'},
  {id:104, citizen:'台風', wolf:'竜巻'},
  {id:105, citizen:'山', wolf:'丘'},
  {id:106, citizen:'川', wolf:'湖'},
  {id:107, citizen:'砂漠', wolf:'草原'},
  {id:108, citizen:'蝶', wolf:'蛾'},
  {id:109, citizen:'カラス', wolf:'スズメ'},
  {id:110, citizen:'金魚', wolf:'メダカ'},
  // ===== エンタメ・ゲーム =====
  {id:111, citizen:'将棋', wolf:'チェス'},
  {id:112, citizen:'オセロ', wolf:'囲碁'},
  {id:113, citizen:'トランプ', wolf:'UNO'},
  {id:114, citizen:'じゃんけん', wolf:'あっちむいてほい'},
  {id:115, citizen:'鬼ごっこ', wolf:'かくれんぼ'},
  {id:116, citizen:'スイッチ', wolf:'プレステ'},
  {id:117, citizen:'Minecraft', wolf:'テラリア'},
  {id:118, citizen:'ポケモン', wolf:'デジモン'},
  {id:119, citizen:'ワンピース', wolf:'ナルト'},
  {id:120, citizen:'鬼滅の刃', wolf:'呪術廻戦'},
  {id:121, citizen:'ジブリ', wolf:'ディズニー'},
  {id:122, citizen:'漫画', wolf:'アニメ'},
  {id:123, citizen:'映画', wolf:'ドラマ'},
  {id:124, citizen:'小説', wolf:'漫画'},
  {id:125, citizen:'ホラー映画', wolf:'サスペンス映画'},
  {id:126, citizen:'コスプレ', wolf:'仮装'},
  {id:127, citizen:'TikTok', wolf:'Instagram'},
  {id:128, citizen:'LINE', wolf:'メール'},
  {id:129, citizen:'Twitter', wolf:'Facebook'},
  {id:130, citizen:'Netflix', wolf:'Amazonプライム'},
  // ===== 生活・日常 =====
  {id:131, citizen:'洗濯', wolf:'掃除'},
  {id:132, citizen:'シャンプー', wolf:'リンス'},
  {id:133, citizen:'歯ブラシ', wolf:'歯磨き粉'},
  {id:134, citizen:'めがね', wolf:'コンタクトレンズ'},
  {id:135, citizen:'財布', wolf:'カバン'},
  {id:136, citizen:'傘', wolf:'レインコート'},
  {id:137, citizen:'腕時計', wolf:'スマートウォッチ'},
  {id:138, citizen:'エアコン', wolf:'扇風機'},
  {id:139, citizen:'布団', wolf:'ベッド'},
  {id:140, citizen:'お風呂', wolf:'シャワー'},
  {id:141, citizen:'ティッシュ', wolf:'ウェットティッシュ'},
  {id:142, citizen:'リモコン', wolf:'スイッチ'},
  {id:143, citizen:'マスク', wolf:'サングラス'},
  {id:144, citizen:'スニーカー', wolf:'サンダル'},
  {id:145, citizen:'Tシャツ', wolf:'ポロシャツ'},
  // ===== 学校・仕事 =====
  {id:146, citizen:'先生', wolf:'教授'},
  {id:147, citizen:'テスト', wolf:'レポート'},
  {id:148, citizen:'宿題', wolf:'自主勉強'},
  {id:149, citizen:'入学式', wolf:'卒業式'},
  {id:150, citizen:'給食', wolf:'弁当'},
  {id:151, citizen:'教室', wolf:'講義室'},
  {id:152, citizen:'部活', wolf:'サークル'},
  {id:153, citizen:'修学旅行', wolf:'遠足'},
  {id:154, citizen:'会議', wolf:'面接'},
  {id:155, citizen:'残業', wolf:'徹夜'},
  // ===== スポーツ =====
  {id:156, citizen:'テニス', wolf:'バドミントン'},
  {id:157, citizen:'水泳', wolf:'飛び込み'},
  {id:158, citizen:'マラソン', wolf:'駅伝'},
  {id:159, citizen:'スキー', wolf:'スノボ'},
  {id:160, citizen:'サーフィン', wolf:'ボディボード'},
  {id:161, citizen:'ボクシング', wolf:'空手'},
  {id:162, citizen:'柔道', wolf:'合気道'},
  {id:163, citizen:'ヨガ', wolf:'ピラティス'},
  {id:164, citizen:'ゴルフ', wolf:'ビリヤード'},
  {id:165, citizen:'バレーボール', wolf:'ハンドボール'},
  // ===== 季節・イベント =====
  {id:166, citizen:'誕生日', wolf:'記念日'},
  {id:167, citizen:'花見', wolf:'紅葉狩り'},
  {id:168, citizen:'七夕', wolf:'ひな祭り'},
  {id:169, citizen:'節分', wolf:'十五夜'},
  {id:170, citizen:'結婚式', wolf:'披露宴'},
  {id:171, citizen:'初詣', wolf:'お墓参り'},
  {id:172, citizen:'海の日', wolf:'山の日'},
  {id:173, citizen:'入社式', wolf:'歓迎会'},
  {id:174, citizen:'忘年会', wolf:'新年会'},
  {id:175, citizen:'夏祭り', wolf:'秋祭り'},
  // ===== 乗り物 =====
  {id:176, citizen:'タクシー', wolf:'Uber'},
  {id:177, citizen:'船', wolf:'フェリー'},
  {id:178, citizen:'ヘリコプター', wolf:'飛行機'},
  {id:179, citizen:'パトカー', wolf:'救急車'},
  {id:180, citizen:'ロープウェイ', wolf:'リフト'},
  {id:181, citizen:'エスカレーター', wolf:'エレベーター'},
  {id:182, citizen:'三輪車', wolf:'キックボード'},
  // ===== 音楽 =====
  {id:183, citizen:'ロック', wolf:'メタル'},
  {id:184, citizen:'JPOP', wolf:'KPOP'},
  {id:185, citizen:'ラップ', wolf:'レゲエ'},
  {id:186, citizen:'カラオケ', wolf:'合唱'},
  {id:187, citizen:'ドラム', wolf:'ベース'},
  {id:188, citizen:'バイオリン', wolf:'チェロ'},
  // ===== 似てるけど違うシリーズ（高難度） =====
  {id:189, citizen:'醤油', wolf:'ソース'},
  {id:190, citizen:'マヨネーズ', wolf:'ケチャップ'},
  {id:191, citizen:'わさび', wolf:'からし'},
  {id:192, citizen:'お箸', wolf:'フォーク'},
  {id:193, citizen:'右', wolf:'左'},
  {id:194, citizen:'兄', wolf:'弟'},
  {id:195, citizen:'おじいちゃん', wolf:'おばあちゃん'},
  {id:196, citizen:'筆記体', wolf:'ブロック体'},
  {id:197, citizen:'平仮名', wolf:'カタカナ'},
  {id:198, citizen:'足し算', wolf:'引き算'},
  {id:199, citizen:'太陽', wolf:'月'},
  {id:200, citizen:'雨', wolf:'雪'},
  // ===== 抽象・概念（超高難度） =====
  {id:201, citizen:'愛', wolf:'友情'},
  {id:202, citizen:'自由', wolf:'平和'},
  {id:203, citizen:'努力', wolf:'才能'},
  {id:204, citizen:'優しさ', wolf:'強さ'},
  {id:205, citizen:'過去', wolf:'未来'},
  {id:206, citizen:'夢', wolf:'目標'},
  {id:207, citizen:'嘘', wolf:'秘密'},
  {id:208, citizen:'正義', wolf:'悪'},
  {id:209, citizen:'勝利', wolf:'成功'},
  {id:210, citizen:'笑い', wolf:'涙'},
];

// Redis 未設定時のフォールバック
if (!globalThis.__wolfRooms) globalThis.__wolfRooms = new Map();
const mem = globalThis.__wolfRooms;

// ===== Helpers =====
function rid() { return Math.random().toString(36).substring(2, 12); }
function rcode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODE_MIN = 4, CODE_MAX = 8;
const CODE_NG = `コードは英数字${CODE_MIN}〜${CODE_MAX}文字にしてください`;
function normalizeCode(input) {
  const c = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (c.length >= CODE_MIN && c.length <= CODE_MAX) ? c : null;
}
function freeColor(room) {
  const used = new Set(room.players.map(p => p.color));
  return COLORS.find(c => !used.has(c)) || COLORS[room.players.length % COLORS.length];
}
const clampInt = (v, def, min, max) => {
  const n = parseInt(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// ===== Persistence =====
const key = code => 'wolf:' + code;

async function loadRaw(code) {
  if (kv.enabled) return await kv.get(key(code));
  const raw = mem.get(code);
  if (raw === undefined) return null;
  try {
    if (Date.now() - JSON.parse(raw).createdAt > TTL) { mem.delete(code); return null; }
  } catch (e) { mem.delete(code); return null; }
  return raw;
}
async function saveNew(code, room) {
  const raw = JSON.stringify(room);
  if (kv.enabled) return await kv.setNew(key(code), raw, TTL_SEC);
  if (mem.has(code)) return false;
  mem.set(code, raw);
  return true;
}
async function cas(code, prev, next) {
  if (kv.enabled) return await kv.cas(key(code), prev, next, TTL_SEC);
  const cur = mem.has(code) ? mem.get(code) : null;
  if (cur !== prev) return false;
  mem.set(code, next);
  return true;
}

async function withRoom(code, fn) {
  for (let i = 0; i < CAS_RETRIES; i++) {
    let raw;
    try { raw = await loadRaw(code); }
    catch (e) { return { error: '通信エラーが発生しました' }; }
    if (!raw) return { error: 'ルームが見つかりません' };

    let room;
    try { room = JSON.parse(raw); } catch (e) { return { error: 'ルームが見つかりません' }; }

    const out = fn(room);
    if (out && out.error) return out;

    const next = JSON.stringify(room);
    if (next === raw) return out;

    try {
      if (await cas(code, raw, next)) return out;
    } catch (e) { return { error: '通信エラーが発生しました' }; }

    await sleep(15 + i * 25);
  }
  return { error: '混み合っています。もう一度お試しください' };
}

// ===== Presence =====
function isConnected(room, p, now) {
  return (now - (room.lastSeen[p.id] || 0)) < DISCONNECT_MS;
}
function connectedPlayers(room, now) {
  return room.players.filter(p => isConnected(room, p, now));
}
function allActiveDone(room, flags) {
  const now = Date.now();
  const conn = connectedPlayers(room, now);
  return conn.length > 0 && conn.every(p => flags[p.id]);
}
function pruneLobby(room, now) {
  const before = room.players.length;
  room.players = room.players.filter(p => isConnected(room, p, now));
  if (room.players.length === before) return;
  if (!room.players.find(p => p.id === room.hostId)) {
    room.hostId = room.players.length ? room.players[0].id : null;
  }
}

// ===== ワードペアストア =====
const WLIST_KEY = 'wolf:wordlist';
const WLIST_MAX = 200;
const WLIST_CACHE_MS = 30 * 1000;
let wlistCache = null, wlistCacheAt = 0;

async function getWordPairs() {
  const t = Date.now();
  if (wlistCache && t - wlistCacheAt < WLIST_CACHE_MS) return wlistCache;
  let list = null;
  if (kv.enabled) {
    try {
      const raw = await kv.get(WLIST_KEY);
      if (raw) list = JSON.parse(raw);
    } catch (e) {}
  } else {
    list = globalThis.__wolfWordList || null;
  }
  wlistCache = (Array.isArray(list) && list.length) ? list : WORD_PAIRS;
  wlistCacheAt = t;
  return wlistCache;
}
async function saveWordPairs(list) {
  if (kv.enabled) await kv.set(WLIST_KEY, JSON.stringify(list));
  else globalThis.__wolfWordList = list;
  wlistCache = list; wlistCacheAt = Date.now();
}

// ===== カスタムワードリスト（デッキ） =====
const DECK_TTL_SEC = 90 * 24 * 60 * 60;
const DECK_MIN = 3;
const DECK_MAX = 200;

if (!globalThis.__wolfDecks) globalThis.__wolfDecks = new Map();
const memDecks = globalThis.__wolfDecks;

const deckKey = code => 'wdeck:' + code;
function dcode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

async function getDeck(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!c) return { error: 'コードを入力してください' };
  let raw;
  try {
    if (kv.enabled) raw = await kv.get(deckKey(c));
    else raw = memDecks.has(c) ? memDecks.get(c) : null;
  } catch (e) { return { error: '通信エラーが発生しました' }; }
  if (!raw) return { error: 'そのワードリストは見つかりません' };
  try { return JSON.parse(raw); }
  catch (e) { return { error: 'そのワードリストは見つかりません' }; }
}

async function saveDeck(code, name, items) {
  if (!Array.isArray(items)) return { error: 'ペアリストが不正です' };
  if (items.length < DECK_MIN) return { error: `ペアは${DECK_MIN}件以上必要です` };
  if (items.length > DECK_MAX) return { error: `ペアは${DECK_MAX}件までです` };
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    const ci = String((items[i] && items[i].citizen) || '').trim();
    const wo = String((items[i] && items[i].wolf) || '').trim();
    if (!ci || !wo) return { error: `${i + 1}件目: 両方入力してください` };
    if (ci.length > 20 || wo.length > 20) return { error: `${i + 1}件目: 20文字以内にしてください` };
    pairs.push({ id: i + 1, citizen: ci, wolf: wo });
  }
  const nm = String(name || '').trim().slice(0, 20) || 'カスタムリスト';
  const now = Date.now();

  if (code) {
    const c = normalizeCode(code);
    if (!c) return { error: CODE_NG };
    const deck = { code: c, name: nm, pairs, createdAt: now, updatedAt: now };
    const raw = JSON.stringify(deck);
    try {
      if (kv.enabled) await kv.set(deckKey(c), raw);
      else memDecks.set(c, raw);
    } catch (e) { return { error: '通信エラーが発生しました' }; }
    return deck;
  }

  for (let i = 0; i < 8; i++) {
    const c = dcode();
    const deck = { code: c, name: nm, pairs, createdAt: now, updatedAt: now };
    const raw = JSON.stringify(deck);
    try {
      if (kv.enabled) {
        if (await kv.setNew(deckKey(c), raw, DECK_TTL_SEC)) return deck;
      } else {
        if (!memDecks.has(c)) { memDecks.set(c, raw); return deck; }
      }
    } catch (e) { return { error: '通信エラーが発生しました' }; }
  }
  return { error: '作成に失敗しました。もう一度お試しください' };
}

// ===== ゲームロジック =====

// ワードペアをランダムに選び、プレイヤーに市民/ウルフを割り振る
function assignWords(room, pairs) {
  let avail = pairs.filter(p => !room.usedPairIds.includes(p.id));
  if (!avail.length) { room.usedPairIds = []; avail = pairs.slice(); }
  const pair = avail[Math.floor(Math.random() * avail.length)];
  room.usedPairIds.push(pair.id);
  room.currentPair = { citizen: pair.citizen, wolf: pair.wolf };

  // ウルフを選ぶ: wolfCount 人をランダムに
  const indices = room.players.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const wolfIndices = new Set(indices.slice(0, room.wolfCount));

  room.words = {};
  room.wolfIds = [];
  room.players.forEach((p, i) => {
    if (wolfIndices.has(i)) {
      room.words[p.id] = pair.wolf;
      room.wolfIds.push(p.id);
    } else {
      room.words[p.id] = pair.citizen;
    }
  });
}

function startRound(room, pairs) {
  room.round++;
  room.confirmed = {};
  room.votes = {};
  room.voted = {};
  room.reverseAnswer = null;
  room.reverseResult = null;
  room.roundWinner = null;
  room.eliminatedId = null;
  room.voteCounts = {};
  room.ready = {};

  if (room.round > room.totalRounds) {
    room.phase = 'final';
    room.deadline = null;
    return;
  }

  assignWords(room, pairs);
  room.phase = 'word';
  room.deadline = null; // word phase には制限時間なし（全員確認で進む）
}

function startDiscuss(room) {
  room.phase = 'discuss';
  room.deadline = Date.now() + room.discussSeconds * 1000;
}

function startVote(room) {
  room.phase = 'vote';
  room.votes = {};
  room.voted = {};
  room.deadline = Date.now() + 60 * 1000; // 投票は60秒
}

function tallyVotes(room) {
  // 集計
  const counts = {};
  room.players.forEach(p => { counts[p.id] = 0; });
  Object.values(room.votes).forEach(targetId => {
    if (counts[targetId] !== undefined) counts[targetId]++;
  });
  room.voteCounts = counts;

  // 最多得票者を見つける
  let maxVotes = 0;
  Object.values(counts).forEach(c => { if (c > maxVotes) maxVotes = c; });
  const topIds = Object.keys(counts).filter(id => counts[id] === maxVotes);

  // 同数の場合は全員生存＝ウルフの勝ち
  if (topIds.length > 1) {
    room.eliminatedId = null; // 処刑なし
    room.roundWinner = 'wolf';
  } else {
    room.eliminatedId = topIds[0];
    const isWolf = room.wolfIds.includes(room.eliminatedId);
    room.roundWinner = isWolf ? 'citizen' : 'wolf';
  }

  // ポイント計算
  if (room.roundWinner === 'citizen') {
    // 市民チーム勝利: 市民に1pt
    room.players.forEach(p => {
      if (!room.wolfIds.includes(p.id)) p.score += 1;
    });
  } else {
    // ウルフ勝利: ウルフに2pt
    room.players.forEach(p => {
      if (room.wolfIds.includes(p.id)) p.score += 2;
    });
  }

  room.phase = 'reveal';
  room.ready = {};
  room.deadline = null;
}

function applyReverseAnswer(room, answer) {
  if (!room.currentPair) return;
  const correct = room.currentPair.citizen;
  // ひらがな・カタカナを統一して比較
  const normalize = s => s.replace(/[\u30A1-\u30F6]/g, m =>
    String.fromCharCode(m.charCodeAt(0) - 0x60)).toLowerCase().trim();
  const isCorrect = normalize(answer) === normalize(correct);
  room.reverseAnswer = answer;
  room.reverseResult = isCorrect;
  if (isCorrect) {
    // 逆転: ウルフの勝ち。市民の得点を戻してウルフに加点
    room.players.forEach(p => {
      if (!room.wolfIds.includes(p.id)) p.score -= 1;
      else p.score += 2;
    });
    room.roundWinner = 'wolf-reverse';
  }
}

// ===== Room CRUD =====
async function createRoom(hostName, opts, wantCode) {
  const hostId = rid();
  let fixedCode = null;
  if (wantCode) {
    fixedCode = normalizeCode(wantCode);
    if (!fixedCode) return { error: CODE_NG };
  }

  const discussSeconds = clampInt(opts.discussSeconds, 180, 60, 300);
  const wolfCount = clampInt(opts.wolfCount, 1, 1, 2);
  const totalRounds = clampInt(opts.totalRounds, 3, 1, 5);

  // デッキ指定
  let pool = null, deckCode = null, deckName = null;
  if (opts.deckCode) {
    const d = await getDeck(opts.deckCode);
    if (d.error) return d;
    pool = d.pairs; deckCode = d.code; deckName = d.name;
  }

  const build = code => ({
    code, createdAt: Date.now(), hostId,
    phase: 'lobby',
    players: [{ id: hostId, name: hostName, score: 0, color: COLORS[0] }],
    discussSeconds, wolfCount, totalRounds,
    wordPool: pool, deckCode, deckName,
    round: 0, words: {}, wolfIds: [],
    currentPair: null, usedPairIds: [],
    confirmed: {}, votes: {}, voted: {},
    voteCounts: {}, eliminatedId: null,
    roundWinner: null, reverseAnswer: null, reverseResult: null,
    ready: {},
    deadline: null,
    lastSeen: { [hostId]: Date.now() },
  });

  if (fixedCode) {
    try {
      if (await saveNew(fixedCode, build(fixedCode))) return { code: fixedCode, playerId: hostId };
    } catch (e) { return { error: '通信エラーが発生しました' }; }
    return { error: 'そのルームコードは使われています' };
  }
  for (let i = 0; i < 8; i++) {
    const code = rcode();
    try {
      if (await saveNew(code, build(code))) return { code, playerId: hostId };
    } catch (e) { return { error: '通信エラーが発生しました' }; }
  }
  return { error: 'ルーム作成に失敗しました。もう一度お試しください' };
}

async function joinRoom(code, name) {
  return withRoom(code, room => {
    if (room.phase !== 'lobby') return { error: 'ゲーム進行中です' };
    if (room.players.length >= MAX_PLAYERS) return { error: `満員です（最大${MAX_PLAYERS}人）` };
    if (room.players.some(p => p.name === name)) return { error: 'その名前は使われています' };
    const playerId = rid();
    room.players.push({ id: playerId, name, score: 0, color: freeColor(room) });
    room.lastSeen[playerId] = Date.now();
    return { playerId };
  });
}

// ===== Actions =====
function applyAction(room, playerId, action, data, pairs) {
  if (!room.players.find(p => p.id === playerId)) return { error: 'プレイヤーが見つかりません' };

  switch (action) {
    case 'start': {
      if (playerId !== room.hostId) return { error: 'ホストのみ' };
      if (room.players.length < MIN_PLAYERS) return { error: `${MIN_PLAYERS}人以上必要` };
      room.round = 0;
      room.usedPairIds = [];
      room.players.forEach(p => p.score = 0);
      startRound(room, pairs);
      break;
    }
    case 'confirm_word': {
      if (room.phase !== 'word') return { error: 'フェーズ違い' };
      room.confirmed[playerId] = true;
      if (allActiveDone(room, room.confirmed)) startDiscuss(room);
      break;
    }
    case 'end_discuss': {
      if (room.phase !== 'discuss') return { error: 'フェーズ違い' };
      if (playerId !== room.hostId) return { error: 'ホストのみ' };
      startVote(room);
      break;
    }
    case 'cast_vote': {
      if (room.phase !== 'vote') return { error: 'フェーズ違い' };
      if (room.voted[playerId]) return { error: '投票済み' };
      const targetId = data.targetId;
      if (!targetId || targetId === playerId) return { error: '投票先が不正です' };
      if (!room.players.find(p => p.id === targetId)) return { error: '投票先が見つかりません' };
      room.votes[playerId] = targetId;
      room.voted[playerId] = true;
      if (allActiveDone(room, room.voted)) tallyVotes(room);
      break;
    }
    case 'reverse_answer': {
      if (room.phase !== 'reveal') return { error: 'フェーズ違い' };
      if (room.roundWinner !== 'citizen') return { error: '逆転チャンスはありません' };
      if (!room.wolfIds.includes(playerId)) return { error: 'ウルフのみ' };
      if (room.reverseAnswer !== null) return { error: '回答済み' };
      const answer = String(data.answer || '').trim();
      if (!answer) return { error: '回答を入力してください' };
      applyReverseAnswer(room, answer);
      break;
    }
    case 'ready_next': {
      if (room.phase !== 'reveal') return { error: 'フェーズ違い' };
      room.ready[playerId] = true;
      if (allActiveDone(room, room.ready)) startRound(room, pairs);
      break;
    }
    case 'play_again': {
      if (playerId !== room.hostId) return { error: 'ホストのみ' };
      room.round = 0;
      room.usedPairIds = [];
      room.players.forEach(p => p.score = 0);
      startRound(room, pairs);
      break;
    }
    case 'back_to_lobby': {
      if (playerId !== room.hostId) return { error: 'ホストのみ' };
      room.phase = 'lobby';
      room.round = 0; room.usedPairIds = [];
      room.words = {}; room.wolfIds = []; room.currentPair = null;
      room.confirmed = {}; room.votes = {}; room.voted = {};
      room.voteCounts = {}; room.eliminatedId = null;
      room.roundWinner = null; room.reverseAnswer = null; room.reverseResult = null;
      room.ready = {}; room.deadline = null;
      room.players.forEach(p => p.score = 0);
      break;
    }
    case 'leave': {
      if (room.phase === 'lobby') {
        room.players = room.players.filter(p => p.id !== playerId);
        delete room.lastSeen[playerId];
        if (!room.players.find(p => p.id === room.hostId)) {
          room.hostId = room.players.length ? room.players[0].id : null;
        }
      } else {
        room.lastSeen[playerId] = 0;
      }
      return { left: true };
    }
    default: return { error: '不明なアクション' };
  }
  return { ok: true };
}

// ===== View Builder =====
function buildView(room, playerId, pairs) {
  const now = Date.now();
  if (playerId && now - (room.lastSeen[playerId] || 0) > SEEN_REFRESH_MS) {
    room.lastSeen[playerId] = now;
  }
  if (room.phase === 'lobby') pruneLobby(room, now);

  // タイマー到達による自動遷移
  if (room.deadline && now > room.deadline) {
    if (room.phase === 'discuss') startVote(room);
    else if (room.phase === 'vote') tallyVotes(room);
  }
  // 全員完了チェック
  if (room.phase === 'word' && allActiveDone(room, room.confirmed)) startDiscuss(room);
  if (room.phase === 'vote' && allActiveDone(room, room.voted)) tallyVotes(room);
  if (room.phase === 'reveal' && allActiveDone(room, room.ready)) startRound(room, pairs);

  const v = {
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, color: p.color,
    })),
    roomCode: room.code,
    round: room.round,
    totalRounds: room.totalRounds,
    discussSeconds: room.discussSeconds,
    wolfCount: room.wolfCount,
    deckName: room.deckName || null,
    isHost: room.hostId === playerId,
    hostId: room.hostId,
    myId: playerId,
    now,
    deadline: room.deadline,
  };

  if (room.phase === 'word') {
    v.myWord = room.words[playerId] || null;
    v.confirmed = !!room.confirmed[playerId];
    v.confirmedStatus = {};
    room.players.forEach(p => { v.confirmedStatus[p.id] = !!room.confirmed[p.id]; });
  }

  if (room.phase === 'discuss') {
    v.myWord = room.words[playerId] || null;
  }

  if (room.phase === 'vote') {
    v.myVote = room.votes[playerId] || null;
    v.hasVoted = !!room.voted[playerId];
    v.votedStatus = {};
    room.players.forEach(p => { v.votedStatus[p.id] = !!room.voted[p.id]; });
  }

  if (room.phase === 'reveal') {
    v.voteCounts = room.voteCounts;
    v.eliminatedId = room.eliminatedId;
    v.wolfIds = room.wolfIds;
    v.citizenWord = room.currentPair ? room.currentPair.citizen : null;
    v.wolfWord = room.currentPair ? room.currentPair.wolf : null;
    v.roundWinner = room.roundWinner;
    v.reverseAnswer = room.reverseAnswer;
    v.reverseResult = room.reverseResult;
    v.isWolf = room.wolfIds.includes(playerId);
    v.canReverse = room.roundWinner === 'citizen' && room.wolfIds.includes(playerId) && room.reverseAnswer === null;
    v.isReady = !!room.ready[playerId];
    v.readyStatus = {};
    room.players.forEach(p => { v.readyStatus[p.id] = !!room.ready[p.id]; });
  }

  if (room.phase === 'final') {
    v.finalRanking = [...room.players].sort((a, b) => b.score - a.score);
  }

  return v;
}

// ===== Public API =====
const roomPairs = (room, shared) =>
  (Array.isArray(room.wordPool) && room.wordPool.length) ? room.wordPool : shared;

async function processAction(code, playerId, action, data) {
  const shared = await getWordPairs();
  return withRoom(code, room => {
    const pairs = roomPairs(room, shared);
    const r = applyAction(room, playerId, action, data, pairs);
    if (r.error) return r;
    if (r.left) return { ok: true };
    return buildView(room, playerId, pairs);
  });
}

async function getView(code, playerId) {
  const shared = await getWordPairs();
  return withRoom(code, room => buildView(room, playerId, roomPairs(room, shared)));
}

module.exports = {
  createRoom, joinRoom, processAction, getView, storageEnabled: kv.enabled,
  getWordPairs, saveWordPairs, getDeck, saveDeck,
  WORD_PAIRS, WLIST_MAX,
};
