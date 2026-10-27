#!/usr/bin/env python3
"""Opt-in personal Telegram synchronizer. No messages, media or sessions are published."""
from __future__ import annotations
import argparse
import asyncio
import json
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "telegram-feed.json"
STATE_DIR = Path.home() / ".config" / "anime-radar"
EPISODE_RE = re.compile(
    r"(?:\b(?:episode|ep|eps|épisode)\s*[#.: -]*|\bS\d{1,2}\s*E)(\d{1,3})\b",
    re.IGNORECASE,
)
DASH_EPISODE_RE = re.compile(r"\s[-–—]\s*(\d{1,3})(?:\s|$)")
TITLE_PREFIX_RE = re.compile(r"^\s*(?:anime|nouveau|new)\s*[:|-]\s*", re.IGNORECASE)
TITLE_SUFFIX_RE = re.compile(r"(?:vostfr|vf|fhd|hd|1080p|720p)\s*$", re.IGNORECASE)


def extract(message: str, date: datetime, source: str, post_id: str, url: str | None) -> dict | None:
    first_line = next((part.strip() for part in message.splitlines() if part.strip()), "")
    line = re.sub(r"[\[\]【】]", " ", first_line).strip()
    found = EPISODE_RE.search(line) or DASH_EPISODE_RE.search(line)
    if not found:
        return None
    ep = int(found.group(1))
    if not 1 <= ep <= 999:
        return None
    title = TITLE_PREFIX_RE.sub("", line[:found.start()])
    title = TITLE_SUFFIX_RE.sub("", title)
    title = title.rstrip("-:#. ").strip()
    if not 2 <= len(title) <= 140:
        return None
    result = {
        "id": post_id,
        "title": title,
        "episode": ep,
        "postedAt": date.astimezone(timezone.utc).isoformat(),
        "source": source[:90],
    }
    if re.search(r"\bVOSTFR\b", message, re.IGNORECASE):
        result["language"] = "VOSTFR"
    elif re.search(r"\bVF\b", message, re.IGNORECASE):
        result["language"] = "VF"
    quality = re.search(r"\b(2160p|1080p|720p|480p)\b", message, re.IGNORECASE)
    if quality:
        result["quality"] = quality.group(1)
    if url and re.fullmatch(r"https://t\.me/[A-Za-z0-9_]+/\d+", url):
        result["url"] = url
    return result


def write_private_feed(items: list[dict]) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schemaVersion": 1, "generatedAt": datetime.now(timezone.utc).isoformat(),
               "episodes": sorted(items, key=lambda item: item["postedAt"], reverse=True)[:5000]}
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        temporary.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    temporary.replace(OUTPUT)
    print(f"Flux local actualisé : {len(payload['episodes'])} épisodes. Aucun message brut enregistré.")


async def sync_once(client, sources: list[str], limit: int) -> None:
    items: list[dict] = []
    for source in sources:
        try:
            entity = await client.get_entity(int(source) if source.lstrip("-").isdigit() else source)
            name = getattr(entity, "title", None) or getattr(entity, "username", None) or source
            public_name = getattr(entity, "username", None)
            count = 0
            async for message in client.iter_messages(entity, limit=limit):
                if not message.message or not message.date:
                    continue
                url = f"https://t.me/{public_name}/{message.id}" if public_name else None
                normalized = extract(message.message, message.date, str(name), f"{source}:{message.id}", url)
                if normalized is not None:
                    items.append(normalized)
                    count += 1
            print(f"{source}: {count} annonces d'épisodes détectées.")
        except Exception as exc:
            print(f"{source}: synchronisation indisponible ({type(exc).__name__}).")
    write_private_feed(items)


async def main(args) -> None:
    from telethon import TelegramClient
    api_id = os.getenv("TELEGRAM_API_ID", "")
    api_hash = os.getenv("TELEGRAM_API_HASH", "")
    sources = [entry.strip() for entry in os.getenv("TELEGRAM_CHATS", "").split(",") if entry.strip()]
    if not api_id.isdigit() or not api_hash or not sources:
        raise SystemExit("Définir TELEGRAM_API_ID, TELEGRAM_API_HASH et TELEGRAM_CHATS (chats autorisés, séparés par des virgules).")
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    session_path = STATE_DIR / "personal"
    async with TelegramClient(str(session_path), int(api_id), api_hash) as client:
        # Authentification interactive à la première exécution ; la session reste hors du dépôt.
        while True:
            await sync_once(client, sources, args.limit)
            if not args.watch:
                break
            await asyncio.sleep(max(300, args.interval * 60))
    for session_file in STATE_DIR.glob("personal.session*"):
        try:
            session_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Synchronise des annonces d'animés depuis des chats Telegram explicitement sélectionnés.")
    parser.add_argument("--watch", action="store_true", help="Actualise périodiquement le flux, tant que le processus tourne.")
    parser.add_argument("--interval", type=int, default=15, help="Intervalle en minutes (minimum 5).")
    parser.add_argument("--limit", type=int, default=150, help="Messages récents lus par chat (1 à 500).")
    args = parser.parse_args()
    if not 1 <= args.limit <= 500:
        parser.error("--limit doit être compris entre 1 et 500")
    asyncio.run(main(args))
