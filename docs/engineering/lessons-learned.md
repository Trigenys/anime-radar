# Lessons learned

## 2026-10-27 — Synchronisation Telegram : 0 épisode détecté

- **Contexte** : première synchronisation réelle sur les chaînes indiquées par l'utilisateur : 0 annonce détectée sur 4 chaînes.
- **Cause racine** : le parseur avait été conçu sur des formats supposés (une ligne « Titre - Episode 12 ») sans échantillon réel. Les chaînes fournies étaient des sommaires renvoyant vers des chaînes privées, qui publient des cartes multi-lignes (« Season : 01 », « Épisode : 04 », petites capitales Unicode, plages « 01 - 10 »).
- **Classification** : hypothèse non vérifiée sur une donnée externe ; écart de contrat entre la source et le parseur.
- **Résolution** : parseur de cartes (Python et TypeScript), normalisation NFKC et petites capitales, champ `season` optionnel (schéma v1 rétrocompatible), déduplication carte et fichiers, ciblage des chaînes privées par identifiant -100…
- **Prévention vérifiable** : `test/fixtures/telegram-posts.json` contient des messages réels anonymisés ; les deux implémentations sont testées dessus (`npm test` et `python3 -m unittest`, tous deux en CI). Tout nouveau format de chaîne s'ajoute d'abord comme cas de test.
- **Leçon** : un parseur de contenu tiers se conçoit à partir d'échantillons réels capturés, jamais de formats imaginés ; une synchro qui renvoie 0 résultat doit être traitée comme un échec, pas comme un succès.
