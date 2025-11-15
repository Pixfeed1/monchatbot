#!/usr/bin/env python3
"""
Script de démarrage pour le Chatbot - Version Frontend API
==========================================================

Ce script démarre l'application Flask en mode backend uniquement.
Les clés API sont gérées côté frontend pour plus de flexibilité.

Prérequis :
- pip install flask flask-sqlalchemy flask-login flask-cors requests python-dotenv

Utilisation :
python run.py
"""

import os
import sys
import logging
from pathlib import Path

# Ajouter le répertoire courant au Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def check_requirements():
    """Vérifie que les dépendances essentielles sont installées."""
    required_packages = {
        'flask': 'Flask',
        'flask_sqlalchemy': 'Flask-SQLAlchemy', 
        'flask_login': 'Flask-Login',
        'flask_cors': 'Flask-CORS',
        'requests': 'requests',
        'dotenv': 'python-dotenv'
    }
    
    missing = []
    for package, name in required_packages.items():
        try:
            __import__(package)
        except ImportError:
            missing.append(name)
    
    if missing:
        print("❌ Packages manquants:")
        for pkg in missing:
            print(f"   - {pkg}")
        print(f"\n💡 Installez avec: pip install {' '.join(missing)}")
        sys.exit(1)
    
    print("✅ Toutes les dépendances sont installées")

def check_or_create_env_file():
    """Vérifie ou crée le fichier .env avec la configuration minimale."""
    env_file = Path('.env')
    
    if not env_file.exists():
        print("📝 Création du fichier .env...")
        
        # Configuration par défaut
        default_config = """# Configuration serveur Flask
DEBUG=false
FLASK_HOST=127.0.0.1
FLASK_PORT=5000

# Clé secrète pour Flask (génération automatique)
SECRET_KEY=your-secret-key-change-this-in-production

# Configuration base de données (optionnel)
# DATABASE_URL=sqlite:///chatbot.db

# Configuration CORS (optionnel)
# CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Note: Les clés API sont gérées côté frontend
# Aucune clé API n'est requise côté backend
"""
        
        try:
            with open(env_file, 'w', encoding='utf-8') as f:
                f.write(default_config)
            print("✅ Fichier .env créé avec la configuration par défaut")
        except Exception as e:
            print(f"⚠️  Impossible de créer .env: {e}")
            print("💡 Le serveur démarrera avec la configuration par défaut")
    
    # Charger les variables d'environnement
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Configuration environnement chargée")

def create_flask_app():
    """Crée et configure l'application Flask."""
    try:
        # Charger les variables d'environnement
        from dotenv import load_dotenv
        load_dotenv()
        
        # Import de l'application depuis le package principal
        from app import create_app
        app = create_app()
        
        # Configuration CORS pour l'application
        from flask_cors import CORS
        
        # Origines autorisées (configurable via .env)
        cors_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',')
        
        CORS(app, supports_credentials=True, resources={
            r"/*": {
                "origins": cors_origins + [
                    "http://localhost:5000",
                    "http://127.0.0.1:5000"
                ],
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Requested-With", "Authorization"],
            }
        })
        
        return app
        
    except ImportError as e:
        print(f"❌ Erreur d'import de l'application: {e}")
        print("💡 Vérifiez que le fichier 'app.py' existe et contient create_app()")
        
        # Essayer d'autres noms de modules courants
        alternative_modules = ['__init__', 'main']
        for module_name in alternative_modules:
            try:
                if module_name == '__init__':
                    # Essayer d'importer depuis le package principal
                    from . import create_app
                    app = create_app()
                    return app
                else:
                    module = __import__(module_name)
                    if hasattr(module, 'create_app'):
                        return module.create_app()
                    elif hasattr(module, 'app'):
                        return module.app
            except ImportError:
                continue
        
        print("❌ Impossible de trouver l'application Flask")
        print("💡 Vérifiez la structure de votre projet:")
        print("   - Le fichier app.py doit exister")
        print("   - Il doit contenir une fonction create_app()")
        sys.exit(1)

def print_startup_info(host, port, debug):
    """Affiche les informations de démarrage."""
    print(f"🌐 Démarrage du serveur sur http://{host}:{port}")
    
    if debug:
        print("⚠️  Mode DEBUG activé - Ne pas utiliser en production!")
        # Configuration des logs pour le développement
        logging.getLogger('flask_cors').setLevel(logging.DEBUG)
    
    print(f"\n🎯 Accès rapide:")
    print(f"   📱 Interface: http://{host}:{port}")
    print(f"   📊 Stats: http://{host}:{port}/api/system/stats")
    print(f"   🔧 Health Check: http://{host}:{port}/api/health")
    
    print(f"\n💡 Architecture:")
    print(f"   🖥️  Backend: Flask (données, logique métier)")
    print(f"   🌐 Frontend: Gère les appels API externes")
    print(f"   🔒 Sécurité: Pas de clés API côté serveur")
    print(f"   🚀 Performance: Cache et optimisations backend")
    
    print(f"\n🛠️  Commandes utiles:")
    print(f"   - Ctrl+C pour arrêter")
    print(f"   - Consultez les logs en cas de problème")
    print(f"   - Le frontend gère les clés API")

def main():
    """Point d'entrée principal."""
    print("🤖 Chatbot Flask - Version Frontend API")
    print("=" * 50)
    
    # Vérifications préliminaires
    print("🔍 Vérification des prérequis...")
    check_requirements()
    check_or_create_env_file()
    
    # Création de l'application
    print("🚀 Initialisation de l'application...")
    app = create_flask_app()
    
    # Configuration du serveur
    host = os.getenv('FLASK_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    
    # Affichage des informations de démarrage
    print_startup_info(host, port, debug)
    
    try:
        # Démarrage du serveur Flask
        app.run(
            host=host,
            port=port,
            debug=debug,
            use_reloader=False,  # Désactivé pour éviter les conflits
            threaded=True
        )
    except KeyboardInterrupt:
        print("\n👋 Arrêt du serveur demandé par l'utilisateur")
        logger.info("Serveur arrêté proprement")
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ Le port {port} est déjà utilisé!")
            print(f"💡 Solutions:")
            print(f"   1. Changez le port: FLASK_PORT=5001 python run.py")
            print(f"   2. Ou arrêtez l'autre processus sur le port {port}")
            print(f"   3. Ou attendez quelques secondes et réessayez")
        else:
            print(f"\n❌ Erreur réseau: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Erreur lors du démarrage: {e}")
        logger.error(f"Erreur fatale: {e}", exc_info=True)
        print("\n🔧 Dépannage:")
        print("   1. Vérifiez votre fichier .env")
        print("   2. Vérifiez que tous les packages sont installés")
        print("   3. Vérifiez la structure de votre projet")
        sys.exit(1)

if __name__ == '__main__':
    main()