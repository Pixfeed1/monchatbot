#!/usr/bin/env python3
"""
Diagnostic en temps réel - quelle base utilise le serveur ?
"""

import os
import sys
import sqlite3
from dotenv import load_dotenv

# Charger l'environnement
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def check_all_databases():
    """Vérifie le contenu de toutes les bases de données"""
    print("🔍 DIAGNOSTIC COMPLET DES BASES DE DONNÉES")
    print("=" * 60)
    
    db_files = [
        './site.db',
        './instance/site.db', 
        './app/instance/site.db'
    ]
    
    for db_path in db_files:
        if os.path.exists(db_path):
            print(f"\n📍 Base: {db_path}")
            print(f"   Taille: {os.path.getsize(db_path)} bytes")
            
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                
                # Vérifier si la table user existe
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user';")
                table_exists = cursor.fetchone()
                
                if table_exists:
                    # Compter les utilisateurs
                    cursor.execute("SELECT COUNT(*) FROM user;")
                    count = cursor.fetchone()[0]
                    print(f"   👥 Utilisateurs: {count}")
                    
                    if count > 0:
                        # Lister les utilisateurs
                        cursor.execute("SELECT id, username, email, is_active FROM user;")
                        users = cursor.fetchall()
                        for user in users:
                            print(f"      - ID:{user[0]} {user[1]} ({user[2]}) - Actif:{user[3]}")
                else:
                    print(f"   ❌ Table 'user' n'existe pas")
                    
                conn.close()
                
            except Exception as e:
                print(f"   ❌ Erreur lecture: {e}")
        else:
            print(f"\n📍 Base: {db_path} - ❌ N'existe pas")

def create_user_in_server_db():
    """Crée l'utilisateur dans la même base que le serveur"""
    print(f"\n🔧 CRÉATION DANS LA BASE DU SERVEUR")
    print("=" * 60)
    
    # Importer exactement comme le serveur
    from app import create_app, db
    from app.models import User
    from werkzeug.security import generate_password_hash
    
    app = create_app()
    
    with app.app_context():
        # Afficher la config réelle du serveur
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
        print(f"📍 URI du serveur: {db_uri}")
        
        # Extraire le chemin du fichier
        if 'sqlite:///' in db_uri:
            db_file_path = db_uri.replace('sqlite:///', '')
            if not os.path.isabs(db_file_path):
                db_file_path = os.path.join(os.getcwd(), db_file_path)
            print(f"📍 Fichier DB réel: {db_file_path}")
            print(f"📍 Existe: {os.path.exists(db_file_path)}")
            if os.path.exists(db_file_path):
                print(f"📍 Taille: {os.path.getsize(db_file_path)} bytes")
        
        # Créer les tables
        db.create_all()
        
        # Vérifier utilisateurs actuels
        users = User.query.all()
        print(f"📊 Utilisateurs actuels dans cette base: {len(users)}")
        
        # Supprimer l'existant
        existing = User.query.filter_by(username='moosyne').first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
            print("🗑️  Utilisateur existant supprimé")
        
        # Créer le nouvel utilisateur
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
            print("✅ Utilisateur créé dans la base du serveur !")
            
            # Vérification
            users_after = User.query.all()
            print(f"📊 Utilisateurs après création: {len(users_after)}")
            
            for u in users_after:
                print(f"   ✅ {u.username} - {u.email}")
                
        except Exception as e:
            print(f"❌ Erreur: {e}")
            db.session.rollback()

if __name__ == '__main__':
    # 1. Diagnostic complet
    check_all_databases()
    
    # 2. Création dans la bonne base
    create_user_in_server_db()
    
    # 3. Vérification finale
    print(f"\n🔍 VÉRIFICATION FINALE")
    print("=" * 60)
    check_all_databases()
    
    print(f"\n🎯 MAINTENANT:")
    print("1. Le serveur devrait afficher 'Total utilisateurs: 1'")
    print("2. Connectez-vous avec: moosyne / Vashthestampede2a.")
    print("3. Si ça ne marche toujours pas, montrez-moi le résultat de ce script")