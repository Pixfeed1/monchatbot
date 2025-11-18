/**
 * FluxBuilder - Éditeur visuel de flux de conversation
 * Gestion complète des nœuds, connexions et tests
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
        this.flowsList = document.querySelector('.flows');
        this.flowSearch = document.querySelector('.flow-search');

        // Modal de test
        this.testModal = document.getElementById('testModal');
        this.testConversation = this.testModal?.querySelector('.test-conversation');
        this.testInput = this.testModal?.querySelector('.test-input input');
        this.testSendBtn = this.testModal?.querySelector('.test-input .btn');
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
        this.newFlowBtn.addEventListener('click', () => this.createNewFlow());
        this.saveFlowBtn.addEventListener('click', () => this.saveFlow());
        this.testFlowBtn.addEventListener('click', () => this.openTestModal());
        this.exportFlowBtn.addEventListener('click', () => this.exportFlow());
        this.importFlowBtn.addEventListener('click', () => this.importFlow());

        // Flow name
        this.flowNameInput.addEventListener('change', () => this.markAsChanged());

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

        // Pan avec molette (middle-click + drag)
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
     * Setup pan avec molette souris + zoom
     */
    setupCanvasPan() {
        let isPanning = false;
        let startX, startY, scrollLeft, scrollTop;
        let scale = 1;
        const minScale = 0.3;
        const maxScale = 2;

        // Pan avec molette maintenue (middle-click + drag)
        this.flowCanvas.addEventListener('mousedown', (e) => {
            // Middle click (button 1)
            if (e.button === 1) {
                e.preventDefault();
                isPanning = true;
                this.flowCanvas.classList.add('panning');

                startX = e.clientX;
                startY = e.clientY;
                scrollLeft = this.flowCanvas.scrollLeft;
                scrollTop = this.flowCanvas.scrollTop;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isPanning) return;

            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            this.flowCanvas.scrollLeft = scrollLeft - dx;
            this.flowCanvas.scrollTop = scrollTop - dy;
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 1) {
                isPanning = false;
                this.flowCanvas.classList.remove('panning');
            }
        });

        // Empêcher le menu contextuel sur middle-click
        this.flowCanvas.addEventListener('contextmenu', (e) => {
            if (e.button === 1 || isPanning) {
                e.preventDefault();
            }
        });

        // Zoom avec molette (scroll)
        this.flowCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));

            if (newScale !== scale) {
                scale = newScale;
                this.nodesContainer.style.transform = `scale(${scale})`;
                this.nodesContainer.style.transformOrigin = '0 0';

                // Mettre à jour toutes les connexions après zoom
                this.updateAllConnections();
            }
        }, { passive: false });

        // Stocker le scale pour utilisation ailleurs
        this.currentScale = () => scale;
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
            } else {
                await this.createNewFlow();
            }
        } catch (error) {
            console.error('Erreur loadFlows:', error);
            this.showError('Impossible de charger les flux');
        }
    }

    /**
     * Affiche la liste des flux dans la sidebar
     */
    renderFlowsList(flows) {
        if (!this.flowsList) return;

        this.flowsList.innerHTML = '';

        flows.forEach(flow => {
            const flowItem = document.createElement('div');
            flowItem.className = 'list-item flow-list-item';
            flowItem.dataset.flowId = flow.id;

            flowItem.innerHTML = `
                <div class="list-item-title">${flow.name}</div>
                <div class="list-item-subtitle">
                    Mis à jour: ${new Date(flow.updated_at).toLocaleDateString()}
                </div>
            `;

            flowItem.addEventListener('click', () => this.loadFlow(flow.id));

            this.flowsList.appendChild(flowItem);
        });
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

            // Rendre les nœuds
            flow.nodes.forEach(node => this.renderNode(node.id, node));

            // Rendre les connexions
            flow.connections.forEach(conn => this.renderConnection(conn.id, conn.source_id, conn.target_id));

            // Mettre à jour la sélection dans la liste
            document.querySelectorAll('.flow-list-item').forEach(item => {
                item.classList.toggle('active', item.dataset.flowId == flowId);
            });

            this.showSuccess('Flux chargé avec succès');
        } catch (error) {
            console.error('Erreur loadFlow:', error);
            this.showError('Impossible de charger le flux');
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
                    flow_data: {}
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

            this.showSuccess('Flux créé avec succès');
        } catch (error) {
            console.error('Erreur createNewFlow:', error);
            this.showError('Impossible de créer le flux');
        }
    }

    /**
     * Sauvegarde le flux actuel
     */
    async saveFlow() {
        if (!this.currentFlow) {
            this.showWarning('Aucun flux à sauvegarder');
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

            this.showSuccess('Flux sauvegardé avec succès');
        } catch (error) {
            console.error('Erreur saveFlow:', error);
            this.showError('Impossible de sauvegarder le flux');
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
            this.showWarning('Veuillez d\'abord créer ou charger un flux');
            return;
        }

        const nodeType = e.dataTransfer.getData('nodeType');
        if (!nodeType) return;

        const rect = this.flowCanvas.getBoundingClientRect();
        const position = {
            x: e.clientX - rect.left + this.flowCanvas.scrollLeft,
            y: e.clientY - rect.top + this.flowCanvas.scrollTop
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
            this.showSuccess('Nœud ajouté');
        } catch (error) {
            console.error('Erreur createNode:', error);
            this.showError('Impossible de créer le nœud');
        }
    }

    /**
     * Rendu d'un nœud dans le canvas
     */
    renderNode(id, nodeData) {
        console.log('renderNode appelé - ID:', id, 'Type:', nodeData.type);

        const nodeElement = document.createElement('div');
        nodeElement.className = `flow-node ${nodeData.type}-node fade-in`;
        nodeElement.dataset.nodeId = id;
        nodeElement.dataset.nodeType = nodeData.type;
        nodeElement.style.left = `${nodeData.position.x}px`;
        nodeElement.style.top = `${nodeData.position.y}px`;

        console.log('Nœud créé avec data-node-id:', nodeElement.dataset.nodeId);

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

        // Bouton suppression - récupérer l'ID depuis le DOM pour éviter problèmes de closure
        const deleteBtn = nodeElement.querySelector('.delete-node');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nodeId = nodeElement.dataset.nodeId;
            console.log('Suppression du nœud ID:', nodeId, 'Type:', nodeElement.dataset.nodeType);
            this.deleteNode(nodeId);
        });

        // Connexions
        const portOut = nodeElement.querySelector('.port-out');
        portOut.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startConnection(e, id);
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
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

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
        console.log('deleteNode appelé avec nodeId:', nodeId);

        // Vérifier que le nœud existe
        const nodeEl = this.nodesContainer.querySelector(`[data-node-id="${nodeId}"]`);
        if (!nodeEl) {
            console.error('Nœud introuvable dans le DOM:', nodeId);
            this.showError('Nœud introuvable');
            return;
        }

        console.log('Nœud trouvé:', nodeEl.dataset.nodeType, nodeEl.dataset.nodeId);

        try {
            const response = await fetch(`/flow/nodes/${nodeId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la suppression');
            }

            console.log('Suppression du nœud dans le DOM:', nodeId);

            // Supprimer l'élément du DOM
            nodeEl.remove();

            // Supprimer les connexions associées
            const connections = this.nodesContainer.querySelectorAll(`[data-source-id="${nodeId}"], [data-target-id="${nodeId}"]`);
            console.log('Connexions à supprimer:', connections.length);
            connections.forEach(el => el.remove());
        } catch (error) {
            console.error('Erreur deleteNode:', error);
            this.showError('Impossible de supprimer le nœud');
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
        svg.style.zIndex = '50';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#5a9eff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '5,5');
        svg.appendChild(path);

        this.nodesContainer.appendChild(svg);
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

        const sourcePort = sourceNode.querySelector('.port-out');
        const sourceRect = sourcePort.getBoundingClientRect();
        const canvasRect = this.flowCanvas.getBoundingClientRect();

        const x1 = sourceRect.left + sourceRect.width / 2 - canvasRect.left + this.flowCanvas.scrollLeft;
        const y1 = sourceRect.top + sourceRect.height / 2 - canvasRect.top + this.flowCanvas.scrollTop;
        const x2 = e.clientX - canvasRect.left + this.flowCanvas.scrollLeft;
        const y2 = e.clientY - canvasRect.top + this.flowCanvas.scrollTop;

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
            this.showSuccess('Connexion créée');
        } catch (error) {
            console.error('Erreur createConnection:', error);
            this.showError('Impossible de créer la connexion');
        }
    }

    /**
     * Rendu d'une connexion
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
        svg.style.pointerEvents = 'auto';
        svg.style.zIndex = '0';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#9ca3af');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);

        // Click pour afficher tooltip de suppression
        svg.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showConnectionTooltip(e, id, svg);
        });

        this.nodesContainer.insertBefore(svg, this.nodesContainer.firstChild);
        this.updateConnectionPath(svg);
    }

    /**
     * Met à jour le chemin d'une connexion (méthode robuste)
     */
    updateConnectionPath(connectionEl) {
        const sourceId = connectionEl.dataset.sourceId;
        const targetId = connectionEl.dataset.targetId;

        const sourceNode = this.nodesContainer.querySelector(`[data-node-id="${sourceId}"]`);
        const targetNode = this.nodesContainer.querySelector(`[data-node-id="${targetId}"]`);

        // Si un des nœuds n'existe plus, supprimer la connexion
        if (!sourceNode || !targetNode) {
            console.warn(`Connexion orpheline détectée: source=${sourceId}, target=${targetId}`);
            connectionEl.remove();
            return;
        }

        // Utiliser les positions directes des nœuds (plus fiable)
        const sourceLeft = parseFloat(sourceNode.style.left) || 0;
        const sourceTop = parseFloat(sourceNode.style.top) || 0;
        const sourceWidth = sourceNode.offsetWidth;
        const sourceHeight = sourceNode.offsetHeight;

        const targetLeft = parseFloat(targetNode.style.left) || 0;
        const targetTop = parseFloat(targetNode.style.top) || 0;
        const targetHeight = targetNode.offsetHeight;

        // Position du port de sortie (milieu droit du nœud source)
        const x1 = sourceLeft + sourceWidth;
        const y1 = sourceTop + sourceHeight / 2;

        // Position du port d'entrée (milieu gauche du nœud cible)
        const x2 = targetLeft;
        const y2 = targetTop + targetHeight / 2;

        const path = connectionEl.querySelector('path');
        if (path) {
            path.setAttribute('d', this.createBezierPath(x1, y1, x2, y2));
        }
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
        const connections = this.nodesContainer.querySelectorAll(
            `[data-source-id="${nodeId}"], [data-target-id="${nodeId}"]`
        );

        connections.forEach(conn => this.updateConnectionPath(conn));
    }

    /**
     * Met à jour TOUTES les connexions (utile après zoom)
     */
    updateAllConnections() {
        const connections = this.nodesContainer.querySelectorAll('.flow-connection');
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

            const connEl = this.nodesContainer.querySelector(`[data-connection-id="${connectionId}"]`);
            if (connEl) connEl.remove();
        } catch (error) {
            console.error('Erreur deleteConnection:', error);
            this.showError('Impossible de supprimer la connexion');
        }
    }

    /**
     * Affiche une tooltip pour supprimer une connexion
     */
    showConnectionTooltip(e, connectionId, connectionElement) {
        // Supprimer toute tooltip existante
        this.hideConnectionTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'connection-tooltip';
        tooltip.innerHTML = `
            <button class="btn-delete-tiny" data-action="delete" title="Supprimer">
                <i data-lucide="trash-2"></i>
            </button>
        `;

        // Positionner la tooltip au point de clic
        const canvasRect = this.flowCanvas.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - canvasRect.left + this.flowCanvas.scrollLeft}px`;
        tooltip.style.top = `${e.clientY - canvasRect.top + this.flowCanvas.scrollTop}px`;

        this.nodesContainer.appendChild(tooltip);
        this.currentTooltip = tooltip;

        // Rafraîchir les icônes
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bouton supprimer
        const deleteBtn = tooltip.querySelector('[data-action="delete"]');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteConnection(connectionId);
            this.hideConnectionTooltip();
        });

        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', this.hideConnectionTooltip.bind(this), { once: true });
        }, 100);
    }

    /**
     * Cache la tooltip de connexion
     */
    hideConnectionTooltip() {
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }

    /**
     * Sélectionne un nœud
     */
    selectNode(nodeElement) {
        this.deselectAll();

        nodeElement.classList.add('selected');
        this.selectedNode = nodeElement;

        // Afficher les propriétés
        this.showNodeProperties(nodeElement);
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

        this.testModal.classList.add('active');
        this.testConversation.innerHTML = '';
        this.testInput.value = '';
        this.testInput.focus();
    }

    /**
     * Ferme la modal de test
     */
    closeTestModal() {
        if (!this.testModal) return;
        this.testModal.classList.remove('active');
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
            botMsg.innerHTML = `<div class="test-message-content">Fonction de test en développement. Le flux sera exécuté prochainement.</div>`;
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
            this.showWarning('Aucun flux à exporter');
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

        this.showSuccess('Flux exporté');
    }

    /**
     * Importe un flux
     */
    importFlow() {
        this.showInfo('Fonction d\'import en développement');
    }

    /**
     * Sérialise les nœuds pour la sauvegarde
     */
    serializeNodes() {
        const nodes = [];
        this.nodesContainer.querySelectorAll('.flow-node').forEach(nodeEl => {
            nodes.push({
                id: nodeEl.dataset.nodeId,
                type: nodeEl.dataset.nodeType,
                position: {
                    x: parseFloat(nodeEl.style.left),
                    y: parseFloat(nodeEl.style.top)
                }
            });
        });
        return nodes;
    }

    /**
     * Sérialise les connexions pour la sauvegarde
     */
    serializeConnections() {
        const connections = [];
        this.nodesContainer.querySelectorAll('.flow-connection').forEach(connEl => {
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
        const items = this.flowsList.querySelectorAll('.flow-list-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const title = item.querySelector('.list-item-title').textContent.toLowerCase();
            item.style.display = title.includes(lowerQuery) ? 'block' : 'none';
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
     * Obtient la configuration par défaut pour un type de nœud
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
     * Obtient le contenu HTML d'un nœud
     */
    getNodeContent(nodeData) {
        switch (nodeData.type) {
            case 'message':
                return `<textarea class="form-control" placeholder="Message à envoyer...">${nodeData.config.message || ''}</textarea>`;
            case 'condition':
                return `
                    <div class="condition-editor">
                        <select class="form-control">
                            <option value="equals">Égal à</option>
                            <option value="contains">Contient</option>
                            <option value="regex">Expression régulière</option>
                        </select>
                        <input type="text" class="form-control" placeholder="Valeur...">
                    </div>`;
            case 'input':
                return `<input type="text" class="form-control" placeholder="Variable de stockage...">`;
            case 'action':
                return `<input type="text" class="form-control" placeholder="Type d'action...">`;
            case 'api':
                return `
                    <select class="form-control">
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                    </select>
                    <input type="text" class="form-control" placeholder="URL de l'API...">`;
            default:
                return '';
        }
    }

    /**
     * Obtient le label d'un type de nœud
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
     * Obtient l'icône d'un type de nœud
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
     * Affiche un message de succès
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        this.showNotification(message, 'danger');
    }

    /**
     * Affiche un avertissement
     */
    showWarning(message) {
        this.showNotification(message, 'warning');
    }

    /**
     * Affiche une information
     */
    showInfo(message) {
        this.showNotification(message, 'info');
    }

    /**
     * Affiche une notification
     */
    showNotification(message, type = 'info') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible`;
        alert.style.position = 'fixed';
        alert.style.top = '20px';
        alert.style.right = '20px';
        alert.style.zIndex = '10000';
        alert.style.minWidth = '250px';
        alert.style.animation = 'slideInRight 0.3s ease';

        alert.innerHTML = `
            ${message}
            <button class="alert-close">&times;</button>
        `;

        document.body.appendChild(alert);

        const closeBtn = alert.querySelector('.alert-close');
        closeBtn.addEventListener('click', () => {
            alert.remove();
        });

        // Auto-fermeture après 3 secondes
        setTimeout(() => {
            if (alert.parentElement) {
                alert.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => alert.remove(), 300);
            }
        }, 3000);
    }

    /**
     * Nettoyage à la destruction
     */
    destroy() {
        // Cleanup de la tooltip si elle existe
        this.hideConnectionTooltip();

        // Cleanup des event listeners si nécessaire
        console.log('FlowBuilder destroyed');
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.flowBuilder = new FlowBuilder();
});

// Animations CSS pour les notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
