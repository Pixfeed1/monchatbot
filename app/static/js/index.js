document.addEventListener('DOMContentLoaded', () => {
    // Récupération des éléments du chat
    const toggleBtn = document.getElementById('toggleChatBtn');
    const chatRoot = document.getElementById('react-chat-root');
    
    let chatOpen = false;
    
    // Fonction pour mettre à jour l'interface du chat
    const updateChatInterface = (isOpen) => {
        chatOpen = isOpen;
        toggleBtn.textContent = chatOpen ? "Arrêter la Conversation" : "Démarrer une Conversation";
        chatRoot.style.display = chatOpen ? 'block' : 'none';
        
        // Utilisation de l'opérateur optionnel pour appeler onOpen si défini
        if (chatOpen && window.ReactChatApp?.onOpen) {
            window.ReactChatApp.onOpen();
        }
    };

    // Mise à jour de la fonction checkConfiguration
    const checkConfiguration = async () => {
        try {
            const response = await fetch('/api/check_key');
            const data = await response.json();
            
            console.log("Configuration:", {
                "Modèle Local": "Actif",
                "API Mistral": data.use_mistral ? "Disponible" : "Non configurée",
                "API GPT": data.key_valid ? "Disponible" : "Non configurée"
            });
            
            // Toujours retourner true car le modèle local est disponible
            return true;
        } catch (error) {
            console.error("Erreur lors de la vérification:", error);
            return true; // Même en cas d'erreur, on continue car le modèle local est disponible
        }
    };

    // Gestion du clic sur le bouton pour ouvrir/fermer le chat
    toggleBtn.addEventListener('click', async () => {
        await checkConfiguration();  // On vérifie juste pour le log
        updateChatInterface(!chatOpen);
    });

    // Classe de gestion de la configuration API
    class ApiConfigManager {
        constructor() {
            console.log("Initialisation de ApiConfigManager");
            this.initializeElements();
            this.loadInitialState();
            this.setupEventListeners();
        }
    
        initializeElements() {
            console.log("Initialisation des éléments");
            this.apiTypeSelect = document.getElementById('apiTypeSelect');
            this.apiKeyField = document.getElementById('apiKey');
            this.modelSelect = document.getElementById('modelSelect');
            this.gptModelGroup = document.getElementById('gptModelGroup');
            this.apiConfigForm = document.getElementById('apiConfigForm');
            this.submitButton = document.getElementById('submitButton');
            
            // Ajouter un indicateur de mode actif à partir de la configuration globale
            this.currentMode = window.USE_MISTRAL ? 'mistral' : 'gpt';
            console.log("Mode actuel:", this.currentMode);
        }
    
        loadInitialState() {
            console.log("Chargement de l'état initial");
            // Mise à jour de l'affichage en fonction du type d'API sélectionné
            this.updateFields(this.apiTypeSelect.value);
        }
    
        setupEventListeners() {
            console.log("Configuration des écouteurs d'événements");
    
            // Écoute du changement du select de type d'API
            this.apiTypeSelect.addEventListener('change', (e) => {
                console.log("Changement détecté sur le type d'API :", e.target.value);
                this.updateFields(e.target.value);
            });
    
            // Validation du formulaire lors de la soumission
            this.apiConfigForm.addEventListener('submit', (e) => {
                console.log("Soumission du formulaire détectée");
                if (!this.validateForm()) {
                    console.log("Validation du formulaire échouée");
                    e.preventDefault();
                    return;
                }
                console.log("Formulaire validé");
            });
        }
    
        updateFields(apiType) {
            console.log("Mise à jour des champs pour l'API :", apiType);

            const isMistral = apiType === 'mistral';
            const isLocal = apiType === 'local';
            
            this.apiKeyField.disabled = isLocal;
            this.apiKeyField.required = !isLocal;
            
            if (isLocal) {
                this.apiKeyField.placeholder = "Mode local - Pas de clé nécessaire";
                this.gptModelGroup.style.display = 'none';
            } else {
                this.apiKeyField.placeholder = isMistral ? 
                    "Entrez votre clé d'API Mistral..." : 
                    "Entrez votre clé d'API GPT...";
                this.gptModelGroup.style.display = isMistral ? 'none' : 'block';
            }
            
            if (this.currentMode !== apiType) {
                this.apiKeyField.value = '';
            }
        }
    
        validateForm() {
            console.log("Validation du formulaire");
            const apiType = this.apiTypeSelect.value;
            const apiKey = this.apiKeyField.value;
    
            if (!apiKey.trim()) {
                alert(`La clé API ${apiType === 'mistral' ? 'Mistral' : 'GPT'} est requise.`);
                return false;
            }
            console.log("Validation réussie");
            return true;
        }
    }
    
    // Initialisation de ApiConfigManager si le formulaire de configuration est présent
    if (document.getElementById('apiConfigForm')) {
        console.log("DOM chargé, initialisation de ApiConfigManager");
        new ApiConfigManager();
    }
});
