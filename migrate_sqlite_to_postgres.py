#!/usr/bin/env python3
"""
Script de migration SQLite vers PostgreSQL pour MonChatbot

Usage:
    python migrate_sqlite_to_postgres.py

Prérequis:
    1. PostgreSQL doit être installé et en cours d'exécution
    2. La base de données PostgreSQL doit être créée
    3. Les variables d'environnement doivent être configurées dans .env
"""

import os
import sys
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from app.models import db, User, Settings, Conversation, Message, Example, FAQ, Knowledge, ResponseConfig

def migrate_data():
    """Migre les données de SQLite vers PostgreSQL"""

    print("\n" + "="*60)
    print("  MIGRATION SQLITE → POSTGRESQL")
    print("="*60 + "\n")

    # 1. Vérifier que le fichier SQLite existe
    sqlite_path = Path(__file__).parent / 'app' / 'instance' / 'site.db'
    if not sqlite_path.exists():
        print(f"[INFO] Aucune base SQLite trouvée à {sqlite_path}")
        print("[INFO] Rien à migrer. Vous pouvez créer une nouvelle base PostgreSQL.")
        return True

    print(f"[OK] Base SQLite trouvée: {sqlite_path}")

    # 2. Créer les connexions
    sqlite_uri = f'sqlite:///{sqlite_path}'

    # Récupérer l'URI PostgreSQL depuis les variables d'environnement
    from dotenv import load_dotenv
    load_dotenv()

    postgres_uri = os.getenv('DATABASE_URL') or os.getenv('SQLALCHEMY_DATABASE_URI')

    if not postgres_uri:
        # Construire depuis les variables séparées
        postgres_user = os.getenv('POSTGRES_USER', 'monchatbot')
        postgres_password = os.getenv('POSTGRES_PASSWORD', 'monchatbot_password')
        postgres_host = os.getenv('POSTGRES_HOST', 'localhost')
        postgres_port = os.getenv('POSTGRES_PORT', '5432')
        postgres_db = os.getenv('POSTGRES_DB', 'monchatbot')

        postgres_uri = f'postgresql://{postgres_user}:{postgres_password}@{postgres_host}:{postgres_port}/{postgres_db}'

    # Support Heroku
    if postgres_uri.startswith('postgres://'):
        postgres_uri = postgres_uri.replace('postgres://', 'postgresql://', 1)

    print(f"[OK] Connexion PostgreSQL: {postgres_uri.split('@')[1] if '@' in postgres_uri else 'localhost'}")

    try:
        # Créer les engines
        sqlite_engine = create_engine(sqlite_uri)
        postgres_engine = create_engine(postgres_uri)

        # Test de connexion PostgreSQL
        postgres_engine.connect()
        print("[OK] Connexion PostgreSQL réussie")

    except Exception as e:
        print(f"[ERROR] Erreur de connexion PostgreSQL: {e}")
        print("\nVérifiez que:")
        print("  1. PostgreSQL est installé et en cours d'exécution")
        print("  2. La base de données existe (créez-la avec: createdb monchatbot)")
        print("  3. Les identifiants dans .env sont corrects")
        return False

    # 3. Créer les sessions
    SqliteSession = sessionmaker(bind=sqlite_engine)
    PostgresSession = sessionmaker(bind=postgres_engine)

    sqlite_session = SqliteSession()
    postgres_session = PostgresSession()

    # 4. Vérifier les tables SQLite
    inspector = inspect(sqlite_engine)
    tables = inspector.get_table_names()

    if not tables:
        print("[INFO] Aucune table trouvée dans SQLite")
        return True

    print(f"[OK] Tables trouvées dans SQLite: {', '.join(tables)}")

    # 5. Créer les tables PostgreSQL si elles n'existent pas
    print("\n[STEP] Création des tables PostgreSQL...")
    from app import create_app
    app = create_app()

    with app.app_context():
        # Utiliser l'URI PostgreSQL temporairement
        app.config['SQLALCHEMY_DATABASE_URI'] = postgres_uri
        db.init_app(app)
        db.create_all()
        print("[OK] Tables PostgreSQL créées")

    # 6. Migrer les données table par table
    models = [
        ('Utilisateurs', User),
        ('Paramètres', Settings),
        ('Conversations', Conversation),
        ('Messages', Message),
        ('Exemples', Example),
        ('FAQ', FAQ),
        ('Connaissances', Knowledge),
        ('Configuration Réponses', ResponseConfig)
    ]

    print("\n[STEP] Migration des données...\n")

    migration_stats = {}

    for model_name, model_class in models:
        try:
            # Compter les enregistrements SQLite
            count = sqlite_session.query(model_class).count()

            if count == 0:
                print(f"  [-] {model_name}: 0 enregistrement")
                migration_stats[model_name] = 0
                continue

            # Récupérer tous les enregistrements
            records = sqlite_session.query(model_class).all()

            # Ajouter à PostgreSQL
            for record in records:
                # Créer une nouvelle instance détachée
                postgres_session.merge(record)

            postgres_session.commit()

            print(f"  [OK] {model_name}: {count} enregistrement(s) migré(s)")
            migration_stats[model_name] = count

        except Exception as e:
            print(f"  [ERROR] {model_name}: {e}")
            postgres_session.rollback()
            migration_stats[model_name] = f"Erreur: {e}"

    # 7. Vérification finale
    print("\n[STEP] Vérification des données migrées...\n")

    for model_name, model_class in models:
        try:
            pg_count = postgres_session.query(model_class).count()
            print(f"  [OK] {model_name}: {pg_count} enregistrement(s) dans PostgreSQL")
        except Exception as e:
            print(f"  [ERROR] {model_name}: {e}")

    # Fermer les sessions
    sqlite_session.close()
    postgres_session.close()

    print("\n" + "="*60)
    print("  MIGRATION TERMINÉE")
    print("="*60)
    print("\n[INFO] Prochaines étapes:")
    print("  1. Vérifiez que toutes vos données sont présentes dans PostgreSQL")
    print("  2. Sauvegardez votre fichier SQLite (app/instance/site.db)")
    print("  3. Configurez vos variables d'environnement pour PostgreSQL")
    print("  4. Redémarrez votre application\n")

    return True


if __name__ == '__main__':
    try:
        success = migrate_data()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n[INFO] Migration interrompue par l'utilisateur")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Erreur inattendue: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
