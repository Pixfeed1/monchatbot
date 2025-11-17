# Base de Connaissances - Configuration

## 🚀 Installation rapide

### 1. Créer les tables en base de données

```bash
python create_knowledge_tables.py
```

Ce script va :
- ✅ Créer les tables : `knowledge_category`, `faq`, `document`, `response_rule`
- ✅ Insérer 4 catégories par défaut : Général, Produits, Procédures, Support
- ✅ Vérifier que tout est bien connecté

### 2. Accéder à l'interface

Une fois les tables créées, allez sur :
```
http://localhost:5000/base-connaissances
```

---

## 📚 Comment ça fonctionne

### Upload de documents

1. **Glissez-déposez** vos fichiers (PDF, Word, Excel, TXT)
2. **Choisissez une catégorie** : Général, Produits, Procédures, Support
3. Le bot **extrait automatiquement** le contenu
4. Le contenu est **indexé** et utilisé pour répondre aux questions

### Création de règles simples

Exemple : Si un utilisateur dit "bug", répondre "Je vous transfère au support"

```
Nom: Redirection support technique
Type: Conditionnelle
Si contient: bug, erreur, problème
Alors répondre: Je vous transfère au support technique
```

---

## 🤖 Intégration avec le bot

Le bot utilise automatiquement la base de connaissances via le `KnowledgeIntegrator` :

### 1. Recherche automatique
Quand un utilisateur pose une question :
- 🔍 Le bot cherche dans les **Documents**
- 🔍 Le bot cherche dans les **FAQs**
- 🔍 Le bot applique les **Règles**

### 2. Scoring de pertinence
Chaque résultat a un **score** basé sur :
- Les mots-clés présents
- La catégorie correspondante
- La priorité (pour les règles)

### 3. Enrichissement du contexte
Les résultats sont ajoutés au contexte de l'IA :

```python
context['knowledge'] = {
    'faqs': [...],           # FAQs pertinentes
    'documents': [...],      # Extraits de documents
    'rules': [...],          # Règles applicables
    'relevance_score': 8.5   # Score de pertinence global
}
```

### 4. Génération de réponse
L'IA utilise ces connaissances pour générer une réponse **plus précise** et **plus complète**.

---

## 📊 Routes API disponibles

### Documents
- `GET /api/knowledge/documents` - Liste tous les documents
- `POST /api/knowledge/documents/upload` - Upload un document
- `GET /api/knowledge/documents/<id>` - Détails d'un document
- `DELETE /api/knowledge/documents/<id>` - Supprimer un document
- `GET /api/knowledge/documents/export` - Exporter tous les documents

### FAQs
- `GET /api/knowledge/faqs` - Liste toutes les FAQs
- `POST /api/knowledge/faqs` - Créer une FAQ
- `GET /api/knowledge/faqs/<id>` - Détails d'une FAQ
- `DELETE /api/knowledge/faqs/<id>` - Supprimer une FAQ

### Règles
- `GET /api/knowledge/rules` - Liste toutes les règles
- `POST /api/knowledge/rules` - Créer une règle
- `POST /api/knowledge/rules/test` - Tester une règle
- `PATCH /api/knowledge/rules/<id>/toggle` - Activer/désactiver
- `DELETE /api/knowledge/rules/<id>` - Supprimer

### Catégories
- `GET /api/knowledge/categories` - Liste toutes les catégories
- `POST /api/knowledge/categories` - Créer une catégorie

### Actions globales
- `GET /api/knowledge/export` - Exporter toute la base
- `POST /api/knowledge/import` - Importer une base
- `POST /api/knowledge/optimize` - Optimiser la base
- `POST /api/knowledge/save-all` - Sauvegarder tout

---

## ✅ Vérification

Pour vérifier que tout fonctionne :

1. **Créer une FAQ de test** :
   - Question: "Quels sont vos horaires ?"
   - Réponse: "Nous sommes ouverts de 9h à 18h"
   - Catégorie: Support

2. **Tester dans le chat** :
   - Envoyez : "Quand êtes-vous ouverts ?"
   - Le bot devrait utiliser la FAQ pour répondre

3. **Vérifier les logs** :
   ```
   ✨ Connaissances enrichies: score 8.5
   ```

---

## 🎯 Exemples d'utilisation

### Cas 1 : Support produit
```
Documents:
- Guide d'utilisation.pdf (catégorie: Produits)
- FAQ produit (catégorie: Produits)

Règle:
Si contient "comment utiliser" → Répondre avec guide produit
```

### Cas 2 : Support technique
```
Documents:
- Guide dépannage.pdf (catégorie: Support)

Règle:
Si contient "bug, erreur, crash" → Escalader vers support humain
```

### Cas 3 : Procédures internes
```
Documents:
- Procédure retour.pdf (catégorie: Procédures)
- Procédure remboursement.pdf (catégorie: Procédures)

FAQ:
Q: Comment faire un retour ?
A: [Procédure détaillée]
```

---

## 🔧 Dépannage

### Erreur 500 sur /api/knowledge/documents
➡️ Les tables n'existent pas. Exécutez :
```bash
python create_knowledge_tables.py
```

### Le bot n'utilise pas la base de connaissances
➡️ Vérifiez que le `KnowledgeIntegrator` est bien initialisé dans `decision_engine.py`

### Les documents ne sont pas traités
➡️ Vérifiez que le contenu est bien extrait lors de l'upload (ligne 2195 de routes.py)

---

## 📝 Prochaines étapes

- [ ] Ajouter l'extraction de contenu pour PDF (PyPDF2)
- [ ] Ajouter l'extraction pour Word (python-docx)
- [ ] Ajouter l'extraction pour Excel (openpyxl)
- [ ] Améliorer le scoring de pertinence (TF-IDF)
- [ ] Ajouter la recherche sémantique (embeddings)
