/**
 * Mes Widgets - Gestion des widgets d'intégration
 */

class WidgetsManager {
    constructor() {
        this.widgets = [];
        this.currentWidgetId = null;
        this.domains = [];
        this.pages = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadWidgets();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Bouton créer widget
        document.getElementById('create-widget-btn').addEventListener('click', () => {
            this.openCreateModal();
        });

        // Modal widget
        document.getElementById('close-widget-modal').addEventListener('click', () => {
            this.closeWidgetModal();
        });

        document.getElementById('cancel-widget-btn').addEventListener('click', () => {
            this.closeWidgetModal();
        });

        document.getElementById('save-widget-btn').addEventListener('click', () => {
            this.saveWidget();
        });

        // Gestion des domaines
        document.getElementById('add-domain-btn').addEventListener('click', () => {
            this.addDomain();
        });

        document.getElementById('domain-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addDomain();
            }
        });

        // Gestion des pages
        document.getElementById('add-page-btn').addEventListener('click', () => {
            this.addPage();
        });

        document.getElementById('page-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addPage();
            }
        });

        // Radio page scope
        document.querySelectorAll('input[name="page-scope"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const specificGroup = document.getElementById('specific-pages-group');
                if (e.target.value === 'specific' || e.target.value === 'pattern') {
                    specificGroup.style.display = 'block';
                } else {
                    specificGroup.style.display = 'none';
                }
            });
        });

        // Color picker
        const colorInput = document.getElementById('primary-color');
        const colorText = document.getElementById('primary-color-text');

        colorInput.addEventListener('input', (e) => {
            colorText.value = e.target.value;
        });

        // Modal code
        document.getElementById('close-code-modal').addEventListener('click', () => {
            this.closeCodeModal();
        });

        document.getElementById('close-code-btn').addEventListener('click', () => {
            this.closeCodeModal();
        });

        document.getElementById('copy-code-btn').addEventListener('click', () => {
            this.copyCode();
        });
    }

    async loadWidgets() {
        try {
            const response = await fetch('/api/widgets');
            if (!response.ok) throw new Error('Erreur lors du chargement des widgets');

            const data = await response.json();
            if (data.success) {
                this.widgets = data.widgets;
                this.renderWidgets();
                this.updateWidgetCount();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des widgets');
        }
    }

    renderWidgets() {
        const grid = document.getElementById('widgets-grid');

        if (this.widgets.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="layout"></i>
                    <h3>Aucun widget créé</h3>
                    <p>Créez votre premier widget pour commencer à intégrer votre chatbot sur vos sites</p>
                    <button class="btn btn-primary" onclick="document.getElementById('create-widget-btn').click()">
                        <i data-lucide="plus"></i>
                        Créer mon premier widget
                    </button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        grid.innerHTML = this.widgets.map(widget => {
            const domains = widget.allowed_domains || [];
            const statusClass = widget.is_active ? 'active' : 'inactive';
            const statusText = widget.is_active ? 'Actif' : 'Inactif';

            return `
                <div class="widget-card">
                    <div class="widget-card-header">
                        <div>
                            <h3 class="widget-name">${this.escapeHtml(widget.name)}</h3>
                            <span class="widget-key">${widget.widget_key.substring(0, 16)}...</span>
                        </div>
                        <div class="widget-status">
                            <span class="status-badge ${statusClass}">
                                <i data-lucide="${widget.is_active ? 'check-circle' : 'x-circle'}"></i>
                                ${statusText}
                            </span>
                        </div>
                    </div>

                    <div class="widget-info">
                        <div class="info-item">
                            <i data-lucide="globe"></i>
                            <div>
                                ${domains.slice(0, 2).map(d => `<span class="domain-tag">${this.escapeHtml(d)}</span>`).join('')}
                                ${domains.length > 2 ? `<span class="domain-tag">+${domains.length - 2}</span>` : ''}
                            </div>
                        </div>
                        <div class="info-item">
                            <i data-lucide="file-text"></i>
                            <span>${this.getPageScopeText(widget)}</span>
                        </div>
                        <div class="info-item">
                            <i data-lucide="palette"></i>
                            <span>Couleur: ${widget.primary_color}</span>
                        </div>
                        <div class="info-item">
                            <i data-lucide="map-pin"></i>
                            <span>${this.getPositionText(widget.position)}</span>
                        </div>
                    </div>

                    <div class="widget-actions">
                        <button class="btn btn-secondary btn-sm" onclick="widgetsManager.showCode(${widget.id})">
                            <i data-lucide="code"></i>
                            Code
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="widgetsManager.editWidget(${widget.id})">
                            <i data-lucide="edit"></i>
                            Modifier
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="widgetsManager.toggleActive(${widget.id}, ${widget.is_active})">
                            <i data-lucide="${widget.is_active ? 'eye-off' : 'eye'}"></i>
                            ${widget.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="widgetsManager.deleteWidget(${widget.id})">
                            <i data-lucide="trash-2"></i>
                            Supprimer
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    updateWidgetCount() {
        document.getElementById('widget-count').textContent = this.widgets.length;

        // Disable create button if max reached
        const createBtn = document.getElementById('create-widget-btn');
        if (this.widgets.length >= 5) {
            createBtn.disabled = true;
            createBtn.title = 'Limite de 5 widgets atteinte';
        } else {
            createBtn.disabled = false;
            createBtn.title = '';
        }
    }

    openCreateModal() {
        if (this.widgets.length >= 5) {
            alert('Vous avez atteint la limite de 5 widgets. Supprimez un widget existant pour en créer un nouveau.');
            return;
        }

        this.currentWidgetId = null;
        this.domains = [];
        this.pages = [];

        document.getElementById('modal-title').textContent = 'Créer un widget';
        document.getElementById('save-btn-text').textContent = 'Créer le widget';
        document.getElementById('widget-form').reset();
        document.getElementById('widget-id').value = '';
        document.getElementById('primary-color').value = '#0d6efd';
        document.getElementById('primary-color-text').value = '#0d6efd';

        this.renderDomainsList();
        this.renderPagesList();

        document.getElementById('specific-pages-group').style.display = 'none';

        document.getElementById('widget-modal').classList.add('show');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    editWidget(widgetId) {
        const widget = this.widgets.find(w => w.id === widgetId);
        if (!widget) return;

        this.currentWidgetId = widgetId;
        this.domains = widget.allowed_domains || [];
        this.pages = widget.allowed_pages || [];

        document.getElementById('modal-title').textContent = 'Modifier le widget';
        document.getElementById('save-btn-text').textContent = 'Sauvegarder';
        document.getElementById('widget-id').value = widgetId;
        document.getElementById('widget-name').value = widget.name;
        document.getElementById('primary-color').value = widget.primary_color;
        document.getElementById('primary-color-text').value = widget.primary_color;
        document.getElementById('position').value = widget.position;
        document.getElementById('welcome-message').value = widget.welcome_message || '';

        // Set page scope
        const pageScope = widget.page_scope || 'all';
        document.querySelector(`input[name="page-scope"][value="${pageScope}"]`).checked = true;

        if (pageScope === 'specific' || pageScope === 'pattern') {
            document.getElementById('specific-pages-group').style.display = 'block';
        }

        this.renderDomainsList();
        this.renderPagesList();

        document.getElementById('widget-modal').classList.add('show');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeWidgetModal() {
        document.getElementById('widget-modal').classList.remove('show');
    }

    addDomain() {
        const input = document.getElementById('domain-input');
        const domain = input.value.trim();

        if (!domain) {
            alert('Veuillez entrer un domaine');
            return;
        }

        if (this.domains.includes(domain)) {
            alert('Ce domaine est déjà dans la liste');
            return;
        }

        this.domains.push(domain);
        input.value = '';
        this.renderDomainsList();
    }

    removeDomain(domain) {
        this.domains = this.domains.filter(d => d !== domain);
        this.renderDomainsList();
    }

    renderDomainsList() {
        const list = document.getElementById('domains-list');
        list.innerHTML = this.domains.map(domain => `
            <span class="domain-tag-input">
                ${this.escapeHtml(domain)}
                <button type="button" class="remove-tag" onclick="widgetsManager.removeDomain('${this.escapeHtml(domain)}')">
                    <i data-lucide="x"></i>
                </button>
            </span>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    addPage() {
        const input = document.getElementById('page-input');
        const page = input.value.trim();

        if (!page) {
            alert('Veuillez entrer une page');
            return;
        }

        if (this.pages.includes(page)) {
            alert('Cette page est déjà dans la liste');
            return;
        }

        this.pages.push(page);
        input.value = '';
        this.renderPagesList();
    }

    removePage(page) {
        this.pages = this.pages.filter(p => p !== page);
        this.renderPagesList();
    }

    renderPagesList() {
        const list = document.getElementById('pages-list');
        list.innerHTML = this.pages.map(page => `
            <span class="page-tag-input">
                ${this.escapeHtml(page)}
                <button type="button" class="remove-tag" onclick="widgetsManager.removePage('${this.escapeHtml(page)}')">
                    <i data-lucide="x"></i>
                </button>
            </span>
        `).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    async saveWidget() {
        const name = document.getElementById('widget-name').value.trim();
        const primaryColor = document.getElementById('primary-color').value;
        const position = document.getElementById('position').value;
        const welcomeMessage = document.getElementById('welcome-message').value.trim();
        const pageScope = document.querySelector('input[name="page-scope"]:checked').value;

        if (!name) {
            alert('Veuillez entrer un nom pour le widget');
            return;
        }

        if (this.domains.length === 0) {
            alert('Veuillez ajouter au moins un domaine autorisé');
            return;
        }

        if ((pageScope === 'specific' || pageScope === 'pattern') && this.pages.length === 0) {
            alert('Veuillez ajouter au moins une page autorisée');
            return;
        }

        const data = {
            name,
            allowed_domains: this.domains,
            page_scope: pageScope,
            allowed_pages: this.pages,
            primary_color: primaryColor,
            position,
            welcome_message: welcomeMessage || null
        };

        try {
            let response;
            if (this.currentWidgetId) {
                // Update
                response = await fetch(`/api/widgets/${this.currentWidgetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else {
                // Create
                response = await fetch('/api/widgets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }

            if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

            const result = await response.json();
            if (result.success) {
                this.closeWidgetModal();
                this.loadWidgets();
            } else {
                alert(result.error || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la sauvegarde du widget');
        }
    }

    async toggleActive(widgetId, currentState) {
        try {
            const response = await fetch(`/api/widgets/${widgetId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !currentState })
            });

            if (!response.ok) throw new Error('Erreur lors de la mise à jour');

            const result = await response.json();
            if (result.success) {
                this.loadWidgets();
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la mise à jour du widget');
        }
    }

    async deleteWidget(widgetId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce widget ?')) {
            return;
        }

        try {
            const response = await fetch(`/api/widgets/${widgetId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Erreur lors de la suppression');

            const result = await response.json();
            if (result.success) {
                this.loadWidgets();
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la suppression du widget');
        }
    }

    async showCode(widgetId) {
        const widget = this.widgets.find(w => w.id === widgetId);
        if (!widget) return;

        const code = this.generateWidgetCode(widget);
        document.getElementById('widget-code').textContent = code;

        document.getElementById('code-modal').classList.add('show');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    generateWidgetCode(widget) {
        // Generate embed code
        const baseUrl = window.location.origin;
        return `<!-- LeoBot Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['LeoBotWidget']=o;w[o] = w[o] || function () { (w[o].q = w[o].q || []).push(arguments) };
    js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
    js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', 'leobot', '${baseUrl}/static/js/widget.js'));
  leobot('init', {
    widgetKey: '${widget.widget_key}',
    primaryColor: '${widget.primary_color}',
    position: '${widget.position}'
  });
</script>
<!-- Fin LeoBot Widget -->`;
    }

    closeCodeModal() {
        document.getElementById('code-modal').classList.remove('show');
    }

    copyCode() {
        const code = document.getElementById('widget-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copy-code-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check"></i> Copié!';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            setTimeout(() => {
                btn.innerHTML = originalText;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }, 2000);
        });
    }

    getPageScopeText(widget) {
        if (widget.page_scope === 'all') return 'Toutes les pages';
        if (widget.page_scope === 'specific') {
            const pages = widget.allowed_pages || [];
            return `${pages.length} page(s) spécifique(s)`;
        }
        if (widget.page_scope === 'pattern') return 'Pattern d\'URL';
        return 'Toutes les pages';
    }

    getPositionText(position) {
        const positions = {
            'bottom-right': 'Bas droite',
            'bottom-left': 'Bas gauche',
            'top-right': 'Haut droite',
            'top-left': 'Haut gauche'
        };
        return positions[position] || 'Bas droite';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        console.error('Erreur:', message);
    }
}

// Initialiser au chargement de la page
let widgetsManager;
document.addEventListener('DOMContentLoaded', () => {
    widgetsManager = new WidgetsManager();
});
