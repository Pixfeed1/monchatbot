class FlowBuilder {
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.currentFlow = null;
        this.selectedNode = null;
        this.isDrawingConnection = false;
        this.draggedNode = null;
    }

    initializeElements() {
        // Éléments principaux
        this.flowCanvas = document.querySelector('.flow-canvas');
        this.nodesContainer = document.getElementById('flowNodes');
        this.nodePalette = document.querySelector('.node-palette');
        this.propertiesPanel = document.querySelector('.node-properties');
        
        // Boutons et actions
        this.newFlowBtn = document.getElementById('newFlowBtn');
        this.saveFlowBtn = document.getElementById('saveFlowBtn');
        this.testFlowBtn = document.getElementById('testFlowBtn');
        this.flowNameInput = document.querySelector('.flow-name');
    }

    setupEventListeners() {
        // Gestion du drag & drop depuis la palette
        this.nodePalette.querySelectorAll('.node-item').forEach(item => {
            item.addEventListener('dragstart', (e) => this.handleDragStart(e));
        });

        // Gestion du canvas
        this.flowCanvas.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.flowCanvas.addEventListener('drop', (e) => this.handleDrop(e));
        this.flowCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Gestion des boutons
        this.newFlowBtn.addEventListener('click', () => this.createNewFlow());
        this.saveFlowBtn.addEventListener('click', () => this.saveFlow());
        this.testFlowBtn.addEventListener('click', () => this.testFlow());
    }

    handleDragStart(e) {
        e.dataTransfer.setData('nodeType', e.target.dataset.type);
        this.draggedNode = e.target;
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    async handleDrop(e) {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        const rect = this.flowCanvas.getBoundingClientRect();
        
        const position = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        await this.createNode(nodeType, position);
    }

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
                },
                body: JSON.stringify(nodeData)
            });

            const data = await response.json();
            if (data.id) {
                this.renderNode(data.id, nodeData);
            }
        } catch (error) {
            console.error('Erreur lors de la création du nœud:', error);
        }
    }

    renderNode(id, nodeData) {
        const nodeElement = document.createElement('div');
        nodeElement.className = `flow-node ${nodeData.type}-node`;
        nodeElement.dataset.nodeId = id;
        nodeElement.dataset.nodeType = nodeData.type;
        nodeElement.style.left = `${nodeData.position.x}px`;
        nodeElement.style.top = `${nodeData.position.y}px`;

        nodeElement.innerHTML = `
            <div class="node-header">
                <span class="node-type">${this.getNodeTypeLabel(nodeData.type)}</span>
                <div class="node-actions">
                    <button class="btn-icon edit-node">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete-node">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="node-content">
                ${this.getNodeContent(nodeData)}
            </div>
            <div class="node-ports">
                <div class="port port-in"></div>
                <div class="port port-out"></div>
            </div>
        `;

        // Gestion du drag & drop du nœud
        nodeElement.draggable = true;
        nodeElement.addEventListener('dragstart', (e) => this.handleNodeDragStart(e, id));
        nodeElement.addEventListener('dragend', (e) => this.handleNodeDragEnd(e, id));

        // Gestion des connexions
        const portOut = nodeElement.querySelector('.port-out');
        portOut.addEventListener('mousedown', (e) => this.startConnection(e, id));

        this.nodesContainer.appendChild(nodeElement);
    }

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

    getNodeContent(nodeData) {
        switch (nodeData.type) {
            case 'message':
                return `<textarea placeholder="Message à envoyer...">${nodeData.config.message || ''}</textarea>`;
            case 'condition':
                return `<div class="condition-editor">
                    <select>
                        <option value="equals">Égal à</option>
                        <option value="contains">Contient</option>
                        <option value="regex">Expression régulière</option>
                    </select>
                    <input type="text" placeholder="Valeur...">
                </div>`;
            case 'input':
                return `<input type="text" placeholder="Variable de stockage...">`;
            default:
                return '';
        }
    }

    startConnection(e, sourceId) {
        this.isDrawingConnection = true;
        this.sourceNodeId = sourceId;
        this.drawConnection(e);

        document.addEventListener('mousemove', this.drawConnection.bind(this));
        document.addEventListener('mouseup', this.finishConnection.bind(this));
    }

    drawConnection(e) {
        // Logique de dessin de la connexion
    }

    finishConnection(e) {
        if (!this.isDrawingConnection) return;

        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetPort = targetElement?.closest('.port-in');
        
        if (targetPort) {
            const targetNode = targetPort.closest('.flow-node');
            if (targetNode) {
                this.createConnection(this.sourceNodeId, targetNode.dataset.nodeId);
            }
        }

        this.isDrawingConnection = false;
        document.removeEventListener('mousemove', this.drawConnection);
        document.removeEventListener('mouseup', this.finishConnection);
    }

    async createConnection(sourceId, targetId) {
        try {
            const response = await fetch(`/flow/nodes/${sourceId}/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    target_id: targetId
                })
            });

            const data = await response.json();
            if (data.id) {
                this.renderConnection(data.id, sourceId, targetId);
            }
        } catch (error) {
            console.error('Erreur lors de la création de la connexion:', error);
        }
    }

    renderConnection(id, sourceId, targetId) {
        // Création de l'élément SVG pour la connexion
        const connection = document.createElement('div');
        connection.className = 'flow-connection';
        connection.dataset.connectionId = id;
        connection.dataset.sourceId = sourceId;
        connection.dataset.targetId = targetId;

        this.updateConnectionPath(connection);
        this.nodesContainer.appendChild(connection);
    }

    updateConnectionPath(connection) {
        // Mise à jour du chemin de la connexion
    }

    async saveFlow() {
        if (!this.currentFlow) return;

        const flowData = {
            name: this.flowNameInput.value,
            nodes: this.serializeNodes(),
            connections: this.serializeConnections()
        };

        try {
            const response = await fetch(`/flow/${this.currentFlow.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(flowData)
            });

            if (response.ok) {
                this.showSuccess('Flux enregistré avec succès');
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            this.showError('Erreur lors de la sauvegarde du flux');
        }
    }

    testFlow() {
        // Implémenter la logique de test
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.flowBuilder = new FlowBuilder();
});