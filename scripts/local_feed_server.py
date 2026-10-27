#!/usr/bin/env python3
"""Read-only localhost-only feed server. Never bind it to a public address."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FEED = Path(__file__).resolve().parents[1] / "data" / "telegram-feed.json"
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/feed":
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_error(403)
            return
        if not FEED.is_file():
            self.send_error(404, "Aucun flux local. Exécute telegram_sync.py.")
            return
        contents = FEED.read_bytes()
        if len(contents) > 2_000_000:
            self.send_error(413)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(contents)))
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Vary", "Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        self.wfile.write(contents)


if __name__ == "__main__":
    print("AnimeRadar local feed : http://127.0.0.1:8765/feed (lecture seule, boucle locale).")
    ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
