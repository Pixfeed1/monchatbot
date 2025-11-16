/**
 * Configuration API - Gestion des clés utilisateur
 * Version corrigée avec gestion complète de l'affichage
 */

console.log("🔧 Chargement du script API Config");

class APIConfigManager {
    constructor() {
        this.currentProvider = null;
        this.isLoaded = false;
        this.elements = {};
        this.init();
    }
    
    init() {
        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    setup() {
        console.log("⚡ Initialisation APIConfigManager");
        
        try {
            this.initElements();
            this.setupEventListeners();
            this.loadCurrentConfig();
            this.hideAllSections(); // S'assurer que tout est caché au départ
            this.isLoaded = true;
            console.log("✅ APIConfigManager initialisé avec succès");
        } catch (error) {
            console.error("❌ Erreur initialisation:", error);
        }
    }
    
    initElements() {
        console.log("🔍 Recherche des éléments DOM...");
        
        // Mapping des éléments avec vérification
        const elementIds = {
            providerSelect: 'provider_select',
            form: 'apiConfigForm',
            saveButton: 'save_config',
            openaiSection: 'openai_section',
            mistralSection: 'mistral_section',
            claudeSection: 'claude_section',
            testResults: 'test_results',
            gptKey: 'gpt_key',
            modelSelect: 'model_select',
            testOpenAI: 'test_openai',
            mistralKey: 'mistral_key',
            mistralModel: 'mistral_model',
            testMistral: 'test_mistral',
            claudeKey: 'claude_key',
            claudeModel: 'claude_model',
            testClaude: 'test_claude'
        };
        
        // Récupérer tous les éléments
        for (const [key, id] of Object.entries(elementIds)) {
            this.elements[key] = document.getElementById(id);
            if (!this.elements[key]) {
                console.warn(`⚠️ Élément manquant: ${id}`);
            }
        }
        
        // Vérifier les éléments critiques
        const criticalElements = ['providerSelect', 'form', 'saveButton', 'openaiSection', 'mistralSection', 'claudeSection'];
        for (const key of criticalElements) {
            if (!this.elements[key]) {
                throw new Error(`Élément critique manquant: ${key}`);
            }
        }
        
        console.log("✅ Tous les éléments DOM trouvés");
    }
    
    setupEventListeners() {
        console.log("🎧 Configuration des événements...");
        
        // Changement de provider - ÉVÉNEMENT PRINCIPAL
        this.elements.providerSelect.addEventListener('change', (e) => {
            console.log("🔄 Provider changé:", e.target.value);
            this.handleProviderChange(e.target.value);
        });
        
        // Validation en temps réel des clés
        if (this.elements.gptKey) {
            this.elements.gptKey.addEventListener('input', () => {
                console.log("⌨️ Saisie OpenAI key");
                this.validateKeys();
            });
        }
        
        if (this.elements.mistralKey) {
            this.elements.mistralKey.addEventListener('input', () => {
                console.log("⌨️ Saisie Mistral key");
                this.validateKeys();
            });
        }

        if (this.elements.claudeKey) {
            this.elements.claudeKey.addEventListener('input', () => {
                console.log("⌨️ Saisie Claude key");
                this.validateKeys();
            });
        }

        // Tests API
        if (this.elements.testOpenAI) {
            this.elements.testOpenAI.addEventListener('click', () => {
                console.log("🧪 Test OpenAI demandé");
                this.testAPI('openai');
            });
        }

        if (this.elements.testMistral) {
            this.elements.testMistral.addEventListener('click', () => {
                console.log("🧪 Test Mistral demandé");
                this.testAPI('mistral');
            });
        }

        if (this.elements.testClaude) {
            this.elements.testClaude.addEventListener('click', () => {
                console.log("🧪 Test Claude demandé");
                this.testAPI('claude');
            });
        }
        
        // Soumission du formulaire
        this.elements.form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log("💾 Sauvegarde demandée");
            this.saveConfig();
        });
        
        console.log("✅ Événements configurés");
    }
    
    handleProviderChange(provider) {
        console.log("🔄 Gestion changement provider:", provider);
        
        this.currentProvider = provider;
        
        // TOUJOURS cacher toutes les sections d'abord
        this.hideAllSections();
        
        // Afficher la section appropriée
        if (provider === 'openai') {
            console.log("👁️ Affichage section OpenAI");
            this.elements.openaiSection.classList.remove('hidden');
            this.elements.testResults.classList.remove('hidden');
            
            // Focus sur le champ clé pour faciliter la saisie
            if (this.elements.gptKey) {
                setTimeout(() => this.elements.gptKey.focus(), 100);
            }
            
        } else if (provider === 'mistral') {
            console.log("👁️ Affichage section Mistral");
            this.elements.mistralSection.classList.remove('hidden');
            this.elements.testResults.classList.remove('hidden');

            // Focus sur le champ clé
            if (this.elements.mistralKey) {
                setTimeout(() => this.elements.mistralKey.focus(), 100);
            }

        } else if (provider === 'claude') {
            console.log("👁️ Affichage section Claude");
            this.elements.claudeSection.classList.remove('hidden');
            this.elements.testResults.classList.remove('hidden');

            // Focus sur le champ clé
            if (this.elements.claudeKey) {
                setTimeout(() => this.elements.claudeKey.focus(), 100);
            }
        }

        // Revalider après changement
        this.validateKeys();
    }
    
    hideAllSections() {
        console.log("🙈 Masquage de toutes les sections");

        const sectionsToHide = [
            this.elements.openaiSection,
            this.elements.mistralSection,
            this.elements.claudeSection,
            this.elements.testResults
        ];

        sectionsToHide.forEach(section => {
            if (section) {
                section.classList.add('hidden');
            }
        });
    }
    
    validateKeys() {
        const provider = this.elements.providerSelect.value;
        let isValid = false;
        
        console.log("🔍 Validation pour provider:", provider);
        
        if (provider === 'openai' && this.elements.gptKey) {
            const key = this.elements.gptKey.value.trim();
            
            // Validation OpenAI plus flexible
            isValid = key.length >= 20 && (
                key.startsWith('sk-') || 
                key.startsWith('sk-proj-') ||
                key.includes('sk-')
            );
            
            console.log("🔑 OpenAI key valid:", isValid, "longueur:", key.length);
            
            // Styles visuels
            this.elements.gptKey.classList.toggle('valid', isValid);
            this.elements.gptKey.classList.toggle('invalid', !isValid && key.length > 0);
            
            // Bouton test
            if (this.elements.testOpenAI) {
                this.elements.testOpenAI.disabled = !isValid;
            }
            
        } else if (provider === 'mistral' && this.elements.mistralKey) {
            const key = this.elements.mistralKey.value.trim();

            // Validation Mistral
            isValid = key.length >= 10;

            console.log("🔑 Mistral key valid:", isValid, "longueur:", key.length);

            // Styles visuels
            this.elements.mistralKey.classList.toggle('valid', isValid);
            this.elements.mistralKey.classList.toggle('invalid', !isValid && key.length > 0);

            // Bouton test
            if (this.elements.testMistral) {
                this.elements.testMistral.disabled = !isValid;
            }

        } else if (provider === 'claude' && this.elements.claudeKey) {
            const key = this.elements.claudeKey.value.trim();

            // Validation Claude (clé commence par sk-ant-)
            isValid = key.length >= 20 && key.startsWith('sk-ant-');

            console.log("🔑 Claude key valid:", isValid, "longueur:", key.length);

            // Styles visuels
            this.elements.claudeKey.classList.toggle('valid', isValid);
            this.elements.claudeKey.classList.toggle('invalid', !isValid && key.length > 0);

            // Bouton test
            if (this.elements.testClaude) {
                this.elements.testClaude.disabled = !isValid;
            }
        }

        // Mise à jour du bouton de sauvegarde
        this.updateSaveButton(provider, isValid);

        return isValid;
    }
    
    updateSaveButton(provider, isValid) {
        if (!provider) {
            this.elements.saveButton.disabled = true;
            this.elements.saveButton.textContent = 'Choisissez d\'abord un provider';
        } else if (!isValid) {
            this.elements.saveButton.disabled = true;
            this.elements.saveButton.textContent = 'Clé API invalide';
        } else {
            this.elements.saveButton.disabled = false;
            this.elements.saveButton.textContent = 'Sauvegarder la configuration';
        }
        
        console.log("🔘 Bouton save:", this.elements.saveButton.textContent, "disabled:", this.elements.saveButton.disabled);
    }
    
    async testAPI(provider) {
        console.log("🧪 Test API:", provider);

        let button;
        if (provider === 'openai') {
            button = this.elements.testOpenAI;
        } else if (provider === 'mistral') {
            button = this.elements.testMistral;
        } else if (provider === 'claude') {
            button = this.elements.testClaude;
        }

        if (!button) {
            console.error("❌ Bouton de test non trouvé pour", provider);
            return;
        }

        const originalText = button.textContent;

        // État de chargement
        button.disabled = true;
        button.textContent = 'Test en cours...';

        try {
            const testData = {
                provider: provider
            };

            if (provider === 'openai') {
                testData.api_key = this.elements.gptKey.value;
                testData.model = this.elements.modelSelect.value;
            } else if (provider === 'mistral') {
                testData.api_key = this.elements.mistralKey.value;
                testData.model = this.elements.mistralModel.value;
            } else if (provider === 'claude') {
                testData.api_key = this.elements.claudeKey.value;
                testData.model = this.elements.claudeModel.value;
            }
            
            console.log("📤 Envoi test:", { provider, model: testData.model });
            
            const response = await fetch('/api/test-api-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify(testData)
            });
            
            console.log("📥 Réponse reçue, status:", response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log("📊 Résultat:", result);
            
            if (result.success) {
                this.showTestResult('success', `✅ ${provider.toUpperCase()}: ${result.message}`);
            } else {
                this.showTestResult('error', `❌ ${provider.toUpperCase()}: ${result.error}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur test API:', error);
            this.showTestResult('error', `❌ Erreur de connexion: ${error.message}`);
        } finally {
            // Restaurer l'état du bouton
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    async saveConfig() {
        console.log("💾 Début sauvegarde...");
        
        const originalText = this.elements.saveButton.textContent;
        this.elements.saveButton.disabled = true;
        this.elements.saveButton.textContent = 'Sauvegarde en cours...';
        
        try {
            const configData = {
                provider: this.elements.providerSelect.value
            };
            
            if (this.elements.providerSelect.value === 'openai') {
                configData.openai_key = this.elements.gptKey.value;
                configData.openai_model = this.elements.modelSelect.value;
            } else if (this.elements.providerSelect.value === 'mistral') {
                configData.mistral_key = this.elements.mistralKey.value;
                configData.mistral_model = this.elements.mistralModel.value;
            } else if (this.elements.providerSelect.value === 'claude') {
                configData.claude_key = this.elements.claudeKey.value;
                configData.claude_model = this.elements.claudeModel.value;
            }
            
            console.log("📤 Envoi config:", { provider: configData.provider });
            
            const response = await fetch('/api/save-api-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify(configData)
            });
            
            const result = await response.json();
            console.log("📥 Résultat sauvegarde:", result);
            
            if (result.success) {
                this.showTestResult('success', '✅ Configuration sauvegardée avec succès');
                // Recharger la config pour confirmer
                setTimeout(() => this.loadCurrentConfig(), 1000);
            } else {
                this.showTestResult('error', `❌ Erreur de sauvegarde: ${result.error}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            this.showTestResult('error', `❌ Erreur de connexion: ${error.message}`);
        } finally {
            this.elements.saveButton.disabled = false;
            this.elements.saveButton.textContent = originalText;
            // Revalider pour restaurer le bon état
            this.validateKeys();
        }
    }
    
    async loadCurrentConfig() {
        console.log("📥 Chargement configuration actuelle...");
        
        try {
            const response = await fetch('/api/get-api-config');
            const result = await response.json();
            
            if (result.success && result.data) {
                const data = result.data;
                console.log("📊 Config chargée:", data);
                
                // Restaurer le provider SANS déclencher l'événement
                if (data.provider) {
                    this.elements.providerSelect.value = data.provider;
                    // Déclencher manuellement le changement
                    this.handleProviderChange(data.provider);
                }
                
                // Restaurer les clés (masquées pour sécurité)
                if (data.openai_key && this.elements.gptKey) {
                    this.elements.gptKey.value = data.openai_key;
                }
                if (data.mistral_key && this.elements.mistralKey) {
                    this.elements.mistralKey.value = data.mistral_key;
                }
                if (data.claude_key && this.elements.claudeKey) {
                    this.elements.claudeKey.value = data.claude_key;
                }

                // Revalider après chargement
                this.validateKeys();
                
            } else {
                console.log("ℹ️ Aucune configuration trouvée");
            }
        } catch (error) {
            console.error('❌ Erreur chargement config:', error);
            // Erreur silencieuse pour ne pas perturber l'utilisateur
        }
    }
    
    showTestResult(type, message) {
        if (!this.elements.testResults) return;
        
        const cssClass = {
            'success': 'test-success',
            'error': 'test-error',
            'info': 'test-info'
        }[type] || 'test-info';
        
        this.elements.testResults.className = `test-zone ${cssClass}`;
        this.elements.testResults.innerHTML = `<p>${message}</p>`;
        this.elements.testResults.classList.remove('hidden');
        
        console.log(`📢 ${type}:`, message);
    }
    
    getCSRFToken() {
        const token = document.querySelector('input[name="csrf_token"]')?.value ||
                     document.querySelector('meta[name="csrf-token"]')?.content;
        return token || '';
    }
    
    // Méthodes de debug
    getStatus() {
        return {
            loaded: this.isLoaded,
            currentProvider: this.currentProvider,
            hasValidKey: this.validateKeys(),
            elements: Object.keys(this.elements).filter(key => this.elements[key])
        };
    }
    
    forceShowSection(provider) {
        console.log("🔧 Force affichage section:", provider);
        this.elements.providerSelect.value = provider;
        this.handleProviderChange(provider);
    }
}

// Initialisation globale
let apiConfigManager;

// Démarrage automatique avec protection d'erreur
(function() {
    console.log("🚀 Démarrage API Config Manager");
    
    try {
        apiConfigManager = new APIConfigManager();
        
        // Exposer globalement pour debug
        window.apiConfigManager = apiConfigManager;
        window.getAPIConfigStatus = () => apiConfigManager.getStatus();
        window.forceShowSection = (provider) => apiConfigManager.forceShowSection(provider);
        
        console.log("✅ API Config Manager chargé et exposé globalement");
        
    } catch (error) {
        console.error("❌ Erreur critique lors du démarrage:", error);
    }
})();