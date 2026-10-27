<!-- appfactory:hero:start -->
<div align="center">

# AnimeRadar

### Ton calendrier animé. Tes épisodes Telegram. Un seul radar.

**Un tableau de bord open source qui sépare les diffusions officielles des épisodes repérés dans les chaînes Telegram que tu choisis de suivre.**

[![Build](https://github.com/Trigenys/anime-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/Trigenys/anime-radar/actions/workflows/ci.yml)
[![Stage: MVP](https://img.shields.io/badge/Stage-MVP-805AD5)](#état-du-projet)
[![AppFactory](https://img.shields.io/badge/Built%20with-AppFactory-7045af)](https://github.com/Trigenys/appfactory)
[![License: MIT](https://img.shields.io/badge/License-MIT-1f8a70)](LICENSE)

**[Démarrer](#démarrage)** · **[Telegram](#telegram--synchronisation-personnelle)** · **[Architecture](#architecture)** · **[Sécurité](#confidentialité-et-sécurité)**

</div>
<!-- appfactory:hero:end -->

## Pourquoi AnimeRadar ?

Le calendrier de diffusion d'un animé et l'annonce de disponibilité d'un épisode dans une chaîne Telegram ne sont pas la même chose. AnimeRadar affiche ces deux signaux sans les confondre : horaires locaux, numéros d'épisodes, source et date de détection. Le code est public ; tes informations Telegram ne le sont pas.

## Fonctionnalités implémentées

- **React 19 / Vite** : catalogue, recherche, filtres par genre, favoris locaux et calendrier trié, responsive.
- **AniList GraphQL** : une sélection d'animés récemment lancés, populaires ou bientôt diffusés, dates de première diffusion, prochains épisodes et, si disponible, diffusions récentes. Les métadonnées officielles restent distinctes de Telegram.
- **Telegram** : import privé du flux JSON ; synchronisation via Telethon sur une sélection explicite de chaînes. Aucun message brut, lien média ou session dans le dépôt.
- **Serveur local facultatif** : API en lecture seule, limitée à 127.0.0.1, accessible depuis Vite local uniquement.
- **AppFactory** : blueprint webapp, Project Automation sans PAT, CI Node 24 et tests du parseur.

## Démarrage

Prérequis : Node.js 24+.

~~~bash
git clone https://github.com/Trigenys/anime-radar.git
cd anime-radar
npm install
npm run dev
~~~

Ouvre l'adresse fournie par Vite, habituellement http://localhost:5173. Le catalogue AniList fonctionne sans Telegram. Vérifier : npm test, puis npm run build.

## Telegram — synchronisation personnelle

Le bot Telegram standard ne peut pas consulter automatiquement l'historique de toutes tes conversations. Le connecteur utilise donc une **session utilisateur locale** via l'API Telegram, et ne lit que les chaînes expressément indiquées. Aucune clé, session ou publication n'est demandée dans GitHub.

1. Depuis [my.telegram.org](https://my.telegram.org), récupère tes identifiants API (api_id et api_hash). Ils restent sur ton PC.
2. Installe Python 3.11+, puis : python -m pip install -r scripts/requirements-telegram.txt
3. Copie .env.example en .env (ignoré par Git) et remplis-le, puis lance python scripts/telegram_sync.py. Ou, sans fichier, dans PowerShell, remplace les exemples par tes valeurs réelles :

   ~~~powershell
   $env:TELEGRAM_API_ID="TON_API_ID"
   $env:TELEGRAM_API_HASH="TON_API_HASH"
   $env:TELEGRAM_CHATS="nom_canal_1,nom_canal_2"
   python scripts/telegram_sync.py --watch --interval 15
   ~~~

   Le premier lancement demande le code de connexion Telegram et éventuellement ton mot de passe 2FA, **uniquement dans ta console**. La session est gardée dans ton profil utilisateur, hors du dépôt.

4. Pour la mise à jour automatique dans l'interface, démarre dans un deuxième terminal : python scripts/local_feed_server.py
5. Ouvre AnimeRadar en local, onglet Telegram, puis clique sur **Synchro locale**. Le navigateur recharge le flux chaque minute tant que le service est joignable.

Alternative : exécute python scripts/telegram_sync.py une fois, puis sélectionne le fichier data/telegram-feed.json via **Importer un flux JSON**. Ce flux est en mémoire de la page et n'est pas envoyé à AniList.

**Important :** seuls les chats que tu as choisis sont interrogés. Indique les chaînes qui publient les épisodes, pas les chaînes « sommaire » qui y renvoient ; une chaîne privée se désigne par son identifiant -100… (visible dans l'URL de Telegram Web). Les formats reconnus incluent « Frieren - Episode 12 VOSTFR », « Frieren EP 12 », « Frieren - 12 » et les cartes multi-lignes (titre, puis « Season : 01 » / « Épisode : 04 », y compris en petites capitales). Les exemples de référence sont dans test/fixtures/telegram-posts.json, partagés par les tests Python et TypeScript. Les messages qui ne correspondent pas ne sont pas inventés. Aucun téléchargement ni contournement DRM.

## Architecture

~~~text
AniList GraphQL (public) ───────────────► React / Vite
                                           ├─ Catalogue / calendrier
                                           ├─ Favoris sur cet appareil
                                           └─ Correspondances d'épisodes
Telegram (chats choisis par toi)
  └─ Telethon sur ton PC
       └─ Extraction de métadonnées (sans médias)
            └─ data/telegram-feed.json [ignoré par Git]
                 ├─ Import manuel dans le navigateur
                 └─ Serveur 127.0.0.1:8765 [facultatif]
~~~

Les contrats et la CI réutilisables proviennent d'[AppFactory](https://github.com/Trigenys/appfactory) et d'[AppFactory Project Automation](https://github.com/EagleFox31/appfactory-project-automation). Voir [architecture et limites](docs/architecture.md).

## Confidentialité et sécurité

- Dépôt **public MIT**, mais données Telegram **privées et locales**. Les chemins data/, .env* et *.session* sont exclus par .gitignore.
- Les identifiants API restent dans l'environnement de ton système. Ne jamais les mettre dans React, GitHub Actions, issues ou commits.
- Le synchroniseur ne conserve ni messages complets, ni vidéos, ni liens externes arbitraires. Seuls des liens de publications publiques t.me peuvent être enregistrés.
- Le serveur personnel n'écoute que sur 127.0.0.1 et n'implémente aucune écriture. L'import est validé et limité à 5 000 épisodes / 2 Mo.
- **Ne jamais committer** un export Telegram. Une instance hébergée publiquement doit utiliser un backend authentifié distinct pour conserver des données privées.

## État du projet

**MVP de développement, non déployé.** Interface et connecteur implémentés ; il faut encore effectuer un essai de bout en bout avec les chaînes personnelles explicitement autorisées. Les couvertures sont chargées depuis AniList, qui peut limiter la fréquence des requêtes. Aucune garantie de catalogue exhaustif ni d'historique complet des épisodes. Les épisodes Telegram ne constituent pas une preuve de disponibilité légale.

## Roadmap

- P0 : prototype, tests, catalogue et calendrier ; valider CI.
- P1 : import de chaînes réelles, ajustements du parsing et gestion des saisons/homonymies.
- P2 : notifications locales, cache résilient, préférences de sources.
- P3 : éventuel déploiement public du seul catalogue, après revue des données personnelles.

## Contribution

Issues et PR bienvenues. Respecter RAIDER (**Reusable, Agnostic, Idempotent, Durable, Engineering-grade, Retroactive**). AnimeRadar n'est affilié ni à Telegram, ni à AniList, ni à un distributeur d'animés.
