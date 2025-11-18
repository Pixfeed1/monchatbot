#!/usr/bin/env python3
"""
Script pour ajouter les colonnes manquantes à la table bot_responses
"""
import os
import sys
from dotenv import load_dotenv
import psycopg2

# Charger les variables d'environnement
load_dotenv()

# Récupérer les credentials PostgreSQL
db_config = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'leobot'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', '')
}

print("=== Ajout des colonnes manquantes à bot_responses ===")
print(f"Base de données: {db_config['database']} @ {db_config['host']}:{db_config['port']}")
print(f"Utilisateur: {db_config['user']}")
print()

try:
    # Connexion à la base de données
    conn = psycopg2.connect(**db_config)
    conn.autocommit = True
    cursor = conn.cursor()

    # Vérifier et ajouter essential_templates
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'bot_responses'
            AND column_name = 'essential_templates'
        );
    """)

    if not cursor.fetchone()[0]:
        print("⏳ Ajout de la colonne 'essential_templates'...")
        cursor.execute("ALTER TABLE bot_responses ADD COLUMN essential_templates TEXT;")
        print("✅ Colonne 'essential_templates' ajoutée avec succès")
    else:
        print("ℹ️  La colonne 'essential_templates' existe déjà")

    # Vérifier et ajouter behavior_config
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'bot_responses'
            AND column_name = 'behavior_config'
        );
    """)

    if not cursor.fetchone()[0]:
        print("⏳ Ajout de la colonne 'behavior_config'...")
        cursor.execute("ALTER TABLE bot_responses ADD COLUMN behavior_config TEXT;")
        print("✅ Colonne 'behavior_config' ajoutée avec succès")
    else:
        print("ℹ️  La colonne 'behavior_config' existe déjà")

    print()
    print("=== Vérification des colonnes de bot_responses ===")
    cursor.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'bot_responses'
        ORDER BY ordinal_position;
    """)

    for row in cursor.fetchall():
        print(f"  - {row[0]:30} {row[1]}")

    cursor.close()
    conn.close()

    print()
    print("✅ Migration terminée avec succès !")
    sys.exit(0)

except psycopg2.Error as e:
    print(f"❌ Erreur PostgreSQL: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Erreur: {e}")
    sys.exit(1)
