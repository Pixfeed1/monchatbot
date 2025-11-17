#!/usr/bin/env python3
"""
Script pour créer les tables de la base de connaissances.
Exécuter avec: python create_knowledge_tables.py
"""
import sys
import os

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import KnowledgeCategory, FAQ, Document, ResponseRule
from sqlalchemy import inspect

def check_table_exists(table_name):
    """Vérifie si une table existe."""
    inspector = inspect(db.engine)
    return table_name in inspector.get_table_names()

def create_knowledge_tables():
    """Crée les tables de la base de connaissances si elles n'existent pas."""
    app = create_app()

    with app.app_context():
        print("🔍 Vérification des tables...")

        tables_to_check = [
            ('knowledge_category', KnowledgeCategory),
            ('faq', FAQ),
            ('document', Document),
            ('response_rule', ResponseRule)
        ]

        missing_tables = []
        for table_name, model in tables_to_check:
            if not check_table_exists(table_name):
                missing_tables.append((table_name, model))
                print(f"  ❌ Table '{table_name}' manquante")
            else:
                print(f"  ✅ Table '{table_name}' existe")

        if missing_tables:
            print(f"\n📝 Création de {len(missing_tables)} table(s) manquante(s)...")

            # Créer toutes les tables manquantes
            db.create_all()

            print("  ✅ Tables créées avec succès")

            # Vérifier si les catégories par défaut existent
            if KnowledgeCategory.query.count() == 0:
                print("\n📦 Insertion des catégories par défaut...")

                categories = [
                    KnowledgeCategory(name='Général', description='Questions et documents généraux'),
                    KnowledgeCategory(name='Produits', description='Informations sur les produits et services'),
                    KnowledgeCategory(name='Procédures', description='Procédures et guides pratiques'),
                    KnowledgeCategory(name='Support', description='Support technique et dépannage')
                ]

                for cat in categories:
                    db.session.add(cat)
                    print(f"  + {cat.name}")

                db.session.commit()
                print("  ✅ Catégories créées")
            else:
                print(f"\n✅ {KnowledgeCategory.query.count()} catégorie(s) déjà existante(s)")
        else:
            print("\n✅ Toutes les tables existent déjà")

        # Afficher un résumé
        print("\n📊 Résumé de la base de connaissances:")
        print(f"  • Catégories: {KnowledgeCategory.query.count()}")
        print(f"  • FAQs: {FAQ.query.count()}")
        print(f"  • Documents: {Document.query.count()}")
        print(f"  • Règles: {ResponseRule.query.count()}")

        print("\n✅ La base de connaissances est prête à l'emploi!")
        print("\n💡 Le bot utilisera automatiquement:")
        print("   - Les FAQs pour répondre aux questions fréquentes")
        print("   - Les Documents pour enrichir ses réponses")
        print("   - Les Règles pour appliquer des logiques conditionnelles")

if __name__ == '__main__':
    try:
        create_knowledge_tables()
    except Exception as e:
        print(f"\n❌ Erreur: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
