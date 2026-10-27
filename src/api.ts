import type { Anime } from "./domain";
const URL = "https://graphql.anilist.co";
const FIELDS = "id title { romaji english native } coverImage { extraLarge large } bannerImage genres description(asHtml:false) averageScore episodes format startDate { year month day } nextAiringEpisode { episode airingAt } siteUrl";
interface AniListMedia {
  id: number;
  title: { english?: string; romaji?: string; native?: string };
  coverImage: { extraLarge?: string; large?: string };
  bannerImage?: string;
  genres?: string[];
  description?: string;
  averageScore?: number;
  episodes?: number;
  format?: string;
  startDate?: { year?: number; month?: number; day?: number };
  nextAiringEpisode?: { episode: number; airingAt: number };
  siteUrl?: string;
}
function mapMedia(media: AniListMedia): Anime {
  const aliases = [media.title.english, media.title.romaji, media.title.native].filter((t): t is string => Boolean(t));
  const d = media.startDate;
  return { id: media.id, title: media.title.english || media.title.romaji || media.title.native || "Sans titre",
    alternativeTitles: aliases, cover: media.coverImage.extraLarge || media.coverImage.large || "",
    banner: media.bannerImage, genres: media.genres || [],
    description: (media.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    averageScore: media.averageScore, episodes: media.episodes || undefined, format: media.format,
    startDate: d?.year && d?.month && d?.day ? [d.year, String(d.month).padStart(2,"0"), String(d.day).padStart(2,"0")].join("-") : undefined,
    nextEpisode: media.nextAiringEpisode ? { episode: media.nextAiringEpisode.episode, at: media.nextAiringEpisode.airingAt } : undefined,
    siteUrl: media.siteUrl || "https://anilist.co/anime/" + media.id };
}
async function graphQL<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(URL, {
    method:"POST", headers: { "Content-Type": "application/json", Accept:"application/json" },
    body: JSON.stringify({ query, variables }), signal
  });
  if (!response.ok) throw new Error("AniList indisponible (HTTP " + response.status + ").");
  const body = await response.json() as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message || "Réponse AniList invalide");
  return body.data;
}
export async function getAiringAnime(signal?: AbortSignal): Promise<Anime[]> {
  const query = "query { first: Page(page:1, perPage:25) { media(type:ANIME, status:RELEASING, sort:POPULARITY_DESC) { "+FIELDS+" } } second: Page(page:2, perPage:25) { media(type:ANIME, status:RELEASING, sort:POPULARITY_DESC) { "+FIELDS+" } } }";
  const data = await graphQL<{ first:{media:AniListMedia[]};second:{media:AniListMedia[]} }>(query, {}, signal);
  return [...data.first.media, ...data.second.media].map(mapMedia).filter(a => a.cover);
}
export async function getRecentlyAired(signal?: AbortSignal): Promise<{ animeId: number; episode:number; at:number }[]> {
  const now = Math.floor(Date.now()/1000);
  const query = "query ($since:Int,$now:Int) { Page(page:1,perPage:25) { airingSchedules(airingAt_greater:$since, airingAt_lesser:$now, sort:TIME_DESC) { mediaId episode airingAt } } }";
  try {
    const data = await graphQL<{ Page:{airingSchedules:{mediaId:number;episode:number;airingAt:number}[]} }>(query, {since:now-7*86400,now}, signal);
    return data.Page.airingSchedules.map(({ mediaId,episode,airingAt }) => ({animeId:mediaId,episode,at:airingAt}));
  } catch { return []; }
}
export function formattedTime(timestamp: number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",...options }).format(new Date(timestamp*1000));
}
