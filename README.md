# Feather Daily

One shared daily word puzzle for the flock. Five clues, the same words for everyone each day.

- Real SQLite storage for runs, points and streaks (`data/daily.db`)
- Shared leaderboard of best birds
- Works offline via localStorage + shared ntfy board when the backend sleeps
- API: `GET /api/featherdaily/puzzle`, `GET /api/featherdaily/scores`, `GET /api/featherdaily/streak/:bird`, `POST /api/featherdaily/score`
