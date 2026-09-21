# Backlog UI de l'extension — P1 et P2

Issu de la session de conception du 2026-09-20 sur la refonte de l'interface
(popup + overlay dans le fil). Le lot **P0** part en spec séparée et n'est pas
repris ici.

Maquettes de référence : artifact Claude « No Spoiler — Maquettes UI »
(<https://claude.ai/artifact/777pvycNwi8i2TSMyEGTGK>). Elles ne montrent que le
P0 — tout ce qui suit est volontairement absent des artboards.

Rappel du P0, pour situer les dépendances :

1. Interrupteur on/off global
2. Refus des doublons à l'ajout
3. URL du backend configurable
4. Statut du moteur + « Tester » (`GET /health`)
5. Overlay : état « analyse en cours »
6. Overlay : état erreur + « Réessayer » / « Afficher quand même »
7. Pastille « extension active » flottante dans le fil
8. Refonte visuelle popup + overlay
9. Identité : logo « disque filé », et clés `icons` / `action.default_icon`
   absentes du manifeste aujourd'hui

---

## P1

### P1-1 — Motif du masquage

**Contexte.** L'overlay dit « Spoiler détecté » sans nommer le sujet qui a
déclenché. `packages/backend/src/app.ts` pose une question `noul` par tweet sur
la watchlist entière : il sait *qu'il y a* spoiler, pas *pour quel sujet*.

**Comportement attendu.** L'overlay affiche « Spoiler · <sujet> ».

**Touche.** `packages/shared/src/judge.ts` (`JudgeResponse.results` passe de
`Record<string, boolean>` à `Record<string, { spoiler: boolean; topic?: string }>`),
`packages/backend/src/app.ts`, `packages/extension/src/content-script.ts`.

**Coût — à trancher avant de démarrer.** Deux options écartées en P0 pour cette
raison :

- _Une question par couple (tweet × sujet)_ dans le même appel `systemOne`.
  Simple, mais le coût LLM est multiplié par la taille de la watchlist à chaque
  batch.
- _Deux passes_ : passe 1 inchangée, passe 2 uniquement sur les tweets déjà
  flaggés pour identifier le sujet. Coût ≈ flaggés × sujets, donc faible en
  pratique, au prix d'un aller-retour de plus et d'un motif affiché en différé.

**Bloque.** P1-3 (un signal de faux positif sans le sujet visé est peu
exploitable).

### P1-2 — Re-masquer après révélation

**Contexte.** `unblurTweet` retire la classe et l'overlay : l'action est
irréversible pour la session.

**Comportement attendu.** Après révélation, un bandeau discret en tête du post
avec « Re-masquer ». Remet l'état `spoiler`.

**Touche.** `packages/extension/src/content-script.ts` uniquement.

**Dépend de.** La machine à états de l'overlay livrée en P0 (états `pending` /
`clear` / `spoiler` / `error`) — ce ticket n'ajoute qu'une transition.

### P1-3 — « Pas un spoiler » (faux positif)

**Contexte.** Aucun moyen de signaler une erreur de jugement. Le même post
sera re-flouté au prochain chargement.

**Comportement attendu.** Bouton « Pas un spoiler » sur l'overlay et sur le
bandeau de P1-2. Effet minimal : ce tweet n'est plus flouté (mémorisé par id).
La remontée du signal au backend est hors périmètre de ce ticket.

**Touche.** `packages/extension/src/content-script.ts`, plus une clé de
stockage pour les ids graciés.

**Question ouverte.** Durée de rétention des ids graciés — session, ou
persistant avec purge ?

**Dépend de.** P1-1.

### P1-4 — Pause temporaire

**Contexte.** Le P0 ne livre qu'un on/off binaire. Mettre en pause « le temps
de regarder le match » impose de penser à réactiver.

**Comportement attendu.** 15 min / 1 h / jusqu'à demain, globale ou par sujet.
Un sujet en pause reste visible dans la liste, barré, avec le temps restant.
Réactivation automatique à l'échéance. La pastille in-page passe alors en état
« en pause » avec le temps restant et un bouton « Reprendre » — le P0 ne lui
donne aucune action, c'est ici qu'elle en gagne une.

**Touche.** `packages/extension/src/settings.ts` (échéance persistée),
`popup.ts`, `content-script.ts`. La réactivation à l'échéance demande soit une
alarme (`chrome.alarms`, donc une permission de plus au manifeste), soit une
vérification paresseuse à chaque lecture — trancher au moment de la spec.

### P1-5 — Sensibilité par sujet

**Contexte.** `SPOILER_THRESHOLD` est une constante à 0.5 pour tout le monde.
« Élections » et « Dune 3 » ne méritent pas la même prudence.

**Comportement attendu.** Trois crans par sujet (souple / modéré / strict),
pastille cliquable sur la ligne du sujet.

**Touche.** `packages/shared/src/judge.ts` (`JudgeRequest.watchlist` passe de
`string[]` à une liste d'objets — changement de contrat cassant),
`packages/backend/src/app.ts` (seuil par sujet), `watchlist.ts`, `popup.ts`.

**Note.** C'est le ticket le plus cassant du lot : la watchlist stockée doit
être migrée. Prévoir une lecture tolérante des anciennes valeurs `string[]`.

### P1-6 — Compteur de spoilers masqués

**Contexte.** Rien ne montre que l'extension travaille.

**Comportement attendu.** Bandeau chiffré en tête du popup (« 27 spoilers
masqués cette semaine »). Un artboard de la V1 des maquettes le montrait.
Second emplacement : le compte de la page courante dans la pastille in-page au
survol (« 3 masqués ici »), volontairement absent du P0.

**Touche.** `content-script.ts` (incrément, et rendu dans la pastille),
`settings.ts` ou une clé dédiée, `popup.ts`.

**Question ouverte.** Fenêtre glissante ou compteur total remis à zéro à la
main ?

### P1-7 — Activer / désactiver par site

**Contexte.** `host_permissions` couvre déjà `x.com` et `twitter.com`, mais
l'interrupteur P0 est global.

**Comportement attendu.** Un interrupteur par domaine dans le panneau
réglages ; l'interrupteur global reste maître.

**Touche.** `settings.ts` (map domaine → booléen), `content-script.ts`
(`syncState` lit le domaine courant), panneau réglages.

---

## P2

### P2-1 — Éditer un sujet

Renommer sans supprimer/recréer. Double-clic sur la ligne → champ en place.
Touche `watchlist.ts` (un `renameTopic` qui repasse par la même normalisation
que l'ajout, dédup comprise) et `popup.ts`.

### P2-2 — Filtrer la watchlist

Utile au-delà d'une quinzaine de sujets. Champ de recherche au-dessus de la
liste, filtrage purement local. Touche `popup.ts` seul.

### P2-3 — Import / export de la watchlist

Export JSON téléchargé, import par sélection de fichier. Utile pour changer de
machine. Touche `popup.ts`, `watchlist.ts`. L'import doit passer par la
normalisation et la dédup du P0, pas écrire le tableau brut.

### P2-4 — Suggestions de sujets tendance

Proposer des sujets à l'écran de premier lancement. Demande une source de
tendances — donc une dépendance réseau et une décision produit qui n'existe
pas encore. À ne pas démarrer sans cette décision.

### P2-5 — Replier ou supprimer au lieu de flouter

Le flou reste devinable et prend de la place. Alternative : replier le post en
une ligne, ou le retirer du fil. Choix global dans les réglages. Touche
`content-script.ts` et le panneau réglages. Attention : supprimer un post du
DOM d'une SPA est fragile — X peut le réinsérer au recyclage de la liste.

---

## Questions à trancher

- P1-1 : une passe (tweet × sujet) ou deux passes ? Décide du coût LLM.
- P1-3 : rétention des ids graciés — session ou persistant ?
- P1-4 : `chrome.alarms` (permission supplémentaire) ou échéance vérifiée
  paresseusement ?
- P1-5 : stratégie de migration de la watchlist `string[]` existante.
- P1-6 : fenêtre glissante ou total remis à zéro à la main ?
- P2-4 : d'où viennent les tendances ? Sans réponse, le ticket ne démarre pas.
