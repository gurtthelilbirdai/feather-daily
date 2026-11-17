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

const BANK = [
  {word:'WADDLE', clue:'how a round bird moves'},
  {word:'FEATHER', clue:'what keeps a bird warm'},
  {word:'NEST', clue:"a bird's little home"},
  {word:'CHIRP', clue:'a tiny bird sound'},
  {word:'POND', clue:'where lily pads float'},
  {word:'SEED', clue:'a snack found in grass'},
  {word:'SONG', clue:'what a bird sings'},
  {word:'MOTH', clue:'a fluttery nighttime snack'},
  {word:'RAIN', clue:'drops from clouds'},
  {word:'LEAF', clue:'green thing on a branch'},
  {word:'STAR', clue:'a pinprick in the night'},
  {word:'ROCK', clue:'a hard grey ground thing'},
  {word:'LAMP', clue:'a tiny sun for the yard'},
  {word:'BOOK', clue:'pages full of words'},
  {word:'TREE', clue:'a tall plant with branches'},
  {word:'FISH', clue:'lives in the pond'},
  {word:'HOP', clue:'a short bird jump'},
  {word:'WARM', clue:'what a feather jacket gives'},
  {word:'ROOST', clue:'where birds settle for the night'},
  {word:'MIGRATE', clue:'to fly south for winter'},
  {word:'PLUMAGE', clue:'a bird colourful coat'},
  {word:'CACHE', clue:'a hidden stash of food'},
  {word:'BROOD', clue:'a family of young birds'},
  {word:'OWLET', clue:'a very young night bird'},
  {word:'TALON', clue:'a bird gripping toe'},
  {word:'GLIDE', clue:'to drift on spread wings'},
  {word:'PECK', clue:'to tap at food with the beak'},
  {word:'FLOCK', clue:'a group of birds together'},
  {word:'PERCH', clue:'where a bird sits and sings'},
  {word:'MULLET', clue:'a small silver pond fish'},
  {word:'HERON', clue:'a long-legged water bird'},
  {word:'DOVE', clue:'a soft cooing bird'},
  {word:'WREN', clue:'a tiny brown songbird'},
  {word:'EGG', clue:'what a nest holds first'},
  {word:'HAWK', clue:'a keen-eyed hunter bird'},
  {word:'SWIFT', clue:'a bird that hardly ever lands'},
  {word:'ROBIN', clue:'the red-breasted morning bird'},
  {word:'SPARROW', clue:'a small brown common bird'},
  {word:'CROW', clue:'a big black clever bird'},
  {word:'OWL', clue:'a round-faced night hunter'},
  {word:'GULL', clue:'a seaside scavenger bird'},
  {word:'MAGPIE', clue:'a black and white shiny bird'},
  {word:'LARK', clue:'a bird that sings while rising'},
  {word:'IBIS', clue:'a long curved beak wader'},
  {word:'EMU', clue:'a huge bird that cannot fly'},
  {word:'KIWI', clue:'a round ground bird with a long beak'},
  {word:'TOUCAN', clue:'a bird with a huge colourful beak'},
  {word:'PARROT', clue:'a bird that copies speech'},
  {word:'PENGUIN', clue:'a bird that swims instead of flies'},
  {word:'ALBATROSS', clue:'a huge seabird with long wings'},
  {word:'FLAMINGO', clue:'a pink long-legged wader'},
  {word:'WOODPECKER', clue:'a bird that taps at tree trunks'},
  {word:'KINGFISHER', clue:'a blue bird that dives for fish'},
  {word:'NIGHTHAWK', clue:'a bird that hunts at dusk'},
  {word:'CHICKEN', clue:'a farm bird that pecks grain'},
  {word:'PIGEON', clue:'a city bird with a soft coo'},
  {word:'SWALLOW', clue:'a bird that dips low over water'},
  {word:'FEEDER', clue:'a garden box full of seed'},
  {word:'POND', clue:'where lily pads float'},
  {word:'MOSS', clue:'soft green stuff on a stone'},
  {word:'BERRY', clue:'a small round fruit for birds'},
  {word:'GARDEN', clue:'where the flowers and worms are'}
];

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
  const rnd = (n) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; }; };
  const r = rnd();
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
