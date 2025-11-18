#!/usr/bin/env python3
"""
Script pour appliquer les migrations de base de données
Usage: python run_migrations.py
"""

import os
import sys

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_migrate import Migrate, upgrade
from app import create_app, db

def run_migrations():
    """Applique toutes les migrations en attente"""
    app = create_app()

    with app.app_context():
        try:
            print("🔄 Application des migrations de base de données...")
            print("=" * 60)

            # Appliquer les migrations
            from flask_migrate import upgrade as flask_upgrade
            flask_upgrade()

            print("=" * 60)
            print("✅ Migrations appliquées avec succès!")
            print("\nNouvelles tables créées:")
            print("  - widget (pour les widgets d'intégration)")
            print("  - recommendation (pour les recommandations d'amélioration)")

            return True

        except Exception as e:
            print("=" * 60)
            print(f"❌ Erreur lors de l'application des migrations: {str(e)}")
            print("\nVeuillez vérifier:")
            print("  1. Que la base de données est accessible")
            print("  2. Que les migrations précédentes ont été appliquées")
            print("  3. Les logs ci-dessus pour plus de détails")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  MIGRATION BASE DE DONNÉES - LeoBot")
    print("="*60 + "\n")

    success = run_migrations()

    if success:
        print("\n✨ Vous pouvez maintenant:")
        print("  - Créer des widgets depuis /widgets")
        print("  - Gérer les recommandations depuis /recommendations")
        print("\n" + "="*60 + "\n")
        sys.exit(0)
    else:
        print("\n" + "="*60 + "\n")
        sys.exit(1)
