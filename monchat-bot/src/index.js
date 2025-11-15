import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

const renderApp = (elementId) => {
  const root = document.getElementById(elementId);
  if (root) {
    ReactDOM.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
      root
    );
  }
};

// Pour le développement (npm start)
if (process.env.NODE_ENV === 'development') {
  renderApp('root');
}

// Pour l'intégration Flask
window.ReactChatApp = {
  onOpen: () => {
    renderApp('react-chat-root');
  }
};