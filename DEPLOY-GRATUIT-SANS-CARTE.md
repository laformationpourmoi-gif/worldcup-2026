# 🆓 Héberger gratuitement — SANS carte bancaire

Render exige une carte (vérification anti-abus). Si tu n'en veux pas, voici **deux options 100 % gratuites, sans carte**. Tu as déjà le dépôt `laformationpourmoi-gif/worldcup-2026` sur GitHub — c'est tout ce qu'il faut.

---

## Option 1 — GitHub Pages ⚡ (le plus simple, 2 min, aucun compte en plus)

Met en ligne la page avec **toutes les vraies données** (tirage, 12 groupes, calendrier, classement FIFA, actus). 
➡️ Le rafraîchissement automatique est **désactivé** (pas de serveur), mais l'affichage est complet et réel.

1. Va sur ton dépôt : **https://github.com/laformationpourmoi-gif/worldcup-2026**
2. Onglet **Settings** → menu de gauche **Pages**.
3. Sous **Build and deployment** → **Source** : choisis **Deploy from a branch**.
4. **Branch** : `main` · dossier `/ (root)` → **Save**.
5. Attends ~1 min, recharge : ton lien public s'affiche en haut :
   **`https://laformationpourmoi-gif.github.io/worldcup-2026/`**

✅ Gratuit, permanent, aucune carte, ne s'endort jamais. Parfait pour consulter/partager.
⚠️ Données figées à la dernière mise à jour du code (pas de live). Pour le live → Option 2.

---

## Option 2 — Vercel 🟢 (gratuit, SANS carte, et garde les données EN DIRECT)

Vercel (offre **Hobby**) héberge la page **et** l'API en direct, sans carte, et **ne s'endort pas**
(démarrage quasi instantané). Le fichier `api/snapshot.mjs` est déjà prêt dans le dépôt.

1. Va sur **https://vercel.com** → **Sign Up** → **Continue with GitHub** (gratuit, pas de carte).
2. **Add New… → Project** → **Import** le dépôt `worldcup-2026`.
3. Laisse tout par défaut (Framework: *Other*, aucune commande de build) → **Deploy**.
4. En ~1 min : ton URL **`https://worldcup-2026.vercel.app/`** 🟢 avec actus en direct.

**(Option) stats en direct** : Project → **Settings → Environment Variables** →
ajoute `FOOTBALLDATA_KEY` = ta clé gratuite (https://www.football-data.org/client/register) → **Redeploy**.

> Comme `api/snapshot.mjs` appelle directement le flux gratuit, **aucune autre config** n'est nécessaire.
> Le front appelle `/api/snapshot` sur le même domaine → ça marche tout seul.

---

## Laquelle choisir ?

| | GitHub Pages | Vercel |
|---|---|---|
| Carte bancaire | ❌ non | ❌ non |
| Compte en plus | ❌ (déjà GitHub) | GitHub login (gratuit) |
| Données en direct | ❌ (embarquées, réelles) | ✅ actus + stats live |
| S'endort | ❌ jamais | ❌ jamais |
| Mise en place | ~2 min | ~3 min |

👉 Juste voir/partager le tableau de bord : **GitHub Pages**. 
👉 Le garder **à jour automatiquement** pendant le tournoi : **Vercel**.
