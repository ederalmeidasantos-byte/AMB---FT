import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', 'config.env') });

// Cache global de tokens V8 Digital
const globalTokenCache = {
  token: null,
  expiresAt: null,
  isRefreshing: false,
  refreshPromise: null
};

/**
 * Obter token válido da V8 Digital (com cache global)
 */
const getValidToken = async () => {
  // Verificar se já temos token válido no cache
  if (globalTokenCache.token && globalTokenCache.expiresAt && new Date() < globalTokenCache.expiresAt) {
    return globalTokenCache.token;
  }

  // Se já está renovando, aguardar o resultado
  if (globalTokenCache.isRefreshing && globalTokenCache.refreshPromise) {
    return await globalTokenCache.refreshPromise;
  }

  // Iniciar renovação do token
  globalTokenCache.isRefreshing = true;
  globalTokenCache.refreshPromise = renewToken();

  try {
    const token = await globalTokenCache.refreshPromise;
    return token;
  } finally {
    globalTokenCache.isRefreshing = false;
    globalTokenCache.refreshPromise = null;
  }
};

/**
 * Renovar token da V8 Digital
 */
const renewToken = async () => {
  try {
    console.log('🔄 Renovando token V8 Digital...');
    
    const authData = 'grant_type=password&username=' + 
      encodeURIComponent(process.env.V8_USERNAME) + 
      '&password=' + encodeURIComponent(process.env.V8_PASSWORD) + 
      '&audience=' + encodeURIComponent(process.env.V8_AUDIENCE) + 
      '&scope=offline_access&client_id=' + encodeURIComponent(process.env.V8_CLIENT_ID);

    const response = await axios.post(
      process.env.V8_AUTH_URL,
      authData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    const { access_token, expires_in } = response.data;

    // Salvar token no cache global
    globalTokenCache.token = access_token;
    globalTokenCache.expiresAt = new Date(Date.now() + (expires_in * 1000));

    console.log('✅ Token V8 Digital renovado com sucesso');
    return access_token;
  } catch (error) {
    console.error('❌ Erro ao renovar token V8 Digital:', error.response?.data || error.message);
    throw new Error('Falha na autenticação com V8 Digital');
  }
};

export {
  getValidToken,
  renewToken,
  globalTokenCache
};

