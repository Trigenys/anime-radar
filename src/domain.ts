export interface TelegramEpisode {
  id: string;
  title: string;
  episode: number;
  season?: number;
  postedAt: string;
  source: string;
  language?: string;
  quality?: string;
  url?: string;
}
export interface Anime {
  id: number;
  title: string;
  alternativeTitles: string[];
  cover: string;
  banner?: string;
  genres: string[];
  description: string;
  averageScore?: number;
  episodes?: number;
  format?: string;
  startDate?: string;
  nextEpisode?: { episode: number; at: number };
  officialRecent?: { episode: number; at: number };
  siteUrl: string;
}
export interface TelegramFeed {
  schemaVersion: 1;
  generatedAt: string;
  episodes: TelegramEpisode[];
}
export function normalizeTitle(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\b(season|saison|part|cour|s)\s*[1-9]\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export function parseTelegramPost(text: string, date: string, source: string, id: string, url?: string): TelegramEpisode | null {
  const clean = cleanText(text);
  const lines = clean.split(/\r?\n/).map(part => part.trim()).filter(Boolean);
  if (!lines.length) return null;
  const parsed = parseCard(lines) || parseLine(lines[0]);
  if (!parsed) return null;
  const title = tidyTitle(parsed.title);
  const { episode, season } = parsed;
  if (!Number.isInteger(episode) || episode < 1 || episode > MAX_EPISODE || title.length < 2 || title.length > 140) return null;
  const postedAt = new Date(date).toISOString();
  const safeUrl = url && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(url) ? url : undefined;
  return { id, title, episode, season: season !== undefined && season >= 1 && season <= 99 ? season : undefined, postedAt, source,
    language: languageOf(clean), quality: QUALITIES.find(q => new RegExp(`\\b${q}\\b`, "i").test(clean)), url: safeUrl };
}
// Même logique que scripts/telegram_sync.py ; les deux sont vérifiés par test/fixtures/telegram-posts.json.
const MAX_EPISODE = 9999;
const QUALITIES = ["2160p", "1080p", "720p", "480p"];
const SMALL_CAPS = new Map([..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ"].map((c, i) => [c, "abcdefghijklmnopqrstuvwyz"[i]]));
const FIELD_EPISODE = /(?<![\p{L}\p{N}_])(?:[eé]pisodes?|eps?)\s*[:：]\s*(\d{1,4})(?:\s*[-–~]\s*(\d{1,4}))?/iu;
const FIELD_SEASON = /(?<![\p{L}\p{N}_])(?:season|saison)\s*[:：]\s*(\d{1,2})/iu;
const TITLE_SEASON = /\s+(?:season|saison)\s*(\d{1,2})\s*$/i;
type Parsed = { title: string; episode: number; season?: number };
function cleanText(text: string): string {
  return [...text.normalize("NFKC")].map(c => SMALL_CAPS.get(c) ?? c).join("");
}
function tidyTitle(raw: string): string {
  const title = raw.replace(/^(?:[^\p{L}\p{N}]|_)+/u, "").replace(/[^\p{L}\p{N}_!?)\]]+$/u, "").trim();
  const letters = [...title].filter(c => /\p{L}/u.test(c));
  const upper = letters.every(c => c !== c.toLowerCase()), lower = letters.every(c => c !== c.toUpperCase());
  return letters.length && (upper || lower)
    ? title.toLowerCase().replace(/(^|[\s\-(\[/:])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    : title;
}
function parseCard(lines: string[]): Parsed | null {
  const episodeMatch = lines.slice(1).map(line => FIELD_EPISODE.exec(line)).find(Boolean);
  if (!episodeMatch) return null;
  const episode = Math.max(...episodeMatch.slice(1).filter(Boolean).map(Number));
  const seasonMatch = lines.slice(1).map(line => FIELD_SEASON.exec(line)).find(Boolean);
  let season = seasonMatch ? Number(seasonMatch[1]) : undefined;
  let title = lines[0];
  const inTitle = TITLE_SEASON.exec(title);
  if (inTitle) {
    season = season || Number(inTitle[1]);
    title = title.slice(0, inTitle.index);
  }
  return { title, episode, season };
}
function parseLine(line: string): Parsed | null {
  const normalized = line.replace(/@[A-Za-z0-9_]+|[【】\[\]]/g, " ").trim();
  const match = normalized.match(/(?:\b(?:episode|ep|eps)\s*[#.: -]*|(?<![\p{L}\p{N}_])épisode\s*[#.: -]*|\bS\d{1,2}\s*E)(\d{1,4})\b/iu)
    || normalized.match(/\s[-–—]\s*(\d{1,4})(?:\s|$)/);
  if (!match) return null;
  const title = normalized.slice(0, match.index).replace(/^(\s*(anime|nouveau|new)\s*[:|-]\s*)/i, "")
    .replace(/(?:vostfr|vf|fhd|hd|1080p|720p)\s*$/i, "")
    .replace(/[-:#.\s]+$/, "").trim();
  return { title, episode: Number(match[1]) };
}
function languageOf(text: string): string | undefined {
  if (/\bVOSTFR\b/i.test(text)) return "VOSTFR";
  if (/\bVF\b/i.test(text)) return "VF";
  if (/\b(?:dual|multi)\s*audio\b/i.test(text)) return "MULTI";
  if (/\beng(?:lish)?\s*sub\b/i.test(text)) return "EN SUB";
  return undefined;
}
export function bestTelegramMatch(anime: Anime, posts: TelegramEpisode[]): TelegramEpisode | undefined {
  const aliases = anime.alternativeTitles.map(normalizeTitle).filter(Boolean);
  return posts.filter(post => aliases.some(alias => {
    const normalized = normalizeTitle(post.title);
    return normalized === alias || (normalized.length > 7 && alias.length > 7 && (normalized.includes(alias) || alias.includes(normalized)));
  })).sort((a, b) => (b.season ?? 0) - (a.season ?? 0) || b.episode - a.episode || Date.parse(b.postedAt) - Date.parse(a.postedAt))[0];
}
export function safeFeed(input: unknown): TelegramFeed {
  if (!input || typeof input !== "object") throw new Error("Le fichier ne contient pas un objet JSON.");
  const obj = input as Record<string, unknown>;
  if (obj.schemaVersion !== 1 || !Array.isArray(obj.episodes)) throw new Error("Format attendu : schemaVersion 1 et tableau episodes.");
  if (obj.episodes.length > 5000) throw new Error("Le fichier dépasse la limite de 5 000 épisodes.");
  const episodes: TelegramEpisode[] = obj.episodes.map((value, i) => {
    if (!value || typeof value !== "object") throw new Error("Entrée Telegram invalide " + i);
    const item = value as Record<string, unknown>;
    if (typeof item.title !== "string" || item.title.length < 2 || item.title.length > 140 ||
        typeof item.source !== "string" || item.source.length > 90 || typeof item.postedAt !== "string" ||
        !Number.isFinite(Date.parse(item.postedAt)) || typeof item.episode !== "number" ||
        !Number.isInteger(item.episode) || item.episode < 1 || item.episode > MAX_EPISODE)
      throw new Error("Épisode Telegram invalide " + i);
    return { id: String(item.id || i), title: item.title, source: item.source,
      episode: item.episode, postedAt: item.postedAt,
      season: typeof item.season === "number" && Number.isInteger(item.season) && item.season >= 1 && item.season <= 99 ? item.season : undefined,
      language: typeof item.language === "string" ? item.language.slice(0, 15) : undefined,
      quality: typeof item.quality === "string" ? item.quality.slice(0, 15) : undefined,
      url: typeof item.url === "string" && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(item.url) ? item.url : undefined };
  });
  return { schemaVersion: 1, generatedAt: typeof obj.generatedAt === "string" && Number.isFinite(Date.parse(obj.generatedAt)) ? obj.generatedAt : new Date().toISOString(), episodes };
}
