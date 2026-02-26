# Domain Outreach App

Application web d'outbound marketing pour investisseurs en noms de domaine.

---

## Prérequis
- Node.js 20+
- Compte Supabase (gratuit)
- Compte Vercel (gratuit)
- Compte Resend OU un compte SMTP
- Clé API Anthropic Claude

---

## Installation pas à pas

### 1. Supabase — Créer la base de données

1. Créer un projet sur supabase.com
2. Aller dans SQL Editor
3. Copier-coller et exécuter le contenu de supabase/migrations/001_schema.sql
4. Copier-coller et exécuter le contenu de supabase/migrations/002_rls.sql
5. Dans Settings → API, noter :
   - Project URL → NEXT_PUBLIC_SUPABASE_URL
   - anon public key → NEXT_PUBLIC_SUPABASE_ANON_KEY
   - service_role key → SUPABASE_SERVICE_ROLE_KEY
6. Dans Authentication → Users, créer votre compte utilisateur manuellement

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplir au minimum :
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- CRON_SECRET

### 3. Lancer en local

```bash
npm install
npm run dev
```

### 4. Déploiement sur Vercel

1. Pousser le projet sur GitHub
2. Importer le repo sur vercel.com
3. Ajouter toutes les variables d'environnement
4. Déployer

Les cron jobs se déclenchent automatiquement via vercel.json.

### 5. Configuration initiale dans l'app

1. Paramètres → Ajouter clés API (Claude, Hunter.io optionnel)
2. Comptes Email → Ajouter au moins 1 compte (Resend ou SMTP), tester
3. Mes Domaines → Ajouter vos domaines à vendre (ex: lussot.com)
4. Campagnes → Nouvelle campagne → Sélectionner un domaine
5. Sur la page campagne → Lancer le Discovery
6. Prospects → Scraper les contacts
7. Outreach → Sélectionner un prospect → Générer un message → Envoyer

---

## Fonctionnalités

- Discovery : Trouve automatiquement les acheteurs potentiels
- Scraping : Extrait emails et profils sociaux depuis les sites
- AI Messages : Génère 2-3 variantes personnalisées via Claude
- Email Multi-compte : Plusieurs comptes avec limites et espacement auto
- CRM : Suivi statuts prospect
- Follow-ups auto : Relances J+4 et J+10
- Social Queue : File journalière 10-20 messages sociaux/jour