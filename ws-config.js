/**
 * Configuración de WebSocket para el proyecto EEG
 * 
 * Para cambiar la URL del servidor WebSocket, solo modifica la variable WS_BASE_URL
 * 
 * El sistema automáticamente detecta:
 * - Desarrollo local (localhost) 
 * - Producción en Vercel
 * - URLs personalizadas de ngrok
 */

// ===== CONFIGURACIÓN PRINCIPAL =====
// Solo cambia esta URL cuando tengas un nuevo túnel de ngrok
const WS_BASE_URL = 'e174-179-6-164-31.ngrok-free.app ';

// ===== CONFIGURACIÓN AVANZADA (opcional) =====
const WS_ADVANCED_CONFIG = {
  // Puertos para desarrollo local
  localPorts: [8765, 8080, 3000],
  
  // Configuración de reintentos
  retryInterval: 3000,      // 3 segundos entre reintentos
  maxRetries: 10,           // máximo 10 reintentos
  heartbeatInterval: 30000, // ping cada 30 segundos
  
  // Headers adicionales para ngrok (evita warnings)
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
};

// ===== NO MODIFICAR DEBAJO DE ESTA LÍNEA =====

/**
 * Genera la URL completa del WebSocket basada en el entorno
 */
function getWebSocketURL() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Desarrollo local
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Intenta diferentes puertos comunes para desarrollo
    return 'ws://localhost:8765';
  }
  
  // Producción o desarrollo con ngrok
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${WS_BASE_URL}`;
}

/**
 * Crea una conexión WebSocket mejorada con reintentos automáticos
 */
function createEnhancedWebSocket(onMessage = null, onStatusChange = null) {
  let ws = null;
  let retryCount = 0;
  let retryTimeout = null;
  let heartbeatInterval = null;
  
  function connect() {
    try {
      ws = new WebSocket(getWebSocketURL());
      
      ws.addEventListener('open', () => {
        console.log('✅ WebSocket conectado:', getWebSocketURL());
        retryCount = 0;
        
        if (onStatusChange) onStatusChange('connected');
        
        // Configurar heartbeat para mantener viva la conexión
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, WS_ADVANCED_CONFIG.heartbeatInterval);
      });
      
      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'pong' && onMessage) {
            onMessage(data);
          }
        } catch (e) {
          console.warn('Mensaje WebSocket no JSON:', event.data);
          if (onMessage) onMessage(event.data);
        }
      });
      
      ws.addEventListener('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
      
      ws.addEventListener('close', (event) => {
        console.log('🔌 WebSocket cerrado:', event.code, event.reason);
        
        // Limpiar heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        
        if (onStatusChange) onStatusChange('disconnected');
        
        // Reintentar conexión si no fue cierre intencional
        if (event.code !== 1000 && retryCount < WS_ADVANCED_CONFIG.maxRetries) {
          retryCount++;
          console.log(`🔄 Reintentando conexión (${retryCount}/${WS_ADVANCED_CONFIG.maxRetries})...`);
          
          retryTimeout = setTimeout(() => {
            connect();
          }, WS_ADVANCED_CONFIG.retryInterval);
        } else if (retryCount >= WS_ADVANCED_CONFIG.maxRetries) {
          console.error('❌ Máximo número de reintentos alcanzado');
          if (onStatusChange) onStatusChange('failed');
        }
      });
      
    } catch (error) {
      console.error('❌ Error creando WebSocket:', error);
      if (onStatusChange) onStatusChange('error');
    }
  }
  
  // Iniciar conexión
  connect();
  
  // Retornar objeto con métodos de control
  return {
    send: (data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
        return true;
      }
      return false;
    },
    
    close: () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (ws) {
        ws.close(1000, 'Cierre intencional');
      }
    },
    
    getState: () => ws ? ws.readyState : WebSocket.CLOSED,
    
    isConnected: () => ws && ws.readyState === WebSocket.OPEN
  };
}

/**
 * Información de debug
 */
console.log('🔧 Configuración WebSocket EEG:', {
  baseURL: WS_BASE_URL,
  fullURL: getWebSocketURL(),
  environment: window.location.hostname,
  protocol: window.location.protocol,
  config: WS_ADVANCED_CONFIG
});

// Exportar configuración para uso global
window.WS_CONFIG = WS_ADVANCED_CONFIG;
window.getWebSocketURL = getWebSocketURL;
window.createEnhancedWebSocket = createEnhancedWebSocket;
