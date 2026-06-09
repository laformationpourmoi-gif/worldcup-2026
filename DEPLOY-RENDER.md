# 🚀 Déployer le dashboard gratuitement sur Render

Tu obtiens une **vraie URL publique** `https://…onrender.com/` accessible partout, sans laisser ton PC allumé. Le `render.yaml` à la racine fait tout le travail.

---

## Étape 1 — Mettre le code sur GitHub

Render déploie depuis un dépôt Git. Dans un terminal :

```bash
cd "D:\projet_python\Application World cup 2026"
git init
git add .
git commit -m "World Cup 2026 dashboard"
git branch -M main
```

Crée ensuite un dépôt **vide** sur https://github.com/new (sans README), puis :

```bash
git remote add origin https://github.com/TON_USER/worldcup-2026.git
git push -u origin main
```

> `node_modules/` et `.env` sont déjà ignorés (voir `.gitignore`) — rien de lourd ni de secret n'est envoyé.

---

## Étape 2 — Déployer sur Render (gratuit)

1. Va sur **https://render.com** → **Sign up** (tu peux te connecter avec GitHub, c'est gratuit).
2. Clique **New +** → **Blueprint**.
3. Choisis ton dépôt `worldcup-2026`. Render lit `render.yaml` automatiquement.
4. Clique **Apply** → il construit et démarre le service (1–3 min).
5. Quand c'est « Live », ton URL s'affiche : **`https://worldcup-2026.onrender.com/`** (le nom peut varier).

> **Sans blueprint ?** New + → **Web Service** → choisis le dépôt → **Root Directory** = `server`, **Build** = `npm install`, **Start** = `npm start`, **Instance Type** = **Free** → Create.

Le front appelle `/api/snapshot` sur le même domaine — **rien à configurer**, la bannière passe sur 🟢 *Données en direct*.

---

## Étape 3 (optionnel) — Stats en direct, toujours gratuit

Par défaut seules les **actus** sont en live. Pour activer aussi classements/scores/buteurs :

1. Crée une clé gratuite : https://www.football-data.org/client/register
2. Sur Render : ton service → onglet **Environment** → **Add Environment Variable**
   - **Key** : `FOOTBALLDATA_KEY`  ·  **Value** : ta clé
3. **Save Changes** → Render redéploie tout seul. C'est tout.

---

## Bon à savoir (offre gratuite)

- 😴 **Mise en veille** : un service gratuit s'endort après **~15 min sans visite**. La 1ʳᵉ visite suivante prend **~30–60 s** (le temps qu'il se réveille), puis c'est instantané.
- ⏰ **Le garder éveillé** (facultatif) : sur https://cron-job.org (gratuit), crée un job qui appelle
  `https://TON-APP.onrender.com/api/health` toutes les **10 min**.
- 🔄 **Mises à jour** : chaque `git push` redéploie automatiquement (`autoDeploy: true`). Les données, elles, se rafraîchissent seules (page 5 min / serveur 10 min).
- 🌍 **750 h/mois** gratuites — largement suffisant pour un service perso.

---

## Récap

| | Local (`localhost:3000`) | Render (`…onrender.com`) |
|---|---|---|
| Accessible partout | ❌ ton PC seulement | ✅ URL publique |
| PC doit rester allumé | ✅ oui | ❌ non |
| Démarrage | `Lancer-le-dashboard.bat` | automatique |
| Veille / réveil | — | ~30–60 s après 15 min d'inactivité |
