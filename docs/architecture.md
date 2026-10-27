# Architecture — AnimeRadar

## Sources et exactitude

**AniList :** titres, images chargées à distance, prochaine diffusion officielle annoncée. L'historique récent est demandé séparément via AiringSchedule. En cas d'échec, l'application n'invente pas un épisode.

**Telegram :** uniquement les messages publiés dans les sources expressément configurées localement. Une publication détectée ne constitue pas une preuve de disponibilité officielle.

**Matching :** normalisation déterministe (casse, accents, ponctuation). Des saisons différentes peuvent avoir des titres proches ; cela justifie un futur adaptateur de correspondance plus précis.

## Frontière de confiance

- Le frontend communique avec AniList pour les métadonnées publiques seulement.
- Telethon utilise une session utilisateur dans le profil OS, jamais dans Git.
- Le synchroniseur n'enregistre pas les messages bruts, médias ni liens de téléchargement ; il produit des métadonnées minimales filtrées.
- Le flux reste sur le PC de l'utilisateur et dans la mémoire du navigateur.
- Le serveur local en lecture seule utilise 127.0.0.1 et la liste restreinte des origines Vite.
- Tout déploiement public nécessitant des données Telegram exigerait un backend authentifié et une nouvelle revue de sécurité.

## RAIDER

Reusable : modules de parsing indépendants et format JSON versionné.
Agnostic : AniList et Telegram sont des adaptateurs indépendants.
Idempotent : synchronisations atomiques, état recalculé.
Durable : identifiants et timestamps par publication.
Engineering-grade : entrée validée, exécution sans secrets côté web, tests et CI Node 24.
Retroactive : lecture des derniers messages, pas seulement des nouveautés futures.

## Limites

- Les diffusions récentes AniList ne garantissent pas un historique complet.
- Messages complexes, noms de saisons et posts sans numéro d'épisode peuvent ne pas être détectés.
- Toute API locale non authentifiée doit rester sur l'interface loopback et ne jamais être exposée.
- Un hébergement public de l'application ne doit pas inclure le répertoire data/ ni les sessions Telegram.
- Pas de déploiement configuré dans ce MVP.
