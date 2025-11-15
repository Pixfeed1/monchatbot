document.addEventListener('DOMContentLoaded', function() {
    // Classe pour gérer les compétences du bot
    class CompetencesManager {
        constructor() {
            this.initializeElements();
            this.setupEventListeners();
            this.updateFormState();
        }

        initializeElements() {
            // Sections principales
            this.serviceClientSection = document.getElementById('serviceClientConfig');
            this.leadGenSection = document.getElementById('leadGenConfig');
            this.supportTechSection = document.getElementById('supportTechConfig');

            // Switches principaux
            this.serviceClientSwitch = document.querySelector('input[name="service_client_active"]');
            this.leadGenSwitch = document.querySelector('input[name="lead_gen_active"]');
            this.supportTechSwitch = document.querySelector('input[name="support_tech_active"]');

            // Formulaire principal
            this.form = document.querySelector('.competences-form');
        }

        setupEventListeners() {
            // Gestion des switches
            if (this.serviceClientSwitch) {
                this.serviceClientSwitch.addEventListener('change', () => {
                    this.toggleSection(this.serviceClientSection, this.serviceClientSwitch.checked);
                });
            }

            if (this.leadGenSwitch) {
                this.leadGenSwitch.addEventListener('change', () => {
                    this.toggleSection(this.leadGenSection, this.leadGenSwitch.checked);
                });
            }

            if (this.supportTechSwitch) {
                this.supportTechSwitch.addEventListener('change', () => {
                    this.toggleSection(this.supportTechSection, this.supportTechSwitch.checked);
                });
            }

            // Validation du formulaire
            if (this.form) {
                this.form.addEventListener('submit', (e) => this.handleSubmit(e));
            }

            // Gestion des changements de niveau
            const niveauSelects = document.querySelectorAll('select[name$="_niveau"]');
            niveauSelects.forEach(select => {
                select.addEventListener('change', (e) => this.handleNiveauChange(e));
            });
        }

        toggleSection(section, isEnabled) {
            if (section) {
                const inputs = section.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    input.disabled = !isEnabled;
                });

                section.style.opacity = isEnabled ? '1' : '0.5';
                section.style.pointerEvents = isEnabled ? 'all' : 'none';
            }
        }

        handleNiveauChange(event) {
            const niveau = event.target.value;
            const section = event.target.closest('.card-content');
            
            // Ajuster les options disponibles selon le niveau
            if (section) {
                const checkboxes = section.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    // Logique spécifique selon le niveau
                    if (niveau === 'basic') {
                        if (checkbox.value.includes('advanced') || checkbox.value.includes('expert')) {
                            checkbox.checked = false;
                            checkbox.disabled = true;
                        }
                    } else {
                        checkbox.disabled = false;
                    }
                });
            }
        }

        updateFormState() {
            // Mettre à jour l'état initial des sections
            this.toggleSection(this.serviceClientSection, this.serviceClientSwitch?.checked);
            this.toggleSection(this.leadGenSection, this.leadGenSwitch?.checked);
            this.toggleSection(this.supportTechSection, this.supportTechSwitch?.checked);
        }

        handleSubmit(event) {
            event.preventDefault();
            
            // Vérifier qu'au moins une compétence est activée
            const hasActiveCompetence = [
                this.serviceClientSwitch,
                this.leadGenSwitch,
                this.supportTechSwitch
            ].some(switch => switch?.checked);

            if (!hasActiveCompetence) {
                alert('Veuillez activer au moins une compétence pour le bot.');
                return;
            }

            // Validation des champs requis pour chaque section active
            let isValid = true;
            
            if (this.serviceClientSwitch?.checked) {
                isValid = this.validateServiceClient();
            }
            
            if (isValid && this.leadGenSwitch?.checked) {
                isValid = this.validateLeadGen();
            }
            
            if (isValid && this.supportTechSwitch?.checked) {
                isValid = this.validateSupportTech();
            }

            if (isValid) {
                this.form.submit();
            }
        }

        validateServiceClient() {
            const domains = document.querySelectorAll('input[name="service_client_domains[]"]:checked');
            if (domains.length === 0) {
                alert('Veuillez sélectionner au moins un domaine pour le service client.');
                return false;
            }
            return true;
        }

        validateLeadGen() {
            const qualifications = document.querySelectorAll('input[name="lead_qualification[]"]:checked');
            if (qualifications.length === 0) {
                alert('Veuillez sélectionner au moins un critère de qualification des leads.');
                return false;
            }
            return true;
        }

        validateSupportTech() {
            const niveau = document.querySelector('select[name="support_tech_niveau"]').value;
            if (!niveau) {
                alert('Veuillez sélectionner un niveau de support technique.');
                return false;
            }
            return true;
        }
    }

    // Initialiser le gestionnaire de compétences
    const competencesManager = new CompetencesManager();

    // Gestionnaire de sauvegarde automatique (optionnel)
    let saveTimeout;
    const autosave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const formData = new FormData(document.querySelector('.competences-form'));
            fetch('/api/bot/competences/autosave', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Sauvegarde automatique réussie');
                }
            })
            .catch(error => console.error('Erreur de sauvegarde:', error));
        }, 2000);
    };

    // Activer la sauvegarde automatique sur les changements de formulaire
    document.querySelector('.competences-form').addEventListener('change', autosave);
});