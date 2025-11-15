// src/components/ChatWidget.js
import React, { useState } from 'react';
import { Box, IconButton, Fade } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import ChatWindow from './ChatWindow';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Bouton flottant en bas à droite */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 2000,
        }}
      >
        {!isOpen && (
          <IconButton
            onClick={toggleChat}
            sx={{
              backgroundColor: '#1976d2',
              color: '#fff',
              '&:hover': {
                backgroundColor: '#115293',
              },
            }}
            size="large"
          >
            <ChatIcon />
          </IconButton>
        )}
      </Box>

      {/* Fenêtre de chat */}
      <Fade in={isOpen}>
        <div>
          {isOpen && <ChatWindow onClose={toggleChat} />}
        </div>
      </Fade>
    </>
  );
}
