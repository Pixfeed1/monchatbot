/**
 * Métriques et Analyses - Gestion des données et visualisations
 */

class MetricsManager {
    constructor() {
        this.currentPeriod = 'today';
        this.conversationsChart = null;
        this.channelsChart = null;
        this.init();
    }

    init() {
        this.setupPeriodFilters();
        this.setupDatePicker();
        this.setupDragAndDrop();
        this.setupExport();
        this.restoreKpiOrder();
        this.loadMetrics();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupDragAndDrop() {
        const kpiGrid = document.getElementById('kpi-grid');
        const cards = kpiGrid.querySelectorAll('.kpi-card');

        let draggedElement = null;

        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                draggedElement = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', (e) => {
                card.classList.remove('dragging');
                this.saveKpiOrder();
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const afterElement = this.getDragAfterElement(kpiGrid, e.clientX, e.clientY);
                if (afterElement == null) {
                    kpiGrid.appendChild(draggedElement);
                } else {
                    kpiGrid.insertBefore(draggedElement, afterElement);
                }
            });
        });
    }

    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.kpi-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

            if (offset < closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.POSITIVE_INFINITY }).element;
    }

    saveKpiOrder() {
        const kpiGrid = document.getElementById('kpi-grid');
        const cards = kpiGrid.querySelectorAll('.kpi-card');
        const order = Array.from(cards).map(card => card.dataset.kpi);
        localStorage.setItem('kpi-order', JSON.stringify(order));
    }

    restoreKpiOrder() {
        const savedOrder = localStorage.getItem('kpi-order');
        if (!savedOrder) return;

        try {
            const order = JSON.parse(savedOrder);
            const kpiGrid = document.getElementById('kpi-grid');
            const cards = Array.from(kpiGrid.querySelectorAll('.kpi-card'));

            // Réorganiser les cartes selon l'ordre sauvegardé
            order.forEach(kpiType => {
                const card = cards.find(c => c.dataset.kpi === kpiType);
                if (card) {
                    kpiGrid.appendChild(card);
                }
            });
        } catch (e) {
            console.error('Erreur lors de la restauration de l\'ordre des KPIs:', e);
        }
    }

    setupPeriodFilters() {
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();

                const period = button.dataset.period;

                // Si c'est le bouton personnalisé, ouvrir le modal
                if (period === 'custom') {
                    this.openDatePicker();
                    return;
                }

                // Mettre à jour les boutons actifs
                periodButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Charger les données pour la période sélectionnée
                this.currentPeriod = period;
                this.customStartDate = null;
                this.customEndDate = null;
                this.loadMetrics();
            });
        });
    }

    setupDatePicker() {
        const modal = document.getElementById('date-picker-modal');
        const customBtn = document.getElementById('custom-period-btn');
        const closeBtn = document.getElementById('close-date-picker');
        const cancelBtn = document.getElementById('cancel-date-picker');
        const applyBtn = document.getElementById('apply-date-range');
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');

        // Set default dates (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        endDateInput.valueAsDate = today;
        startDateInput.valueAsDate = thirtyDaysAgo;

        // Close modal handlers
        [closeBtn, cancelBtn].forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('show');
            });
        });

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });

        // Apply date range
        applyBtn.addEventListener('click', () => {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;

            if (!startDate || !endDate) {
                alert('Veuillez sélectionner une date de début et de fin');
                return;
            }

            if (new Date(startDate) > new Date(endDate)) {
                alert('La date de début doit être antérieure à la date de fin');
                return;
            }

            // Update active button
            document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
            customBtn.classList.add('active');

            // Store custom dates
            this.customStartDate = startDate;
            this.customEndDate = endDate;
            this.currentPeriod = 'custom';

            // Load metrics with custom range
            this.loadMetrics();

            // Close modal
            modal.classList.remove('show');

            // Refresh icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }

    openDatePicker() {
        const modal = document.getElementById('date-picker-modal');
        modal.classList.add('show');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async loadMetrics() {
        try {
            // Charger toutes les métriques en parallèle
            const [kpiData, channelsData, aiData, knowledgeData, actionsData, topContentData] = await Promise.all([
                this.fetchKPIMetrics(),
                this.fetchChannelMetrics(),
                this.fetchAIMetrics(),
                this.fetchKnowledgeMetrics(),
                this.fetchActionsMetrics(),
                this.fetchTopContent()
            ]);

            // Mettre à jour l'interface
            this.updateKPIs(kpiData);
            this.updateCharts(kpiData, channelsData);
            this.updateChannelsTable(channelsData);
            this.updateAIUsage(aiData);
            this.updateKnowledgeStats(knowledgeData);
            this.updateActionsStats(actionsData);
            this.updateTopContent(topContentData);

        } catch (error) {
            console.error('Erreur lors du chargement des métriques:', error);
            this.showError('Erreur lors du chargement des données');
        }
    }

    async fetchKPIMetrics() {
        const response = await fetch(`/api/metrics/kpi?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération des KPIs');
        return await response.json();
    }

    async fetchChannelMetrics() {
        const response = await fetch(`/api/metrics/channels?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération des métriques de canaux');
        return await response.json();
    }

    async fetchAIMetrics() {
        const response = await fetch(`/api/metrics/ai?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération des métriques IA');
        return await response.json();
    }

    async fetchKnowledgeMetrics() {
        const response = await fetch(`/api/metrics/knowledge?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération des métriques de connaissance');
        return await response.json();
    }

    async fetchActionsMetrics() {
        const response = await fetch(`/api/metrics/actions?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération des métriques d\'actions');
        return await response.json();
    }

    async fetchTopContent() {
        const response = await fetch(`/api/metrics/top-content?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('Erreur lors de la récupération du top contenu');
        return await response.json();
    }

    updateKPIs(data) {
        // Conversations totales
        document.getElementById('total-conversations').textContent = this.formatNumber(data.total_conversations || 0);
        this.updateTrend('conversations-trend', data.conversations_trend || 0);

        // Messages échangés
        document.getElementById('total-messages').textContent = this.formatNumber(data.total_messages || 0);
        this.updateTrend('messages-trend', data.messages_trend || 0);

        // Utilisateurs actifs
        document.getElementById('active-users').textContent = this.formatNumber(data.active_users || 0);
        this.updateTrend('users-trend', data.users_trend || 0);

        // Taux de résolution
        document.getElementById('resolution-rate').textContent = `${data.resolution_rate || 0}%`;
        this.updateTrend('resolution-trend', data.resolution_trend || 0);

        // Temps de réponse moyen
        document.getElementById('avg-response-time').textContent = this.formatDuration(data.avg_response_time || 0);
        this.updateTrend('response-time-trend', data.response_time_trend || 0, true); // inverse pour le temps

        // Satisfaction client
        document.getElementById('satisfaction-score').textContent = `${data.satisfaction_score || 0}%`;
        this.updateTrend('satisfaction-trend', data.satisfaction_trend || 0);
    }

    updateTrend(elementId, value, inverse = false) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const isPositive = inverse ? value < 0 : value > 0;
        const isNegative = inverse ? value > 0 : value < 0;
        const isNeutral = value === 0;

        // Retirer toutes les classes
        element.classList.remove('positive', 'negative', 'neutral');

        // Ajouter la classe appropriée
        if (isPositive) {
            element.classList.add('positive');
        } else if (isNegative) {
            element.classList.add('negative');
        } else {
            element.classList.add('neutral');
        }

        // Mettre à jour le texte
        const sign = value > 0 ? '+' : '';
        element.textContent = `${sign}${value}%`;
    }

    updateCharts(kpiData, channelsData) {
        this.updateConversationsChart(kpiData.conversations_timeline || []);
        this.updateChannelsChart(channelsData.distribution || []);
    }

    updateConversationsChart(timelineData) {
        const ctx = document.getElementById('conversationsChart');
        if (!ctx) return;

        // Détruire le graphique existant
        if (this.conversationsChart) {
            this.conversationsChart.destroy();
        }

        // Préparer les données
        const labels = timelineData.map(item => item.date);
        const data = timelineData.map(item => item.count);

        this.conversationsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Conversations',
                    data: data,
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#0d6efd',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#0d6efd',
                        borderWidth: 1
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    updateChannelsChart(distributionData) {
        const ctx = document.getElementById('channelsChart');
        if (!ctx) return;

        // Détruire le graphique existant
        if (this.channelsChart) {
            this.channelsChart.destroy();
        }

        // Préparer les données
        const labels = distributionData.map(item => item.channel);
        const data = distributionData.map(item => item.count);
        const colors = [
            '#0d6efd', '#6366f1', '#3b82f6', '#10b981',
            '#f59e0b', '#8b5cf6', '#14b8a6', '#06b6d4',
            '#ef4444', '#ec4899', '#f97316', '#84cc16'
        ];

        this.channelsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff'
                    }
                }
            }
        });
    }

    updateChannelsTable(channelsData) {
        const tbody = document.getElementById('channels-metrics-tbody');
        if (!tbody) return;

        const channels = channelsData.channels || [];

        if (channels.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i data-lucide="inbox"></i>
                            <p>Aucune donnée disponible</p>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        tbody.innerHTML = channels.map(channel => {
            const successRate = channel.messages_sent > 0
                ? ((channel.messages_sent - channel.errors) / channel.messages_sent * 100).toFixed(1)
                : 0;

            const statusClass = channel.status === 'active' ? 'success' :
                              channel.status === 'error' ? 'error' : 'warning';
            const statusLabel = channel.status === 'active' ? 'Actif' :
                              channel.status === 'error' ? 'Erreur' : 'Inactif';

            return `
                <tr>
                    <td>
                        <div class="channel-name">
                            <strong>${channel.name}</strong>
                        </div>
                    </td>
                    <td>${this.formatNumber(channel.messages_sent || 0)}</td>
                    <td>${this.formatNumber(channel.messages_received || 0)}</td>
                    <td>${successRate}%</td>
                    <td>${this.formatNumber(channel.errors || 0)}</td>
                    <td>
                        <span class="channel-badge ${statusClass}">
                            ${statusLabel}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateAIUsage(data) {
        // Tokens utilisés
        document.getElementById('total-tokens').textContent = this.formatNumber(data.total_tokens || 0);
        document.getElementById('openai-tokens').textContent = this.formatNumber(data.openai_tokens || 0);
        document.getElementById('mistral-tokens').textContent = this.formatNumber(data.mistral_tokens || 0);

        // Coût estimé
        document.getElementById('total-cost').textContent = this.formatCurrency(data.total_cost || 0);
        document.getElementById('openai-cost').textContent = this.formatCurrency(data.openai_cost || 0);
        document.getElementById('mistral-cost').textContent = this.formatCurrency(data.mistral_cost || 0);

        // Requêtes
        document.getElementById('total-requests').textContent = this.formatNumber(data.total_requests || 0);
        document.getElementById('successful-requests').textContent = this.formatNumber(data.successful_requests || 0);
        document.getElementById('failed-requests').textContent = this.formatNumber(data.failed_requests || 0);

        // Temps de réponse IA
        document.getElementById('avg-ai-response-time').textContent = this.formatDuration(data.avg_response_time || 0);
        document.getElementById('min-response-time').textContent = this.formatDuration(data.min_response_time || 0);
        document.getElementById('max-response-time').textContent = this.formatDuration(data.max_response_time || 0);
    }

    updateKnowledgeStats(data) {
        document.getElementById('total-documents').textContent = this.formatNumber(data.total_documents || 0);
        document.getElementById('total-faqs').textContent = this.formatNumber(data.total_faqs || 0);
        document.getElementById('total-categories').textContent = this.formatNumber(data.total_categories || 0);
        document.getElementById('kb-usage-rate').textContent = `${data.usage_rate || 0}%`;
    }

    updateActionsStats(data) {
        document.getElementById('active-triggers').textContent = this.formatNumber(data.active_triggers || 0);
        document.getElementById('executed-actions').textContent = this.formatNumber(data.executed_actions || 0);
        document.getElementById('emails-sent').textContent = this.formatNumber(data.emails_sent || 0);
        document.getElementById('form-redirects').textContent = this.formatNumber(data.form_redirects || 0);
    }

    updateTopContent(data) {
        this.updateTopFAQs(data.top_faqs || []);
        this.updateTopDocuments(data.top_documents || []);
    }

    updateTopFAQs(faqs) {
        const container = document.getElementById('top-faqs-list');
        if (!container) return;

        if (faqs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="help-circle"></i>
                    <p>Aucune donnée disponible</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        container.innerHTML = faqs.slice(0, 5).map((faq, index) => `
            <div class="content-item">
                <div class="content-item-left">
                    <div class="content-rank">${index + 1}</div>
                    <div class="content-title">${faq.question}</div>
                </div>
                <div class="content-count">${this.formatNumber(faq.views || 0)}</div>
            </div>
        `).join('');
    }

    updateTopDocuments(documents) {
        const container = document.getElementById('top-docs-list');
        if (!container) return;

        if (documents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="file"></i>
                    <p>Aucune donnée disponible</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        container.innerHTML = documents.slice(0, 5).map((doc, index) => `
            <div class="content-item">
                <div class="content-item-left">
                    <div class="content-rank">${index + 1}</div>
                    <div class="content-title">${doc.title}</div>
                </div>
                <div class="content-count">${this.formatNumber(doc.views || 0)}</div>
            </div>
        `).join('');
    }

    formatNumber(num) {
        return new Intl.NumberFormat('fr-FR').format(num);
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2
        }).format(amount);
    }

    formatDuration(seconds) {
        if (seconds < 1) {
            return `${Math.round(seconds * 1000)}ms`;
        } else if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${minutes}m ${secs}s`;
        }
    }

    setupExport() {
        const exportBtn = document.getElementById('export-btn');
        const exportMenu = document.getElementById('export-menu');
        const exportOptions = document.querySelectorAll('.export-option');

        // Toggle menu
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            exportMenu.classList.remove('show');
        });

        // Handle export options
        exportOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = option.dataset.format;
                exportMenu.classList.remove('show');

                if (format === 'csv') {
                    this.exportCSV();
                } else if (format === 'pdf') {
                    this.exportPDF();
                }
            });
        });
    }

    exportCSV() {
        const period = this.getPeriodLabel();
        const now = new Date().toLocaleString('fr-FR').replace(/[/:]/g, '-');

        // Prepare CSV data
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";

        // Header
        csvContent += `Rapport Métriques LeoBot - ${period}\n`;
        csvContent += `Généré le: ${new Date().toLocaleString('fr-FR')}\n\n`;

        // KPIs
        csvContent += "INDICATEURS CLÉS\n";
        csvContent += "Métrique,Valeur,Tendance\n";
        csvContent += `Conversations totales,${document.getElementById('total-conversations').textContent},${document.getElementById('conversations-trend').textContent}\n`;
        csvContent += `Messages échangés,${document.getElementById('total-messages').textContent},${document.getElementById('messages-trend').textContent}\n`;
        csvContent += `Utilisateurs actifs,${document.getElementById('active-users').textContent},${document.getElementById('users-trend').textContent}\n`;
        csvContent += `Taux de résolution,${document.getElementById('resolution-rate').textContent},${document.getElementById('resolution-trend').textContent}\n`;
        csvContent += `Temps de réponse moyen,${document.getElementById('avg-response-time').textContent},${document.getElementById('response-time-trend').textContent}\n`;
        csvContent += `Satisfaction client,${document.getElementById('satisfaction-score').textContent},${document.getElementById('satisfaction-trend').textContent}\n`;

        // API Usage
        csvContent += "\nUTILISATION DE L'IA\n";
        csvContent += "Métrique,Valeur\n";
        csvContent += `Tokens utilisés,${document.getElementById('total-tokens').textContent}\n`;
        csvContent += `Coût estimé,${document.getElementById('total-cost').textContent}\n`;
        csvContent += `Requêtes totales,${document.getElementById('total-requests').textContent}\n`;
        csvContent += `Requêtes réussies,${document.getElementById('successful-requests').textContent}\n`;
        csvContent += `Requêtes échouées,${document.getElementById('failed-requests').textContent}\n`;

        // Knowledge Base
        csvContent += "\nBASE DE CONNAISSANCES\n";
        csvContent += "Métrique,Valeur\n";
        csvContent += `Documents,${document.getElementById('total-documents').textContent}\n`;
        csvContent += `FAQs,${document.getElementById('total-faqs').textContent}\n`;
        csvContent += `Catégories,${document.getElementById('total-categories').textContent}\n`;
        csvContent += `Taux d'utilisation,${document.getElementById('kb-usage-rate').textContent}\n`;

        // Actions
        csvContent += "\nACTIONS ET AUTOMATISATIONS\n";
        csvContent += "Métrique,Valeur\n";
        csvContent += `Déclencheurs actifs,${document.getElementById('active-triggers').textContent}\n`;
        csvContent += `Actions exécutées,${document.getElementById('executed-actions').textContent}\n`;
        csvContent += `Emails envoyés,${document.getElementById('emails-sent').textContent}\n`;
        csvContent += `Redirections formulaire,${document.getElementById('form-redirects').textContent}\n`;

        // Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `metriques_leobot_${now}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('Export CSV terminé');
    }

    async exportPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            const period = this.getPeriodLabel();
            const now = new Date().toLocaleString('fr-FR');

            // Header
            pdf.setFillColor(13, 110, 253);
            pdf.rect(0, 0, pageWidth, 40, 'F');

            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(24);
            pdf.setFont(undefined, 'bold');
            pdf.text('Rapport Métriques LeoBot', pageWidth / 2, 20, { align: 'center' });

            pdf.setFontSize(12);
            pdf.setFont(undefined, 'normal');
            pdf.text(`Période: ${period}`, pageWidth / 2, 28, { align: 'center' });
            pdf.text(`Généré le: ${now}`, pageWidth / 2, 35, { align: 'center' });

            let yPos = 50;

            // KPIs Section
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text('Indicateurs Clés', 15, yPos);
            yPos += 10;

            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');

            const kpis = [
                ['Conversations totales', document.getElementById('total-conversations').textContent, document.getElementById('conversations-trend').textContent],
                ['Messages échangés', document.getElementById('total-messages').textContent, document.getElementById('messages-trend').textContent],
                ['Utilisateurs actifs', document.getElementById('active-users').textContent, document.getElementById('users-trend').textContent],
                ['Taux de résolution', document.getElementById('resolution-rate').textContent, document.getElementById('resolution-trend').textContent],
                ['Temps de réponse moyen', document.getElementById('avg-response-time').textContent, document.getElementById('response-time-trend').textContent],
                ['Satisfaction client', document.getElementById('satisfaction-score').textContent, document.getElementById('satisfaction-trend').textContent]
            ];

            kpis.forEach(([label, value, trend]) => {
                pdf.text(`${label}: ${value} (${trend})`, 20, yPos);
                yPos += 7;
            });

            yPos += 5;

            // API Usage
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text("Utilisation de l'IA", 15, yPos);
            yPos += 10;

            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');

            const apiData = [
                ['Tokens utilisés', document.getElementById('total-tokens').textContent],
                ['Coût estimé', document.getElementById('total-cost').textContent],
                ['Requêtes totales', document.getElementById('total-requests').textContent],
                ['Temps de réponse IA', document.getElementById('avg-ai-response-time').textContent]
            ];

            apiData.forEach(([label, value]) => {
                pdf.text(`${label}: ${value}`, 20, yPos);
                yPos += 7;
            });

            yPos += 5;

            // Check if we need a new page
            if (yPos > pageHeight - 40) {
                pdf.addPage();
                yPos = 20;
            }

            // Knowledge Base
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text('Base de Connaissances', 15, yPos);
            yPos += 10;

            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');

            const kbData = [
                ['Documents', document.getElementById('total-documents').textContent],
                ['FAQs', document.getElementById('total-faqs').textContent],
                ['Catégories', document.getElementById('total-categories').textContent],
                ["Taux d'utilisation", document.getElementById('kb-usage-rate').textContent]
            ];

            kbData.forEach(([label, value]) => {
                pdf.text(`${label}: ${value}`, 20, yPos);
                yPos += 7;
            });

            yPos += 5;

            // Actions
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text('Actions et Automatisations', 15, yPos);
            yPos += 10;

            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');

            const actionsData = [
                ['Déclencheurs actifs', document.getElementById('active-triggers').textContent],
                ['Actions exécutées', document.getElementById('executed-actions').textContent],
                ['Emails envoyés', document.getElementById('emails-sent').textContent],
                ['Redirections formulaire', document.getElementById('form-redirects').textContent]
            ];

            actionsData.forEach(([label, value]) => {
                pdf.text(`${label}: ${value}`, 20, yPos);
                yPos += 7;
            });

            // Footer
            const footerY = pageHeight - 10;
            pdf.setFontSize(9);
            pdf.setTextColor(128, 128, 128);
            pdf.text('LeoBot @ 2025 - Propulsé par Pixfeed', pageWidth / 2, footerY, { align: 'center' });

            // Save PDF
            const filename = `metriques_leobot_${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(filename);

            console.log('Export PDF terminé');
        } catch (error) {
            console.error('Erreur lors de l\'export PDF:', error);
            alert('Erreur lors de l\'export PDF. Veuillez réessayer.');
        }
    }

    getPeriodLabel() {
        const labels = {
            'today': "Aujourd'hui",
            'week': '7 derniers jours',
            'month': '30 derniers jours',
            'year': '1 an',
            'all': 'Toute la période'
        };
        return labels[this.currentPeriod] || 'Période personnalisée';
    }

    showError(message) {
        console.error(message);
        // Optionnel: afficher une notification à l'utilisateur
    }
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    new MetricsManager();
});
