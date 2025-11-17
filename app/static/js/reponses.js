/**
 * Configuration des Réponses - Version améliorée
 * Interface intuitive et guidée pour la configuration des réponses automatiques
 */

class ResponsesWizard {
    constructor() {
        this.currentSection = 'essentials';
        this.unsavedChanges = false;
        this.autoSaveTimeout = null;
        this.templates = new Map();
        this.customResponses = [];
        this.vocabularyTerms = [];
        this.errorMessages = [];
        this.eventListeners = [];  // Pour suivre les event listeners

        this.init();
    }

    /**
     * Initialisation du wizard
     */
    init() {
        if (!this.checkRequiredElements()) {
            console.warn('Éléments requis manquants pour le wizard des réponses');
            return;
        }

        this.setupEventListeners();
        this.loadExistingData();
        this.initializeTemplates();
        this.setupAutoSave();
        this.updateSaveStatus('saved');
    }

    /**
     * Vérification des éléments DOM requis
     */
    checkRequiredElements() {
        return document.querySelector('.responses-container') !== null;
    }

    /**
     * Configuration des écouteurs d'événements
     */
    setupEventListeners() {
        // Navigation entre sections
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSection(btn.dataset.section);
            });
        });

        // Message de bienvenue en temps réel
        const welcomeTextarea = document.querySelector('.smart-textarea[data-preview="welcomePreview"]');
        if (welcomeTextarea) {
            welcomeTextarea.addEventListener('input', (e) => {
                this.updatePreview('welcomePreview', e.target.value);
                this.markAsChanged();
            });
        }

        // Templates de réponses essentielles
        this.setupTemplateListeners();

        // Testeur rapide
        this.setupQuickTester();

        // Assistant de création (section métier)
        this.setupCreationAssistant();

        // Vocabulaire métier
        this.setupVocabularyManager();

        // Configuration avancée
        this.setupAdvancedConfig();

        // Actions globales
        this.setupGlobalActions();

        // Exemples rapides
        this.setupQuickExamples();

        // Prévention de la perte de données
        this.setupUnloadProtection();
    }

    /**
     * Navigation entre sections
     */
    switchSection(sectionId) {
        // Masquer toutes les sections
        document.querySelectorAll('.wizard-section').forEach(section => {
            section.classList.remove('active');
        });

        // Désactiver tous les boutons de navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Activer la section et le bouton correspondants
        const targetSection = document.getElementById(sectionId);
        const targetBtn = document.querySelector(`.nav-btn[data-section="${sectionId}"]`);

        if (targetSection && targetBtn) {
            targetSection.classList.add('active');
            targetBtn.classList.add('active');
            this.currentSection = sectionId;

            // Animation d'entrée
            targetSection.classList.add('fade-in');
            setTimeout(() => targetSection.classList.remove('fade-in'), 300);

            // Mettre à jour l'indicateur de progression
            this.updateProgressIndicator(sectionId);
        }
    }

    /**
     * Mise à jour de l'indicateur de progression
     */
    updateProgressIndicator(sectionId) {
        const stepMapping = {
            'essentials': 1,
            'specialized': 2,
            'advanced': 3
        };

        const currentStep = stepMapping[sectionId] || 1;
        
        document.querySelectorAll('.progress-step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 <= currentStep);
        });
    }

    /**
     * Configuration des templates de réponses essentielles
     */
    setupTemplateListeners() {
        // Boutons de toggle pour activer/désactiver les templates
        document.querySelectorAll('.toggle-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTemplate(btn);
            });
        });

        // Options radio pour les styles de réponse
        document.querySelectorAll('.radio-option input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleTemplateStyleChange(e.target);
                this.markAsChanged();
            });
        });

        // Inputs personnalisés
        document.querySelectorAll('.custom-input').forEach(input => {
            input.addEventListener('input', (e) => {
                this.markAsChanged();
            });
        });
    }

    /**
     * Toggle d'activation/désactivation d'un template
     */
    toggleTemplate(button) {
        const isActive = button.classList.contains('active');
        const templateCard = button.closest('.template-card');
        const icon = button.querySelector('i');

        if (isActive) {
            // Désactiver le template
            button.classList.remove('active');
            templateCard.classList.add('disabled');
            icon.className = 'fas fa-toggle-off';
        } else {
            // Activer le template
            button.classList.add('active');
            templateCard.classList.remove('disabled');
            icon.className = 'fas fa-toggle-on';
        }

        this.markAsChanged();
    }

    /**
     * Gestion du changement de style de template
     */
    handleTemplateStyleChange(radio) {
        const customInput = radio.closest('.radio-option').querySelector('.custom-input');
        
        if (radio.value === 'custom') {
            if (customInput) {
                customInput.style.display = 'block';
                customInput.focus();
            }
        } else {
            if (customInput) {
                customInput.style.display = 'none';
            }
        }
    }

    /**
     * Configuration du testeur rapide
     */
    setupQuickTester() {
        const testInput = document.querySelector('.test-input');
        const testBtn = document.querySelector('.test-btn');
        const testResponse = document.getElementById('testResponse');

        if (testBtn && testInput && testResponse) {
            testBtn.addEventListener('click', () => {
                this.runQuickTest(testInput.value, testResponse);
            });

            testInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.runQuickTest(testInput.value, testResponse);
                }
            });

            // Test automatique pendant la frappe (avec délai)
            let testTimeout;
            testInput.addEventListener('input', (e) => {
                clearTimeout(testTimeout);
                testTimeout = setTimeout(() => {
                    if (e.target.value.trim()) {
                        this.runQuickTest(e.target.value, testResponse);
                    }
                }, 500);
            });
        }
    }

    /**
     * Exécution d'un test rapide
     */
    async runQuickTest(input, responseElement) {
        if (!input.trim()) {
            responseElement.textContent = 'Tapez un message pour voir la réponse';
            return;
        }

        responseElement.textContent = 'Test en cours...';
        
        try {
            // Simuler le test avec les templates actuels
            const response = await this.simulateResponse(input);
            responseElement.textContent = response.message;
            
            // Animation de mise à jour
            responseElement.parentElement.classList.add('highlight');
            setTimeout(() => {
                responseElement.parentElement.classList.remove('highlight');
            }, 1000);
            
        } catch (error) {
            responseElement.textContent = 'Erreur lors du test';
            this.showNotification('Erreur lors du test rapide', 'error');
        }
    }

    /**
     * Simulation de réponse basée sur les templates configurés
     */
    async simulateResponse(input) {
        const lowerInput = input.toLowerCase();
        
        // Vérifier les templates de base
        const greetings = ['bonjour', 'salut', 'hello', 'bonsoir'];
        const goodbyes = ['au revoir', 'bye', 'à bientôt', 'merci'];
        const thanks = ['merci', 'thanks', 'super'];
        
        if (greetings.some(word => lowerInput.includes(word))) {
            const style = this.getSelectedTemplateStyle('greeting');
            return { message: this.getGreetingResponse(style) };
        }
        
        if (goodbyes.some(word => lowerInput.includes(word))) {
            const style = this.getSelectedTemplateStyle('goodbye');
            return { message: this.getGoodbyeResponse(style) };
        }
        
        if (thanks.some(word => lowerInput.includes(word))) {
            const style = this.getSelectedTemplateStyle('thanks');
            return { message: this.getThanksResponse(style) };
        }
        
        // Vérifier les réponses métier personnalisées
        for (const response of this.customResponses) {
            if (response.keywords.some(keyword => lowerInput.includes(keyword.toLowerCase()))) {
                return { message: response.content };
            }
        }
        
        return { message: 'Pourriez-vous reformuler votre question ? Je veux être sûr de bien vous aider.' };
    }

    /**
     * Récupération du style sélectionné pour un template
     */
    getSelectedTemplateStyle(templateName) {
        const selectedRadio = document.querySelector(`input[name="${templateName}-style"]:checked`);
        return selectedRadio ? selectedRadio.value : 'formal';
    }

    /**
     * Génération des réponses selon le style
     */
    getGreetingResponse(style) {
        const responses = {
            formal: 'Bonjour, comment puis-je vous aider ?',
            friendly: 'Salut ! Que puis-je faire pour toi ?'
        };
        return responses[style] || responses.formal;
    }

    getGoodbyeResponse(style) {
        const responses = {
            polite: 'Au revoir, bonne journée !',
            helpful: 'N\'hésitez pas à revenir si vous avez d\'autres questions !'
        };
        return responses[style] || responses.polite;
    }

    getThanksResponse(style) {
        const responses = {
            simple: 'De rien, ravi d\'avoir pu vous aider !',
            encouraging: 'Avec plaisir ! Je suis là si vous avez d\'autres questions.'
        };
        return responses[style] || responses.simple;
    }

    /**
     * Configuration de l'assistant de création
     */
    setupCreationAssistant() {
        // Boutons de scénarios
        document.querySelectorAll('.scenario-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startScenario(btn.dataset.scenario);
            });
        });

        // Tags de suggestions de mots-clés
        document.querySelectorAll('.suggestion-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                this.addKeywordSuggestion(tag.textContent);
            });
        });

        // Formulaire guidé
        this.setupGuidedForm();
    }

    /**
     * Démarrage d'un scénario de création
     */
    startScenario(scenarioType) {
        const guidedForm = document.getElementById('guidedForm');
        const keywordsInput = document.getElementById('keywordsInput');
        const responseInput = document.getElementById('responseInput');

        // Afficher le formulaire
        guidedForm.style.display = 'block';
        guidedForm.scrollIntoView({ behavior: 'smooth' });

        // Pré-remplir selon le scénario
        const scenarios = {
            services: {
                keywords: 'services, prestations, offre, proposez',
                response: 'Nous proposons une large gamme de services adaptés à vos besoins. Que recherchez-vous spécifiquement ?'
            },
            pricing: {
                keywords: 'prix, tarif, coût, combien',
                response: 'Nos tarifs varient selon vos besoins spécifiques. Je peux vous proposer un devis personnalisé. Pouvez-vous me dire ce qui vous intéresse ?'
            },
            contact: {
                keywords: 'contact, téléphone, email, adresse',
                response: 'Vous pouvez nous contacter par téléphone au [VOTRE_NUMERO] ou par email à [VOTRE_EMAIL]. Nous sommes également situés à [VOTRE_ADRESSE].'
            },
            hours: {
                keywords: 'horaires, ouvert, fermé, heures',
                response: 'Nous sommes ouverts du lundi au vendredi de 9h à 18h. Le samedi de 9h à 12h. Fermé le dimanche.'
            },
            faq: {
                keywords: '',
                response: ''
            }
        };

        const scenario = scenarios[scenarioType];
        if (scenario) {
            keywordsInput.value = scenario.keywords;
            responseInput.value = scenario.response;
            
            if (scenarioType === 'custom' || scenarioType === 'faq') {
                keywordsInput.value = '';
                responseInput.value = '';
                keywordsInput.focus();
            }
        }
    }

    /**
     * Ajout d'une suggestion de mot-clé
     */
    addKeywordSuggestion(keyword) {
        const keywordsInput = document.getElementById('keywordsInput');
        if (keywordsInput) {
            const currentValue = keywordsInput.value;
            const keywords = currentValue.split(',').map(k => k.trim()).filter(k => k);
            
            if (!keywords.includes(keyword)) {
                keywords.push(keyword);
                keywordsInput.value = keywords.join(', ');
                this.markAsChanged();
            }
        }
    }

    /**
     * Configuration du formulaire guidé
     */
    setupGuidedForm() {
        const cancelBtn = document.getElementById('cancelForm');
        const saveBtn = document.getElementById('saveResponse');
        const guidedForm = document.getElementById('guidedForm');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                guidedForm.style.display = 'none';
                this.clearGuidedForm();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveCustomResponse();
            });
        }
    }

    /**
     * Sauvegarde d'une réponse personnalisée
     */
    saveCustomResponse() {
        const keywordsInput = document.getElementById('keywordsInput');
        const responseInput = document.getElementById('responseInput');

        if (!keywordsInput.value.trim() || !responseInput.value.trim()) {
            this.showNotification('Veuillez remplir tous les champs', 'warning');
            return;
        }

        const keywords = keywordsInput.value.split(',').map(k => k.trim()).filter(k => k);
        const response = {
            id: Date.now(),
            keywords: keywords,
            content: responseInput.value.trim(),
            created: new Date()
        };

        this.customResponses.push(response);
        this.renderCustomResponses();
        this.clearGuidedForm();
        
        document.getElementById('guidedForm').style.display = 'none';
        this.markAsChanged();
        this.showNotification('Réponse ajoutée avec succès !', 'success');
    }

    /**
     * Nettoyage du formulaire guidé
     */
    clearGuidedForm() {
        const keywordsInput = document.getElementById('keywordsInput');
        const responseInput = document.getElementById('responseInput');
        
        if (keywordsInput) keywordsInput.value = '';
        if (responseInput) responseInput.value = '';
    }

    /**
     * Rendu des réponses personnalisées
     */
    renderCustomResponses() {
        const container = document.getElementById('businessResponsesList');
        if (!container) return;

        if (this.customResponses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-lightbulb"></i>
                    <p>Aucune réponse métier configurée</p>
                    <small>Utilisez l'assistant ci-dessus pour en créer facilement</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.customResponses.map(response => `
            <div class="custom-response-item" data-id="${response.id}">
                <div class="response-header">
                    <div class="response-keywords">
                        ${response.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
                    </div>
                    <button class="delete-response" data-id="${response.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="response-content">
                    <p>${response.content}</p>
                </div>
            </div>
        `).join('');

        // Attacher les événements de suppression
        container.querySelectorAll('.delete-response').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.deleteCustomResponse(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * Suppression d'une réponse personnalisée
     */
    deleteCustomResponse(responseId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette réponse ?')) {
            return;
        }

        this.customResponses = this.customResponses.filter(r => r.id !== responseId);
        this.renderCustomResponses();
        this.markAsChanged();
        this.showNotification('Réponse supprimée', 'info');
    }

    /**
     * Configuration du gestionnaire de vocabulaire
     */
    setupVocabularyManager() {
        const addVocabBtn = document.querySelector('.add-vocab-btn');
        if (addVocabBtn) {
            addVocabBtn.addEventListener('click', () => {
                this.addVocabularyTerm();
            });
        }

        // Entrée avec la touche Enter
        const termInput = document.getElementById('termInput');
        const definitionInput = document.getElementById('definitionInput');
        [termInput, definitionInput].forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.addVocabularyTerm();
                    }
                });
            }
        });
    }

    /**
     * Ajout d'un terme de vocabulaire
     */
    addVocabularyTerm() {
        const termInput = document.getElementById('termInput');
        const definitionInput = document.getElementById('definitionInput');

        if (!termInput.value.trim() || !definitionInput.value.trim()) {
            this.showNotification('Veuillez remplir le terme et sa définition', 'warning');
            return;
        }

        const term = {
            id: Date.now(),
            term: termInput.value.trim(),
            definition: definitionInput.value.trim()
        };

        this.vocabularyTerms.push(term);
        this.renderVocabularyList();
        
        termInput.value = '';
        definitionInput.value = '';
        termInput.focus();
        
        this.markAsChanged();
        this.showNotification('Terme ajouté au vocabulaire', 'success');
    }

    /**
     * Rendu de la liste de vocabulaire
     */
    renderVocabularyList() {
        const container = document.getElementById('vocabularyList');
        if (!container) return;

        if (this.vocabularyTerms.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Aucun terme de vocabulaire défini</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.vocabularyTerms.map(term => `
            <div class="vocab-item" data-id="${term.id}">
                <div class="vocab-term">
                    <strong>${term.term}</strong>
                </div>
                <div class="vocab-definition">
                    ${term.definition}
                </div>
                <button class="delete-vocab" data-id="${term.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Attacher les événements de suppression
        container.querySelectorAll('.delete-vocab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.deleteVocabularyTerm(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * Suppression d'un terme de vocabulaire
     */
    deleteVocabularyTerm(termId) {
        this.vocabularyTerms = this.vocabularyTerms.filter(t => t.id !== termId);
        this.renderVocabularyList();
        this.markAsChanged();
        this.showNotification('Terme supprimé', 'info');
    }

    /**
     * Configuration avancée
     */
    setupAdvancedConfig() {
        // Messages d'erreur
        document.querySelectorAll('.error-content textarea').forEach(textarea => {
            textarea.addEventListener('input', () => {
                this.markAsChanged();
            });
        });

        // Options de comportement
        document.querySelectorAll('.option-group input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.markAsChanged();
            });
        });
    }

    /**
     * Configuration des actions globales
     */
    setupGlobalActions() {
        const saveAllBtn = document.getElementById('saveAll');
        const resetAllBtn = document.getElementById('resetAll');
        const exportConfigBtn = document.getElementById('exportConfig');

        if (saveAllBtn) {
            saveAllBtn.addEventListener('click', () => {
                this.saveAllConfiguration();
            });
        }

        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => {
                this.resetAllConfiguration();
            });
        }

        if (exportConfigBtn) {
            exportConfigBtn.addEventListener('click', () => {
                this.exportConfiguration();
            });
        }
    }

    /**
     * Sauvegarde automatique
     */
    setupAutoSave() {
        // Auto-sauvegarde toutes les 30 secondes si des changements non sauvegardés existent
        setInterval(() => {
            if (this.unsavedChanges) {
                this.saveAllConfiguration(true); // true = sauvegarde silencieuse
            }
        }, 30000);
    }

    /**
     * Protection contre la perte de données
     */
    setupUnloadProtection() {
        window.addEventListener('beforeunload', (e) => {
            if (this.unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir quitter ?';
                return e.returnValue;
            }
        });
    }

    /**
     * Marquer comme modifié
     */
    markAsChanged() {
        this.unsavedChanges = true;
        this.updateSaveStatus('unsaved');
        
        // Déclencher la sauvegarde automatique après 2 secondes d'inactivité
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveAllConfiguration(true);
        }, 2000);
    }

    /**
     * Mise à jour du statut de sauvegarde
     */
    updateSaveStatus(status) {
        const saveStatus = document.getElementById('saveStatus');
        const statusIndicator = saveStatus.querySelector('.status-indicator');
        const statusText = statusIndicator.querySelector('span');
        const statusIcon = statusIndicator.querySelector('i');

        saveStatus.className = 'save-status';
        
        switch (status) {
            case 'saved':
                saveStatus.classList.add('saved');
                statusIcon.className = 'fas fa-check-circle';
                statusText.textContent = 'Toutes les modifications sont sauvegardées';
                break;
            case 'saving':
                saveStatus.classList.add('saving');
                statusIcon.className = 'fas fa-spinner fa-spin';
                statusText.textContent = 'Sauvegarde en cours...';
                break;
                case 'unsaved':
                saveStatus.classList.add('unsaved');
                statusIcon.className = 'fas fa-exclamation-circle';
                statusText.textContent = 'Modifications non sauvegardées';
                break;
            case 'error':
                saveStatus.classList.add('error');
                statusIcon.className = 'fas fa-times-circle';
                statusText.textContent = 'Erreur lors de la sauvegarde';
                break;
        }
    }

    /**
     * Mise à jour de l'aperçu en temps réel
     */
    updatePreview(previewId, content) {
        const previewElement = document.getElementById(previewId);
        if (previewElement) {
            // Traitement des variables
            let processedContent = content;
            const variables = {
                '{bot_name}': 'Assistant',
                '{user_name}': 'Visiteur',
                '{current_time}': new Date().toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                '{current_date}': new Date().toLocaleDateString('fr-FR')
            };

            Object.entries(variables).forEach(([variable, value]) => {
                processedContent = processedContent.replace(new RegExp(variable, 'g'), value);
            });

            previewElement.textContent = processedContent || 'Tapez votre message...';
        }
    }

    /**
     * Sauvegarde de toute la configuration
     */
    async saveAllConfiguration(silent = false) {
        if (!silent) {
            this.updateSaveStatus('saving');
        }

        try {
            const configuration = this.gatherAllConfiguration();
            await this.sendConfigurationToServer(configuration);
            
            this.unsavedChanges = false;
            this.updateSaveStatus('saved');
            
            if (!silent) {
                this.showNotification('Configuration sauvegardée avec succès !', 'success');
            }
        } catch (error) {
            this.updateSaveStatus('error');

            if (!silent) {
                this.showNotification(`Erreur lors de la sauvegarde: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Collecte de toute la configuration
     */
    gatherAllConfiguration() {
        return {
            // Message de bienvenue
            welcomeMessage: this.getWelcomeMessage(),
            
            // Templates essentiels
            essentialTemplates: this.getEssentialTemplates(),
            
            // Réponses métier personnalisées
            customResponses: this.customResponses,
            
            // Vocabulaire métier
            vocabulary: this.vocabularyTerms,
            
            // Messages d'erreur
            errorMessages: this.getErrorMessages(),
            
            // Configuration du comportement
            behaviorConfig: this.getBehaviorConfig(),
            
            // Métadonnées
            lastModified: new Date().toISOString(),
            version: '2.0'
        };
    }

    /**
     * Récupération du message de bienvenue
     */
    getWelcomeMessage() {
        const textarea = document.querySelector('.smart-textarea[data-preview="welcomePreview"]');
        return textarea ? textarea.value.trim() : '';
    }

    /**
     * Récupération des templates essentiels
     */
    getEssentialTemplates() {
        const templates = {};
        
        // Templates de base
        ['greeting', 'goodbye', 'thanks', 'unclear'].forEach(templateName => {
            const toggleBtn = document.querySelector(`.template-card[data-category="${templateName}"] .toggle-template`);
            const isActive = toggleBtn ? toggleBtn.classList.contains('active') : false;
            
            if (isActive) {
                const selectedStyle = this.getSelectedTemplateStyle(templateName);
                const customInput = document.querySelector(`.radio-option input[name="${templateName}-style"][value="custom"]`)
                    ?.closest('.radio-option').querySelector('.custom-input');
                
                templates[templateName] = {
                    active: true,
                    style: selectedStyle,
                    customMessage: customInput?.value || ''
                };
            } else {
                templates[templateName] = { active: false };
            }
        });
        
        return templates;
    }

    /**
     * Récupération des messages d'erreur
     */
    getErrorMessages() {
        const errorMessages = [];
        
        document.querySelectorAll('.error-card').forEach(card => {
            const title = card.querySelector('.error-info h4')?.textContent;
            const code = card.querySelector('.error-code')?.textContent;
            const content = card.querySelector('.error-content textarea')?.value;
            
            if (title && code && content) {
                errorMessages.push({
                    title: title.trim(),
                    code: code.trim(),
                    content: content.trim()
                });
            }
        });
        
        return errorMessages;
    }

    /**
     * Récupération de la configuration du comportement
     */
    getBehaviorConfig() {
        const config = {};
        
        document.querySelectorAll('.option-group input[type="checkbox"]').forEach(checkbox => {
            const optionName = checkbox.closest('.option-group').querySelector('strong')?.textContent;
            if (optionName) {
                const key = optionName.toLowerCase().replace(/\s+/g, '_');
                config[key] = checkbox.checked;
            }
        });
        
        return config;
    }

    /**
     * Envoi de la configuration au serveur
     */
    async sendConfigurationToServer(configuration) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

        const response = await fetch('/responses/api/configuration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(configuration)
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Réinitialisation de toute la configuration
     */
    async resetAllConfiguration() {
        const confirmed = await this.showConfirmDialog(
            'Êtes-vous sûr de vouloir réinitialiser toute la configuration ?',
            'Cette action supprimera toutes vos réponses personnalisées et remettra les paramètres par défaut.'
        );

        if (!confirmed) return;

        try {
            // Réinitialiser les données locales
            this.customResponses = [];
            this.vocabularyTerms = [];
            
            // Réinitialiser l'interface
            this.resetInterface();
            
            // Sauvegarder la configuration vide
            await this.saveAllConfiguration();
            
            this.showNotification('Configuration réinitialisée', 'info');
        } catch (error) {
            this.showNotification(`Erreur lors de la réinitialisation: ${error.message}`, 'error');
        }
    }

    /**
     * Réinitialisation de l'interface
     */
    resetInterface() {
        // Réinitialiser le message de bienvenue
        const welcomeTextarea = document.querySelector('.smart-textarea[data-preview="welcomePreview"]');
        if (welcomeTextarea) {
            welcomeTextarea.value = 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?';
            this.updatePreview('welcomePreview', welcomeTextarea.value);
        }

        // Réinitialiser les templates
        document.querySelectorAll('.toggle-template').forEach(btn => {
            btn.classList.add('active');
            btn.querySelector('i').className = 'fas fa-toggle-on';
        });

        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('disabled');
        });

        // Réinitialiser les radios aux valeurs par défaut
        document.querySelectorAll('.radio-option input[type="radio"]').forEach(radio => {
            if (radio.value === 'formal' || radio.value === 'polite' || radio.value === 'simple' || radio.value === 'helpful') {
                radio.checked = true;
            }
        });

        // Réinitialiser les listes
        this.renderCustomResponses();
        this.renderVocabularyList();

        // Réinitialiser les checkboxes de comportement
        document.querySelectorAll('.option-group input[type="checkbox"]').forEach((checkbox, index) => {
            checkbox.checked = index < 2; // Les deux premières activées par défaut
        });
    }

    /**
     * Exportation de la configuration
     */
    exportConfiguration() {
        const configuration = this.gatherAllConfiguration();
        const dataStr = JSON.stringify(configuration, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `responses-config-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showNotification('Configuration exportée', 'success');
    }

    /**
     * Configuration des exemples rapides
     */
    setupQuickExamples() {
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const exampleType = btn.dataset.example;
                this.loadExample(exampleType);
            });
        });
    }

    /**
     * Chargement d'un exemple pré-configuré
     */
    async loadExample(exampleType) {
        const examples = {
            professional: {
                welcomeMessage: 'Bonjour, bienvenue sur notre plateforme. Comment puis-je vous assister aujourd\'hui ?',
                essentialTemplates: {
                    greeting: { active: true, style: 'formal' },
                    goodbye: { active: true, style: 'polite' },
                    thanks: { active: true, style: 'professional' },
                    unclear: { active: true, style: 'helpful' }
                },
                customResponses: [
                    {
                        keywords: ['horaires', 'heures', 'ouverture'],
                        content: 'Nous sommes ouverts du lundi au vendredi de 9h à 18h. Nos équipes restent à votre disposition pendant ces horaires.'
                    },
                    {
                        keywords: ['contact', 'joindre', 'téléphone'],
                        content: 'Vous pouvez nous joindre au 01 23 45 67 89 ou par email à contact@entreprise.fr'
                    }
                ],
                vocabulary: [
                    { term: 'Devis', definition: 'Estimation détaillée de nos services' },
                    { term: 'Consultation', definition: 'Rendez-vous pour étudier votre projet' }
                ]
            },
            friendly: {
                welcomeMessage: 'Salut ! 😊 Super content de te voir ici ! Comment puis-je t\'aider ?',
                essentialTemplates: {
                    greeting: { active: true, style: 'friendly' },
                    goodbye: { active: true, style: 'casual' },
                    thanks: { active: true, style: 'warm' },
                    unclear: { active: true, style: 'guiding' }
                },
                customResponses: [
                    {
                        keywords: ['horaires', 'heures', 'quand'],
                        content: 'On est là tous les jours de 10h à 20h ! N\'hésite pas à passer nous voir 😉'
                    },
                    {
                        keywords: ['prix', 'tarif', 'coût'],
                        content: 'Les prix varient selon tes besoins. Je peux t\'en dire plus si tu veux ! 🎯'
                    }
                ],
                vocabulary: [
                    { term: 'RDV', definition: 'Rendez-vous pour discuter tranquillement' },
                    { term: 'Conseil', definition: 'On t\'aide à trouver ce qui te convient le mieux' }
                ]
            },
            support: {
                welcomeMessage: 'Bonjour ! Je suis votre assistant virtuel. Je suis là pour répondre à toutes vos questions. Comment puis-je vous aider ?',
                essentialTemplates: {
                    greeting: { active: true, style: 'helpful' },
                    goodbye: { active: true, style: 'supportive' },
                    thanks: { active: true, style: 'professional' },
                    unclear: { active: true, style: 'patient' }
                },
                customResponses: [
                    {
                        keywords: ['problème', 'bug', 'erreur', 'ne fonctionne pas'],
                        content: 'Je comprends votre problème. Pouvez-vous me donner plus de détails pour que je puisse vous aider efficacement ?'
                    },
                    {
                        keywords: ['mot de passe', 'connexion', 'login'],
                        content: 'Pour réinitialiser votre mot de passe, cliquez sur "Mot de passe oublié" sur la page de connexion. Vous recevrez un email avec les instructions.'
                    },
                    {
                        keywords: ['urgent', 'rapide', 'vite'],
                        content: 'Je comprends l\'urgence. Je fais mon maximum pour vous aider rapidement. Pouvez-vous me préciser votre demande ?'
                    }
                ],
                vocabulary: [
                    { term: 'Ticket', definition: 'Demande d\'assistance enregistrée dans notre système' },
                    { term: 'Délai', definition: 'Temps de réponse habituel: 24h en semaine' }
                ]
            }
        };

        const example = examples[exampleType];
        if (!example) return;

        const confirmed = await this.showConfirmDialog(
            `Charger l'exemple "${exampleType === 'professional' ? 'Professionnel' : exampleType === 'friendly' ? 'Amical' : 'Service Client'}" ?`,
            'Ceci va remplacer votre configuration actuelle. Assurez-vous de l\'avoir sauvegardée si nécessaire.'
        );

        if (!confirmed) return;

        // Appliquer l'exemple
        this.applyConfiguration(example);
        this.customResponses = example.customResponses || [];
        this.vocabularyTerms = example.vocabulary || [];

        // Rafraîchir l'affichage
        this.renderCustomResponses();
        this.renderVocabulary();

        this.markAsChanged();
        this.showNotification(`Exemple "${exampleType === 'professional' ? 'Professionnel' : exampleType === 'friendly' ? 'Amical' : 'Service Client'}" chargé !`, 'success');
    }

    /**
     * Chargement des données existantes
     */
    async loadExistingData() {
        try {
            const response = await fetch('/responses/api/configuration');
            if (response.ok) {
                const data = await response.json();
                this.applyConfiguration(data);
            }
        } catch (error) {
            this.showNotification('Erreur lors du chargement des données', 'error');
        }
    }

    /**
     * Application d'une configuration chargée
     */
    applyConfiguration(config) {
        if (!config) return;

        // Appliquer le message de bienvenue
        if (config.welcomeMessage) {
            const welcomeTextarea = document.querySelector('.smart-textarea[data-preview="welcomePreview"]');
            if (welcomeTextarea) {
                welcomeTextarea.value = config.welcomeMessage;
                this.updatePreview('welcomePreview', config.welcomeMessage);
            }
        }

        // Appliquer les templates essentiels
        if (config.essentialTemplates) {
            Object.entries(config.essentialTemplates).forEach(([templateName, templateConfig]) => {
                this.applyTemplateConfig(templateName, templateConfig);
            });
        }

        // Appliquer les réponses personnalisées
        if (config.customResponses) {
            this.customResponses = config.customResponses;
            this.renderCustomResponses();
        }

        // Appliquer le vocabulaire
        if (config.vocabulary) {
            this.vocabularyTerms = config.vocabulary;
            this.renderVocabularyList();
        }

        // Appliquer les messages d'erreur
        if (config.errorMessages) {
            this.applyErrorMessages(config.errorMessages);
        }

        // Appliquer la configuration du comportement
        if (config.behaviorConfig) {
            this.applyBehaviorConfig(config.behaviorConfig);
        }
    }

    /**
     * Application de la configuration d'un template
     */
    applyTemplateConfig(templateName, config) {
        const templateCard = document.querySelector(`.template-card[data-category="${templateName}"]`);
        if (!templateCard) return;

        const toggleBtn = templateCard.querySelector('.toggle-template');
        if (toggleBtn) {
            if (config.active) {
                toggleBtn.classList.add('active');
                toggleBtn.querySelector('i').className = 'fas fa-toggle-on';
                templateCard.classList.remove('disabled');
            } else {
                toggleBtn.classList.remove('active');
                toggleBtn.querySelector('i').className = 'fas fa-toggle-off';
                templateCard.classList.add('disabled');
            }
        }

        if (config.style) {
            const styleRadio = templateCard.querySelector(`input[name="${templateName}-style"][value="${config.style}"]`);
            if (styleRadio) {
                styleRadio.checked = true;
                this.handleTemplateStyleChange(styleRadio);
            }
        }

        if (config.customMessage) {
            const customInput = templateCard.querySelector('.custom-input');
            if (customInput) {
                customInput.value = config.customMessage;
            }
        }
    }

    /**
     * Application des messages d'erreur
     */
    applyErrorMessages(errorMessages) {
        errorMessages.forEach((errorMsg, index) => {
            const errorCard = document.querySelectorAll('.error-card')[index];
            if (errorCard) {
                const textarea = errorCard.querySelector('.error-content textarea');
                if (textarea) {
                    textarea.value = errorMsg.content;
                }
            }
        });
    }

    /**
     * Application de la configuration du comportement
     */
    applyBehaviorConfig(behaviorConfig) {
        Object.entries(behaviorConfig).forEach(([key, value]) => {
            const checkbox = document.querySelector(`.option-group input[type="checkbox"]`);
            // Logique plus sophistiquée nécessaire pour mapper les clés aux checkboxes
        });
    }

    /**
     * Initialisation des templates par défaut
     */
    initializeTemplates() {
        // Assurer que tous les templates sont activés par défaut
        document.querySelectorAll('.toggle-template').forEach(btn => {
            if (!btn.classList.contains('active')) {
                btn.classList.add('active');
                btn.querySelector('i').className = 'fas fa-toggle-on';
            }
        });
    }

    /**
     * Affichage d'une notification
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;

        document.body.appendChild(notification);

        // Animation d'entrée
        setTimeout(() => notification.classList.add('show'), 100);

        // Fermeture automatique
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);

        // Fermeture manuelle
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
    }

    /**
     * Affichage d'un dialog de confirmation
     */
    showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleElement = modal.querySelector('.modal-header h3');
            const messageElement = modal.querySelector('#confirmMessage');
            const cancelBtn = modal.querySelector('#confirmCancel');
            const okBtn = modal.querySelector('#confirmOk');
            const closeBtn = modal.querySelector('.modal-close');

            titleElement.textContent = title;
            messageElement.textContent = message;

            modal.classList.add('show');

            const cleanup = () => {
                modal.classList.remove('show');
                cancelBtn.removeEventListener('click', handleCancel);
                okBtn.removeEventListener('click', handleOk);
                closeBtn.removeEventListener('click', handleCancel);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const handleOk = () => {
                cleanup();
                resolve(true);
            };

            cancelBtn.addEventListener('click', handleCancel);
            okBtn.addEventListener('click', handleOk);
            closeBtn.addEventListener('click', handleCancel);
        });
    }

    /**
     * Nettoyage des ressources et event listeners
     * Appelé avant de quitter la page pour éviter les fuites mémoire
     */
    destroy() {
        // Arrêter l'auto-save
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }

        // Nettoyer les données
        this.templates.clear();
        this.customResponses = [];
        this.vocabularyTerms = [];
        this.errorMessages = [];

        // Note: Nettoyage complet des event listeners nécessiterait une refonte
        // de tous les addEventListener pour stocker les références.
        // Pour l'instant, les listeners seront nettoyés par le navigateur
        // lors du rechargement de la page.
    }
}

/**
 * Styles CSS pour les notifications (à ajouter au CSS si pas déjà présent)
 */
const notificationStyles = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-radius: 8px;
    padding: 16px 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 2000;
    max-width: 400px;
    border-left: 4px solid #2563eb;
}

.notification.show {
    transform: translateX(0);
}

.notification-success {
    border-left-color: #059669;
}

.notification-warning {
    border-left-color: #d97706;
}

.notification-error {
    border-left-color: #dc2626;
}

.notification-close {
    background: none;
    border: none;
    font-size: 18px;
    color: #64748b;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.notification-close:hover {
    color: #374151;
}

/* Styles pour les éléments de réponses personnalisées */
.custom-response-item {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    background: white;
}

.custom-response-item .response-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.response-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.keyword-tag {
    background: #e6f0ff;
    color: #2563eb;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.delete-response {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
}

.delete-response:hover {
    background: #fee2e2;
}

/* Styles pour les éléments de vocabulaire */
.vocab-item {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 8px;
    background: white;
}

.vocab-term {
    font-weight: 600;
    color: #1e293b;
}

.vocab-definition {
    color: #64748b;
    font-size: 14px;
    line-height: 1.4;
}

.delete-vocab {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
}

.delete-vocab:hover {
    background: #fee2e2;
}
`;

// Injection des styles
if (!document.getElementById('notification-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-styles';
    styleSheet.textContent = notificationStyles;
    document.head.appendChild(styleSheet);
}

// Initialisation automatique au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.responses-container')) {
        window.responsesWizard = new ResponsesWizard();
    }
});

// Nettoyage avant de quitter la page
window.addEventListener('beforeunload', (e) => {
    if (window.responsesWizard) {
        // Sauvegarder silencieusement si des changements sont en attente
        if (window.responsesWizard.unsavedChanges) {
            window.responsesWizard.saveAllConfiguration(true);
        }
        // Nettoyer les ressources
        window.responsesWizard.destroy();
    }
});

// Export pour utilisation externe si nécessaire
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResponsesWizard;
}