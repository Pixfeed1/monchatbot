/**
 * Gestionnaire moderne de la Base de Connaissances
 * Interface cohérente avec reponses.js
 */

class KnowledgeBaseManager {
    constructor() {
        this.currentSection = 'documents';
        this.uploadQueue = [];
        this.vocabularyTerms = new Map();
        this.activeRules = new Map();
        this.isProcessing = false;
        this.autoSaveTimer = null;
        
        this.init();
    }

    /**
     * Initialisation du gestionnaire
     */
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupWizardNavigation();
        this.loadInitialData();
        this.setupAutoSave();
    }

    /**
     * Initialisation des éléments DOM
     */
    initializeElements() {
        // Navigation
        this.wizardNavigation = document.querySelector('.wizard-navigation');
        this.wizardSections = document.querySelectorAll('.wizard-section');
        
        // Upload
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.uploadProgress = document.getElementById('uploadProgress');
        
        // Documents
        this.documentsGrid = document.getElementById('documentsGrid');
        this.categoriesButtons = document.querySelectorAll('.category-btn');
        
        // Vocabulaire
        this.vocabularyForm = document.getElementById('vocabularyForm');
        this.vocabularyGrid = document.getElementById('vocabularyGrid');
        this.importOptions = document.querySelectorAll('.import-btn');
        
        // Règles
        this.ruleEditor = document.getElementById('ruleEditor');
        this.ruleTypeCards = document.querySelectorAll('.rule-type-card');
        this.rulesList = document.getElementById('rulesList');
        
        // Status
        this.processingStatus = document.getElementById('processingStatus');
        
        // Modales
        this.documentModal = document.getElementById('documentModal');
        this.confirmModal = document.getElementById('confirmModal');
    }

    /**
     * Configuration des écouteurs d'événements
     */
    setupEventListeners() {
        // Upload de fichiers
        this.setupFileUpload();
        
        // Catégorisation
        this.setupCategorization();
        
        // Vocabulaire
        this.setupVocabulary();
        
        // Règles
        this.setupRules();
        
        // Actions globales
        this.setupGlobalActions();
        
        // Modales
        this.setupModals();
    }

    /**
     * Configuration de la navigation wizard
     */
    setupWizardNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const section = button.dataset.section;
                this.switchSection(section);
            });
        });
    }

    /**
     * Changement de section
     */
    switchSection(sectionName) {
        // Mise à jour de la navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
        
        // Mise à jour des sections
        this.wizardSections.forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName).classList.add('active');
        
        // Mise à jour de l'indicateur de progression
        this.updateProgressIndicator(sectionName);
        
        this.currentSection = sectionName;
        
        // Chargement des données de la section
        this.loadSectionData(sectionName);
    }

    /**
     * Mise à jour de l'indicateur de progression
     */
    updateProgressIndicator(sectionName) {
        const steps = document.querySelectorAll('.progress-step');
        const sectionMap = {
            'documents': 1,
            'vocabulary': 2,
            'rules': 3
        };
        
        steps.forEach((step, index) => {
            step.classList.remove('active');
            if (index + 1 <= sectionMap[sectionName]) {
                step.classList.add('active');
            }
        });
    }

    /**
     * Configuration de l'upload de fichiers
     */
    setupFileUpload() {
        if (!this.uploadZone || !this.fileInput) return;

        // Drag & Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadZone.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadZone.addEventListener(eventName, () => {
                this.uploadZone.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadZone.addEventListener(eventName, () => {
                this.uploadZone.classList.remove('drag-over');
            }, false);
        });

        this.uploadZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFiles(files);
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Click pour ouvrir le sélecteur
        this.uploadZone.addEventListener('click', () => {
            this.fileInput.click();
        });
    }

    /**
     * Prévention des comportements par défaut
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Traitement des fichiers uploadés
     */
    async handleFiles(files) {
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter(file => this.isValidFile(file));
        
        if (validFiles.length === 0) {
            this.showToast('Aucun fichier valide sélectionné', 'warning');
            return;
        }

        // Affichage de la progression
        this.showUploadProgress();
        
        for (const file of validFiles) {
            await this.uploadFile(file);
        }
        
        this.hideUploadProgress();
        this.refreshDocumentsList();
    }

    /**
     * Validation du type de fichier
     */
    isValidFile(file) {
        const validTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        
        return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024; // 50MB max
    }

    /**
     * Upload d'un fichier
     */
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', this.getSelectedCategory());

        try {
            const response = await fetch('/api/knowledge/documents/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.showToast(`${file.name} uploadé avec succès`, 'success');
                this.updateProcessingStatus('processing');
            } else {
                throw new Error(result.message || 'Erreur lors de l\'upload');
            }
        } catch (error) {
            console.error('Erreur upload:', error);
            this.showToast(`Erreur lors de l'upload de ${file.name}`, 'error');
        }
    }

    /**
     * Affichage de la progression d'upload
     */
    showUploadProgress() {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'block';
            this.updateProgressBar(0);
        }
    }

    /**
     * Masquage de la progression d'upload
     */
    hideUploadProgress() {
        if (this.uploadProgress) {
            setTimeout(() => {
                this.uploadProgress.style.display = 'none';
            }, 1000);
        }
    }

    /**
     * Mise à jour de la barre de progression
     */
    updateProgressBar(percent) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }
        if (progressText) {
            progressText.textContent = `${Math.round(percent)}% terminé`;
        }
    }

    /**
     * Configuration de la catégorisation
     */
    setupCategorization() {
        // Boutons de catégorie rapide
        this.categoriesButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.selectCategory(button);
            });
        });

        // Nouvelle catégorie
        const customCategoryBtn = document.querySelector('[data-category="custom"]');
        if (customCategoryBtn) {
            customCategoryBtn.addEventListener('click', () => {
                this.showNewCategoryForm();
            });
        }

        // Sauvegarde de nouvelle catégorie
        const saveCategory = document.getElementById('saveCategory');
        const cancelCategory = document.getElementById('cancelCategory');
        
        if (saveCategory) {
            saveCategory.addEventListener('click', () => {
                this.saveNewCategory();
            });
        }
        
        if (cancelCategory) {
            cancelCategory.addEventListener('click', () => {
                this.hideNewCategoryForm();
            });
        }
    }

    /**
     * Sélection d'une catégorie
     */
    selectCategory(button) {
        // Retirer la sélection précédente
        this.categoriesButtons.forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Sélectionner la nouvelle catégorie
        button.classList.add('selected');
        
        // Masquer le formulaire de nouvelle catégorie
        this.hideNewCategoryForm();
    }

    /**
     * Obtention de la catégorie sélectionnée
     */
    getSelectedCategory() {
        const selected = document.querySelector('.category-btn.selected');
        return selected ? selected.dataset.category : 'general';
    }

    /**
     * Affichage du formulaire de nouvelle catégorie
     */
    showNewCategoryForm() {
        const form = document.getElementById('newCategoryForm');
        if (form) {
            form.style.display = 'block';
            document.getElementById('categoryName')?.focus();
        }
    }

    /**
     * Masquage du formulaire de nouvelle catégorie
     */
    hideNewCategoryForm() {
        const form = document.getElementById('newCategoryForm');
        if (form) {
            form.style.display = 'none';
            document.getElementById('categoryName').value = '';
            document.getElementById('categoryDescription').value = '';
        }
    }

    /**
     * Sauvegarde d'une nouvelle catégorie
     */
    async saveNewCategory() {
        const nameInput = document.getElementById('categoryName');
        const descInput = document.getElementById('categoryDescription');
        
        if (!nameInput || !nameInput.value.trim()) {
            this.showToast('Veuillez saisir un nom de catégorie', 'warning');
            return;
        }

        const categoryData = {
            name: nameInput.value.trim(),
            description: descInput ? descInput.value.trim() : ''
        };

        try {
            const response = await fetch('/api/knowledge/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                },
                body: JSON.stringify(categoryData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Catégorie créée avec succès', 'success');
                this.hideNewCategoryForm();
                // Rafraîchir la liste des catégories
                this.loadCategories();
            } else {
                throw new Error(result.message || 'Erreur lors de la création');
            }
        } catch (error) {
            console.error('Erreur création catégorie:', error);
            this.showToast('Erreur lors de la création de la catégorie', 'error');
        }
    }

    /**
     * Configuration du vocabulaire
     */
    setupVocabulary() {
        // Options d'import
        this.importOptions.forEach(option => {
            option.addEventListener('click', () => {
                const type = option.dataset.type;
                this.handleVocabularyImport(type);
            });
        });

        // Formulaire de vocabulaire
        const saveVocabTerm = document.getElementById('saveVocabTerm');
        const closeVocabForm = document.getElementById('closeVocabForm');
        const resetVocabForm = document.getElementById('resetVocabForm');

        if (saveVocabTerm) {
            saveVocabTerm.addEventListener('click', () => {
                this.saveVocabularyTerm();
            });
        }

        if (closeVocabForm) {
            closeVocabForm.addEventListener('click', () => {
                this.hideVocabularyForm();
            });
        }

        if (resetVocabForm) {
            resetVocabForm.addEventListener('click', () => {
                this.resetVocabularyForm();
            });
        }

        // Filtres
        const categoryFilter = document.getElementById('categoryFilter');
        const searchVocab = document.getElementById('searchVocab');

        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.filterVocabulary();
            });
        }

        if (searchVocab) {
            searchVocab.addEventListener('input', this.debounce(() => {
                this.filterVocabulary();
            }, 300));
        }
    }

    /**
     * Gestion de l'import de vocabulaire
     */
    handleVocabularyImport(type) {
        switch (type) {
            case 'manual':
                this.showVocabularyForm();
                break;
            case 'csv':
                this.importVocabularyCSV();
                break;
            case 'ai':
                this.extractVocabularyAI();
                break;
        }
    }

    /**
     * Affichage du formulaire de vocabulaire
     */
    showVocabularyForm() {
        if (this.vocabularyForm) {
            this.vocabularyForm.classList.add('active');
            document.getElementById('termName')?.focus();
        }
    }

    /**
     * Masquage du formulaire de vocabulaire
     */
    hideVocabularyForm() {
        if (this.vocabularyForm) {
            this.vocabularyForm.classList.remove('active');
            this.resetVocabularyForm();
        }
    }

    /**
     * Réinitialisation du formulaire de vocabulaire
     */
    resetVocabularyForm() {
        const form = this.vocabularyForm;
        if (form) {
            form.querySelectorAll('input, textarea, select').forEach(field => {
                field.value = '';
            });
        }
    }

    /**
     * Sauvegarde d'un terme de vocabulaire
     */
    async saveVocabularyTerm() {
        const termName = document.getElementById('termName')?.value.trim();
        const termDefinition = document.getElementById('termDefinition')?.value.trim();
        const termSynonyms = document.getElementById('termSynonyms')?.value.trim();
        const termCategory = document.getElementById('termCategory')?.value;

        if (!termName || !termDefinition) {
            this.showToast('Veuillez remplir au moins le terme et sa définition', 'warning');
            return;
        }

        const termData = {
            name: termName,
            definition: termDefinition,
            synonyms: termSynonyms ? termSynonyms.split(',').map(s => s.trim()) : [],
            category: termCategory || 'general'
        };

        try {
            const response = await fetch('/api/knowledge/vocabulary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                },
                body: JSON.stringify(termData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Terme ajouté avec succès', 'success');
                this.hideVocabularyForm();
                this.refreshVocabularyList();
            } else {
                throw new Error(result.message || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur sauvegarde terme:', error);
            this.showToast('Erreur lors de la sauvegarde du terme', 'error');
        }
    }

    /**
     * Import de vocabulaire depuis CSV
     */
    async importVocabularyCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('csv_file', file);

                try {
                    const response = await fetch('/api/knowledge/vocabulary/import-csv', {
                        method: 'POST',
                        headers: {
                            'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                        },
                        body: formData
                    });

                    const result = await response.json();
                    
                    if (result.success) {
                        this.showToast(`${result.imported_count} termes importés`, 'success');
                        this.refreshVocabularyList();
                    } else {
                        throw new Error(result.message || 'Erreur lors de l\'import');
                    }
                } catch (error) {
                    console.error('Erreur import CSV:', error);
                    this.showToast('Erreur lors de l\'import CSV', 'error');
                }
            }
        };
        
        input.click();
    }

    /**
     * Extraction automatique de vocabulaire par IA
     */
    async extractVocabularyAI() {
        try {
            this.showToast('Extraction du vocabulaire en cours...', 'info');
            
            const response = await fetch('/api/knowledge/vocabulary/extract-ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast(`${result.extracted_count} termes extraits`, 'success');
                this.loadSuggestions(result.suggestions);
            } else {
                throw new Error(result.message || 'Erreur lors de l\'extraction');
            }
        } catch (error) {
            console.error('Erreur extraction IA:', error);
            this.showToast('Erreur lors de l\'extraction automatique', 'error');
        }
    }

    /**
     * Configuration des règles
     */
    setupRules() {
        // Types de règles
        this.ruleTypeCards.forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                this.showRuleEditor(type);
            });
        });

        // Éditeur de règles
        const closeRuleEditor = document.getElementById('closeRuleEditor');
        const saveRule = document.getElementById('saveRule');
        const testRule = document.getElementById('testRule');

        if (closeRuleEditor) {
            closeRuleEditor.addEventListener('click', () => {
                this.hideRuleEditor();
            });
        }

        if (saveRule) {
            saveRule.addEventListener('click', () => {
                this.saveRule();
            });
        }

        if (testRule) {
            testRule.addEventListener('click', () => {
                this.testRule();
            });
        }

        // Conditions et actions dynamiques
        this.setupDynamicRuleBuilder();
    }

    /**
     * Configuration du constructeur de règles dynamique
     */
    setupDynamicRuleBuilder() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-condition')) {
                this.addCondition();
            }
            if (e.target.classList.contains('remove-condition')) {
                this.removeCondition(e.target);
            }
        });
    }

    /**
     * Affichage de l'éditeur de règles
     */
    showRuleEditor(type) {
        if (this.ruleEditor) {
            this.ruleEditor.style.display = 'block';
            this.ruleEditor.dataset.ruleType = type;
            
            // Initialiser l'éditeur selon le type
            this.initializeRuleEditor(type);
        }
    }

    /**
     * Masquage de l'éditeur de règles
     */
    hideRuleEditor() {
        if (this.ruleEditor) {
            this.ruleEditor.style.display = 'none';
            this.resetRuleEditor();
        }
    }

    /**
     * Configuration des actions globales
     */
    setupGlobalActions() {
        const exportKnowledge = document.getElementById('exportKnowledge');
        const importKnowledge = document.getElementById('importKnowledge');
        const optimizeKnowledge = document.getElementById('optimizeKnowledge');
        const saveAllKnowledge = document.getElementById('saveAllKnowledge');

        if (exportKnowledge) {
            exportKnowledge.addEventListener('click', () => {
                this.exportKnowledgeBase();
            });
        }

        if (importKnowledge) {
            importKnowledge.addEventListener('click', () => {
                this.importKnowledgeBase();
            });
        }

        if (optimizeKnowledge) {
            optimizeKnowledge.addEventListener('click', () => {
                this.optimizeKnowledgeBase();
            });
        }

        if (saveAllKnowledge) {
            saveAllKnowledge.addEventListener('click', () => {
                this.saveAllKnowledge();
            });
        }

        // Actions des documents
        const refreshDocs = document.getElementById('refreshDocs');
        const exportDocs = document.getElementById('exportDocs');

        if (refreshDocs) {
            refreshDocs.addEventListener('click', () => {
                this.refreshDocumentsList();
            });
        }

        if (exportDocs) {
            exportDocs.addEventListener('click', () => {
                this.exportDocuments();
            });
        }
    }

    /**
     * Configuration des modales
     */
    setupModals() {
        // Fermeture des modales
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || 
                e.target.classList.contains('modal')) {
                this.closeModals();
            }
        });

        // Échap pour fermer les modales
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModals();
            }
        });
    }

    /**
     * Chargement des données initiales
     */
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadCategories(),
                this.loadDocuments(),
                this.loadVocabulary(),
                this.loadRules()
            ]);
        } catch (error) {
            console.error('Erreur chargement données initiales:', error);
        }
    }

    /**
     * Chargement des données d'une section
     */
    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'documents':
                await this.loadDocuments();
                break;
            case 'vocabulary':
                await this.loadVocabulary();
                break;
            case 'rules':
                await this.loadRules();
                break;
        }
    }

    /**
     * Chargement des documents
     */
    async loadDocuments() {
        try {
            const response = await fetch('/api/knowledge/documents');
            const data = await response.json();
            
            if (data.success) {
                this.renderDocuments(data.documents);
            }
        } catch (error) {
            console.error('Erreur chargement documents:', error);
        }
    }

    /**
     * Affichage des documents
     */
    renderDocuments(documents) {
        if (!this.documentsGrid) return;

        if (documents.length === 0) {
            this.documentsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-plus"></i>
                    <p>Aucun document importé</p>
                    <small>Commencez par importer vos premiers fichiers ci-dessus</small>
                </div>
            `;
            return;
        }

        this.documentsGrid.innerHTML = documents.map(doc => this.createDocumentCard(doc)).join('');
    }

    /**
     * Création d'une carte de document
     */
    createDocumentCard(document) {
        const statusBadge = this.getStatusBadge(document.status);
        const icon = this.getDocumentIcon(document.type);
        
        return `
            <div class="document-card" data-id="${document.id}">
                <div class="document-header">
                    <div class="document-icon">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="document-info">
                        <h4 class="document-name">${this.escapeHtml(document.name)}</h4>
                        <div class="document-meta">
                            <span>${this.formatFileSize(document.size)}</span>
                            <span>${this.formatDate(document.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="document-content">
                    <div class="document-status">
                        ${statusBadge}
                    </div>
                    <div class="document-summary">
                        ${this.escapeHtml(document.summary || 'Résumé non disponible')}
                    </div>
                    <div class="document-actions">
                        <span class="document-category">${this.escapeHtml(document.category)}</span>
                        <div class="document-buttons">
                            <button class="btn-icon" onclick="knowledgeManager.viewDocument(${document.id})" data-tooltip="Voir">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon" onclick="knowledgeManager.editDocument(${document.id})" data-tooltip="Modifier">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="knowledgeManager.deleteDocument(${document.id})" data-tooltip="Supprimer">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Chargement du vocabulaire
     */
    async loadVocabulary() {
        try {
            const response = await fetch('/api/knowledge/vocabulary');
            const data = await response.json();
            
            if (data.success) {
                this.renderVocabulary(data.terms);
            }
        } catch (error) {
            console.error('Erreur chargement vocabulaire:', error);
        }
    }

    /**
     * Configuration de la sauvegarde automatique
     */
    setupAutoSave() {
        // Sauvegarder automatiquement toutes les 30 secondes
        this.autoSaveTimer = setInterval(() => {
            this.autoSave();
        }, 30000);
    }

    /**
     * Sauvegarde automatique
     */
    async autoSave() {
        if (!this.hasUnsavedChanges()) return;

        try {
            await this.saveAllKnowledge();
            this.updateProcessingStatus('saved');
        } catch (error) {
            console.error('Erreur sauvegarde automatique:', error);
        }
    }

    /**
     * Vérification des modifications non sauvegardées
     */
    hasUnsavedChanges() {
        // Logique pour détecter les changements
        return false; // Placeholder
    }

    /**
     * Mise à jour du statut de traitement
     */
    updateProcessingStatus(status) {
        if (!this.processingStatus) return;

        const indicator = this.processingStatus.querySelector('.status-indicator');
        const icon = indicator.querySelector('i');
        const text = indicator.querySelector('span');

        // Supprimer les classes précédentes
        this.processingStatus.classList.remove('processing', 'error', 'saved');

        switch (status) {
            case 'processing':
                this.processingStatus.classList.add('processing');
                icon.className = 'fas fa-spinner fa-spin';
                text.textContent = 'Traitement en cours...';
                break;
            case 'error':
                this.processingStatus.classList.add('error');
                icon.className = 'fas fa-exclamation-circle';
                text.textContent = 'Erreur de traitement';
                break;
            case 'saved':
                icon.className = 'fas fa-check-circle';
                text.textContent = 'Tous les documents sont traités';
                break;
        }
    }

    /**
     * Affichage d'un toast de notification
     */
    showToast(message, type = 'info') {
        const toastContainer = this.getOrCreateToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;

        toastContainer.appendChild(toast);

        // Animation d'entrée
        setTimeout(() => toast.classList.add('show'), 10);

        // Suppression automatique
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);

        // Suppression manuelle
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }

    /**
     * Création ou récupération du conteneur de toasts
     */
    getOrCreateToastContainer() {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Obtention de l'icône selon le type de toast
     */
    getToastIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Affichage du vocabulaire
     */
    renderVocabulary(terms) {
        if (!this.vocabularyGrid) return;

        if (terms.length === 0) {
            this.vocabularyGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>Aucun terme défini</p>
                    <small>Commencez par ajouter vos premiers termes métier</small>
                </div>
            `;
            return;
        }

        this.vocabularyGrid.innerHTML = terms.map(term => this.createVocabularyCard(term)).join('');
    }

    /**
     * Création d'une carte de vocabulaire
     */
    createVocabularyCard(term) {
        const synonyms = Array.isArray(term.synonyms) ? term.synonyms : [];
        
        return `
            <div class="vocabulary-card" data-id="${term.id}">
                <div class="vocab-header">
                    <h4 class="vocab-term">${this.escapeHtml(term.name)}</h4>
                    <span class="vocab-category ${term.category}">${this.escapeHtml(term.category)}</span>
                </div>
                <div class="vocab-definition">
                    ${this.escapeHtml(term.definition)}
                </div>
                <div class="vocab-synonyms">
                    ${synonyms.map(synonym => 
                        `<span class="synonym-tag">${this.escapeHtml(synonym)}</span>`
                    ).join('')}
                </div>
                <div class="vocab-actions">
                    <button class="btn-icon" onclick="knowledgeManager.editVocabularyTerm(${term.id})" data-tooltip="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="knowledgeManager.deleteVocabularyTerm(${term.id})" data-tooltip="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Chargement des règles
     */
    async loadRules() {
        try {
            const response = await fetch('/api/knowledge/rules');
            const data = await response.json();
            
            if (data.success) {
                this.renderRules(data.rules);
                this.updateRulesStats(data.rules);
            }
        } catch (error) {
            console.error('Erreur chargement règles:', error);
        }
    }

    /**
     * Affichage des règles
     */
    renderRules(rules) {
        if (!this.rulesList) return;

        if (rules.length === 0) {
            this.rulesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cogs"></i>
                    <p>Aucune règle configurée</p>
                    <small>Créez vos premières règles avancées ci-dessus</small>
                </div>
            `;
            return;
        }

        this.rulesList.innerHTML = rules.map(rule => this.createRuleItem(rule)).join('');
    }

    /**
     * Création d'un élément de règle
     */
    createRuleItem(rule) {
        return `
            <div class="rule-item" data-id="${rule.id}">
                <div class="rule-header">
                    <h4 class="rule-name">${this.escapeHtml(rule.name)}</h4>
                    <div class="rule-toggle">
                        <label>
                            <input type="checkbox" ${rule.active ? 'checked' : ''} 
                                   onchange="knowledgeManager.toggleRule(${rule.id})">
                            <span>Actif</span>
                        </label>
                    </div>
                </div>
                <div class="rule-summary">
                    ${this.escapeHtml(rule.description || 'Aucune description')}
                </div>
                <div class="rule-meta">
                    <span>Type: ${this.escapeHtml(rule.type)}</span>
                    <span>Modifié: ${this.formatDate(rule.updated_at)}</span>
                    <div class="rule-actions">
                        <button class="btn-icon" onclick="knowledgeManager.editRule(${rule.id})" data-tooltip="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="knowledgeManager.deleteRule(${rule.id})" data-tooltip="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Mise à jour des statistiques des règles
     */
    updateRulesStats(rules) {
        const totalRules = document.getElementById('totalRules');
        const activeRules = document.getElementById('activeRules');
        
        if (totalRules) {
            totalRules.textContent = rules.length;
        }
        if (activeRules) {
            activeRules.textContent = rules.filter(rule => rule.active).length;
        }
    }

    /**
     * Filtrage du vocabulaire
     */
    filterVocabulary() {
        const categoryFilter = document.getElementById('categoryFilter')?.value;
        const searchTerm = document.getElementById('searchVocab')?.value.toLowerCase();
        
        const cards = document.querySelectorAll('.vocabulary-card');
        
        cards.forEach(card => {
            const term = card.querySelector('.vocab-term').textContent.toLowerCase();
            const definition = card.querySelector('.vocab-definition').textContent.toLowerCase();
            const category = card.querySelector('.vocab-category').textContent;
            
            const matchesCategory = !categoryFilter || category === categoryFilter;
            const matchesSearch = !searchTerm || 
                term.includes(searchTerm) || 
                definition.includes(searchTerm);
            
            card.style.display = matchesCategory && matchesSearch ? 'block' : 'none';
        });
    }

    /**
     * Actualisation de la liste des documents
     */
    async refreshDocumentsList() {
        this.updateProcessingStatus('processing');
        await this.loadDocuments();
        this.updateProcessingStatus('saved');
        this.showToast('Liste des documents actualisée', 'success');
    }

    /**
     * Actualisation de la liste du vocabulaire
     */
    async refreshVocabularyList() {
        await this.loadVocabulary();
        this.showToast('Liste du vocabulaire actualisée', 'success');
    }

    /**
     * Chargement des catégories
     */
    async loadCategories() {
        try {
            const response = await fetch('/api/knowledge/categories');
            const data = await response.json();
            
            if (data.success) {
                this.updateCategoriesUI(data.categories);
            }
        } catch (error) {
            console.error('Erreur chargement catégories:', error);
        }
    }

    /**
     * Chargement des suggestions automatiques
     */
    loadSuggestions(suggestions) {
        const suggestionsList = document.getElementById('suggestionsList');
        if (!suggestionsList || !suggestions) return;

        if (suggestions.length === 0) {
            suggestionsList.innerHTML = '<p>Aucune suggestion disponible</p>';
            return;
        }

        suggestionsList.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion-item" onclick="knowledgeManager.applySuggestion('${suggestion.term}', '${suggestion.definition}')">
                <div class="suggestion-term">${this.escapeHtml(suggestion.term)}</div>
                <div class="suggestion-context">${this.escapeHtml(suggestion.context)}</div>
            </div>
        `).join('');
    }

    /**
     * Application d'une suggestion
     */
    applySuggestion(term, definition) {
        document.getElementById('termName').value = term;
        document.getElementById('termDefinition').value = definition;
        this.showVocabularyForm();
    }

    /**
     * Ajout d'une condition dans le constructeur de règles
     */
    addCondition() {
        const conditionBuilder = document.querySelector('.condition-builder');
        if (!conditionBuilder) return;

        const conditionItem = document.createElement('div');
        conditionItem.className = 'condition-item';
        conditionItem.innerHTML = `
            <select class="condition-type">
                <option value="contains">Contient le mot</option>
                <option value="starts_with">Commence par</option>
                <option value="ends_with">Se termine par</option>
                <option value="exact_match">Correspondance exacte</option>
            </select>
            <input type="text" class="condition-value" placeholder="Valeur...">
            <button class="remove-condition">
                <i class="fas fa-trash"></i>
            </button>
        `;

        const addButton = conditionBuilder.querySelector('.add-condition');
        conditionBuilder.insertBefore(conditionItem, addButton);
    }

    /**
     * Suppression d'une condition
     */
    removeCondition(button) {
        const conditionItem = button.closest('.condition-item');
        if (conditionItem) {
            conditionItem.remove();
        }
    }

    /**
     * Initialisation de l'éditeur de règles
     */
    initializeRuleEditor(type) {
        const header = this.ruleEditor.querySelector('.editor-header h3');
        if (header) {
            header.textContent = `Nouvelle règle ${type}`;
        }
        
        // Réinitialiser le contenu
        this.resetRuleEditor();
        
        // Ajouter une condition par défaut
        this.addCondition();
    }

    /**
     * Réinitialisation de l'éditeur de règles
     */
    resetRuleEditor() {
        // Supprimer toutes les conditions existantes
        const conditionItems = this.ruleEditor.querySelectorAll('.condition-item');
        conditionItems.forEach(item => item.remove());
        
        // Réinitialiser les actions
        const actionContent = this.ruleEditor.querySelector('.action-content');
        if (actionContent) {
            actionContent.value = '';
        }
    }

    /**
     * Sauvegarde d'une règle
     */
    async saveRule() {
        const ruleType = this.ruleEditor.dataset.ruleType;
        const conditions = this.collectConditions();
        const actions = this.collectActions();

        if (conditions.length === 0) {
            this.showToast('Veuillez ajouter au moins une condition', 'warning');
            return;
        }

        if (actions.length === 0) {
            this.showToast('Veuillez définir au moins une action', 'warning');
            return;
        }

        const ruleData = {
            type: ruleType,
            conditions: conditions,
            actions: actions,
            active: true
        };

        try {
            const response = await fetch('/api/knowledge/rules', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                },
                body: JSON.stringify(ruleData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Règle sauvegardée avec succès', 'success');
                this.hideRuleEditor();
                this.loadRules();
            } else {
                throw new Error(result.message || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur sauvegarde règle:', error);
            this.showToast('Erreur lors de la sauvegarde de la règle', 'error');
        }
    }

    /**
     * Collecte des conditions de l'éditeur
     */
    collectConditions() {
        const conditionItems = this.ruleEditor.querySelectorAll('.condition-item');
        const conditions = [];

        conditionItems.forEach(item => {
            const type = item.querySelector('.condition-type').value;
            const value = item.querySelector('.condition-value').value.trim();
            
            if (value) {
                conditions.push({ type, value });
            }
        });

        return conditions;
    }

    /**
     * Collecte des actions de l'éditeur
     */
    collectActions() {
        const actionType = this.ruleEditor.querySelector('.action-type')?.value;
        const actionContent = this.ruleEditor.querySelector('.action-content')?.value.trim();
        
        if (actionType && actionContent) {
            return [{ type: actionType, content: actionContent }];
        }
        
        return [];
    }

    /**
     * Test d'une règle
     */
    async testRule() {
        const conditions = this.collectConditions();
        const actions = this.collectActions();

        if (conditions.length === 0) {
            this.showToast('Aucune condition à tester', 'warning');
            return;
        }

        const testQuery = prompt('Entrez un message de test:');
        if (!testQuery) return;

        try {
            const response = await fetch('/api/knowledge/rules/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                },
                body: JSON.stringify({
                    conditions: conditions,
                    actions: actions,
                    query: testQuery
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const matched = result.matched ? 'correspond' : 'ne correspond pas';
                this.showToast(`Le message "${testQuery}" ${matched} aux conditions`, 
                             result.matched ? 'success' : 'info');
            } else {
                throw new Error(result.message || 'Erreur lors du test');
            }
        } catch (error) {
            console.error('Erreur test règle:', error);
            this.showToast('Erreur lors du test de la règle', 'error');
        }
    }

    /**
     * Actions sur les documents
     */
    async viewDocument(id) {
        try {
            const response = await fetch(`/api/knowledge/documents/${id}`);
            const data = await response.json();
            
            if (data.success) {
                this.showDocumentModal(data.document);
            }
        } catch (error) {
            console.error('Erreur visualisation document:', error);
            this.showToast('Erreur lors de l\'ouverture du document', 'error');
        }
    }

    async editDocument(id) {
        // Implémentation de l'édition de document
        this.showToast('Fonctionnalité en cours de développement', 'info');
    }

    async deleteDocument(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/knowledge/documents/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Document supprimé avec succès', 'success');
                this.refreshDocumentsList();
            } else {
                throw new Error(result.message || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur suppression document:', error);
            this.showToast('Erreur lors de la suppression du document', 'error');
        }
    }

    /**
     * Actions sur le vocabulaire
     */
    async editVocabularyTerm(id) {
        try {
            const response = await fetch(`/api/knowledge/vocabulary/${id}`);
            const data = await response.json();
            
            if (data.success) {
                this.populateVocabularyForm(data.term);
                this.showVocabularyForm();
            }
        } catch (error) {
            console.error('Erreur édition terme:', error);
            this.showToast('Erreur lors de l\'édition du terme', 'error');
        }
    }

    async deleteVocabularyTerm(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce terme ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/knowledge/vocabulary/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Terme supprimé avec succès', 'success');
                this.refreshVocabularyList();
            } else {
                throw new Error(result.message || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur suppression terme:', error);
            this.showToast('Erreur lors de la suppression du terme', 'error');
        }
    }

    /**
     * Actions sur les règles
     */
    async toggleRule(id) {
        try {
            const response = await fetch(`/api/knowledge/rules/${id}/toggle`, {
                method: 'PATCH',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Règle mise à jour', 'success');
                this.loadRules();
            } else {
                throw new Error(result.message || 'Erreur lors de la mise à jour');
            }
        } catch (error) {
            console.error('Erreur toggle règle:', error);
            this.showToast('Erreur lors de la mise à jour de la règle', 'error');
        }
    }

    async editRule(id) {
        // Implémentation de l'édition de règle
        this.showToast('Fonctionnalité en cours de développement', 'info');
    }

    async deleteRule(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/knowledge/rules/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Règle supprimée avec succès', 'success');
                this.loadRules();
            } else {
                throw new Error(result.message || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur suppression règle:', error);
            this.showToast('Erreur lors de la suppression de la règle', 'error');
        }
    }

    /**
     * Actions globales
     */
    async exportKnowledgeBase() {
        try {
            const response = await fetch('/api/knowledge/export');
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `knowledge-base-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showToast('Base de connaissances exportée', 'success');
        } catch (error) {
            console.error('Erreur export:', error);
            this.showToast('Erreur lors de l\'export', 'error');
        }
    }

    async importKnowledgeBase() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('knowledge_file', file);

            try {
                const response = await fetch('/api/knowledge/import', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                    },
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    this.showToast('Base de connaissances importée', 'success');
                    this.loadInitialData();
                } else {
                    throw new Error(result.message || 'Erreur lors de l\'import');
                }
            } catch (error) {
                console.error('Erreur import:', error);
                this.showToast('Erreur lors de l\'import', 'error');
            }
        };
        
        input.click();
    }

    async optimizeKnowledgeBase() {
        if (!confirm('Cette opération peut prendre du temps. Continuer ?')) {
            return;
        }

        try {
            this.showToast('Optimisation en cours...', 'info');
            
            const response = await fetch('/api/knowledge/optimize', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Base de connaissances optimisée', 'success');
                this.loadInitialData();
            } else {
                throw new Error(result.message || 'Erreur lors de l\'optimisation');
            }
        } catch (error) {
            console.error('Erreur optimisation:', error);
            this.showToast('Erreur lors de l\'optimisation', 'error');
        }
    }

    async saveAllKnowledge() {
        try {
            const response = await fetch('/api/knowledge/save-all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Toutes les modifications sauvegardées', 'success');
                this.updateProcessingStatus('saved');
            } else {
                throw new Error(result.message || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur sauvegarde globale:', error);
            this.showToast('Erreur lors de la sauvegarde', 'error');
        }
    }

    async exportDocuments() {
        try {
            const response = await fetch('/api/knowledge/documents/export');
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `documents-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showToast('Documents exportés', 'success');
        } catch (error) {
            console.error('Erreur export documents:', error);
            this.showToast('Erreur lors de l\'export des documents', 'error');
        }
    }

    /**
     * Utilitaires
     */
    populateVocabularyForm(term) {
        document.getElementById('termName').value = term.name || '';
        document.getElementById('termDefinition').value = term.definition || '';
        document.getElementById('termSynonyms').value = Array.isArray(term.synonyms) ? 
            term.synonyms.join(', ') : '';
        document.getElementById('termCategory').value = term.category || 'general';
    }

    showDocumentModal(document) {
        const modal = this.documentModal;
        const details = document.getElementById('documentDetails');
        
        if (modal && details) {
            details.innerHTML = `
                <h4>${this.escapeHtml(document.name)}</h4>
                <p><strong>Taille:</strong> ${this.formatFileSize(document.size)}</p>
                <p><strong>Type:</strong> ${this.escapeHtml(document.type)}</p>
                <p><strong>Catégorie:</strong> ${this.escapeHtml(document.category)}</p>
                <p><strong>Résumé:</strong></p>
                <div class="document-summary">${this.escapeHtml(document.summary || 'Aucun résumé disponible')}</div>
            `;
            
            modal.classList.add('show');
        }
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    }

    updateCategoriesUI(categories) {
        // Mise à jour de l'interface avec les nouvelles catégories
        // Implementation spécifique selon les besoins
    }

    getStatusBadge(status) {
        const badges = {
            'processed': '<span class="status-badge processed">Traité</span>',
            'processing': '<span class="status-badge processing">En cours</span>',
            'error': '<span class="status-badge error">Erreur</span>'
        };
        return badges[status] || badges['processing'];
    }

    getDocumentIcon(type) {
        const icons = {
            'pdf': 'file-pdf',
            'doc': 'file-word',
            'docx': 'file-word',
            'xls': 'file-excel',
            'xlsx': 'file-excel',
            'txt': 'file-alt'
        };
        return icons[type] || 'file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Nettoyage lors de la destruction
     */
    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        // Nettoyer les écouteurs d'événements si nécessaire
        document.removeEventListener('click', this.globalClickHandler);
        document.removeEventListener('keydown', this.globalKeyHandler);
    }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    window.knowledgeManager = new KnowledgeBaseManager();
});

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
   module.exports = KnowledgeBaseManager;
}

// Gestion des erreurs globales
window.addEventListener('error', (event) => {
   console.error('Erreur JavaScript:', event.error);
   if (window.knowledgeManager) {
       window.knowledgeManager.showToast('Une erreur inattendue s\'est produite', 'error');
   }
});

// Gestion des erreurs de requêtes
window.addEventListener('unhandledrejection', (event) => {
   console.error('Promise rejetée:', event.reason);
   if (window.knowledgeManager) {
       window.knowledgeManager.showToast('Erreur de communication avec le serveur', 'error');
   }
   event.preventDefault();
});

// Sauvegarde avant fermeture de la page
window.addEventListener('beforeunload', (event) => {
   if (window.knowledgeManager && window.knowledgeManager.hasUnsavedChanges()) {
       event.preventDefault();
       event.returnValue = 'Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir quitter ?';
       return event.returnValue;
   }
});

// Raccourcis clavier
document.addEventListener('keydown', (event) => {
   if (!window.knowledgeManager) return;
   
   // Ctrl+S pour sauvegarder
   if (event.ctrlKey && event.key === 's') {
       event.preventDefault();
       window.knowledgeManager.saveAllKnowledge();
   }
   
   // Ctrl+E pour exporter
   if (event.ctrlKey && event.key === 'e') {
       event.preventDefault();
       window.knowledgeManager.exportKnowledgeBase();
   }
   
   // Ctrl+I pour importer
   if (event.ctrlKey && event.key === 'i') {
       event.preventDefault();
       window.knowledgeManager.importKnowledgeBase();
   }
   
   // Échap pour fermer les modales et formulaires
   if (event.key === 'Escape') {
       window.knowledgeManager.closeModals();
       if (window.knowledgeManager.vocabularyForm) {
           window.knowledgeManager.hideVocabularyForm();
       }
       if (window.knowledgeManager.ruleEditor) {
           window.knowledgeManager.hideRuleEditor();
       }
   }
});

// Service Worker pour le cache (optionnel)
if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
       navigator.serviceWorker.register('/static/js/knowledge-sw.js')
           .then(registration => {
               console.log('Service Worker enregistré:', registration.scope);
           })
           .catch(error => {
               console.log('Échec de l\'enregistrement du Service Worker:', error);
           });
   });
}

// Configuration de l'observateur de performance
if ('PerformanceObserver' in window) {
   const observer = new PerformanceObserver((list) => {
       list.getEntries().forEach((entry) => {
           if (entry.entryType === 'navigation') {
               console.log(`Temps de chargement de la page: ${entry.loadEventEnd - entry.loadEventStart}ms`);
           }
       });
   });
   
   observer.observe({ entryTypes: ['navigation'] });
}

// Fonction d'assistance pour le debugging
window.debugKnowledge = function() {
   if (!window.knowledgeManager) {
       console.log('KnowledgeBaseManager non initialisé');
       return;
   }
   
   console.log('État du gestionnaire de base de connaissances:');
   console.log('- Section actuelle:', window.knowledgeManager.currentSection);
   console.log('- Termes de vocabulaire:', window.knowledgeManager.vocabularyTerms.size);
   console.log('- Règles actives:', window.knowledgeManager.activeRules.size);
   console.log('- En cours de traitement:', window.knowledgeManager.isProcessing);
   console.log('- File d\'upload:', window.knowledgeManager.uploadQueue.length);
};

// Fonction d'assistance pour les tests
window.testKnowledge = function() {
   if (!window.knowledgeManager) {
       console.error('KnowledgeBaseManager non disponible');
       return;
   }
   
   // Tests basiques
   console.log('=== Tests de la Base de Connaissances ===');
   
   // Test de notification
   window.knowledgeManager.showToast('Test de notification', 'info');
   
   // Test de changement de section
   setTimeout(() => {
       window.knowledgeManager.switchSection('vocabulary');
       console.log('✓ Changement de section vers vocabulaire');
   }, 1000);
   
   setTimeout(() => {
       window.knowledgeManager.switchSection('rules');
       console.log('✓ Changement de section vers règles');
   }, 2000);
   
   setTimeout(() => {
       window.knowledgeManager.switchSection('documents');
       console.log('✓ Retour à la section documents');
   }, 3000);
   
   console.log('Tests terminés. Vérifiez les changements dans l\'interface.');
};

// Métriques et analytics (optionnel)
class KnowledgeAnalytics {
   constructor() {
       this.startTime = Date.now();
       this.interactions = [];
       this.errors = [];
   }
   
   trackInteraction(action, details = {}) {
       this.interactions.push({
           timestamp: Date.now(),
           action: action,
           details: details
       });
       
       // Limitation du nombre d'interactions stockées
       if (this.interactions.length > 1000) {
           this.interactions = this.interactions.slice(-500);
       }
   }
   
   trackError(error, context = '') {
       this.errors.push({
           timestamp: Date.now(),
           error: error.message || error,
           context: context,
           stack: error.stack || ''
       });
       
       // Limitation du nombre d'erreurs stockées
       if (this.errors.length > 100) {
           this.errors = this.errors.slice(-50);
       }
   }
   
   getSessionStats() {
       const sessionDuration = Date.now() - this.startTime;
       const uniqueActions = [...new Set(this.interactions.map(i => i.action))];
       
       return {
           sessionDuration: sessionDuration,
           totalInteractions: this.interactions.length,
           uniqueActions: uniqueActions.length,
           errorCount: this.errors.length,
           actionsBreakdown: this.getActionsBreakdown()
       };
   }
   
   getActionsBreakdown() {
       const breakdown = {};
       this.interactions.forEach(interaction => {
           breakdown[interaction.action] = (breakdown[interaction.action] || 0) + 1;
       });
       return breakdown;
   }
   
   exportData() {
       return {
           startTime: this.startTime,
           endTime: Date.now(),
           interactions: this.interactions,
           errors: this.errors,
           stats: this.getSessionStats()
       };
   }
}

// Initialisation des analytics
window.knowledgeAnalytics = new KnowledgeAnalytics();

// Tracking automatique des interactions principales
document.addEventListener('click', (event) => {
   const target = event.target.closest('button, .nav-btn, .category-btn, .import-btn');
   if (target && window.knowledgeAnalytics) {
       const action = target.textContent?.trim() || target.className || 'click';
       window.knowledgeAnalytics.trackInteraction('click', {
           element: action,
           section: window.knowledgeManager?.currentSection || 'unknown'
       });
   }
});

// Fonction pour exporter les analytics
window.exportAnalytics = function() {
   if (!window.knowledgeAnalytics) {
       console.log('Analytics non disponibles');
       return;
   }
   
   const data = window.knowledgeAnalytics.exportData();
   const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   
   const a = document.createElement('a');
   a.href = url;
   a.download = `knowledge-analytics-${new Date().toISOString().split('T')[0]}.json`;
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);
   URL.revokeObjectURL(url);
   
   console.log('Analytics exportées:', data.stats);
};

// Message de bienvenue dans la console
console.log(`
🧠 Base de Connaissances - Version 2.0
=====================================
Commandes disponibles:
- debugKnowledge() : Affiche l'état du gestionnaire
- testKnowledge() : Lance les tests de fonctionnement
- exportAnalytics() : Exporte les données d'utilisation

Raccourcis clavier:
- Ctrl+S : Sauvegarder
- Ctrl+E : Exporter
- Ctrl+I : Importer
- Échap : Fermer les modales

Pour plus d'informations, consultez la documentation.
`);