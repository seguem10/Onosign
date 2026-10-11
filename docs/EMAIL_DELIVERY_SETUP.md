# OnoSign — Envoi des invitations (désactivé)

**Statut : infrastructure développée, diffusion réelle non autorisée.**
Le circuit de signature DI/DR et sa transition `draft → sent` restent volontairement bloqués par Supabase. Aucun modèle ONOMO central DI/DR n'a été activé, aucune invitation ne part automatiquement.

## Architecture implémentée

1. Quand un destinataire autorisé atteint `status='sent'` dans un document DI/DR effectivement envoyé, un trigger vérifie le document et l'ordre, puis crée **une seule** entrée dans `onosign_email_outbox`.
2. Cette table n'a aucun accès direct `anon` ou `authenticated`; les fonctions de récupération/confirmation sont limitées à `service_role`.
3. `/api/internal/email-worker` fonctionne **uniquement** avec un secret `CRON_SECRET` et un drapeau explicite. Il récupère au plus trois jobs, et demande au fournisseur Resend l'envoi avec une clé d'idempotence par job.
4. Le courriel ne contient **aucun jeton secret ou lien vers le stockage PDF** : uniquement `/sign/<document-id>`. Le portail vérifie le compte Supabase Auth et l'adresse confirmée du destinataire. Le PDF est servi via une route authentifiée et RLS Storage, avec vérification de l'empreinte SHA-256.
5. Un échec clairement transitoire HTTP 429 peut être retenté dans la fenêtre prévue. Les réponses ambiguës ou erreurs réseau passent en `manual_review` pour éviter les doubles envois non contrôlés.

## Variables privées à configurer **seulement après validation**

| Variable | Portée | Usage |
| --- | --- | --- |
| `CRON_SECRET` | Serveur uniquement | Secret aléatoire d'au moins 24 caractères pour authentifier le traitement |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur uniquement | Récupérer/terminer les travaux privés de la file |
| `RESEND_API_KEY` | Serveur uniquement | Fournisseur transactionnel, clé Resend |
| `ONOSIGN_EMAIL_FROM` | Serveur uniquement | Expéditeur sur un domaine réellement vérifié |
| `ONOSIGN_APP_URL` | Serveur uniquement | Origine HTTPS exacte de l'application (sans chemin) |
| `ONOSIGN_EMAIL_WORKER_ENABLED` | Serveur uniquement | Doit rester **absent** ou `false` jusqu'à l'accord de mise en service |

**Ne jamais créer de variables `NEXT_PUBLIC_` pour des secrets**. Les seules variables publiques sont les identifiants publics Supabase déjà présents en Preview.

Le fournisseur doit être vérifié et les DNS SPF/DKIM/DMARC contrôlés. L'envoi en production exige également un déclencheur planifié externe ou Vercel Cron avec `Authorization: Bearer <CRON_SECRET>`. Aucun cron n'est installé automatiquement par cette étape.

## Points encore bloquants

- Création et validation d'une vraie transaction **envoi autorisé** : propriétaire, conformité DI/DR, montants, attribution nominative, contrôle des champs PDF, hash source, état et locks. La protection actuelle ne doit pas être retirée avant les tests.
- Capture du consentement et de la signature d'un destinataire authentifié, sans contourner l'ordre des étapes.
- Apposition des signatures sur le PDF final, calcul de son empreinte, stockage non modifiable, clôture atomique du document et gestion d'expiration/refus.
- Relecture humaine des erreurs `manual_review`, délivrabilité fournisseur, webhooks de rejet, tests avec comptes et hôtels de validation, sauvegardes et politique de rétention.
- Validation juridique des garanties de signature recherchées pour les juridictions ONOMO.

La chaîne SHA-256 du journal d'audit détecte des modifications de données **techniques**, mais ne constitue ni une attestation signée par un tiers de confiance ni une preuve d'identité civile.

Documentation officielle du fournisseur : https://resend.com/changelog/idempotency-keys (les clés d'idempotence y sont conservées 24 heures).
