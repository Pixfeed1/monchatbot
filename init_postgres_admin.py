#!/usr/bin/env python3
"""
Script pour initialiser PostgreSQL et créer l'utilisateur admin
"""
import os
import sys
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent))

# Charger les variables d'environnement
from dotenv import load_dotenv
load_dotenv()

def init_database():
    """Initialise la base PostgreSQL et crée l'utilisateur admin"""

    print("\n" + "="*60)
    print("  INITIALISATION POSTGRESQL + ADMIN")
    print("="*60 + "\n")

    try:
        from app import create_app, db
        from app.models import User

        app = create_app()

        with app.app_context():
            # 1. Créer toutes les tables
            print("[STEP 1] Création des tables...")
            db.create_all()
            print("[OK] Tables créées\n")

            # 2. Vérifier si admin existe déjà
            print("[STEP 2] Vérification de l'utilisateur admin...")
            admin_login = os.getenv('ADMIN_LOGIN', 'admin')
            admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')

            existing_admin = User.query.filter_by(username=admin_login).first()

            if existing_admin:
                print(f"[INFO] L'utilisateur '{admin_login}' existe déjà")
                print("[INFO] Mise à jour du mot de passe...")
                existing_admin.set_password(admin_password)
                db.session.commit()
                print(f"[OK] Mot de passe mis à jour pour '{admin_login}'\n")
            else:
                print(f"[INFO] Création de l'utilisateur admin '{admin_login}'...")
                admin_user = User(
                    username=admin_login,
                    email=f'{admin_login}@example.com'
                )
                admin_user.set_password(admin_password)

                db.session.add(admin_user)
                db.session.commit()
                print(f"[OK] Utilisateur '{admin_login}' créé avec succès\n")

            # 3. Afficher les utilisateurs existants
            print("[STEP 3] Liste des utilisateurs dans la base:")
            all_users = User.query.all()
            print(f"[INFO] Nombre d'utilisateurs: {len(all_users)}")
            for user in all_users:
                print(f"  - Username: {user.username}")

            print("\n" + "="*60)
            print("  INITIALISATION TERMINÉE")
            print("="*60)
            print(f"\nVous pouvez vous connecter avec:")
            print(f"  Identifiant: {admin_login}")
            print(f"  Mot de passe: {admin_password}\n")

            return True

    except Exception as e:
        print(f"\n[ERROR] Erreur lors de l'initialisation: {e}")
        import traceback
        traceback.print_exc()

        print("\n[AIDE] Vérifiez que:")
        print("  1. PostgreSQL est bien démarré")
        print("  2. Les identifiants dans .env sont corrects")
        print("  3. La base de données existe")
        print("  4. Flask et ses dépendances sont installées")

        return False


if __name__ == '__main__':
    try:
        success = init_database()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n[INFO] Initialisation interrompue")
        sys.exit(1)
