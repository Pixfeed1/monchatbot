#!/usr/bin/env python3
"""
Diagnostic et création utilisateur avec gestion explicite du chemin de DB
"""

import os
import sys
from dotenv import load_dotenv

# Charger l'environnement
load_dotenv()

# Même setup que run.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def find_database_files():
    """Trouve tous les fichiers de base de données"""
    print("🔍 DIAGNOSTIC DES BASES DE DONNÉES")
    print("=" * 50)
    
    db_files = []
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.endswith('.db'):
                full_path = os.path.join(root, file)
                db_files.append(full_path)
    
    print(f"📊 Fichiers .db trouvés: {len(db_files)}")
    for db_file in db_files:
        size = os.path.getsize(db_file) if os.path.exists(db_file) else 0
        print(f"   - {db_file} (taille: {size} bytes)")
    
    return db_files

def create_user_explicit_path():
    """Crée l'utilisateur en forçant le bon chemin"""
    
    # Diagnostic initial
    db_files = find_database_files()
    
    print(f"\n🔧 CRÉATION UTILISATEUR")
    print("=" * 50)
    
    # Forcer le chemin exact de la base
    db_path = os.path.join(os.getcwd(), 'site.db')
    db_uri = f'sqlite:///{db_path}'
    
    print(f"📍 Chemin forcé de la DB: {db_path}")
    print(f"📍 URI: {db_uri}")
    
    # Temporairement modifier la variable d'environnement
    os.environ['SQLALCHEMY_DATABASE_URI'] = db_uri
    
    # Importer après avoir défini l'URI
    from app import create_app, db
    from app.models import User
    from werkzeug.security import generate_password_hash
    
    app = create_app()
    
    with app.app_context():
        print(f"📍 URI effective: {app.config.get('SQLALCHEMY_DATABASE_URI')}")
        
        # Créer les tables si nécessaire
        db.create_all()
        
        # Vérifier les utilisateurs existants
        users = User.query.all()
        print(f"📊 Utilisateurs avant: {len(users)}")
        
        # Supprimer l'existant si présent
        existing_user = User.query.filter_by(username='moosyne').first()
        if existing_user:
            print("🗑️  Suppression utilisateur existant...")
            db.session.delete(existing_user)
            db.session.commit()
        
        # Créer le nouvel utilisateur
        print("👤 Création utilisateur...")
        user = User(
            username='moosyne',
            email='moosyne@gmail.com',
            is_admin=True,
            is_active=True
        )
        user.password = generate_password_hash('Vashthestampede2a.')
        
        try:
            db.session.add(user)
            db.session.commit()
            
            print("✅ Utilisateur créé !")
            
            # Vérification finale
            final_users = User.query.all()
            print(f"📊 Utilisateurs après: {len(final_users)}")
            
            for u in final_users:
                print(f"   ✅ {u.username} - {u.email}")
            
            # Test mot de passe
            if user.check_password('Vashthestampede2a.'):
                print("✅ Mot de passe OK !")
            else:
                print("❌ Problème mot de passe")
                
            return True
            
        except Exception as e:
            print(f"❌ Erreur création: {e}")
            db.session.rollback()
            return False

def update_env_file():
    """Met à jour le fichier .env avec le bon chemin"""
    env_path = '.env'
    
    # Lire le fichier actuel
    with open(env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Modifier la ligne SQLALCHEMY_DATABASE_URI
    new_lines = []
    for line in lines:
        if line.startswith('SQLALCHEMY_DATABASE_URI='):
            new_lines.append('SQLALCHEMY_DATABASE_URI=sqlite:///site.db\n')
            print("📝 Ligne DB mise à jour dans .env")
        else:
            new_lines.append(line)
    
    # Réécrire le fichier
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

if __name__ == '__main__':
    print("🔧 DIAGNOSTIC ET CORRECTION DB")
    print("=" * 60)
    
    # 1. Diagnostic
    find_database_files()
    
    # 2. Mise à jour .env
    update_env_file()
    
    # 3. Création utilisateur
    if create_user_explicit_path():
        print("\n🎯 SUCCÈS !")
        print("✅ Utilisateur créé dans la bonne base")
        print("🚀 Redémarrez le serveur: python run.py")
        print("🔑 Connexion: moosyne / Vashthestampede2a.")
    else:
        print("\n❌ Échec de la création")
    
    # 4. Diagnostic final
    print("\n" + "="*60)
    find_database_files()