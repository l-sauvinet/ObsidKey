# Obsidkey

Gestionnaire de mots de passe **zero-knowledge** : le serveur (Firebase) ne stocke et
ne voit jamais un mot de passe en clair, ni aucune donnée permettant de le déchiffrer.

## Stack

- Vue 3 + TypeScript + Vite
- Pinia (state management)
- Tailwind CSS v4
- Firebase Auth + Firestore

## Démarrage

```bash
npm install
cp .env.example .env   # puis remplis avec tes clés Firebase (console Firebase > Project Settings)
npm run dev
```

## Architecture de sécurité (résumé)

1. **Master password** — jamais envoyé au serveur, jamais stocké.
2. **Double dérivation** (`src/crypto/keyDerivation.ts`) — à partir du master password :
   - une **clé d'authentification** (hash envoyé à Firebase Auth)
   - une **clé de chiffrement** (reste uniquement en mémoire locale, `stores/vault.ts`)
   → une fuite de l'une ne compromet pas l'autre.
3. **Chiffrement des entrées** (`src/crypto/encryption.ts`) — AES-256-GCM via la Web Crypto
   API native, IV unique à chaque chiffrement.
4. **Firestore** ne stocke que des blobs chiffrés + IV + salt. Les
   [Security Rules](./firestore.rules) restreignent l'accès au propriétaire du document.
5. La clé de chiffrement n'est **jamais persistée** (pas de localStorage/sessionStorage) :
   elle disparaît à la fermeture de l'onglet ou au clic sur "Verrouiller".

## À faire avant toute mise en production

- [ ] Remplacer PBKDF2 par **Argon2id** (lib WASM, ex. `argon2-browser`) — voir TODO dans `keyDerivation.ts`
- [ ] Ajouter la 2FA (TOTP ou WebAuthn)
- [ ] Déployer les `firestore.rules` (`firebase deploy --only firestore:rules`)
- [ ] Activer Firebase App Check (anti-abus/bot)
- [ ] Rate limiting sur les tentatives de connexion (Cloud Functions)
- [ ] Content Security Policy stricte (protection XSS — critique pour ce type d'app)
- [ ] Export/backup chiffré pour l'utilisateur
- [ ] Audit de sécurité externe

## Structure

```
src/
├── crypto/          # Dérivation de clé + chiffrement/déchiffrement (le cœur sécurité)
├── services/         # Firebase, futurs appels API
├── stores/           # Pinia (état du vault, jamais persisté)
├── router/            # Vue Router + guard d'authentification
├── views/            # Pages (Login, Vault...)
├── components/ui/    # Composants UI réutilisables
└── composables/      # Logique réutilisable (Vue composables)
```
