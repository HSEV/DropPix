<div align="center">

# 📸 DropPix

**Dépose une image. Récupère un code. Retrouve-la n'importe où. Elle s'efface toute seule.**

Aucun compte. Aucune base de données. Suppression automatique après **5 minutes**.

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![No database](https://img.shields.io/badge/database-none-blueviolet)
![Vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e?logo=javascript&logoColor=black)

</div>

---

## ✨ L'idée

Tu as une photo sur ton PC et tu veux la récupérer sur ton téléphone (ou
l'inverse) — sans créer de compte, sans Discord, sans AirDrop, sans câble.

1. **Tu glisses ton image** sur DropPix.
2. Le site te donne un **code à 6 caractères** (`K7P-3XQ`) + un **QR code**.
3. **Sur n'importe quel autre appareil**, tu tapes le code — ou tu scannes le
   QR depuis un téléphone — et tes images apparaissent, prêtes à télécharger.
4. **5 minutes après**, tout est supprimé du serveur. Définitivement.

Pas de compte à créer, pas de mot de passe à retenir, pas de trace qui
traîne.

## 🖼️ Aperçu du flux

```
   PC                         DropPix                       Téléphone
┌─────────┐   dépose image   ┌─────────┐   scan du QR /   ┌─────────┐
│  photo  │ ───────────────▶ │  K7P-3XQ │ ───────────────▶ │  ouvre   │
│         │                  │  + QR    │   saisie du code │  l'image │
└─────────┘                  └─────────┘                  └─────────┘
                                   │
                          ⏱ auto-suppression après 5 min
```

## 🔒 Comment la sécurité est gérée

- **Vraie vérification d'image** : chaque fichier est inspecté par sa
  signature binaire (*magic bytes*), pas par son extension ou son
  `Content-Type` déclaré — un `.exe` renommé en `.png` est rejeté. Voir
  [server/lib/imageValidator.js](server/lib/imageValidator.js).
- **Codes non devinables** : générés avec `crypto.randomInt` sur un alphabet
  de 32 caractères sans ambiguïté visuelle (pas de `0/O`, `1/I/L`), soit
  ~1 milliard de combinaisons pour une fenêtre de vie de 5 minutes.
- **Rate limiting** sur l'upload et sur la récupération de code, pour rendre
  tout brute-force impraticable dans le temps imparti.
- **En-têtes de sécurité** via `helmet` (CSP, nosniff, etc.).

## 🧱 Stack technique

Choisie pour rester la plus simple et la plus lisible possible — un seul
process, aucune dépendance superflue.

| Couche | Techno | Pourquoi |
|---|---|---|
| Serveur | Node.js + Express | Minimaliste, un seul fichier de routes |
| Stockage | Système de fichiers + `Map` en mémoire | Pas de BDD à gérer ; la donnée est éphémère par nature |
| Frontend | HTML / CSS / JS vanilla | Aucun build, aucun framework, chargement instantané |
| Upload | `multer` (buffer mémoire) | Validation avant écriture disque |
| Zip à la volée | `archiver` | Téléchargement groupé sans fichier temporaire |
| QR code | `qrcode` | Généré côté serveur, PNG servi directement |

## 🚀 Démarrer en local

```bash
git clone https://github.com/HSEV/DropPix.git
cd DropPix
npm install
npm start
# → http://localhost:3000
```

`npm run dev` relance automatiquement le serveur à chaque modification
(`node --watch`).

Variable d'environnement disponible (voir [.env.example](.env.example)) :

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port d'écoute du serveur |

## 📁 Structure du projet

```
DropPix/
├── server/
│   ├── index.js               # routes Express (upload, récupération, zip, QR)
│   └── lib/
│       ├── store.js           # Map en mémoire + expiration auto (5 min)
│       ├── codeGen.js         # génération / formatage / normalisation des codes
│       └── imageValidator.js  # détection d'image par magic bytes
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js               # drag & drop, appels API, compte à rebours
├── uploads/                    # créé au runtime, vidé au démarrage, gitignored
└── package.json
```

## ⚠️ Limites assumées

- **Une seule instance** : le store étant en mémoire, DropPix doit tourner
  sur un seul process (pas de scaling horizontal sans Redis — hors scope,
  contraire au « sans BDD » voulu).
- **Redémarrage = tout est perdu immédiatement**, au lieu d'attendre 5 min.
  Cohérent avec l'esprit éphémère du site.
- **Pas de chiffrement de bout en bout** : quiconque connaît un code pendant
  sa fenêtre de 5 minutes peut accéder aux images correspondantes. Le
  rate-limiting rend le brute-force impraticable, mais ce n'est pas un
  coffre-fort.

## ☁️ Déploiement

Le site n'a besoin **d'aucune base de données ni de stockage persistant**
(tout s'efface tout seul) : ça ouvre la porte aux hébergements Node les plus
simples et les moins chers.

| Option | Effort | Idéal pour |
|---|---|---|
| **Render / Railway** | Connecte le repo Git, ça déploie tout seul | Démarrer vite, gratuit à ~5$/mois |
| **Fly.io** | Un peu de CLI | Toujours actif, pas de mise en veille |
| **VPS + Caddy** | Setup manuel, HTTPS auto | Contrôle total, ~4-5€/mois |

Un sous-domaine type `droppix.tondomaine.fr` fonctionne très bien : un simple
`CNAME` vers l'URL fournie par l'hébergeur (ou un `A` vers l'IP du VPS)
suffit.

---

<div align="center">
<sub>Fait avec Node.js, sans base de données, et sans prise de tête.</sub>
</div>
