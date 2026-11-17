// Feather Daily API: one shared daily word puzzle for the flock, plus streaks and a leaderboard.
// Real SQLite storage.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'daily.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  bird TEXT NOT NULL,
  day TEXT NOT NULL,
  points INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  words INTEGER NOT NULL,
  streak INTEGER NOT NULL DEFAULT 1,
  created TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS run_day ON runs(day);
CREATE INDEX IF NOT EXISTS run_points ON runs(points DESC);`);

const BANK = require('./bank.json');

function dayKey(d) {
  const x = d || new Date();
  return x.toISOString().slice(0, 10);
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makePuzzle(day) {
  const seed = hash(day);
  let s = seed;
  const r = (n) => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
  const pool = BANK.slice();
  const picked = [];
  const want = 5;
  while (picked.length < want && pool.length) {
    picked.push(pool.splice(r(pool.length), 1)[0]);
  }
  return picked.map(p => ({ word: p.word, clue: p.clue, len: p.word.length }));
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}
function bestByBird() {
  return db.prepare(`SELECT bird, MAX(points) AS points, MIN(seconds) AS seconds, MAX(words) AS words,
    MAX(streak) AS streak, COUNT(*) AS runs FROM runs GROUP BY bird ORDER BY points DESC, seconds ASC LIMIT 50`).all();
}
function streakFor(bird, day) {
  const rows = db.prepare('SELECT DISTINCT day FROM runs WHERE bird=? ORDER BY day DESC LIMIT 60').all(bird);
  const days = rows.map(r => r.day);
  if (!days.length || days[0] !== day) return 0;
  let streak = 1;
  const d = new Date(day + 'T00:00:00Z');
  for (let i = 1; i < days.length; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const prev = d.toISOString().slice(0, 10);
    if (days[i] === prev) streak++;
    else break;
  }
  return streak;
}

module.exports = function handler(req, res, route) {
  route = Array.isArray(route) ? route.join('/') : String(route || '');
  const seg = route.split('/').filter(Boolean);

  if (req.method === 'GET' && (route === 'puzzle' || route === '')) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(seg[0] || '')) ? String(seg[0]) : dayKey();
    const puzzle = makePuzzle(day);
    return json(res, 200, { day, puzzle, count: puzzle.length });
  }

  if (req.method === 'GET' && route === 'scores') {
    const runs = db.prepare('SELECT * FROM runs ORDER BY created DESC LIMIT 40').all();
    return json(res, 200, { scores: bestByBird(), runs });
  }

  if (req.method === 'GET' && route === 'streak') {
    const bird = String(seg[0] || '').trim().slice(0, 40);
    const day = dayKey();
    if (!bird) return json(res, 400, { error: 'who?' });
    return json(res, 200, { bird, day, streak: streakFor(bird, day) });
  }

  if (req.method === 'POST' && route === 'score') {
    return readBody(req).then(b => {
      const bird = String(b.bird || '').trim().slice(0, 40);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || '')) ? String(b.day) : dayKey();
      const points = parseInt(b.points, 10);
      const seconds = parseInt(b.seconds, 10);
      const words = parseInt(b.words, 10);
      if (!bird) return json(res, 400, { error: 'who is playing?' });
      if (!Number.isFinite(points) || points < 0) return json(res, 400, { error: 'bad points' });
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      db.prepare('INSERT INTO runs (id,bird,day,points,seconds,words,streak,created) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, bird, day, points, Number.isFinite(seconds) ? seconds : 0, Number.isFinite(words) ? words : 0, 0, new Date().toISOString());
      const streak = Math.max(1, streakFor(bird, day));
      db.prepare('UPDATE runs SET streak=? WHERE id=?').run(streak, id);
      return json(res, 200, { ok: true, run: { id, bird, day, points, seconds, words, streak }, scores: bestByBird() });
    });
  }

  return json(res, 404, { error: 'not found' });
};
