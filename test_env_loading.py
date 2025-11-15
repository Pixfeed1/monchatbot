#!/usr/bin/env python3
"""
Script de test pour vérifier le chargement du fichier .env

Ce script aide à diagnostiquer les problèmes de connexion PostgreSQL en affichant
exactement ce qui est chargé depuis le fichier .env.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

print("=" * 70)
print("TEST DE CHARGEMENT DES VARIABLES D'ENVIRONNEMENT")
print("=" * 70)

# 1. Trouver le fichier .env
project_root = Path(__file__).parent
env_file = project_root / '.env'

print(f"\n1. Chemin du fichier .env:")
print(f"   {env_file}")
print(f"   Existe: {env_file.exists()}")

if not env_file.exists():
    print("\n❌ ERREUR: Le fichier .env n'existe pas!")
    print(f"   Créez-le ici: {env_file}")
    exit(1)

# 2. Charger le .env
print(f"\n2. Chargement du fichier .env...")
load_dotenv(dotenv_path=env_file)
print("   ✓ Chargé")

# 3. Lire les variables PostgreSQL
print(f"\n3. Variables PostgreSQL lues:")

database_url = os.getenv('DATABASE_URL')
postgres_user = os.getenv('POSTGRES_USER')
postgres_password = os.getenv('POSTGRES_PASSWORD')
postgres_host = os.getenv('POSTGRES_HOST')
postgres_port = os.getenv('POSTGRES_PORT')
postgres_db = os.getenv('POSTGRES_DB')

if database_url:
    print(f"\n   ✓ DATABASE_URL trouvé")
    # Parser l'URL
    if '@' in database_url and '//' in database_url:
        try:
            user_part = database_url.split('//')[1].split('@')[0]
            host_part = database_url.split('@')[1]
            if ':' in user_part:
                user, pwd = user_part.split(':', 1)
                masked_pwd = f"{pwd[:3]}...{pwd[-3:]}" if len(pwd) > 6 else "***"

                print(f"   User: {user}")
                print(f"   Password: {masked_pwd} (longueur: {len(pwd)} caractères)")
                print(f"   Host/DB: {host_part}")
        except Exception as e:
            print(f"   ⚠️  Erreur parsing: {e}")
else:
    print(f"\n   ⚠️  DATABASE_URL non trouvé")
    print(f"\n   Variables séparées:")
    print(f"   POSTGRES_USER: {postgres_user}")
    print(f"   POSTGRES_HOST: {postgres_host}")
    print(f"   POSTGRES_PORT: {postgres_port}")
    print(f"   POSTGRES_DB: {postgres_db}")

    if postgres_password:
        masked = f"{postgres_password[:3]}...{postgres_password[-3:]}" if len(postgres_password) > 6 else "***"
        print(f"   POSTGRES_PASSWORD: {masked} (longueur: {len(postgres_password)} caractères)")
    else:
        print(f"   POSTGRES_PASSWORD: ❌ NON DÉFINI")

# 4. Vérifier le contenu du .env
print(f"\n4. Contenu du fichier .env (première ligne DATABASE_URL):")
try:
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line.startswith('DATABASE_URL='):
                # Masquer le mot de passe
                if '@' in line and '//' in line:
                    parts = line.split('://')
                    if len(parts) == 2:
                        user_pwd_host = parts[1]
                        if '@' in user_pwd_host:
                            user_pwd = user_pwd_host.split('@')[0]
                            host_part = user_pwd_host.split('@')[1]
                            if ':' in user_pwd:
                                user, pwd = user_pwd.split(':', 1)
                                masked_pwd = f"{pwd[:3]}...{pwd[-3:]}" if len(pwd) > 6 else "***"
                                print(f"   DATABASE_URL=postgresql://{user}:{masked_pwd}@{host_part}")
                                break
                else:
                    print(f"   {line[:50]}...")
                break
        else:
            print(f"   ⚠️  DATABASE_URL non trouvé dans le fichier")
except Exception as e:
    print(f"   ❌ Erreur lecture: {e}")

# 5. Test de connexion PostgreSQL (optionnel)
print(f"\n5. Test de connexion PostgreSQL:")
try:
    import psycopg2

    if database_url:
        conn_str = database_url
    elif all([postgres_user, postgres_password, postgres_host, postgres_db]):
        conn_str = f"postgresql://{postgres_user}:{postgres_password}@{postgres_host}:{postgres_port}/{postgres_db}"
    else:
        print(f"   ⚠️  Pas assez d'informations pour tester la connexion")
        conn_str = None

    if conn_str:
        # Extraire les paramètres pour psycopg2
        from urllib.parse import urlparse
        result = urlparse(conn_str)

        try:
            conn = psycopg2.connect(
                database=result.path[1:],
                user=result.username,
                password=result.password,
                host=result.hostname,
                port=result.port or 5432
            )
            conn.close()
            print(f"   ✅ Connexion PostgreSQL réussie!")
        except psycopg2.OperationalError as e:
            print(f"   ❌ Échec de connexion: {e}")

except ImportError:
    print(f"   ⚠️  psycopg2 non installé (optionnel pour ce test)")

print("\n" + "=" * 70)
print("FIN DU TEST")
print("=" * 70)
