# Guide de Migration - Widget et Recommendation

Ce guide explique comment appliquer les migrations pour ajouter les tables `widget` et `recommendation` à votre base de données.

## 🎯 Objectif

Ajouter deux nouvelles tables à la base de données:

1. **widget** - Pour gérer les widgets d'intégration sur sites externes
2. **recommendation** - Pour les recommandations d'amélioration du bot

## 📋 Méthodes d'application

### Méthode 1: Script Python automatique (RECOMMANDÉ)

```bash
python run_migrations.py
```

Cette méthode:
- ✅ Applique automatiquement toutes les migrations
- ✅ Gère les dépendances entre migrations
- ✅ Affiche des messages clairs de succès/erreur
- ✅ Crée les index automatiquement

### Méthode 2: Commande Flask-Migrate

Si vous avez Flask et Flask-Migrate installés:

```bash
# Appliquer les migrations
flask db upgrade

# Ou avec Python
python -m flask db upgrade
```

### Méthode 3: SQL Manuel

Si les méthodes automatiques ne fonctionnent pas:

```bash
# PostgreSQL
psql -U votre_user -d votre_database -f migrations/manual_add_widget_recommendation.sql

# MySQL
mysql -u votre_user -p votre_database < migrations/manual_add_widget_recommendation.sql

# SQLite
sqlite3 votre_database.db < migrations/manual_add_widget_recommendation.sql
```

**⚠️ ATTENTION:** Si vous utilisez le SQL manuel, vous devez aussi mettre à jour la table `alembic_version`:

```sql
UPDATE alembic_version SET version_num = 'add_widget_recommendation';
```

## 🔍 Vérification

Après l'application des migrations, vérifiez que tout fonctionne:

```python
python
>>> from app import create_app, db
>>> app = create_app()
>>> with app.app_context():
...     # Vérifier que les tables existent
...     from sqlalchemy import inspect
...     inspector = inspect(db.engine)
...     tables = inspector.get_table_names()
...     print('widget' in tables)  # Doit afficher True
...     print('recommendation' in tables)  # Doit afficher True
```

Ou via SQL:

```sql
-- Lister toutes les tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('widget', 'recommendation');

-- Compter les colonnes de chaque table
SELECT
    'widget' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'widget'
UNION ALL
SELECT
    'recommendation' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'recommendation';
```

## 📊 Structure des tables créées

### Table Widget

| Colonne | Type | Description |
|---------|------|-------------|
| id | Integer | Clé primaire |
| name | String(255) | Nom du widget |
| widget_key | String(64) | Clé unique générée |
| allowed_domains | Text (JSON) | Domaines autorisés |
| page_scope | String(20) | all/specific/pattern |
| allowed_pages | Text (JSON) | Pages autorisées |
| primary_color | String(7) | Couleur principale (#hex) |
| position | String(20) | Position (bottom-right, etc.) |
| welcome_message | Text | Message de bienvenue |
| is_active | Boolean | Widget actif/inactif |
| created_by | Integer | ID utilisateur créateur |
| created_at | DateTime | Date de création |
| updated_at | DateTime | Date de modification |

**Index créés:**
- `ix_widget_created_by` sur `created_by`
- `ix_widget_is_active` sur `is_active`
- Unique constraint sur `widget_key`

### Table Recommendation

| Colonne | Type | Description |
|---------|------|-------------|
| id | Integer | Clé primaire |
| title | String(255) | Titre de la recommandation |
| description | Text | Description détaillée |
| recommendation_type | String(50) | manual/auto/ai_suggested |
| category | String(50) | Catégorie (faq/flow/etc.) |
| priority | String(20) | low/medium/high/critical |
| status | String(20) | pending/in_progress/implemented/dismissed |
| source | Text | Source de la recommandation |
| source_data | Text (JSON) | Données source |
| estimated_impact | String(20) | low/medium/high |
| affected_users_count | Integer | Nombre d'utilisateurs affectés |
| suggested_action | Text | Action suggérée |
| notes | Text | Notes supplémentaires |
| created_by | Integer | ID utilisateur créateur |
| implemented_by | Integer | ID utilisateur implémenteur |
| created_at | DateTime | Date de création |
| updated_at | DateTime | Date de modification |
| implemented_at | DateTime | Date d'implémentation |

**Index créés:**
- `ix_recommendation_status` sur `status`
- `ix_recommendation_priority` sur `priority`
- `ix_recommendation_category` sur `category`
- `ix_recommendation_created_by` sur `created_by`

## 🆘 Dépannage

### Erreur: "No module named flask"

Installez les dépendances:

```bash
pip install -r requirements.txt
```

### Erreur: "table already exists"

Les tables existent déjà. Vérifiez avec:

```sql
\dt widget
\dt recommendation
```

Si elles existent, pas besoin de migration. Si elles existent partiellement, supprimez-les d'abord:

```sql
DROP TABLE IF EXISTS widget CASCADE;
DROP TABLE IF EXISTS recommendation CASCADE;
```

Puis réappliquez la migration.

### Erreur: "foreign key constraint"

Assurez-vous que la table `user` existe avant d'appliquer la migration:

```sql
SELECT * FROM information_schema.tables WHERE table_name = 'user';
```

## ✅ Prochaines étapes

Après l'application réussie des migrations:

1. **Testez les widgets:**
   - Accédez à `/widgets` dans votre application
   - Créez un widget de test
   - Vérifiez le code généré

2. **Testez les recommandations:**
   - Accédez à `/recommendations` (quand implémenté)
   - Créez une recommandation manuelle

3. **Vérifiez les logs:**
   - Consultez les logs de l'application
   - Assurez-vous qu'aucune erreur liée aux tables n'apparaît

## 📝 Notes importantes

- Ces migrations sont **idempotentes** - vous pouvez les réexécuter sans problème
- Les **données existantes** ne sont pas affectées
- Les **index** améliorent les performances des requêtes
- Les **foreign keys** assurent l'intégrité référentielle

---

**Version:** add_widget_recommendation
**Date:** 2025-11-18
**Révise:** add_api_usage_log
