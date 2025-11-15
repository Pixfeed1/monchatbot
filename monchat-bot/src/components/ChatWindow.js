// src/components/ChatWindow.js - Version optimisée
import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Paper,
  Box,
  List,
  TextField,
  Avatar,
  CircularProgress,
  Tooltip,
  IconButton,
  LinearProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmojiPicker from 'emoji-picker-react';
import axios from 'axios';
import Message from './Message';

// Configuration d'Axios pour CSRF
axios.defaults.withCredentials = true;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Intercepteur pour ajouter le token CSRF à chaque requête
axios.interceptors.request.use(config => {
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (token) {
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// Clé pour le stockage des messages dans localStorage
const STORAGE_KEY = 'chatbot_conversation_history';

export default function ChatWindow({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [botName, setBotName] = useState('Monchat-bot');
  const [botAvatar, setBotAvatar] = useState('');
  const [botWelcome, setBotWelcome] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // États pour la gestion asynchrone améliorée
  const [requestId, setRequestId] = useState(null);
  const [messageStatus, setMessageStatus] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [suggestRetry, setSuggestRetry] = useState(false);
  const [messageComplexity, setMessageComplexity] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [queuePosition, setQueuePosition] = useState(0);
  
  // Références pour gestion du timing et des événements
  const pollIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // Références DOM
  const messagesEndRef = useRef(null);
  const chatRef = useRef(null);

  // Chargement des paramètres du bot et récupération des messages enregistrés dans localStorage
  useEffect(() => {
    axios.get('/api/get_general_settings')
      .then((res) => {
        setBotName(res.data.bot_name || 'Monchat-bot');
        setBotAvatar(res.data.bot_avatar || '');
        setBotWelcome(res.data.bot_welcome || 'Bienvenue! Je suis votre assistant.');
      })
      .catch((error) => {
        console.error('Erreur lors du chargement des paramètres:', error);
      });
    
    // Charger les messages depuis localStorage
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        setMessages(parsedMessages);
      } catch (error) {
        console.error('Erreur lors du chargement des messages depuis localStorage:', error);
        // En cas d'erreur, supprimer les données corrompues
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Sauvegarder les messages dans localStorage à chaque mise à jour
  useEffect(() => {
    // Ne sauvegarder que si nous avons des messages et aucun n'est temporaire
    const messagesToSave = messages.filter(msg => !msg.isTemporary);
    if (messagesToSave.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToSave));
    }
  }, [messages]);

  // Scroll automatique vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fermeture de la fenêtre lors d'un clic à l'extérieur
  useEffect(() => {
    function handleClickOutside(e) {
      if (chatRef.current && !chatRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Nettoyage des ressources à la sortie
  useEffect(() => {
    return () => {
      // Nettoyer le polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      
      // Fermer les événements de streaming
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Fonction pour utiliser le streaming avec EventSource
  const startEventStream = (reqId) => {
    // Arrêter le polling s'il est en cours
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    try {
      // Créer une connexion EventSource pour le streaming
      const eventSource = new EventSource(`/api/stream/${reqId}`);
      
      // Stocker la référence pour pouvoir la fermer plus tard
      eventSourceRef.current = eventSource;
      
      // Gestionnaire pour les événements de mise à jour de statut
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Mettre à jour le statut
          setMessageStatus(data.status);
          
          // Mettre à jour le temps écoulé
          if (data.elapsed_time) {
            setElapsedTime(data.elapsed_time);
          }
          
          // Mettre à jour le pourcentage de progression
          if (data.progress_percent) {
            setProgressPercent(data.progress_percent);
          }
          
          // Mettre à jour la position dans la file
          if (data.queue_position !== undefined) {
            setQueuePosition(data.queue_position);
          }
          
          // Suggérer de réessayer si nécessaire
          if (data.suggest_retry) {
            setSuggestRetry(true);
          }
          
          // Message de progression personnalisé
          if (data.progress_message) {
            updateTemporaryMessage(data.progress_message);
          }
          
          // Si terminé ou erreur
          if (data.status === 'completed') {
            handleCompletedResponse(data);
          } else if (data.status === 'error') {
            handleErrorStreamResponse(data);
          } else if (data.status === 'stream_ended') {
            // Fermer la connexion
            eventSource.close();
            eventSourceRef.current = null;
          }
        } catch (error) {
          console.error('Erreur lors du traitement des données de streaming:', error);
        }
      };
      
      // Gestion des erreurs de streaming
      eventSource.onerror = (error) => {
        console.error('Erreur de streaming:', error);
        eventSource.close();
        eventSourceRef.current = null;
        
        // Fallback vers le polling si le streaming échoue
        startPolling(reqId);
      };
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du streaming:', error);
      // Fallback vers le polling en cas d'erreur
      startPolling(reqId);
    }
  };

  // Mettre à jour seulement le message temporaire
  const updateTemporaryMessage = (text) => {
    const temporaryTime = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Remplacer le message temporaire existant ou ajouter un nouveau
    setMessages(prev => {
      const filtered = prev.filter(msg => !msg.isTemporary);
      return [...filtered, {
        sender: 'Bot',
        text,
        time: temporaryTime,
        isTemporary: true
      }];
    });
  };

  // Gérer une réponse terminée
  const handleCompletedResponse = (data) => {
    // Nettoyer les ressources
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    const botTime = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Supprimer tout message temporaire existant
    setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
      sender: 'Bot',
      text: data.message || data.result || 'Aucune réponse reçue',
      time: botTime,
      generationTime: data.generation_time
    }]);
    
    // Réinitialiser les états
    setIsLoading(false);
    setMessageStatus('completed');
    setSuggestRetry(false);
    setProgressPercent(100);
    setQueuePosition(0);
  };

  // Gérer une erreur de streaming
  const handleErrorStreamResponse = (data) => {
    // Nettoyer les ressources
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    const errorTime = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Supprimer tout message temporaire existant
    setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
      sender: 'Bot',
      text: data.message || `Erreur: ${data.error || 'Une erreur est survenue'}`,
      time: errorTime,
      isError: true
    }]);
    
    // Réinitialiser les états
    setIsLoading(false);
    setMessageStatus('error');
    setSuggestRetry(false);
  };

  // Fonction pour envoyer un message avec gestion asynchrone améliorée
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const timeNow = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const userMessage = { 
      sender: 'Utilisateur', 
      text: input.trim(), 
      time: timeNow 
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setMessageStatus('pending');
    setSuggestRetry(false);
    setProgressPercent(0);
    setQueuePosition(0);
    startTimeRef.current = Date.now();
    setElapsedTime(0);

    try {
      // Récupération explicite du token CSRF
      const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      // Envoi de la requête asynchrone
      const response = await axios.post(
        '/api/message', 
        { message: userMessage.text },
        {
          headers: {
            'X-CSRF-Token': token,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Gestion de la réponse selon son format
      if (response.data.request_id) {
        // Réponse asynchrone avec ID de requête
        setRequestId(response.data.request_id);
        
        // Nouvelles informations disponibles dans la réponse optimisée
        if (response.data.complexity !== undefined) {
          setMessageComplexity(response.data.complexity);
        }
        
        if (response.data.estimated_time) {
          setEstimatedTime(response.data.estimated_time);
        }
        
        // Utiliser SSE si disponible, sinon fallback vers polling
        if (window.EventSource && response.data.stream_url) {
          startEventStream(response.data.request_id);
        } else {
          startPolling(response.data.request_id);
        }
        
        setMessageStatus('waiting');
        
        // Afficher un message temporaire de début
        const botTime = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        setMessages(prev => [...prev, {
          sender: 'Bot',
          text: response.data.message || "Votre demande est en cours de traitement...",
          time: botTime,
          isTemporary: true
        }]);
      } else if (response.data.message) {
        // Réponse synchrone immédiate (probablement une réponse rapide)
        const botTime = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        setMessages(prev => [...prev, {
          sender: 'Bot',
          text: response.data.message,
          time: botTime,
          isFastResponse: !!response.data.fast_response
        }]);
        
        setIsLoading(false);
      } else {
        throw new Error('Format de réponse non reconnu');
      }
    } catch (error) {
      console.error('Erreur détaillée:', error.response?.data || error);
      handleErrorResponse(error);
    }
  };

  // Fonction pour démarrer le polling du statut (version améliorée)
  const startPolling = (reqId) => {
    // Nettoyer tout intervalle existant
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    // Variables pour la gestion adaptative du polling
    let pollingInterval = 1000; // Commencer à 1s
    
    // Démarrer un nouvel intervalle de polling
    pollIntervalRef.current = setInterval(() => {
      // Mise à jour du temps écoulé
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      
      // Vérifier le statut
      checkStatus(reqId);
      
      // Augmenter progressivement l'intervalle si ça prend du temps
      if (elapsedTime > 10) {
        pollingInterval = 2000; // 2s après 10s
      }
      
      if (elapsedTime > 30) {
        pollingInterval = 3000; // 3s après 30s
      }
      
      // Arrêt automatique après 2 minutes
      if (elapsedTime > 120) {
        clearInterval(pollIntervalRef.current);
        setIsLoading(false);
        setMessageStatus('error');
        
        // Supprimer les messages temporaires
        const errorTime = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
          sender: 'Bot',
          text: 'La génération a pris trop de temps. Essayez de poser une question plus simple ou réessayez plus tard.',
          time: errorTime,
          isError: true
        }]);
      }
    }, pollingInterval);
  };

  // Fonction pour vérifier le statut d'une requête (version améliorée)
  const checkStatus = async (reqId) => {
    try {
      const response = await axios.get(`/api/status/${reqId}`);
      
      // Mettre à jour le statut
      setMessageStatus(response.data.status);
      
      // Mettre à jour le temps écoulé si présent
      if (response.data.elapsed_time) {
        setElapsedTime(response.data.elapsed_time);
      }
      
      // Mettre à jour le pourcentage de progression
      if (response.data.progress_percent) {
        setProgressPercent(response.data.progress_percent);
      } else if (response.data.status === 'completed') {
        setProgressPercent(100);
      }
      
      // Mettre à jour la position dans la file
      if (response.data.queue_position !== undefined) {
        setQueuePosition(response.data.queue_position);
      }
      
      // Mettre à jour la suggestion de réessayer
      if (response.data.suggest_retry) {
        setSuggestRetry(true);
      }
      
      // Si c'est terminé
      if (response.data.status === 'completed') {
        clearInterval(pollIntervalRef.current);
        
        const botTime = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        // Supprimer tout message temporaire existant
        setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
          sender: 'Bot',
          text: response.data.message || response.data.result || 'Aucune réponse reçue',
          time: botTime,
          generationTime: response.data.generation_time
        }]);
        
        setIsLoading(false);
        setSuggestRetry(false);
      } 
      // Si erreur
      else if (response.data.status === 'error') {
        clearInterval(pollIntervalRef.current);
        
        const errorTime = new Date().toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        // Supprimer tout message temporaire existant
        setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
          sender: 'Bot',
          text: response.data.message || `Erreur: ${response.data.error || 'Une erreur est survenue'}`,
          time: errorTime,
          isError: true
        }]);
        
        setIsLoading(false);
        setMessageStatus('error');
        setSuggestRetry(false);
      }
      // Si message de progression personnalisé
      else if (response.data.progress_message) {
        updateTemporaryMessage(response.data.progress_message);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du statut:', error);
      
      // En cas d'erreur 404, on arrête le polling
      if (error.response && error.response.status === 404) {
        clearInterval(pollIntervalRef.current);
        handleErrorResponse(error);
      }
    }
  };

  // Annuler la requête en cours et réinitialiser
  const cancelRequest = () => {
    // Nettoyer les ressources de streaming
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Nettoyer le polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    setIsLoading(false);
    setMessageStatus(null);
    setSuggestRetry(false);
    setRequestId(null);
    setProgressPercent(0);
    setQueuePosition(0);
    
    // Supprimer les messages temporaires
    setMessages(prev => prev.filter(msg => !msg.isTemporary));
  };

  // Effacer l'historique des conversations
  const clearConversation = () => {
    if (isLoading) {
      cancelRequest();
    }
    
    // Effacer les messages de l'état
    setMessages([]);
    
    // Effacer les messages de localStorage
    localStorage.removeItem(STORAGE_KEY);
  };

  // Fonction pour gérer les erreurs
  const handleErrorResponse = (error) => {
    const errorTime = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Supprimer tout message temporaire existant
    setMessages(prev => [...prev.filter(msg => !msg.isTemporary), {
      sender: 'Bot',
      text: error.response?.data?.message || error.response?.data?.error || 
            'Désolé, je rencontre des difficultés techniques...',
      time: errorTime,
      isError: true
    }]);
    
    setIsLoading(false);
    setMessageStatus('error');
    setSuggestRetry(false);
  };

  // Gestion de l'appui sur la touche Entrée
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Gestion des emojis
  const handleEmojiClick = (emojiData) => {
    setInput(prev => prev + (emojiData.emoji || ''));
  };

  // Obtention du message de statut amélioré
  const getStatusMessage = () => {
    switch (messageStatus) {
      case 'pending':
        return `Envoi de votre message... (${elapsedTime}s)`;
      case 'waiting':
        return queuePosition > 0 
          ? `Dans la file d'attente... Position: ${queuePosition} (${elapsedTime}s)` 
          : `Dans la file d'attente... (${elapsedTime}s)`;
      case 'processing':
        return progressPercent > 0 
          ? `Génération en cours... ${progressPercent}% (${elapsedTime}s)` 
          : `Génération en cours... (${elapsedTime}s)`;
      case 'completed':
        return 'Réponse générée';
      case 'error':
        return 'Une erreur est survenue';
      default:
        return isLoading ? 'En attente...' : '';
    }
  };

  return (
    <Paper
      ref={chatRef}
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 4,
        borderRadius: 2,
        overflow: 'hidden',
        zIndex: 1300,
        backgroundColor: '#fff'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: '1px solid #ddd',
          backgroundColor: '#f5f5f5'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Avatar
            alt={botName}
            src={botAvatar}
            sx={{ width: 32, height: 32, mr: 1 }}
          >
            {(!botAvatar && botName) ? botName.charAt(0).toUpperCase() : ''}
          </Avatar>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {botName}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <CloseIcon
            onClick={onClose}
            sx={{
              color: '#666',
              cursor: 'pointer',
              '&:hover': {
                color: '#000'
              }
            }}
          />
        </Box>
      </Box>

      {!messages.length && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 2,
            borderBottom: '1px solid #ddd'
          }}
        >
          <Avatar
            alt={botName}
            src={botAvatar}
            sx={{ width: 64, height: 64, mb: 1 }}
          >
            {(!botAvatar && botName) ? botName.charAt(0).toUpperCase() : ''}
          </Avatar>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {botName}
          </Typography>
          <Box
            sx={{
              mt: 1,
              p: 1,
              borderRadius: 1,
              backgroundColor: '#f0f0f0',
              textAlign: 'center'
            }}
          >
            <Typography variant="body2" sx={{ color: '#333' }}>
              {botWelcome}
            </Typography>
          </Box>
        </Box>
      )}

      <Box
        sx={{
          flexGrow: 1,
          p: 1,
          backgroundColor: '#fff',
          overflowY: 'auto',
          maxHeight: 400
        }}
      >
        <List sx={{ py: 0 }}>
          {messages.map((m, i) => (
            <Message 
              key={i} 
              sender={m.sender} 
              text={m.text} 
              time={m.time} 
              isTemporary={m.isTemporary}
              isError={m.isError}
              isFastResponse={m.isFastResponse}
              generationTime={m.generationTime}
            />
          ))}
          <div ref={messagesEndRef} />
        </List>
      </Box>

      {showEmojiPicker && (
        <Box sx={{ px: 1 }}>
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            locale="fr"
            searchPlaceHolder="Rechercher..."
          />
        </Box>
      )}

      {/* Barre de progression visuelle */}
      {isLoading && messageStatus === 'processing' && progressPercent > 0 && (
        <LinearProgress 
          variant="determinate" 
          value={progressPercent} 
          sx={{ 
            height: 2,
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#1976d2'
            }
          }}
        />
      )}

      {/* Affichage du statut avec indicateur visuel amélioré */}
      {isLoading && (
        <Box 
          sx={{ 
            px: 1, 
            py: 0.5,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 1
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="caption" sx={{ color: '#666' }}>
            {getStatusMessage()}
          </Typography>
          
          {/* Bouton d'annulation */}
          <Tooltip title="Annuler la génération">
            <IconButton 
              size="small" 
              onClick={cancelRequest}
              sx={{ ml: 1, p: 0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          
          {/* Bouton pour réessayer (visible après un certain temps) */}
          {suggestRetry && (
            <Tooltip title="Réessayer avec une requête plus simple">
              <IconButton 
                size="small" 
                onClick={() => {
                  cancelRequest();
                  setInput('');
                }}
                color="primary"
                sx={{ ml: 0, p: 0.5 }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      <Box
        sx={{
          borderTop: '1px solid #ddd',
          p: 1,
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <TextField
          variant="outlined"
          size="small"
          placeholder={isLoading ? "En attente de réponse..." : "Tapez votre message..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          fullWidth
          sx={{
            mr: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '15px',
              backgroundColor: '#f5f5f5'
            }
          }}
          InputProps={{
            endAdornment: (
              <InsertEmoticonIcon
                onClick={() => setShowEmojiPicker(prev => !prev)}
                style={{ 
                  color: isLoading ? '#ccc' : '#1976d2', 
                  cursor: isLoading ? 'default' : 'pointer' 
                }}
              />
            )
          }}
        />
        <SendIcon
          onClick={sendMessage}
          style={{
            color: isLoading || !input.trim() ? '#ccc' : '#1976d2',
            cursor: isLoading || !input.trim() ? 'default' : 'pointer',
            fontSize: '28px'
          }}
        />
      </Box>
    </Paper>
  );
}