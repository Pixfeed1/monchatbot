from app import create_app, db
from app.models import User

def create_user():
    # Créer l'instance de l'app
    app = create_app()
    
    with app.app_context():
        # Vérifier si l'utilisateur existe déjà (par username, comme dans la route login)
        existing_user = User.query.filter_by(username='moosyne').first()
        if existing_user:
            print(f"❌ Utilisateur existe déjà: {existing_user.username}")
            return
        
        # Créer votre utilisateur
        user = User(
            username='moosyne',
            email='moosyne@gmail.com',
            is_admin=True,
            is_active=True
        )
        user.set_password('Vashthestampede2a.')
        
        db.session.add(user)
        db.session.commit()
        
        print("✅ Votre utilisateur a été créé !")
        print("👤 Username: moosyne")
        print("📧 Email: moosyne@gmail.com")
        print("🔐 Prêt pour la connexion !")

def check_user():
    app = create_app()
    
    with app.app_context():
        # Chercher par username (comme dans la route login)
        user = User.query.filter_by(username='moosyne').first()
        if user:
            print("✅ Utilisateur trouvé !")
            print(f"👤 Username: {user.username}")
            print(f"📧 Email: {user.email}")
            
            # Voir tous les attributs de l'utilisateur
            print("🔍 Attributs de l'utilisateur:")
            for attr in dir(user):
                if not attr.startswith('_') and not callable(getattr(user, attr)):
                    value = getattr(user, attr)
                    if 'password' in attr.lower():
                        print(f"   {attr}: {str(value)[:20]}..." if value else f"   {attr}: None")
                    else:
                        print(f"   {attr}: {value}")
            
            # Test de vérification du mot de passe
            test_password = 'Vashthestampede2a.'
            if hasattr(user, 'check_password'):
                if user.check_password(test_password):
                    print("✅ Mot de passe correct !")
                else:
                    print("❌ Problème avec le mot de passe")
            else:
                print("❌ Méthode check_password non trouvée")
        else:
            print("❌ Utilisateur non trouvé")

if __name__ == '__main__':
    create_user()
    check_user()