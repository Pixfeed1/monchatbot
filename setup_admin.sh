#!/bin/bash
# Script pour créer l'utilisateur admin en trouvant automatiquement le bon Python

echo "=== RECHERCHE DU BON PYTHON ==="
echo ""

# Chercher le Python avec Flask installé
PYTHON_CMD=""

# Essayer différents chemins possibles
PYTHON_CANDIDATES=(
    "/usr/local/bin/python3"
    "/usr/bin/python3"
    "/usr/bin/python3.11"
    "/usr/bin/python3.10"
    "python3"
    "python"
)

for py in "${PYTHON_CANDIDATES[@]}"; do
    if command -v $py &> /dev/null; then
        if $py -c "import flask" 2>/dev/null; then
            PYTHON_CMD=$py
            echo "[OK] Python trouvé: $py"
            $py --version
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "[ERROR] Aucun Python avec Flask trouvé!"
    echo ""
    echo "Solutions:"
    echo "  1. Installer les dépendances: pip3 install -r requirements.txt"
    echo "  2. Activer le virtualenv si tu en as un"
    echo ""
    exit 1
fi

echo ""
echo "=== CRÉATION DE L'UTILISATEUR ADMIN ==="
echo ""

# Lancer le script Python avec le bon interpréteur
$PYTHON_CMD create_admin.py

exit $?
