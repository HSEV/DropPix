<div align="center">

# 📸 DropPix

**Dépose une image. Récupère un code. Retrouve-la n'importe où. Elle s'efface toute seule.**

Aucun compte. Aucune base de données. Suppression automatique après **5 minutes**.

### [![Ouvrir DropPix](https://img.shields.io/badge/🚀_Ouvrir_DropPix-droppix.hsev.fr-7c5cff?style=for-the-badge)](https://droppix.hsev.fr)

![PHP](https://img.shields.io/badge/PHP-%3E%3D7.4-777BB4?logo=php&logoColor=white)
![No database](https://img.shields.io/badge/database-none-blueviolet)
![No Composer](https://img.shields.io/badge/dependencies-aucune-success)
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
   PC                           DropPix                      Téléphone
┌─────────┐   dépose image    ┌─────────┐   scan du QR /    ┌─────────┐
│  photo  │ ───────────────▶ │  K7P-3XQ │ ───────────────▶ │ ouvre   │
│         │                   │  + QR   │   saisie du code  │ l'image │
└─────────┘                   └─────────┘                   └─────────┘
                                   │
                    ⏱ auto-suppression après 5 min
```

## 🧱 Stack technique (aucune dépendance à installer)

Choisie pour tourner tel quel sur un hébergement mutualisé classique
(Hostinger, OVH, etc.) — pas de Node.js, pas de Composer, pas de build step.

| Couche | Techno | Pourquoi |
|---|---|---|
| Serveur | **PHP** (7.4+) | Supporté nativement par la quasi-totalité des hébergements web |
| Stockage | Système de fichiers (`storage/<code>/...`) | Pas de BDD à gérer ; chaque dossier porte sa propre date d'expiration dans un `meta.json` |
| Frontend | HTML / CSS / JS vanilla | Aucun build, aucun framework, chargement instantané |
| Zip à la volée | `ZipArchive` (natif PHP) | Rien à installer |
| QR code | [qrcodejs](https://github.com/davidshimjs/qrcodejs) (vendored, MIT) | Généré **côté navigateur**, aucun appel serveur, aucune dépendance externe au runtime |
| Rate limiting | Fichiers + `flock()` | Pas de Redis, juste des compteurs sur disque |

## 🔒 Comment la sécurité est gérée

- **Vraie vérification d'image** : chaque fichier est inspecté par sa
  signature binaire (*magic bytes*), pas par son extension ou son
  `Content-Type` déclaré — un `.exe` renommé en `.png` est rejeté. Voir
  [lib/ImageValidator.php](lib/ImageValidator.php).
- **Codes non devinables** : générés avec `random_int()` sur un alphabet de
  32 caractères sans ambiguïté visuelle (pas de `0/O`, `1/I/L`), soit
  ~1 milliard de combinaisons pour une fenêtre de vie de 5 minutes.
- **Rate limiting** sur l'upload et sur la récupération de code, pour rendre
  tout brute-force impraticable dans le temps imparti.
- **`storage/` non accessible en HTTP** : un `.htaccess` (`Require all
  denied`) bloque tout accès direct au dossier de stockage. Les images ne
  transitent que par `api/view.php`, `api/download.php` ou `api/zip.php`,
  qui vérifient le code et l'expiration à chaque appel.
- **En-têtes de sécurité** (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`) sur chaque réponse.

## 📁 Structure du projet

```
DropPix/
├── index.html
├── css/style.css
├── js/
│   ├── app.js                 # drag & drop, appels API, compte à rebours, QR
│   └── vendor/qrcode.js        # génération QR côté navigateur (vendored)
├── api/
│   ├── upload.php              # dépôt d'images -> génère un code
│   ├── batch.php                # métadonnées d'un code (GET ?code=)
│   ├── view.php                  # image affichée en ligne (vignettes)
│   ├── download.php               # téléchargement d'une image
│   └── zip.php                     # téléchargement groupé en .zip
├── lib/
│   ├── Store.php                # stockage fichiers + expiration (5 min)
│   ├── CodeGen.php               # génération / formatage / normalisation des codes
│   ├── ImageValidator.php         # détection d'image par magic bytes
│   ├── RateLimiter.php            # limiteur de débit basé fichiers
│   └── Http.php                    # petits utilitaires JSON / sécurité
├── cron/cleanup.php             # nettoyage des dépôts expirés (Cron Job)
├── storage/                      # créé au runtime, gitignored, non accessible en HTTP
└── .htaccess
```

Chaque dossier interne (`lib/`, `cron/`, `storage/`) a son propre
`.htaccess` qui bloque tout accès direct par URL.

## 🚀 Déploiement

Le site tourne sur n'importe quel hébergement PHP 7.4+ classique (mutualisé
ou non), sans base de données ni build :

1. Dépose le contenu du dépôt à la racine du domaine/sous-domaine.
2. Vérifie que `storage/` est accessible en écriture par PHP.
3. Programme `cron/cleanup.php` sur une tâche planifiée (CLI ou requête HTTP
   avec une clé secrète — voir les commentaires en tête du fichier), pour
   garantir que le stockage ne grossit jamais. DropPix a aussi deux filets
   de sécurité intégrés au cas où ce ne serait pas fait (suppression à la
   consultation + balayage déclenché par le trafic, voir
   `Store::maybeSweep()` dans [lib/Store.php](lib/Store.php)).
4. Active le HTTPS (généralement automatique via Let's Encrypt chez la
   plupart des hébergeurs).

### Mettre à jour le site après un changement

`css/style.css` et `js/app.js` sont chargés avec un paramètre `?v=X` dans
[index.html](index.html) (ex. `css/style.css?v=3`). **À chaque modification
de l'un de ces fichiers, incrémente ce numéro** — sinon les navigateurs (et
le cache de l'hébergeur) peuvent continuer à servir l'ancienne version après
un nouvel upload, ce qui peut donner l'impression qu'un correctif n'a pas été
appliqué. Sans ça, il faut compter sur un rechargement forcé (Ctrl+Maj+R) de
chaque visiteur, ce qui n'est pas fiable.

## 🧪 Tester en local

Si tu as PHP installé (`php -v`) :

```bash
php -S localhost:8080
# → http://localhost:8080
```

Aucune autre dépendance à installer.

## ⚠️ Limites assumées

- **Précision de l'expiration** : un dépôt consulté après ses 5 minutes est
  supprimé immédiatement (vérifié à chaque requête). Un dépôt **jamais
  reconsulté** après expiration reste sur le disque jusqu'au prochain
  passage du Cron Job — d'où l'intérêt de le régler sur *toutes les
  minutes*.
- **Pas de chiffrement de bout en bout** : quiconque connaît un code pendant
  sa fenêtre de 5 minutes peut accéder aux images correspondantes. Le
  rate-limiting rend le brute-force impraticable, mais ce n'est pas un
  coffre-fort.
- **Hébergement mutualisé unique** : le rate-limiting et le compteur
  d'expiration sont sur disque local ; si un jour tu passes sur plusieurs
  serveurs derrière un load-balancer, il faudrait un stockage partagé
  (hors scope ici, contraire au « sans BDD » voulu).

---

<div align="center">
<sub>Fait avec PHP, sans base de données, et sans prise de tête.</sub>
</div>
