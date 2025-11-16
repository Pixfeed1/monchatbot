# Configuration PostgreSQL pour MonChatbot

Ce guide vous explique comment configurer PostgreSQL pour votre application MonChatbot.

## 📋 Prérequis

- Python 3.8+
- PostgreSQL 12+ installé

## 🚀 Installation de PostgreSQL

### Sur Ubuntu/Debian

```bash
# Installer PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Démarrer le service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Sur macOS

```bash
# Avec Homebrew
brew install postgresql@14
brew services start postgresql@14
```

### Sur Windows

Téléchargez et installez depuis [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

## 🔧 Configuration de la base de données

### 1. Créer un utilisateur PostgreSQL

```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans le shell PostgreSQL, exécutez:
CREATE USER jurojinn_mvaertan WITH PASSWORD 'votre_mot_de_passe_secure';
CREATE DATABASE jurojinn_leo OWNER jurojinn_mvaertan;
GRANT ALL PRIVILEGES ON DATABASE jurojinn_leo TO jurojinn_mvaertan;

# Quitter
\q
```

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet :

```bash
cp .env.example .env
```

Éditez `.env` et configurez PostgreSQL :

```bash
# Configuration PostgreSQL
POSTGRES_USER=jurojinn_mvaertan
POSTGRES_PASSWORD=votre_mot_de_passe_secure
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=jurojinn_leo

# OU utilisez une URL complète
DATABASE_URL=postgresql://jurojinn_mvaertan:votre_mot_de_passe_secure@localhost:5432/jurojinn_leo

# Générez une clé de chiffrement
ENCRYPTION_KEY=<générez avec la commande ci-dessous>
```

Pour générer une clé de chiffrement :

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## 📦 Installation des dépendances

```bash
pip install -r requirements.txt
```

## 🔄 Migration des données (si vous utilisez déjà SQLite)

Si vous avez déjà des données dans SQLite et souhaitez les migrer vers PostgreSQL :

```bash
python migrate_sqlite_to_postgres.py
```

Le script va :
1. Lire les données de `app/instance/site.db`
2. Créer les tables dans PostgreSQL
3. Transférer toutes les données
4. Vérifier l'intégrité

## 🗃️ Initialisation de la base de données (nouvelle installation)

Si vous partez de zéro :

```bash
# Initialiser les migrations
flask db init

# Créer les tables
flask db upgrade

# (Optionnel) Créer un utilisateur admin
python
>>> from app import create_app, db
>>> from app.models import User
>>> app = create_app()
>>> with app.app_context():
...     admin = User(username='admin', email='admin@example.com', is_admin=True)
...     admin.set_password('admin_password')
...     db.session.add(admin)
...     db.session.commit()
...     print("Admin créé!")
>>> exit()
```

## ✅ Vérification

Testez la connexion :

```bash
python -c "
from app import create_app
app = create_app()
with app.app_context():
    from app.models import db
    print('Connexion PostgreSQL: OK')
    print(f'URI: {app.config[\"SQLALCHEMY_DATABASE_URI\"].split(\"@\")[1]}')
"
```

## 🔐 Sécurité en production

### 1. Utilisez un mot de passe fort

```bash
# Générer un mot de passe sécurisé
openssl rand -base64 32
```

### 2. Configurez SSL pour PostgreSQL

Dans `.env` :

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

### 3. Limitez les connexions

Éditez `/etc/postgresql/*/main/pg_hba.conf` :

```
# IPv4 local connections:
host    jurojinn_leo    jurojinn_mvaertan    127.0.0.1/32    md5
```

## 🛠️ Commandes utiles PostgreSQL

```bash
# Se connecter à la base
psql -U jurojinn_mvaertan -d jurojinn_leo

# Lister les tables
\dt

# Voir la structure d'une table
\d user

# Compter les utilisateurs
SELECT COUNT(*) FROM "user";

# Sauvegarder la base
pg_dump -U jurojinn_mvaertan jurojinn_leo > backup.sql

# Restaurer la base
psql -U jurojinn_mvaertan jurojinn_leo < backup.sql
```

## 📊 Monitoring

### Voir les connexions actives

```sql
SELECT * FROM pg_stat_activity WHERE datname = 'jurojinn_leo';
```

### Taille de la base

```sql
SELECT pg_size_pretty(pg_database_size('jurojinn_leo'));
```

## 🚨 Dépannage

### Erreur: "FATAL: Peer authentication failed"

Éditez `/etc/postgresql/*/main/pg_hba.conf` et changez `peer` en `md5` :

```
local   all   all   md5
```

Redémarrez PostgreSQL :

```bash
sudo systemctl restart postgresql
```

### Erreur: "psycopg2 not installed"

```bash
pip install psycopg2-binary
```

### Erreur: "database does not exist"

```bash
createdb -U postgres jurojinn_leo
```

## 🌐 Déploiement (Heroku, Render, etc.)

Ces plateformes fournissent PostgreSQL automatiquement. La variable `DATABASE_URL` est définie automatiquement.

```bash
# Heroku
heroku addons:create heroku-postgresql:mini

# L'application détectera automatiquement DATABASE_URL
```

## 📚 Ressources

- [Documentation PostgreSQL](https://www.postgresql.org/docs/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Flask-SQLAlchemy](https://flask-sqlalchemy.palletsprojects.com/)

## ⚡ Performance

Pour améliorer les performances en production, ajustez `SQLALCHEMY_ENGINE_OPTIONS` dans `app/config.py` :

```python
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 10,
    'pool_recycle': 3600,
    'pool_pre_ping': True,
    'max_overflow': 20
}
```
