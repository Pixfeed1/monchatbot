#!/usr/bin/env python3
"""
Script simple pour créer l'utilisateur admin
À lancer avec le même Python que ton application
"""

if __name__ == '__main__':
    print("\n=== CRÉATION UTILISATEUR ADMIN ===\n")

    # Import local
    from app import create_app, db
    from app.models import User
    import os

    app = create_app()

    with app.app_context():
        # Créer les tables si elles n'existent pas
        db.create_all()
        print("[OK] Tables créées/vérifiées")

        # Récupérer les identifiants depuis .env ou utiliser les defaults
        admin_login = os.getenv('ADMIN_LOGIN', 'admin')
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')

        # Vérifier si admin existe
        existing_admin = User.query.filter_by(username=admin_login).first()

        if existing_admin:
            print(f"[INFO] L'utilisateur '{admin_login}' existe déjà")
            print("[INFO] Mise à jour du mot de passe...")
            existing_admin.set_password(admin_password)
            db.session.commit()
            print(f"[OK] Mot de passe mis à jour\n")
        else:
            print(f"[INFO] Création de '{admin_login}'...")
            # Si admin_login est un email, utiliser comme email ET username
            email = admin_login if '@' in admin_login else f'{admin_login}@example.com'
            admin_user = User(
                username=admin_login,
                email=email
            )
            admin_user.set_password(admin_password)
            db.session.add(admin_user)
            db.session.commit()
            print(f"[OK] Utilisateur créé\n")

        # Afficher tous les utilisateurs
        all_users = User.query.all()
        print(f"Utilisateurs dans la base ({len(all_users)}):")
        for user in all_users:
            print(f"  - {user.username}")

        print(f"\n[INFO] Connexion:")
        print(f"  Identifiant: {admin_login}")
        print(f"  Mot de passe: {admin_password}\n")
