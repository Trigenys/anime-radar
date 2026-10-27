import test from "node:test";
import assert from "node:assert/strict";
import { parseTelegramPost, normalizeTitle, safeFeed, bestTelegramMatch } from "../src/domain.ts";

test("detects episode from selected channel without storing media URLs", () => {
  const result = parseTelegramPost("Frieren - Episode 12 VOSTFR 1080p\nhttps://example.net/media", "2026-10-27T10:00:00Z", "Mes animés", "channel:123", "https://t.me/officialchannel/123");
  assert.equal(result?.title, "Frieren");
  assert.equal(result?.episode, 12);
  assert.equal(result?.language, "VOSTFR");
  assert.equal(result?.url, "https://t.me/officialchannel/123");
  assert.ok(!JSON.stringify(result).includes("example.net"));
});
test("rejects non anime chatter and arbitrary external links", () => {
  assert.equal(parseTelegramPost("Rendez-vous demain", "2026-10-27T10:00:00Z", "ch", "42"), null);
  const post = parseTelegramPost("Frieren - 12", "2026-10-27T10:00:00Z", "ch", "42", "https://evil.example");
  assert.equal(post?.url,undefined);
});
test("validates private feed schema", () => {
  const feed = safeFeed({schemaVersion:1, generatedAt:"2026-10-27T10:00:00Z", episodes:[{title:"Frieren",source:"test",episode:8,postedAt:"2026-10-27T10:00:00Z",url:"https://evil.example"}]});
  assert.equal(feed.episodes[0].url,undefined);
  assert.throws(() => safeFeed({schemaVersion:1,episodes:[{title:"x",source:"test",episode:0,postedAt:"x"}]}));
});
test("matches normalized titles", () => {
  const anime = {id:1,title:"Frieren: Beyond Journey’s End",alternativeTitles:["Sousou no Frieren","Frieren"],cover:"",genres:[],description:"",siteUrl:"https://anilist.co/anime/1"};
  const posts = [parseTelegramPost("Frieren - Episode 5", "2026-10-27T10:00:00Z","Anime","1")!];
  assert.equal(bestTelegramMatch(anime,posts)?.episode,5);
  assert.equal(normalizeTitle("Épisode : 12"),"episode 12");
});
