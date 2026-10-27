import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { getAiringAnime, getRecentlyAired, formattedTime } from "./api";
import { bestTelegramMatch, safeFeed, type Anime, type TelegramEpisode } from "./domain";

type View = "discover" | "calendar" | "telegram" | "favorites";
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale";
const NAV: { key:View;label:string;icon:string }[] = [
  {key:"discover",label:"Découvrir",icon:"◈"}, {key:"calendar",label:"Calendrier",icon:"▦"},
  {key:"telegram",label:"Telegram",icon:"✈"}, {key:"favorites",label:"Favoris",icon:"♡"}
];
function readFavorites(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("anime-radar:favorites") || "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch { return []; }
}
function relative(ts: number | string) {
  const diff = Date.now() - (typeof ts === "number" ? ts*1000 : Date.parse(ts));
  if (!Number.isFinite(diff)) return "Date inconnue";
  const hours = Math.max(0, Math.floor(Math.abs(diff)/3600000));
  if (hours < 1) return "À l'instant";
  if (diff < 0) return "Dans " + (hours < 24 ? hours+" h" : Math.ceil(hours/24)+" j");
  return "Il y a " + (hours < 24 ? hours+" h" : Math.floor(hours/24)+" j");
}
function AnimeCard({ anime, matched, favorite, toggle }: {anime:Anime;matched?:TelegramEpisode;favorite:boolean;toggle:()=>void}) {
  return <article className="anime-card">
    <div className="poster-wrap">
      <img src={anime.cover} alt={"Affiche de "+anime.title} loading="lazy" referrerPolicy="no-referrer" />
      <div className="poster-shade"/>
      <span className="poster-format">{anime.format || "ANIME"}</span>
      <button className={"heart "+(favorite ? "on" : "")} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={toggle}>{favorite ? "♥" : "♡"}</button>
      {typeof anime.averageScore === "number" && <div className="rating">★ {Math.round(anime.averageScore)/10}</div>}
    </div>
    <div className="anime-body">
      <p className="mini-label">{anime.genres.slice(0,2).join(" · ") || "Animation japonaise"}</p>
      <a className="anime-title" href={anime.siteUrl} target="_blank" rel="noopener noreferrer">{anime.title}</a>
      <div className="anime-meta">
        {anime.nextEpisode ? <span><b>EP {anime.nextEpisode.episode}</b> · {relative(anime.nextEpisode.at)}</span>
        : anime.officialRecent ? <span>EP {anime.officialRecent.episode} · diffusé {relative(anime.officialRecent.at).toLowerCase()}</span>
        : <span>Prochaine date non renseignée</span>}
      </div>
      <div className={"telegram-info "+(matched ? "active" : "")}>
        <span className="telegram-symbol">✈</span>
        <span>{matched ? "Telegram · épisode "+matched.episode+" détecté" : "Aucun épisode Telegram associé"}</span>
      </div>
    </div>
  </article>;
}
export default function App() {
  const [anime, setAnime] = useState<Anime[]>([]);
  const [posts,setPosts] = useState<TelegramEpisode[]>([]);
  const [view,setView] = useState<View>("discover");
  const [query,setQuery] = useState("");
  const [genre,setGenre] = useState("Tous");
  const [favorites,setFavorites] = useState<number[]>(readFavorites);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [telegramError,setTelegramError] = useState("");
  const [feedTime,setFeedTime] = useState("");
  const [localSync,setLocalSync] = useState(false);
  const [refreshKey,setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);setError("");
    getAiringAnime(controller.signal).then(async data => {
      const recent = await getRecentlyAired(controller.signal);
      const latest = new Map<number,{episode:number;at:number}>();
      for (const item of recent) if (!latest.has(item.animeId)) latest.set(item.animeId,{episode:item.episode,at:item.at});
      setAnime(data.map(item => ({...item,officialRecent:latest.get(item.id)})));
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Chargement impossible"); })
      .finally(() => {if(!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[refreshKey]);

  useEffect(() => {localStorage.setItem("anime-radar:favorites",JSON.stringify(favorites));},[favorites]);
  async function connectLocal(showError = true) {
    try {
      const result = await fetch("http://127.0.0.1:8765/feed", {cache:"no-store",signal:AbortSignal.timeout(5000)});
      if(!result.ok)throw new Error("Service local indisponible");
      const data = safeFeed(await result.json());
      setPosts(data.episodes);
      setFeedTime(data.generatedAt);
      setLocalSync(true);setTelegramError("");
    } catch {
      if(showError) setTelegramError("Impossible de joindre la synchronisation locale. Lance le serveur documenté dans le README ou importe le JSON.");
      setLocalSync(false);
    }
  }
  useEffect(() => {
    if (!localSync) return;
    const timer = window.setInterval(() => { void connectLocal(false); }, 60000);
    return () => window.clearInterval(timer);
  },[localSync]);
  async function importFeed(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];if(!file)return;
    try {
      if(file.size > 2_000_000)throw new Error("Fichier trop volumineux (2 Mo max).");
      const data = safeFeed(JSON.parse(await file.text()) as unknown);
      setPosts(data.episodes);setFeedTime(data.generatedAt);setTelegramError("");setLocalSync(false);
      setView("telegram");
    } catch(err) {setTelegramError(err instanceof Error?err.message:"JSON invalide");}
    e.target.value = "";
  }
  const genres = useMemo(() => ["Tous",...new Set(anime.flatMap(a=>a.genres))].sort((a,b)=>a==="Tous"?-1:b==="Tous"?1:a.localeCompare(b)) ,[anime]);
  const filtered = useMemo(() => anime.filter(item => {
    const text = [item.title,...item.alternativeTitles].join(" ").toLowerCase();
    return text.includes(query.toLowerCase()) && (genre==="Tous"||item.genres.includes(genre)) && (view!=="favorites"||favorites.includes(item.id));
  }),[anime,query,genre,view,favorites]);
  const upcoming = useMemo(() => [...filtered].filter(item=>item.nextEpisode).sort((a,b)=>(a.nextEpisode?.at||0)-(b.nextEpisode?.at||0)),[filtered]);
  const matchedCount = useMemo(()=>anime.filter(item=>bestTelegramMatch(item,posts)).length,[anime,posts]);
  const sortedPosts = useMemo(()=>[...posts].sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)),[posts]);
  const recentPosts = sortedPosts.filter(p=>normalizeQuery(p.title).includes(normalizeQuery(query)));
  const nextOne = upcoming[0];

  function toggle(id:number) {setFavorites(prev=>prev.includes(id)?prev.filter(k=>k!==id):[...prev,id]);}
  return <div className="app">
    <aside className="sidebar" aria-label="Navigation principale">
      <a className="brand" href="/" aria-label="AnimeRadar, accueil"><span className="brand-logo">◉</span><span>anime<span className="brand-accent">radar</span><small>BY TRIGENYS</small></span></a>
      <p className="sidebar-heading">EXPLORE</p>
      <nav className="navigation">{NAV.map(x=><button key={x.key} className={"nav-item "+(view===x.key?"selected":"")} onClick={()=>setView(x.key)}><span className="nav-icon">{x.icon}</span>{x.label}{x.key==="telegram" && posts.length>0 && <span className="nav-count">{posts.length}</span>}</button>)}</nav>
      <div className="sidebar-divider"/>
      <div className="side-info"><div className="side-info-icon">✧</div><strong>Ton univers, à jour.</strong><p>Un seul radar pour les sorties officielles et tes sources Telegram.</p><button onClick={()=>setView("telegram")}>Configurer Telegram <span>↗</span></button></div>
      <div className="sidebar-bottom"><span className="online-dot"/><span>AniList · Données publiques</span></div>
    </aside>
    <div className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Découverte</span><span>/</span><strong>{NAV.find(v=>v.key===view)?.label}</strong></div><div className="top-actions"><span className="timezone">◷ {TIMEZONE.replace("_"," ")}</span><button className="refresh-button" onClick={()=>setRefreshKey(k=>k+1)} title="Actualiser les diffusions">↻ <span>Actualiser</span></button><div className="avatar">AR</div></div></header>
      <main>
        <section className="hero-section">
          <div className="hero-left"><div className="hero-eyebrow"><span className="pulse-dot"/> LE RADAR DE LA SAISON <span className="hero-line"/></div>
            <h1>Tes animés.<br/><span>Au bon moment.</span></h1>
            <p>Les prochaines diffusions, les derniers épisodes et tes découvertes Telegram. Tout est réuni au même endroit, sans spoiler.</p>
            <div className="hero-ctas"><button onClick={()=>setView("calendar")} className="primary-cta">Voir le calendrier <span>↗</span></button><button onClick={()=>setView("telegram")} className="secondary-cta">✈ Connecter Telegram</button></div>
          </div>
          <div className="hero-right" aria-label="Statistiques du radar">
            <div className="orb orb-one"/><div className="orb orb-two"/><div className="radar-ring ring-one"/><div className="radar-ring ring-two"/><div className="radar-ring ring-three"/><div className="radar-core"><div className="radar-core-mark">◉</div><div className="scan-line"/></div>
            <div className="radar-stat stat-top"><span>EN DIFFUSION</span><strong>{anime.length || "—"}</strong><small>animés suivis</small></div>
            <div className="radar-stat stat-bottom"><span>TELEGRAM</span><strong>{posts.length}</strong><small>épisodes repérés</small></div>
          </div>
        </section>
        <div className="stats-strip">
          <div><span className="stat-icon violet">◈</span><span><strong>{anime.length || (loading?"…":"0")}</strong><small>Animés en cours</small></span></div>
          <div><span className="stat-icon green">◷</span><span><strong>{upcoming.length}</strong><small>Prochains épisodes</small></span></div>
          <div><span className="stat-icon blue">✈</span><span><strong>{matchedCount}</strong><small>Correspondances Telegram</small></span></div>
          <div><span className="stat-icon amber">♡</span><span><strong>{favorites.length}</strong><small>Mes favoris</small></span></div>
        </div>
        <section className="dashboard">
          <div className="section-heading"><div><p className="section-eyebrow">{view==="telegram"?"MES SOURCES":view==="calendar"?"AGENDA":view==="favorites"?"MA LISTE":"DÉCOUVRIR"}</p><h2>{view==="discover"?"À l'affiche cette saison":view==="calendar"?"Prochaines diffusions":view==="telegram"?"Épisodes de Telegram":"Mes animés favoris"}</h2><p className="section-desc">{view==="telegram"?"Uniquement les messages d'animés que tu as choisi de synchroniser.":view==="calendar"?"Heures converties automatiquement dans ton fuseau local.":"Diffusions réelles et annonces personnelles, clairement distinguées."}</p></div>
            {nextOne && view!=="telegram" && <div className="next-pill"><span className="next-dot"/><span>Prochain : <strong>EP {nextOne.nextEpisode?.episode}</strong></span></div>}
          </div>
          {view==="telegram" && <div className="telegram-connect">
            <div className="connect-icon">✈</div><div className="connect-copy"><strong>Relier tes chaînes Telegram</strong><p>Lecture locale, sans mot de passe dans GitHub. Importe un flux JSON généré par le synchroniseur ou connecte le service de ton PC.</p>
            {feedTime && <small>Dernière synchronisation : {new Date(feedTime).toLocaleString("fr-FR")} · {localSync?"Actualisation automatique toutes les 60 s":"Import local"}</small>}</div>
            <div className="connect-actions"><label className="upload-button">Importer un flux JSON <input type="file" accept=".json,application/json" onChange={e=>{void importFeed(e);}} hidden /></label><button className="local-button" onClick={()=>{void connectLocal();}}>↻ Synchro locale</button></div>
          </div>}
          {telegramError && <div className="alert" role="alert">{telegramError}</div>}
          {view!=="telegram" && <div className="controls"><label className="search"><span>⌕</span><input type="search" placeholder="Rechercher un animé…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Rechercher un animé" /></label><select value={genre} onChange={e=>setGenre(e.target.value)} aria-label="Filtrer par genre">{genres.map(g=><option key={g}>{g}</option>)}</select><div className="item-count">{filtered.length} résultats</div></div>}
          {view==="telegram" && <label className="search telegram-search"><span>⌕</span><input type="search" placeholder="Rechercher dans mes épisodes…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
          {error && <div className="alert" role="alert">{error} <button onClick={()=>setRefreshKey(k=>k+1)}>Réessayer</button></div>}
          {loading && view!=="telegram" && <div className="loading" role="status">◉ Synchronisation avec AniList…</div>}
          {!loading && !error && view!=="telegram" && filtered.length===0 && <div className="empty"><span>◌</span><h3>Aucun animé à afficher</h3><p>Modifie tes filtres ou actualise le catalogue.</p></div>}
          {(view==="discover"||view==="favorites") && <div className="anime-grid">{filtered.map(item=><AnimeCard key={item.id} anime={item} matched={bestTelegramMatch(item,posts)} favorite={favorites.includes(item.id)} toggle={()=>toggle(item.id)}/>)}</div>}
          {view==="calendar" && <div className="schedule-list">{upcoming.map(item=><article className="schedule-row" key={item.id}><img src={item.cover} alt="" loading="lazy"/><div><strong>{item.title}</strong><span>Épisode {item.nextEpisode?.episode} · {item.genres.slice(0,2).join(" · ")}</span></div><div className="schedule-date"><strong>{item.nextEpisode?formattedTime(item.nextEpisode.at):"—"}</strong><small>{item.nextEpisode?relative(item.nextEpisode.at):""}</small></div><a href={item.siteUrl} target="_blank" rel="noopener noreferrer" aria-label={"Voir "+item.title+" sur AniList"}>↗</a></article>)}{!loading&&upcoming.length===0&&<div className="empty">Aucune diffusion à venir renseignée.</div>}</div>}
          {view==="telegram" && <div className="telegram-list">{recentPosts.map(post=><article key={post.id} className="telegram-row"><div className="telegram-row-icon">✈</div><div className="telegram-row-main"><strong>{post.title}</strong><span>{post.source} · {new Date(post.postedAt).toLocaleString("fr-FR")}</span></div><div className="telegram-row-ep">EP {post.episode}</div><div className="telegram-row-tags">{post.language&&<span>{post.language}</span>}{post.quality&&<span>{post.quality}</span>}</div>{post.url&&<a href={post.url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la publication Telegram">↗</a>}</article>)}{recentPosts.length===0 && <div className="empty"><span>✈</span><h3>Ton flux Telegram est encore vide</h3><p>Connecte le synchroniseur local ou importe un fichier généré sur ta machine. Aucun message personnel ne sera envoyé à AniList.</p></div>}</div>}
        </section>
      </main>
      <footer><span>© 2026 Trigenys · AnimeRadar</span><span>AniList pour les métadonnées · Telegram uniquement depuis tes sources autorisées</span><a href="https://github.com/Trigenys/anime-radar" target="_blank" rel="noopener noreferrer">Open source ↗</a></footer>
    </div>
  </div>;
}
function normalizeQuery(q:string){return q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
