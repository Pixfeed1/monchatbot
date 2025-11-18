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
        this.loadMetrics();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupPeriodFilters() {
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();

                // Mettre à jour les boutons actifs
                periodButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Charger les données pour la période sélectionnée
                this.currentPeriod = button.dataset.period;
                this.loadMetrics();
            });
        });
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
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#667eea',
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
                        borderColor: '#667eea',
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
            '#667eea', '#f093fb', '#4facfe', '#43e97b',
            '#fa709a', '#30cfd0', '#ff6b6b', '#4ecdc4',
            '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'
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

    showError(message) {
        console.error(message);
        // Optionnel: afficher une notification à l'utilisateur
    }
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    new MetricsManager();
});
