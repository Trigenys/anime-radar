#!/usr/bin/env python3
"""Opt-in personal Telegram synchronizer. No messages, media or sessions are published."""
from __future__ import annotations
import argparse
import asyncio
import json
import os
import re
import stat
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "telegram-feed.json"
STATE_DIR = Path.home() / ".config" / "anime-radar"
MAX_EPISODE = 9999
EPISODE_RE = re.compile(
    r"(?:\b(?:episode|ep|eps|épisode)\s*[#.: -]*|\bS\d{1,2}\s*E)(\d{1,4})\b",
    re.IGNORECASE,
)
DASH_EPISODE_RE = re.compile(r"\s[-–—]\s*(\d{1,4})(?:\s|$)")
TITLE_PREFIX_RE = re.compile(r"^\s*(?:anime|nouveau|new)\s*[:|-]\s*", re.IGNORECASE)
TITLE_SUFFIX_RE = re.compile(r"(?:vostfr|vf|fhd|hd|1080p|720p)\s*$", re.IGNORECASE)
# Cartes multi-lignes : « Titre » puis des champs « Season : 01 », « Épisode : 04 » ou « Épisode : 01 - 10 ».
FIELD_EPISODE_RE = re.compile(r"(?<!\w)(?:[eé]pisodes?|eps?)\s*[:：]\s*(\d{1,4})(?:\s*[-–~]\s*(\d{1,4}))?", re.IGNORECASE)
FIELD_SEASON_RE = re.compile(r"(?<!\w)(?:season|saison)\s*[:：]\s*(\d{1,2})", re.IGNORECASE)
TITLE_SEASON_RE = re.compile(r"\s+(?:season|saison)\s*(\d{1,2})\s*$", re.IGNORECASE)
SMALL_CAPS = str.maketrans("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ", "abcdefghijklmnopqrstuvwyz")
QUALITIES = ("2160p", "1080p", "720p", "480p")


def clean_text(text: str) -> str:
    """Ramène les lettres stylisées (gras mathématique, petites capitales) à des lettres simples."""
    return unicodedata.normalize("NFKC", text).translate(SMALL_CAPS)


def tidy_title(raw: str) -> str:
    title = re.sub(r"^[\W_]+", "", raw)
    title = re.sub(r"[^\w!?)\]]+$", "", title).strip()
    letters = [char for char in title if char.isalpha()]
    if letters and (all(char.isupper() for char in letters) or all(char.islower() for char in letters)):
        title = re.sub(r"(^|[\s\-(\[/:])([a-z])", lambda m: m.group(1) + m.group(2).upper(), title.lower())
    return title


def parse_card(lines: list[str]) -> tuple[str, int, int | None] | None:
    episode_match = next((m for m in map(FIELD_EPISODE_RE.search, lines[1:]) if m), None)
    if episode_match is None:
        return None
    episode = max(int(value) for value in episode_match.groups() if value)
    season_match = next((m for m in map(FIELD_SEASON_RE.search, lines[1:]) if m), None)
    season = int(season_match.group(1)) if season_match else None
    title = lines[0]
    in_title = TITLE_SEASON_RE.search(title)
    if in_title:
        season = season or int(in_title.group(1))
        title = title[:in_title.start()]
    return title, episode, season


def parse_line(line: str) -> tuple[str, int, int | None] | None:
    line = re.sub(r"@[A-Za-z0-9_]+|[\[\]【】]", " ", line).strip()
    found = EPISODE_RE.search(line) or DASH_EPISODE_RE.search(line)
    if not found:
        return None
    title = TITLE_PREFIX_RE.sub("", line[:found.start()])
    title = TITLE_SUFFIX_RE.sub("", title)
    return title.rstrip("-:#. ").strip(), int(found.group(1)), None


def extract(message: str, date: datetime, source: str, post_id: str, url: str | None) -> dict | None:
    text = clean_text(message)
    lines = [part.strip() for part in text.splitlines() if part.strip()]
    if not lines:
        return None
    parsed = parse_card(lines) or parse_line(lines[0])
    if parsed is None:
        return None
    raw_title, ep, season = parsed
    title = tidy_title(raw_title)
    if not 1 <= ep <= MAX_EPISODE or not 2 <= len(title) <= 140:
        return None
    result = {
        "id": post_id,
        "title": title,
        "episode": ep,
        "postedAt": date.astimezone(timezone.utc).isoformat(),
        "source": source[:90],
    }
    if season is not None and 1 <= season <= 99:
        result["season"] = season
    if re.search(r"\bVOSTFR\b", text, re.IGNORECASE):
        result["language"] = "VOSTFR"
    elif re.search(r"\bVF\b", text, re.IGNORECASE):
        result["language"] = "VF"
    elif re.search(r"\b(?:dual|multi)\s*audio\b", text, re.IGNORECASE):
        result["language"] = "MULTI"
    elif re.search(r"\beng(?:lish)?\s*sub\b", text, re.IGNORECASE):
        result["language"] = "EN SUB"
    quality = next((q for q in QUALITIES if re.search(rf"\b{q}\b", text, re.IGNORECASE)), None)
    if quality:
        result["quality"] = quality
    if url and re.fullmatch(r"https://t\.me/[A-Za-z0-9_]+/\d+", url):
        result["url"] = url
    return result


def normalize_title(text: str) -> str:
    """Équivalent de normalizeTitle (src/domain.ts)."""
    text = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c)).lower()
    text = re.sub(r"\b(season|saison|part|cour|s)\s*[1-9]\b", "", text)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text).strip())


def dedupe(items: list[dict]) -> list[dict]:
    """Une même sortie arrive souvent en plusieurs messages (carte, fichiers 360p/720p) : on garde le titre le plus court."""
    kept: list[dict] = []
    for item in sorted(items, key=lambda i: (len(i["title"]), i["postedAt"])):
        name = normalize_title(item["title"])
        duplicate = any(
            other["source"] == item["source"] and other["episode"] == item["episode"]
            and (other.get("season") is None or item.get("season") is None or other["season"] == item["season"])
            and name.startswith(normalize_title(other["title"]))
            for other in kept
        )
        if not duplicate:
            kept.append(item)
    return kept


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
    if any(source.lstrip("-").isdigit() for source in sources):
        # Les chaînes privées (identifiant -100…) ne sont résolues qu'une fois connues de la session.
        await client.get_dialogs(limit=None)
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
    write_private_feed(dedupe(items))


def load_local_env() -> None:
    """Lit ROOT/.env (ignoré par Git) ; les variables déjà définies dans le terminal restent prioritaires."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(ROOT / ".env", override=False)


async def main(args) -> None:
    from telethon import TelegramClient
    load_local_env()
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
