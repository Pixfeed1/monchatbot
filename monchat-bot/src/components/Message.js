// src/components/Message.js - Version optimisée
import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export default function Message({ 
  sender, 
  text, 
  time, 
  isTemporary = false, 
  isError = false,
  isFastResponse = false,
  generationTime = null 
}) {
  const isUser = sender === 'Utilisateur';

// Sélection de la couleur de fond en fonction du type de message
  let backgroundColor = isUser ? '#1976d2' : '#e0e0e0';
  let textColor = isUser ? '#fff' : '#000';
  
  if (isTemporary) {
    backgroundColor = '#f0f0f0';
    textColor = '#666';
  } else if (isError) {
    backgroundColor = '#ffebee';
    textColor = '#d32f2f';
  } else if (isFastResponse) {
    backgroundColor = '#e3f2fd';
    textColor = '#0d47a1';
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        mb: 1,
        px: 1
      }}
    >
      <Box
        sx={{
          backgroundColor,
          color: textColor,
          padding: '8px 12px',
          borderRadius: '12px',
          maxWidth: '75%',
          boxShadow: 1,
          opacity: isTemporary ? 0.8 : 1,
          fontStyle: isTemporary ? 'italic' : 'normal',
        }}
      >
        <Typography 
          variant="body2" 
          sx={{ 
            lineHeight: 1.4,
            opacity: isTemporary ? 0.9 : 1
          }}
        >
          {text}
        </Typography>
      </Box>

      {/* Indicateurs spéciaux sous le message */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mt: 0.5,
          gap: 0.5,
          justifyContent: isUser ? 'flex-end' : 'flex-start'
        }}
      >
        {/* L'heure en petit texte */}
        <Typography 
          variant="caption" 
          sx={{ 
            color: isTemporary ? '#999' : '#666', 
            fontStyle: isTemporary ? 'italic' : 'normal'
          }}
        >
          {time}
        </Typography>
        
        {/* Indicateur de réponse rapide */}
        {isFastResponse && (
          <Chip
            icon={<FlashOnIcon fontSize="small" />}
            label="Rapide"
            size="small"
            sx={{ 
              height: 16, 
              fontSize: '0.6rem',
              backgroundColor: '#e3f2fd',
              color: '#0d47a1',
              '& .MuiChip-icon': { 
                fontSize: '0.7rem', 
                marginRight: '-2px',
                marginLeft: '2px'
              }
            }}
          />
        )}
        
        {/* Indicateur de temps de génération */}
        {generationTime && (
          <Chip
            icon={<SpeedIcon fontSize="small" />}
            label={`${generationTime.toFixed(1)}s`}
            size="small"
            sx={{ 
              height: 16, 
              fontSize: '0.6rem',
              backgroundColor: '#f1f8e9',
              color: '#33691e',
              '& .MuiChip-icon': { 
                fontSize: '0.7rem', 
                marginRight: '-2px',
                marginLeft: '2px'
              }
            }}
          />
        )}
        
        {/* Indicateur d'erreur */}
        {isError && (
          <Chip
            icon={<ErrorOutlineIcon fontSize="small" />}
            label="Erreur"
            size="small"
            sx={{ 
              height: 16, 
              fontSize: '0.6rem',
              backgroundColor: '#ffebee',
              color: '#d32f2f',
              '& .MuiChip-icon': { 
                fontSize: '0.7rem', 
                marginRight: '-2px',
                marginLeft: '2px'
              }
            }}
          />
        )}
      </Box>
    </Box>
  );
}