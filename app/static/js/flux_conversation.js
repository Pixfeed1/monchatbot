/**
 * FluxBuilder - Version FINALE avec VRAIS fixes
 * - PAS de notifications visuelles
 * - Clic SIMPLE sur connexions
 * - Pan avec molette qui MARCHE
 * - Connexions sur les VRAIS ports bleus
 * - Nœud entre deux qui FONCTIONNE
 */

class FlowBuilder {
    constructor() {
        this.currentFlow = null;
        this.selectedNode = null;
        this.selectedConnection = null;
        this.isDrawingConnection = false;
        this.draggedNode = null;
        this.tempConnectionEl = null;
        this.csrfToken = this.getCsrfToken();
        this.autoSaveTimer = null;
        this.currentSelectorCloseHandler = null;
        this.scale = 1;

        this.initializeElements();
        this.setupEventListeners();
        this.loadFlows();
    }

    /**
     * Récupère le token CSRF depuis le meta tag
     */
    getCsrfToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    }

    /**
     * Initialise les références aux éléments du DOM
     */
    initializeElements() {
        // Éléments principaux
        this.flowCanvas = document.querySelector('.flow-canvas');
        this.connectionsContainer = document.getElementById('flowConnections');
        this.nodesContainer = document.getElementById('flowNodes');
        this.nodePalette = document.querySelector('.node-palette');
        this.propertiesPanel = document.querySelector('.node-properties');
        this.propertiesContent = this.propertiesPanel?.querySelector('.properties-content');

        // Toolbar et actions
        this.newFlowBtn = document.getElementById('newFlowBtn');
        this.saveFlowBtn = document.getElementById('saveFlowBtn');
        this.testFlowBtn = document.getElementById('testFlowBtn');
        this.importFlowBtn = document.getElementById('importFlowBtn');
        this.exportFlowBtn = document.getElementById('exportFlowBtn');
        this.flowNameInput = document.querySelector('.flow-name');

        // Liste des flux
        this.flowsList = document.getElementById('flowsGrid');
        this.flowSearch = document.querySelector('.flow-search');

        // Modal de test
        this.testModal = document.getElementById('testModal');
        this.testConversation = this.testModal?.querySelector('.test-conversation');
        this.testInput = this.testModal?.querySelector('#testInput');
        this.testSendBtn = this.testModal?.querySelector('#testSendBtn');
        this.closeTestModalBtn = this.testModal?.querySelector('#closeTestModal');
        this.resetTestBtn = this.testModal?.querySelector('#resetTest');
        this.closeTestBtn = this.testModal?.querySelector('#closeTest');
    }

    /**
     * Configure tous les event listeners
     */
    setupEventListeners() {
        // Drag & Drop depuis la palette
        this.nodePalette.querySelectorAll('.node-item').forEach(item => {
            item.addEventListener('dragstart', (e) => this.handlePaletteDragStart(e));
            item.addEventListener('dragend', (e) => this.handlePaletteDragEnd(e));
        });

        // Canvas events
        this.flowCanvas.addEventListener('dragover', (e) => this.handleCanvasDragOver(e));
        this.flowCanvas.addEventListener('drop', (e) => this.handleCanvasDrop(e));
        this.flowCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Toolbar buttons
        this.newFlowBtn?.addEventListener('click', () => this.createNewFlow());
        this.saveFlowBtn?.addEventListener('click', () => this.saveFlow());
        this.testFlowBtn?.addEventListener('click', () => this.openTestModal());
        this.exportFlowBtn?.addEventListener('click', () => this.exportFlow());
        this.importFlowBtn?.addEventListener('click', () => this.importFlow());

        // Flow name
        this.flowNameInput?.addEventListener('change', () => this.markAsChanged());

        // Search
        if (this.flowSearch) {
            this.flowSearch.addEventListener('input', (e) => this.searchFlows(e.target.value));
        }

        // Test modal
        if (this.testSendBtn) {
            this.testSendBtn.addEventListener('click', () => this.sendTestMessage());
        }
        if (this.testInput) {
            this.testInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendTestMessage();
            });
        }
        if (this.closeTestModalBtn) {
            this.closeTestModalBtn.addEventListener('click', () => this.closeTestModal());
        }
        if (this.resetTestBtn) {
            this.resetTestBtn.addEventListener('click', () => this.resetTest());
        }
        if (this.closeTestBtn) {
            this.closeTestBtn.addEventListener('click', () => this.closeTestModal());
        }

        // Fermeture du modal en cliquant à l'extérieur
        if (this.testModal) {
            this.testModal.addEventListener('click', (e) => {
                if (e.target === this.testModal) {
                    this.closeTestModal();
                }
            });
        }

        // Bouton plein écran
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Pan avec molette ET zoom
        this.setupCanvasPan();

        // Cleanup à la fermeture de la page
        window.addEventListener('beforeunload', () => this.destroy());
    }

    /**
     * Toggle plein écran
     */
    toggleFullscreen() {
        const editor = document.getElementById('flowEditor');
        const fullscreenBtn = document.getElementById('fullscreenBtn');

        if (editor) {
            editor.classList.toggle('fullscreen');

            // Changer l'icône
            const icon = fullscreenBtn.querySelector('i');
            if (editor.classList.contains('fullscreen')) {
                icon.setAttribute('data-lucide', 'minimize-2');
            } else {
                icon.setAttribute('data-lucide', 'maximize-2');
            }

            // Rafraîchir les icônes
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    /**
     * PAN QUI MARCHE VRAIMENT avec molette + zoom
     */
    setupCanvasPan() {
        let isPanning = false;
        let startX, startY;
        const minScale = 0.3;
        const maxScale = 2;

        // Pan avec MOLETTE (button 1) ou CLIC GAUCHE + SHIFT
        this.flowCanvas.addEventListener('mousedown', (e) => {
            // Molette (button 1) OU clic gauche + shift
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                e.preventDefault();
                isPanning = true;
                this.flowCanvas.style.cursor = 'grabbing';
                
                startX = e.pageX - this.flowCanvas.scrollLeft;
                startY = e.pageY - this.flowCanvas.scrollTop;
            }
        });

        // Mouvement de la souris
        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            e.preventDefault();
            
            this.flowCanvas.scrollLeft = startX - e.pageX;
            this.flowCanvas.scrollTop = startY - e.pageY;
            
            // Mettre à jour les connexions pendant le pan
            this.updateAllConnections();
        });

        // Relâchement de la souris
        document.addEventListener('mouseup', () => {
            if (isPanning) {
                isPanning = false;
                this.flowCanvas.style.cursor = 'grab';
            }
        });
        
        // Désactiver le menu contextuel sur molette
        this.flowCanvas.addEventListener('auxclick', (e) => {
            if (e.button === 1) e.preventDefault();
        });

        // Empêcher le menu contextuel
        this.flowCanvas.addEventListener('contextmenu', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });

        // ZOOM avec Ctrl + Molette
        this.flowCanvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();

                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const newScale = Math.max(minScale, Math.min(maxScale, this.scale + delta));

                if (newScale !== this.scale) {
                    this.scale = newScale;
                    // Appliquer le zoom aux DEUX conteneurs
                    this.nodesContainer.style.transform = `scale(${this.scale})`;
                    this.nodesContainer.style.transformOrigin = '0 0';
                    this.connectionsContainer.style.transform = `scale(${this.scale})`;
                    this.connectionsContainer.style.transformOrigin = '0 0';

                    // Mettre à jour toutes les connexions après zoom
                    this.updateAllConnections();
                }
            }
        }, { passive: false });

        // Méthode pour obtenir le scale actuel
        this.currentScale = () => this.scale;
    }

    /**
     * Charge tous les flux disponibles
     */
    async loadFlows() {
        try {
            const response = await fetch('/flow/', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) {
                throw new Error('Erreur lors du chargement des flux');
            }

            const data = await response.json();
            this.renderFlowsList(data.flows);

            // Charger le premier flux ou créer un nouveau
            if (data.flows.length > 0) {
                await this.loadFlow(data.flows[0].id);
            }
        } catch (error) {
            console.error('Erreur loadFlows:', error);
        }
    }

    /**
     * Affiche la liste des flux dans la sidebar
     */
    renderFlowsList(flows) {
        if (!this.flowsList) return;

        this.flowsList.innerHTML = '';

        if (flows.length === 0) {
            this.flowsList.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="git-branch"></i>
                    <p>Aucun flux créé</p>
                    <small>Commencez par créer votre premier flux de conversation</small>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            return;
        }

        flows.forEach(flow => {
            const flowCard = document.createElement('div');
            flowCard.className = 'flow-card';
            flowCard.dataset.flowId = flow.id;

            const isActive = flow.is_active || false;

            flowCard.innerHTML = `
                <div class="flow-card-header">
                    <h3 class="flow-card-title">${flow.name}</h3>
                    <span class="flow-card-status ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? 'Actif' : 'Inactif'}
                    </span>
                </div>
                <div class="flow-card-description">
                    ${flow.description || 'Aucune description'}
                </div>
                <div class="flow-card-meta">
                    <span>${flow.nodes_count || 0} nœuds</span>
                    <span>${new Date(flow.updated_at).toLocaleDateString()}</span>
                </div>
            `;

            flowCard.addEventListener('click', () => this.loadFlow(flow.id));

            this.flowsList.appendChild(flowCard);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Charge un flux spécifique
     */
    async loadFlow(flowId) {
        try {
            const response = await fetch(`/flow/${flowId}`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) {
                throw new Error('Flux introuvable');
            }

            const flow = await response.json();
            this.currentFlow = flow;
            this.flowNameInput.value = flow.name;

            // Effacer le canvas
            this.nodesContainer.innerHTML = '';
            this.connectionsContainer.innerHTML = '';

            // Rendre les nœuds
            if (flow.nodes) {
                flow.nodes.forEach(node => this.renderNode(node.id, node));
            }

            // Rendre les connexions APRÈS les nœuds
            setTimeout(() => {
                if (flow.connections) {
                    flow.connections.forEach(conn => this.renderConnection(conn.id, conn.source_id, conn.target_id));
                }
            }, 100);

            // Mettre à jour la sélection dans la liste
            document.querySelectorAll('.flow-card').forEach(item => {
                item.classList.toggle('active', item.dataset.flowId == flowId);
            });
        } catch (error) {
            console.error('Erreur loadFlow:', error);
        }
    }

    /**
     * Crée un nouveau flux
     */
    async createNewFlow() {
        const name = prompt('Nom du nouveau flux:', 'Nouveau flux');
        if (!name) return;

        try {
            const response = await fetch('/flow/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({
                    name: name,
                    description: '',
                    flow_data: {
                        nodes: [],
                        connections: []
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la création du flux');
            }

            const data = await response.json();

            // Recharger la liste des flux
            await this.loadFlows();

            // Charger le nouveau flux
            await this.loadFlow(data.id);

        } catch (error) {
            console.error('Erreur createNewFlow:', error);
        }
    }

    /**
     * Sauvegarde le flux actuel
     */
    async saveFlow() {
        if (!this.currentFlow) {
            console.warn('Aucun flux à sauvegarder');
            return;
        }

        try {
            const flowData = {
                name: this.flowNameInput.value,
                nodes: this.serializeNodes(),
                connections: this.serializeConnections()
            };

            const response = await fetch(`/flow/${this.currentFlow.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify(flowData)
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la sauvegarde');
            }

            // Réinitialiser l'indicateur de changement
            this.flowNameInput.style.borderBottomColor = '';
            
        } catch (error) {
            console.error('Erreur saveFlow:', error);
        }
    }

    /**
     * Gère le début du drag depuis la palette
     */
    handlePaletteDragStart(e) {
        e.dataTransfer.setData('nodeType', e.target.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
        e.target.classList.add('dragging');
    }

    /**
     * Gère la fin du drag depuis la palette
     */
    handlePaletteDragEnd(e) {
        e.target.classList.remove('dragging');
    }

    /**
     * Gère le dragover sur le canvas
     */
    handleCanvasDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    /**
     * Gère le drop sur le canvas
     */
    async handleCanvasDrop(e) {
        e.preventDefault();

        if (!this.currentFlow) {
            console.warn('Veuillez d\'abord créer ou charger un flux');
            return;
        }

        const nodeType = e.dataTransfer.getData('nodeType');
        if (!nodeType) return;

        const rect = this.flowCanvas.getBoundingClientRect();
        const scale = this.currentScale();
        const position = {
            x: (e.clientX - rect.left + this.flowCanvas.scrollLeft) / scale,
            y: (e.clientY - rect.top + this.flowCanvas.scrollTop) / scale
        };

        await this.createNode(nodeType, position);
    }

    /**
     * Gère le clic sur le canvas (déselection)
     */
    handleCanvasClick(e) {
        if (e.target === this.flowCanvas || e.target === this.nodesContainer) {
            this.deselectAll();
        }
    }

    /**
     * Crée un nouveau nœud
     */
    async createNode(type, position) {
        if (!this.currentFlow) return;

        const nodeData = {
            type: type,
            position: position,
            config: this.getDefaultConfigForType(type)
        };

        try {
            const response = await fetch(`/flow/${this.currentFlow.id}/nodes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify(nodeData)
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la création du nœud');
            }

            const data = await response.json();
            this.renderNode(data.id, data);
        } catch (error) {
            console.error('Erreur createNode:', error);
        }
    }

    /**
     * Rendu d'un nœud dans le canvas
     */
    renderNode(id, nodeData) {
        const nodeElement = document.createElement('div');
        nodeElement.className = `flow-node ${nodeData.type}-node fade-in`;
        nodeElement.dataset.nodeId = id;
        nodeElement.dataset.nodeType = nodeData.type;
        nodeElement.style.left = `${nodeData.position.x}px`;
        nodeElement.style.top = `${nodeData.position.y}px`;

        nodeElement.innerHTML = `
            <div class="node-header">
                <span class="node-type">
                    <i data-lucide="${this.getNodeIcon(nodeData.type)}"></i>
                    ${this.getNodeTypeLabel(nodeData.type)}
                </span>
                <div class="node-actions">
                    <button class="btn-icon delete-node" title="Supprimer">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="node-content">
                ${this.getNodeContent(nodeData)}
            </div>
            <div class="node-ports">
                <div class="port port-in" data-port="in"></div>
                <div class="port port-out" data-port="out"></div>
            </div>
        `;

        // Events pour le nœud
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(nodeElement);
        });

        // Drag du nœud
        const header = nodeElement.querySelector('.node-header');
        header.addEventListener('mousedown', (e) => this.startNodeDrag(e, nodeElement));

        nodeElement.querySelector('.delete-node').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNode(nodeElement.dataset.nodeId);
        });

        // Connexions
        const portOut = nodeElement.querySelector('.port-out');
        portOut.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startConnection(e, id);
        });

        // Sauvegarder les changements des inputs
        const inputs = nodeElement.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.markAsChanged();
                // Auto-save après 2 secondes
                clearTimeout(this.autoSaveTimer);
                this.autoSaveTimer = setTimeout(() => this.saveFlow(), 2000);
            });
        });

        this.nodesContainer.appendChild(nodeElement);

        // Rafraîchir les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Gère le début du drag d'un nœud
     */
    startNodeDrag(e, nodeElement) {
        if (e.target.closest('.btn-icon') || e.target.closest('.port')) return;

        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseFloat(nodeElement.style.left);
        const startTop = parseFloat(nodeElement.style.top);

        nodeElement.classList.add('dragging');

        const handleMouseMove = (e) => {
            const scale = this.currentScale();
            const deltaX = (e.clientX - startX) / scale;
            const deltaY = (e.clientY - startY) / scale;

            nodeElement.style.left = `${startLeft + deltaX}px`;
            nodeElement.style.top = `${startTop + deltaY}px`;

            this.updateNodeConnections(nodeElement.dataset.nodeId);
        };

        const handleMouseUp = async () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            nodeElement.classList.remove('dragging');

            // Sauvegarder la nouvelle position
            await this.updateNodePosition(nodeElement.dataset.nodeId, {
                x: parseFloat(nodeElement.style.left),
                y: parseFloat(nodeElement.style.top)
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    /**
     * Met à jour la position d'un nœud sur le serveur
     */
    async updateNodePosition(nodeId, position) {
        try {
            await fetch(`/flow/nodes/${nodeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({ position })
            });
        } catch (error) {
            console.error('Erreur updateNodePosition:', error);
        }
    }

    /**
     * Supprime un nœud
     */
    async deleteNode(nodeId) {
        const nodeEl = this.nodesContainer.querySelector(`[data-node-id="${nodeId}"]`);
        if (!nodeEl) return;

        if (!confirm('Supprimer ce nœud et toutes ses connexions ?')) return;

        try {
            const response = await fetch(`/flow/nodes/${nodeId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) throw new Error('Erreur suppression');

            nodeEl.remove();
            this.connectionsContainer.querySelectorAll(`[data-source-id="${nodeId}"], [data-target-id="${nodeId}"]`).forEach(el => el.remove());
            
        } catch (error) {
            console.error('Erreur deleteNode:', error);
        }
    }

    /**
     * Commence la création d'une connexion
     */
    startConnection(e, sourceId) {
        e.stopPropagation();

        this.isDrawingConnection = true;
        this.sourceNodeId = sourceId;

        // Créer un élément SVG temporaire pour la connexion
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('temp-connection');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '200';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#5a9eff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '5,5');
        svg.appendChild(path);

        this.connectionsContainer.appendChild(svg);
        this.tempConnectionEl = svg;

        const handleMouseMove = (e) => this.drawTempConnection(e);
        const handleMouseUp = (e) => this.finishConnection(e, handleMouseMove, handleMouseUp);

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    /**
     * Dessine la connexion temporaire avec gestion du scale
     */
    drawTempConnection(e) {
        if (!this.tempConnectionEl) return;

        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${this.sourceNodeId}"]`);
        if (!sourceNode) return;

        const sourceLeft = parseFloat(sourceNode.style.left) || 0;
        const sourceTop = parseFloat(sourceNode.style.top) || 0;
        const sourceWidth = sourceNode.offsetWidth;
        const sourceHeight = sourceNode.offsetHeight;

        // Point de départ
        const x1 = sourceLeft + sourceWidth;
        const y1 = sourceTop + sourceHeight / 2;

        // Point d'arrivée - Calcul corrigé avec scale
        const canvasRect = this.flowCanvas.getBoundingClientRect();
        const scale = this.currentScale();
        const x2 = (e.clientX - canvasRect.left) / scale + this.flowCanvas.scrollLeft / scale;
        const y2 = (e.clientY - canvasRect.top) / scale + this.flowCanvas.scrollTop / scale;

        const path = this.tempConnectionEl.querySelector('path');
        path.setAttribute('d', this.createBezierPath(x1, y1, x2, y2));
    }

    /**
     * Termine la création d'une connexion
     */
    async finishConnection(e, moveHandler, upHandler) {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);

        // Supprimer la connexion temporaire
        if (this.tempConnectionEl) {
            this.tempConnectionEl.remove();
            this.tempConnectionEl = null;
        }

        if (!this.isDrawingConnection) return;
        this.isDrawingConnection = false;

        // Trouver le port cible
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetPort = targetElement?.closest('.port-in');

        if (targetPort) {
            const targetNode = targetPort.closest('.flow-node');
            if (targetNode && targetNode.dataset.nodeId !== this.sourceNodeId) {
                await this.createConnection(this.sourceNodeId, targetNode.dataset.nodeId);
            }
        }

        this.sourceNodeId = null;
    }

    /**
     * Crée une connexion entre deux nœuds
     */
    async createConnection(sourceId, targetId) {
        // Empêcher les boucles
        if (sourceId === targetId) {
            console.warn('Un nœud ne peut pas être connecté à lui-même');
            return;
        }

        try {
            const response = await fetch(`/flow/nodes/${sourceId}/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({
                    target_id: targetId
                })
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la création de la connexion');
            }

            const data = await response.json();
            this.renderConnection(data.id, sourceId, targetId);
        } catch (error) {
            console.error('Erreur createConnection:', error);
        }
    }

    /**
     * Rendu d'une connexion avec CLIC SIMPLE
     */
    renderConnection(id, sourceId, targetId) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('flow-connection');
        svg.dataset.connectionId = id;
        svg.dataset.sourceId = sourceId;
        svg.dataset.targetId = targetId;
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '0';

        // Chemin invisible large pour capturer les clics (20px)
        const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitPath.setAttribute('stroke', 'transparent');
        hitPath.setAttribute('stroke-width', '20');
        hitPath.setAttribute('fill', 'none');
        hitPath.style.pointerEvents = 'stroke';
        hitPath.style.cursor = 'pointer';
        svg.appendChild(hitPath);

        // Chemin visible fin (2px)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#9ca3af');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.style.pointerEvents = 'none';
        svg.appendChild(path);

        // CLIC SIMPLE (pas double-clic) sur le chemin invisible
        hitPath.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showConnectionMenu(e, id, sourceId, targetId, svg);
        });

        this.connectionsContainer.appendChild(svg);
        this.updateConnectionPath(svg);
    }

    /**
     * Met à jour le chemin d'une connexion - POSITION EXACTE sur les ports
     */
    updateConnectionPath(connectionEl) {
        const sourceId = connectionEl.dataset.sourceId;
        const targetId = connectionEl.dataset.targetId;

        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${sourceId}"]`);
        const targetNode = this.nodesContainer.querySelector(`[data-node-id="${targetId}"]`);

        if (!sourceNode || !targetNode) {
            console.warn(`Connexion orpheline: source=${sourceId}, target=${targetId}`);
            connectionEl.remove();
            return;
        }

        // Utiliser getBoundingClientRect pour position EXACTE
        const sourceRect = sourceNode.getBoundingClientRect();
        const targetRect = targetNode.getBoundingClientRect();
        const canvasRect = this.flowCanvas.getBoundingClientRect();
        
        // Position relative au canvas avec scroll
        const scale = this.currentScale();
        const x1 = (sourceRect.right - canvasRect.left + this.flowCanvas.scrollLeft) / scale;
        const y1 = (sourceRect.top + sourceRect.height/2 - canvasRect.top + this.flowCanvas.scrollTop) / scale;
        
        const x2 = (targetRect.left - canvasRect.left + this.flowCanvas.scrollLeft) / scale;
        const y2 = (targetRect.top + targetRect.height/2 - canvasRect.top + this.flowCanvas.scrollTop) / scale;

        // Mettre à jour les deux chemins
        const paths = connectionEl.querySelectorAll('path');
        const bezierPath = this.createBezierPath(x1, y1, x2, y2);
        paths.forEach(path => {
            path.setAttribute('d', bezierPath);
        });
    }

    /**
     * Crée un chemin Bézier pour une connexion
     */
    createBezierPath(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(distance / 2, 100);

        const cp1x = x1 + offset;
        const cp1y = y1;
        const cp2x = x2 - offset;
        const cp2y = y2;

        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }

    /**
     * Met à jour toutes les connexions d'un nœud
     */
    updateNodeConnections(nodeId) {
        const connections = this.connectionsContainer.querySelectorAll(
            `[data-source-id="${nodeId}"], [data-target-id="${nodeId}"]`
        );

        connections.forEach(conn => this.updateConnectionPath(conn));
    }

    /**
     * Met à jour TOUTES les connexions
     */
    updateAllConnections() {
        const connections = this.connectionsContainer.querySelectorAll('.flow-connection');
        connections.forEach(conn => this.updateConnectionPath(conn));
    }

    /**
     * Supprime une connexion
     */
    async deleteConnection(connectionId) {
        try {
            const response = await fetch(`/flow/connections/${connectionId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la suppression');
            }

            const connEl = this.connectionsContainer.querySelector(`[data-connection-id="${connectionId}"]`);
            if (connEl) connEl.remove();
        } catch (error) {
            console.error('Erreur deleteConnection:', error);
        }
    }

    /**
     * Affiche le menu de connexion
     */
    showConnectionMenu(e, connectionId, sourceId, targetId, connectionElement) {
        this.hideConnectionMenu();

        const menu = document.createElement('div');
        menu.className = 'connection-menu';
        menu.innerHTML = `
            <button class="btn-connection-action btn-delete" data-action="delete" title="Supprimer">
                <i data-lucide="trash-2"></i>
            </button>
            <button class="btn-connection-action btn-add" data-action="add" title="Ajouter un nœud">
                <i data-lucide="plus"></i>
            </button>
        `;

        // Positionner le menu au point de clic
        const canvasRect = this.flowCanvas.getBoundingClientRect();
        const scale = this.currentScale();
        menu.style.left = `${(e.clientX - canvasRect.left + this.flowCanvas.scrollLeft) / scale}px`;
        menu.style.top = `${(e.clientY - canvasRect.top + this.flowCanvas.scrollTop) / scale}px`;

        this.nodesContainer.appendChild(menu);
        this.currentConnectionMenu = menu;
        this.currentConnectionMenuData = { connectionId, sourceId, targetId };

        // Rafraîchir les icônes
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        menu.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteConnection(connectionId);
            this.hideConnectionMenu();
        });

        menu.querySelector('[data-action="add"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideConnectionMenu();
            this.addNodeBetween(sourceId, targetId, connectionId);
        });

        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', this.hideConnectionMenu.bind(this), { once: true });
        }, 100);
    }

    /**
     * Cache le menu de connexion
     */
    hideConnectionMenu() {
        if (this.currentConnectionMenu) {
            this.currentConnectionMenu.remove();
            this.currentConnectionMenu = null;
            this.currentConnectionMenuData = null;
        }
    }

    /**
     * VRAIE CORRECTION: Ajoute un nœud entre deux nœuds existants
     */
    async addNodeBetween(sourceId, targetId, connectionId) {
        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${sourceId}"]`);
        const targetNode = this.nodesContainer.querySelector(`[data-node-id="${targetId}"]`);

        if (!sourceNode || !targetNode) {
            console.error('Nœuds source ou cible introuvables');
            return;
        }

        // Position au milieu
        const sourceX = parseFloat(sourceNode.style.left);
        const sourceY = parseFloat(sourceNode.style.top);
        const targetX = parseFloat(targetNode.style.left);
        const targetY = parseFloat(targetNode.style.top);
        
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        this.showNodeTypeSelector(midX, midY, async (selectedType) => {
            try {
                // Créer d'abord le nœud LOCALEMENT avec un ID temporaire
                const tempId = 'temp_' + Date.now();
                const nodeData = {
                    id: tempId,
                    type: selectedType,
                    position: { x: midX, y: midY },
                    config: this.getDefaultConfigForType(selectedType)
                };
                
                // Rendre IMMÉDIATEMENT le nœud
                this.renderNode(tempId, nodeData);
                
                // Supprimer l'ancienne connexion VISUELLEMENT
                const connEl = this.connectionsContainer.querySelector(`[data-connection-id="${connectionId}"]`);
                if (connEl) connEl.remove();
                
                // Créer les nouvelles connexions VISUELLEMENT avec des IDs temporaires
                this.renderConnection('temp_conn_1', sourceId, tempId);
                this.renderConnection('temp_conn_2', tempId, targetId);
                
                // ENSUITE faire l'appel serveur
                const response = await fetch(`/flow/${this.currentFlow.id}/nodes`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({
                        type: selectedType,
                        position: { x: midX, y: midY },
                        config: this.getDefaultConfigForType(selectedType)
                    })
                });

                if (response.ok) {
                    const newNode = await response.json();
                    
                    // Remplacer l'ID temporaire par le vrai ID
                    const tempNodeEl = this.nodesContainer.querySelector(`[data-node-id="${tempId}"]`);
                    if (tempNodeEl) {
                        tempNodeEl.dataset.nodeId = newNode.id;
                    }
                    
                    // Supprimer les connexions temporaires
                    this.connectionsContainer.querySelector('[data-connection-id="temp_conn_1"]')?.remove();
                    this.connectionsContainer.querySelector('[data-connection-id="temp_conn_2"]')?.remove();
                    
                    // Supprimer l'ancienne connexion sur le serveur
                    await this.deleteConnection(connectionId);
                    
                    // Créer les vraies connexions
                    await this.createConnection(sourceId, newNode.id);
                    await this.createConnection(newNode.id, targetId);
                }

            } catch (error) {
                console.error('Erreur:', error);
                // En cas d'erreur, nettoyer les éléments temporaires
                const tempNodeEl = this.nodesContainer.querySelector('[data-node-id^="temp_"]');
                if (tempNodeEl) tempNodeEl.remove();
                this.connectionsContainer.querySelector('[data-connection-id="temp_conn_1"]')?.remove();
                this.connectionsContainer.querySelector('[data-connection-id="temp_conn_2"]')?.remove();
            }
        });
    }

    /**
     * Affiche un sélecteur de type de nœud
     */
    showNodeTypeSelector(x, y, callback) {
        this.hideNodeTypeSelector();

        const selector = document.createElement('div');
        selector.className = 'node-type-selector';
        selector.style.left = `${x}px`;
        selector.style.top = `${y}px`;

        const nodeTypes = [
            { type: 'message', icon: 'message-circle', label: 'Message' },
            { type: 'condition', icon: 'git-branch', label: 'Condition' },
            { type: 'input', icon: 'type', label: 'Saisie' },
            { type: 'action', icon: 'zap', label: 'Action' },
            { type: 'api', icon: 'plug', label: 'API' }
        ];

        selector.innerHTML = `
            <div class="node-type-selector-header">
                Choisir un type de nœud
            </div>
            <div class="node-type-selector-items">
                ${nodeTypes.map(nt => `
                    <button class="node-type-selector-item" data-type="${nt.type}">
                        <i data-lucide="${nt.icon}"></i>
                        <span>${nt.label}</span>
                    </button>
                `).join('')}
            </div>
        `;

        this.nodesContainer.appendChild(selector);
        this.currentNodeTypeSelector = selector;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Gérer les clics sur les boutons
        selector.querySelectorAll('.node-type-selector-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedType = btn.dataset.type;
                this.hideNodeTypeSelector();
                callback(selectedType);
            });
        });

        // Fermer en cliquant ailleurs avec un délai plus long
        setTimeout(() => {
            const closeHandler = (e) => {
                const clickedElement = e.target;
                const isInsideSelector = selector.contains(clickedElement);
                
                if (!isInsideSelector) {
                    this.hideNodeTypeSelector();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
            
            // Stocker le handler pour pouvoir le supprimer
            this.currentSelectorCloseHandler = closeHandler;
        }, 500);
    }

    /**
     * Cache le sélecteur de type de nœud
     */
    hideNodeTypeSelector() {
        if (this.currentNodeTypeSelector) {
            this.currentNodeTypeSelector.remove();
            this.currentNodeTypeSelector = null;
        }
        
        // Nettoyer le handler s'il existe
        if (this.currentSelectorCloseHandler) {
            document.removeEventListener('click', this.currentSelectorCloseHandler);
            this.currentSelectorCloseHandler = null;
        }
    }

    /**
     * Sélectionne un nœud
     */
    selectNode(nodeElement) {
        this.deselectAll();

        nodeElement.classList.add('selected');
        this.selectedNode = nodeElement;

        // Afficher les propriétés si le panneau est visible
        if (this.propertiesPanel && this.propertiesPanel.style.display !== 'none') {
            this.showNodeProperties(nodeElement);
        }
    }

    /**
     * Déselectionne tout
     */
    deselectAll() {
        document.querySelectorAll('.flow-node.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.flow-connection.selected').forEach(el => el.classList.remove('selected'));
        this.selectedNode = null;
        this.selectedConnection = null;

        if (this.propertiesContent) {
            this.propertiesContent.innerHTML = '<div class="properties-empty">Sélectionnez un nœud pour voir ses propriétés</div>';
        }
    }

    /**
     * Affiche les propriétés d'un nœud
     */
    showNodeProperties(nodeElement) {
        if (!this.propertiesContent) return;

        const nodeId = nodeElement.dataset.nodeId;
        const nodeType = nodeElement.dataset.nodeType;

        this.propertiesContent.innerHTML = `
            <div class="property-group">
                <label class="property-label">Type de nœud</label>
                <input type="text" class="property-input form-control" value="${this.getNodeTypeLabel(nodeType)}" disabled>
            </div>
            <div class="property-group">
                <label class="property-label">ID</label>
                <input type="text" class="property-input form-control" value="${nodeId}" disabled>
            </div>
            <div class="property-group">
                <label class="property-label">Configuration</label>
                <small class="form-help">Les propriétés spécifiques au nœud apparaîtront ici.</small>
            </div>
        `;
    }

    /**
     * Ouvre la modal de test
     */
    openTestModal() {
        if (!this.testModal) return;

        this.testModal.classList.add('show');
        this.testConversation.innerHTML = '';
        this.testInput.value = '';
        this.testInput.focus();
    }

    /**
     * Ferme la modal de test
     */
    closeTestModal() {
        if (!this.testModal) return;
        this.testModal.classList.remove('show');
    }

    /**
     * Réinitialise le test
     */
    resetTest() {
        if (!this.testConversation) return;
        this.testConversation.innerHTML = '';
        this.testInput.value = '';
    }

    /**
     * Envoie un message de test
     */
    sendTestMessage() {
        const message = this.testInput.value.trim();
        if (!message) return;

        // Afficher le message utilisateur
        const userMsg = document.createElement('div');
        userMsg.className = 'test-message user';
        userMsg.innerHTML = `<div class="test-message-content">${message}</div>`;
        this.testConversation.appendChild(userMsg);

        // Simuler une réponse du bot
        setTimeout(() => {
            const botMsg = document.createElement('div');
            botMsg.className = 'test-message bot';
            botMsg.innerHTML = `<div class="test-message-content">Fonction de test en développement.</div>`;
            this.testConversation.appendChild(botMsg);
            this.testConversation.scrollTop = this.testConversation.scrollHeight;
        }, 500);

        this.testInput.value = '';
        this.testConversation.scrollTop = this.testConversation.scrollHeight;
    }

    /**
     * Exporte le flux
     */
    exportFlow() {
        if (!this.currentFlow) {
            console.warn('Aucun flux à exporter');
            return;
        }

        const flowData = {
            ...this.currentFlow,
            nodes: this.serializeNodes(),
            connections: this.serializeConnections()
        };

        const dataStr = JSON.stringify(flowData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${this.currentFlow.name}.json`;
        link.click();
    }

    /**
     * Importe un flux
     */
    importFlow() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const flowData = JSON.parse(text);

                // Créer un nouveau flux avec les données importées
                const response = await fetch('/flow/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({
                        name: flowData.name || 'Flux importé',
                        description: flowData.description || '',
                        flow_data: {
                            nodes: flowData.nodes || [],
                            connections: flowData.connections || []
                        }
                    })
                });

                if (!response.ok) throw new Error('Erreur import');

                const newFlow = await response.json();
                await this.loadFlows();
                await this.loadFlow(newFlow.id);

            } catch (error) {
                console.error('Erreur import:', error);
            }
        });

        input.click();
    }

    /**
     * Sérialise les nœuds avec leurs configurations
     */
    serializeNodes() {
        const nodes = [];
        this.nodesContainer.querySelectorAll('.flow-node').forEach(nodeEl => {
            const config = {};
            
            // Récupérer les valeurs des inputs selon le type
            const nodeType = nodeEl.dataset.nodeType;
            const content = nodeEl.querySelector('.node-content');
            
            switch(nodeType) {
                case 'message':
                    const textarea = content.querySelector('textarea');
                    config.message = textarea ? textarea.value : '';
                    break;
                case 'condition':
                    const select = content.querySelector('select');
                    const input = content.querySelector('input');
                    config.operator = select ? select.value : 'equals';
                    config.value = input ? input.value : '';
                    break;
                case 'input':
                    const inputField = content.querySelector('input');
                    config.variable = inputField ? inputField.value : '';
                    break;
                case 'action':
                    const actionInput = content.querySelector('input');
                    config.action_type = actionInput ? actionInput.value : '';
                    break;
                case 'api':
                    const methodSelect = content.querySelector('select');
                    const urlInput = content.querySelector('input[type="text"]');
                    config.method = methodSelect ? methodSelect.value : 'GET';
                    config.endpoint = urlInput ? urlInput.value : '';
                    break;
            }
            
            nodes.push({
                id: nodeEl.dataset.nodeId,
                type: nodeType,
                position: {
                    x: parseFloat(nodeEl.style.left),
                    y: parseFloat(nodeEl.style.top)
                },
                config: config
            });
        });
        return nodes;
    }

    /**
     * Sérialise les connexions
     */
    serializeConnections() {
        const connections = [];
        this.connectionsContainer.querySelectorAll('.flow-connection').forEach(connEl => {
            // Ignorer les connexions temporaires
            if (!connEl.dataset.connectionId.startsWith('temp_')) {
                connections.push({
                    id: connEl.dataset.connectionId,
                    source_id: connEl.dataset.sourceId,
                    target_id: connEl.dataset.targetId
                });
            }
        });
        return connections;
    }

    /**
     * Recherche dans les flux
     */
    searchFlows(query) {
        const items = this.flowsList?.querySelectorAll('.flow-card');
        if (!items) return;
        
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const title = item.querySelector('.flow-card-title')?.textContent.toLowerCase() || '';
            const description = item.querySelector('.flow-card-description')?.textContent.toLowerCase() || '';
            const matches = title.includes(lowerQuery) || description.includes(lowerQuery);
            item.style.display = matches ? 'block' : 'none';
        });
    }

    /**
     * Marque le flux comme modifié
     */
    markAsChanged() {
        // Indicateur visuel que le flux a été modifié
        this.flowNameInput.style.borderBottomColor = '#f59e0b';
    }

    /**
     * Configuration par défaut pour un type de nœud
     */
    getDefaultConfigForType(type) {
        const defaults = {
            message: { message: '' },
            condition: { operator: 'equals', value: '' },
            input: { variable: '' },
            action: { action_type: '' },
            api: { endpoint: '', method: 'GET' }
        };
        return defaults[type] || {};
    }

    /**
     * Contenu HTML d'un nœud avec les valeurs pré-remplies
     */
    getNodeContent(nodeData) {
        const config = nodeData.config || {};
        
        switch (nodeData.type) {
            case 'message':
                return `<textarea class="form-control" placeholder="Message à envoyer...">${config.message || ''}</textarea>`;
            case 'condition':
                return `
                    <div class="condition-editor">
                        <select class="form-control">
                            <option value="equals" ${config.operator === 'equals' ? 'selected' : ''}>Égal à</option>
                            <option value="contains" ${config.operator === 'contains' ? 'selected' : ''}>Contient</option>
                            <option value="regex" ${config.operator === 'regex' ? 'selected' : ''}>Expression régulière</option>
                        </select>
                        <input type="text" class="form-control" placeholder="Valeur..." value="${config.value || ''}">
                    </div>`;
            case 'input':
                return `<input type="text" class="form-control" placeholder="Variable de stockage..." value="${config.variable || ''}">`;
            case 'action':
                return `<input type="text" class="form-control" placeholder="Type d'action..." value="${config.action_type || ''}">`;
            case 'api':
                return `
                    <select class="form-control">
                        <option value="GET" ${config.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${config.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${config.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    </select>
                    <input type="text" class="form-control" placeholder="URL de l'API..." value="${config.endpoint || ''}">`;
            default:
                return '';
        }
    }

    /**
     * Label d'un type de nœud
     */
    getNodeTypeLabel(type) {
        const labels = {
            message: 'Message',
            condition: 'Condition',
            input: 'Saisie',
            action: 'Action',
            api: 'API'
        };
        return labels[type] || type;
    }

    /**
     * Icône d'un type de nœud
     */
    getNodeIcon(type) {
        const icons = {
            message: 'message-circle',
            condition: 'git-branch',
            input: 'type',
            action: 'zap',
            api: 'plug'
        };
        return icons[type] || 'square';
    }

    /**
     * PAS DE NOTIFICATIONS VISUELLES
     */
    showSuccess(message) {
        console.log('✅', message);
    }

    showError(message) {
        console.error('❌', message);
    }

    showWarning(message) {
        console.warn('⚠️', message);
    }

    showInfo(message) {
        console.log('ℹ️', message);
    }

    showNotification(message, type = 'info') {
        // RIEN - Pas de notification visuelle
        console.log(`[${type}]`, message);
    }

    /**
     * Nettoyage complet
     */
    destroy() {
        // Cleanup tous les timers
        clearTimeout(this.autoSaveTimer);
        
        // Cleanup les menus
        this.hideConnectionMenu();
        this.hideNodeTypeSelector();
        
        // Cleanup les connexions temporaires
        if (this.tempConnectionEl) {
            this.tempConnectionEl.remove();
            this.tempConnectionEl = null;
        }
        
        console.log('FlowBuilder destroyed');
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.flowBuilder = new FlowBuilder();
});
