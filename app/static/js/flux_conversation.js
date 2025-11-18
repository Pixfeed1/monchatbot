/**
 * FluxBuilder - Version PRO comme n8n
 * - Molette = Zoom
 * - Clic gauche + drag = Pan
 * - Connexions EXACTES sur les ports
 * - Ajout de nœud qui FONCTIONNE
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
        this.isPanning = false;
        this.panStart = null;

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

        // SETUP COMME N8N : Pan et Zoom
        this.setupCanvasControls();

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

            const icon = fullscreenBtn.querySelector('i');
            if (editor.classList.contains('fullscreen')) {
                icon.setAttribute('data-lucide', 'minimize-2');
            } else {
                icon.setAttribute('data-lucide', 'maximize-2');
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    /**
     * COMME N8N : Molette = Zoom, Clic gauche + drag = Pan
     */
    setupCanvasControls() {
        const minScale = 0.3;
        const maxScale = 2;

        // ZOOM avec MOLETTE (comme n8n)
        this.flowCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Calculer le nouveau scale
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newScale = Math.max(minScale, Math.min(maxScale, this.scale + delta));
            
            if (newScale !== this.scale) {
                // Point de zoom (position de la souris)
                const rect = this.flowCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Ratio de zoom
                const ratio = newScale / this.scale;
                
                // Ajuster le scroll pour zoomer sur la position de la souris
                this.flowCanvas.scrollLeft = x + (this.flowCanvas.scrollLeft - x) * ratio;
                this.flowCanvas.scrollTop = y + (this.flowCanvas.scrollTop - y) * ratio;
                
                // Appliquer le nouveau scale
                this.scale = newScale;
                this.nodesContainer.style.transform = `scale(${this.scale})`;
                this.connectionsContainer.style.transform = `scale(${this.scale})`;
                
                // Mettre à jour les connexions
                this.updateAllConnections();
            }
        }, { passive: false });

        // PAN avec CLIC GAUCHE sur le fond (comme n8n)
        this.flowCanvas.addEventListener('mousedown', (e) => {
            // Seulement si on clique sur le fond (pas sur un nœud)
            if (e.target === this.flowCanvas || e.target === this.nodesContainer || e.target === this.connectionsContainer) {
                if (e.button === 0) { // Clic gauche
                    e.preventDefault();
                    this.isPanning = true;
                    this.panStart = {
                        x: e.clientX,
                        y: e.clientY,
                        scrollLeft: this.flowCanvas.scrollLeft,
                        scrollTop: this.flowCanvas.scrollTop
                    };
                    this.flowCanvas.style.cursor = 'grabbing';
                }
            }
        });

        // Mouvement pendant le pan
        document.addEventListener('mousemove', (e) => {
            if (this.isPanning && this.panStart) {
                const dx = e.clientX - this.panStart.x;
                const dy = e.clientY - this.panStart.y;
                
                this.flowCanvas.scrollLeft = this.panStart.scrollLeft - dx;
                this.flowCanvas.scrollTop = this.panStart.scrollTop - dy;
            }
        });

        // Fin du pan
        document.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.panStart = null;
                this.flowCanvas.style.cursor = 'grab';
            }
        });

        // Désactiver le menu contextuel
        this.flowCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

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

            if (data.flows.length > 0) {
                await this.loadFlow(data.flows[0].id);
            }
        } catch (error) {
            console.error('Erreur loadFlows:', error);
        }
    }

    /**
     * Affiche la liste des flux
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

            // Rendre les connexions APRÈS avec délai pour être sûr
            setTimeout(() => {
                if (flow.connections) {
                    flow.connections.forEach(conn => {
                        this.renderConnection(conn.id, conn.source_id, conn.target_id);
                    });
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
            await this.loadFlows();
            await this.loadFlow(data.id);

        } catch (error) {
            console.error('Erreur createNewFlow:', error);
        }
    }

    /**
     * Sauvegarde le flux actuel
     */
    async saveFlow() {
        if (!this.currentFlow) return;

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

        if (!this.currentFlow) return;

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
     * Gère le clic sur le canvas
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

        // Créer le nœud LOCALEMENT d'abord
        const tempId = 'temp_' + Date.now();
        const nodeData = {
            id: tempId,
            type: type,
            position: position,
            config: this.getDefaultConfigForType(type)
        };

        // Rendre immédiatement
        this.renderNode(tempId, nodeData);

        // Puis appeler le serveur
        try {
            const response = await fetch(`/flow/${this.currentFlow.id}/nodes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({
                    type: type,
                    position: position,
                    config: nodeData.config
                })
            });

            if (response.ok) {
                const data = await response.json();
                // Mettre à jour l'ID du nœud
                const tempNode = this.nodesContainer.querySelector(`[data-node-id="${tempId}"]`);
                if (tempNode) {
                    tempNode.dataset.nodeId = data.id;
                }
            }
            
        } catch (error) {
            console.error('Erreur createNode:', error);
            // Supprimer le nœud temporaire en cas d'erreur
            const tempNode = this.nodesContainer.querySelector(`[data-node-id="${tempId}"]`);
            if (tempNode) tempNode.remove();
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
            e.preventDefault();
            this.startConnection(e, id);
        });

        // Auto-save sur changement
        const inputs = nodeElement.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.markAsChanged();
                clearTimeout(this.autoSaveTimer);
                this.autoSaveTimer = setTimeout(() => this.saveFlow(), 2000);
            });
        });

        this.nodesContainer.appendChild(nodeElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Gère le drag d'un nœud
     */
    startNodeDrag(e, nodeElement) {
        if (e.target.closest('.btn-icon') || e.target.closest('.port')) return;

        e.preventDefault();
        e.stopPropagation();

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
        // Ignorer les IDs temporaires
        if (nodeId.startsWith('temp_')) return;

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

        // Supprimer visuellement d'abord
        nodeEl.remove();
        this.connectionsContainer.querySelectorAll(
            `[data-source-id="${nodeId}"], [data-target-id="${nodeId}"]`
        ).forEach(el => el.remove());

        // Si c'est un nœud temporaire, pas d'appel serveur
        if (nodeId.startsWith('temp_')) return;

        try {
            await fetch(`/flow/nodes/${nodeId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });
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
     * Dessine la connexion temporaire
     */
    drawTempConnection(e) {
        if (!this.tempConnectionEl) return;

        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${this.sourceNodeId}"]`);
        if (!sourceNode) return;

        // Position du nœud source
        const sourceLeft = parseFloat(sourceNode.style.left) || 0;
        const sourceTop = parseFloat(sourceNode.style.top) || 0;
        const sourceWidth = sourceNode.offsetWidth;
        const sourceHeight = sourceNode.offsetHeight;

        // Point de départ (centre du port-out)
        const x1 = sourceLeft + sourceWidth;
        const y1 = sourceTop + sourceHeight / 2;

        // Position de la souris dans le canvas
        const canvasRect = this.flowCanvas.getBoundingClientRect();
        const scale = this.currentScale();
        const x2 = (e.clientX - canvasRect.left + this.flowCanvas.scrollLeft) / scale;
        const y2 = (e.clientY - canvasRect.top + this.flowCanvas.scrollTop) / scale;

        const path = this.tempConnectionEl.querySelector('path');
        path.setAttribute('d', this.createBezierPath(x1, y1, x2, y2));
    }

    /**
     * Termine la création d'une connexion
     */
    async finishConnection(e, moveHandler, upHandler) {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);

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
        if (sourceId === targetId) return;

        // Créer visuellement d'abord
        const tempConnId = 'temp_conn_' + Date.now();
        this.renderConnection(tempConnId, sourceId, targetId);

        // Si ce sont des nœuds temporaires, pas d'appel serveur
        if (sourceId.startsWith('temp_') || targetId.startsWith('temp_')) return;

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

            if (response.ok) {
                const data = await response.json();
                // Mettre à jour l'ID de la connexion
                const tempConn = this.connectionsContainer.querySelector(`[data-connection-id="${tempConnId}"]`);
                if (tempConn) {
                    tempConn.dataset.connectionId = data.id;
                }
            }
        } catch (error) {
            console.error('Erreur createConnection:', error);
            // Supprimer la connexion temporaire en cas d'erreur
            const tempConn = this.connectionsContainer.querySelector(`[data-connection-id="${tempConnId}"]`);
            if (tempConn) tempConn.remove();
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

        // Path invisible pour les clics
        const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitPath.setAttribute('stroke', 'transparent');
        hitPath.setAttribute('stroke-width', '20');
        hitPath.setAttribute('fill', 'none');
        hitPath.style.pointerEvents = 'stroke';
        hitPath.style.cursor = 'pointer';
        svg.appendChild(hitPath);

        // Path visible
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#9ca3af');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.style.pointerEvents = 'none';
        svg.appendChild(path);

        // CLIC SIMPLE pour le menu
        hitPath.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showConnectionMenu(e, id, sourceId, targetId);
        });

        this.connectionsContainer.appendChild(svg);
        this.updateConnectionPath(svg);
    }

    /**
     * Met à jour le chemin d'une connexion - VERSION QUI MARCHE
     */
    updateConnectionPath(connectionEl) {
        const sourceId = connectionEl.dataset.sourceId;
        const targetId = connectionEl.dataset.targetId;

        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${sourceId}"]`);
        const targetNode = this.nodesContainer.querySelector(`[data-node-id="${targetId}"]`);

        if (!sourceNode || !targetNode) {
            connectionEl.remove();
            return;
        }

        // Utiliser les positions CSS des nœuds (pas getBoundingClientRect)
        const sourceLeft = parseFloat(sourceNode.style.left) || 0;
        const sourceTop = parseFloat(sourceNode.style.top) || 0;
        const sourceWidth = sourceNode.offsetWidth;
        const sourceHeight = sourceNode.offsetHeight;

        const targetLeft = parseFloat(targetNode.style.left) || 0;
        const targetTop = parseFloat(targetNode.style.top) || 0;
        const targetHeight = targetNode.offsetHeight;

        // Position EXACTE des ports (port = 16px, centré sur le bord)
        const x1 = sourceLeft + sourceWidth; // Bord droit du nœud source
        const y1 = sourceTop + sourceHeight / 2; // Milieu vertical

        const x2 = targetLeft; // Bord gauche du nœud cible
        const y2 = targetTop + targetHeight / 2; // Milieu vertical

        // Créer le chemin
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
        const distance = Math.abs(dx);
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
        const connEl = this.connectionsContainer.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connEl) connEl.remove();

        // Si c'est une connexion temporaire, pas d'appel serveur
        if (connectionId.startsWith('temp_')) return;

        try {
            await fetch(`/flow/connections/${connectionId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });
        } catch (error) {
            console.error('Erreur deleteConnection:', error);
        }
    }

    /**
     * Affiche le menu de connexion
     */
    showConnectionMenu(e, connectionId, sourceId, targetId) {
        this.hideConnectionMenu();

        const menu = document.createElement('div');
        menu.className = 'connection-menu';
        menu.innerHTML = `
            <button class="btn-connection-action btn-delete" title="Supprimer">
                <i data-lucide="trash-2"></i>
            </button>
            <button class="btn-connection-action btn-add" title="Ajouter un nœud">
                <i data-lucide="plus"></i>
            </button>
        `;

        const canvasRect = this.flowCanvas.getBoundingClientRect();
        const scale = this.currentScale();
        menu.style.left = `${(e.clientX - canvasRect.left + this.flowCanvas.scrollLeft) / scale}px`;
        menu.style.top = `${(e.clientY - canvasRect.top + this.flowCanvas.scrollTop) / scale}px`;

        this.nodesContainer.appendChild(menu);
        this.currentConnectionMenu = menu;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        menu.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteConnection(connectionId);
            this.hideConnectionMenu();
        });

        menu.querySelector('.btn-add').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideConnectionMenu();
            this.addNodeBetween(sourceId, targetId, connectionId);
        });

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
        }
    }

    /**
     * VERSION QUI MARCHE : Ajoute un nœud entre deux nœuds
     */
    async addNodeBetween(sourceId, targetId, connectionId) {
        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${sourceId}"]`);
        const targetNode = this.nodesContainer.querySelector(`[data-node-id="${targetId}"]`);

        if (!sourceNode || !targetNode) return;

        // Position au milieu
        const sourceX = parseFloat(sourceNode.style.left) || 0;
        const sourceY = parseFloat(sourceNode.style.top) || 0;
        const targetX = parseFloat(targetNode.style.left) || 0;
        const targetY = parseFloat(targetNode.style.top) || 0;
        
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        this.showNodeTypeSelector(midX, midY, async (selectedType) => {
            // Créer le nœud IMMÉDIATEMENT avec ID temporaire
            const tempNodeId = 'temp_node_' + Date.now();
            const nodeData = {
                id: tempNodeId,
                type: selectedType,
                position: { x: midX, y: midY },
                config: this.getDefaultConfigForType(selectedType)
            };
            
            // Rendre le nœud TOUT DE SUITE
            this.renderNode(tempNodeId, nodeData);
            
            // Supprimer l'ancienne connexion TOUT DE SUITE
            const oldConn = this.connectionsContainer.querySelector(`[data-connection-id="${connectionId}"]`);
            if (oldConn) oldConn.remove();
            
            // Créer les nouvelles connexions TOUT DE SUITE
            const tempConn1 = 'temp_conn_' + Date.now() + '_1';
            const tempConn2 = 'temp_conn_' + Date.now() + '_2';
            this.renderConnection(tempConn1, sourceId, tempNodeId);
            this.renderConnection(tempConn2, tempNodeId, targetId);
            
            // APRÈS SEULEMENT, appeler le serveur
            try {
                // Si les nœuds source/target sont temporaires, pas d'appel serveur
                if (sourceId.startsWith('temp_') || targetId.startsWith('temp_')) {
                    return;
                }

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
                    
                    // Mettre à jour l'ID du nœud temporaire
                    const tempNodeEl = this.nodesContainer.querySelector(`[data-node-id="${tempNodeId}"]`);
                    if (tempNodeEl) {
                        tempNodeEl.dataset.nodeId = newNode.id;
                    }
                    
                    // Supprimer l'ancienne connexion côté serveur
                    if (!connectionId.startsWith('temp_')) {
                        await this.deleteConnection(connectionId);
                    }
                    
                    // Créer les vraies connexions côté serveur
                    await this.createConnection(sourceId, newNode.id);
                    await this.createConnection(newNode.id, targetId);
                    
                    // Mettre à jour les IDs des connexions temporaires
                    const tc1 = this.connectionsContainer.querySelector(`[data-connection-id="${tempConn1}"]`);
                    const tc2 = this.connectionsContainer.querySelector(`[data-connection-id="${tempConn2}"]`);
                    if (tc1) tc1.dataset.connectionId = 'conn_' + Date.now() + '_1';
                    if (tc2) tc2.dataset.connectionId = 'conn_' + Date.now() + '_2';
                }
            } catch (error) {
                console.error('Erreur serveur, mais le nœud est visible:', error);
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

        selector.querySelectorAll('.node-type-selector-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedType = btn.dataset.type;
                this.hideNodeTypeSelector();
                callback(selectedType);
            });
        });

        setTimeout(() => {
            const closeHandler = (e) => {
                if (!selector.contains(e.target)) {
                    this.hideNodeTypeSelector();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
            this.currentSelectorCloseHandler = closeHandler;
        }, 300);
    }

    /**
     * Cache le sélecteur de type de nœud
     */
    hideNodeTypeSelector() {
        if (this.currentNodeTypeSelector) {
            this.currentNodeTypeSelector.remove();
            this.currentNodeTypeSelector = null;
        }
        
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
    }

    /**
     * Déselectionne tout
     */
    deselectAll() {
        document.querySelectorAll('.flow-node.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.flow-connection.selected').forEach(el => el.classList.remove('selected'));
        this.selectedNode = null;
        this.selectedConnection = null;
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

        const userMsg = document.createElement('div');
        userMsg.className = 'test-message user';
        userMsg.innerHTML = `<div class="test-message-content">${message}</div>`;
        this.testConversation.appendChild(userMsg);

        setTimeout(() => {
            const botMsg = document.createElement('div');
            botMsg.className = 'test-message bot';
            botMsg.innerHTML = `<div class="test-message-content">Test en cours...</div>`;
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
        if (!this.currentFlow) return;

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
            // Ignorer les nœuds temporaires
            if (nodeEl.dataset.nodeId.startsWith('temp_')) return;

            const config = {};
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
            if (connEl.dataset.connectionId.startsWith('temp_')) return;

            connections.push({
                id: connEl.dataset.connectionId,
                source_id: connEl.dataset.sourceId,
                target_id: connEl.dataset.targetId
            });
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
     * Contenu HTML d'un nœud
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
     * PAS DE NOTIFICATIONS - Juste console
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
        console.log(`[${type}]`, message);
    }

    /**
     * Nettoyage
     */
    destroy() {
        clearTimeout(this.autoSaveTimer);
        this.hideConnectionMenu();
        this.hideNodeTypeSelector();
        
        if (this.tempConnectionEl) {
            this.tempConnectionEl.remove();
            this.tempConnectionEl = null;
        }
        
        console.log('FlowBuilder destroyed');
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.flowBuilder = new FlowBuilder();
});
