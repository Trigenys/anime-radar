export interface TelegramEpisode {
  id: string;
  title: string;
  episode: number;
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
  const line = text.split(/\r?\n/).map(part => part.trim()).find(Boolean) || "";
  const normalized = line.replace(/[【】\[\]]/g, " ").trim();
  const match = normalized.match(/(?:\b(?:episode|ep|épisode|eps)\s*[#.: -]*|(?:\bS\d{1,2}\s*E))(\d{1,3})\b/i)
    || normalized.match(/\s[-–—]\s*(\d{1,3})(?:\s|$)/);
  if (!match) return null;
  const episode = Number(match[1]);
  if (!Number.isInteger(episode) || episode < 1 || episode > 999) return null;
  const title = normalized.slice(0, match.index).replace(/^(\s*(anime|nouveau|new)\s*[:|-]\s*)/i, "")
    .replace(/(?:vostfr|vf|fhd|hd|1080p|720p)\s*$/i, "")
    .replace(/[-:#.\s]+$/, "").trim();
  if (title.length < 2 || title.length > 140) return null;
  const postedAt = new Date(date).toISOString();
  const safeUrl = url && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(url) ? url : undefined;
  return { id, title, episode, postedAt, source, language: /\bVOSTFR\b/i.test(text) ? "VOSTFR" : /\bVF\b/i.test(text) ? "VF" : undefined,
    quality: /\b(2160p|1080p|720p|480p)\b/i.exec(text)?.[1], url: safeUrl };
}
export function bestTelegramMatch(anime: Anime, posts: TelegramEpisode[]): TelegramEpisode | undefined {
  const aliases = anime.alternativeTitles.map(normalizeTitle).filter(Boolean);
  return posts.filter(post => aliases.some(alias => {
    const normalized = normalizeTitle(post.title);
    return normalized === alias || (normalized.length > 7 && alias.length > 7 && (normalized.includes(alias) || alias.includes(normalized)));
  })).sort((a, b) => b.episode - a.episode || Date.parse(b.postedAt) - Date.parse(a.postedAt))[0];
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
        !Number.isInteger(item.episode) || item.episode < 1 || item.episode > 999)
      throw new Error("Épisode Telegram invalide " + i);
    return { id: String(item.id || i), title: item.title, source: item.source,
      episode: item.episode, postedAt: item.postedAt,
      language: typeof item.language === "string" ? item.language.slice(0, 15) : undefined,
      quality: typeof item.quality === "string" ? item.quality.slice(0, 15) : undefined,
      url: typeof item.url === "string" && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(item.url) ? item.url : undefined };
  });
  return { schemaVersion: 1, generatedAt: typeof obj.generatedAt === "string" && Number.isFinite(Date.parse(obj.generatedAt)) ? obj.generatedAt : new Date().toISOString(), episodes };
}
