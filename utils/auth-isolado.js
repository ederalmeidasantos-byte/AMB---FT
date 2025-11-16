/**
 * Sistema de Autenticação V8 Isolado por Porta
 * Cada porta tem seu próprio cache de tokens completamente isolado
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Cache isolado por porta
const portCaches = {};

/**
 * Obter ou criar cache para uma porta específica
 */
function getCacheForPort(port) {
  if (!portCaches[port]) {
    portCaches[port] = {
      token: null,
      expiresAt: null,
      isRefreshing: false,
      refreshPromise: null
    };
  }
  return portCaches[port];
}

/**
 * Carregar configuração para uma porta específica
 */
function loadConfigForPort(port) {
  const configPath = path.join(__dirname, '..', 'config', `config-${port}.env`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Arquivo de configuração não encontrado para porta ${port}: ${configPath}`);
  }
  
  // Carregar variáveis de ambiente do arquivo específico
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = {};
  
  configContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        config[key.trim()] = value;
      }
    }
  });
  
  return config;
}

/**
 * Obter token válido da V8 Digital para uma porta específica
 */
async function getValidToken(port) {
  const cache = getCacheForPort(port);
  
  // Verificar se já temos token válido no cache
  if (cache.token && cache.expiresAt && new Date() < new Date(cache.expiresAt)) {
    console.log(`✅ [Porta ${port}] Token V8 válido encontrado no cache`);
    return cache.token;
  }

  // Se já está renovando, aguardar o resultado
  if (cache.isRefreshing && cache.refreshPromise) {
    console.log(`⏳ [Porta ${port}] Token sendo renovado, aguardando...`);
    return await cache.refreshPromise;
  }

  // Iniciar renovação do token
  cache.isRefreshing = true;
  cache.refreshPromise = renewToken(port);

  try {
    const token = await cache.refreshPromise;
    return token;
  } finally {
    cache.isRefreshing = false;
    cache.refreshPromise = null;
  }
}

/**
 * Renovar token da V8 Digital para uma porta específica
 */
async function renewToken(port) {
  try {
    console.log(`🔄 [Porta ${port}] Renovando token V8 Digital...`);
    
    // Carregar configuração específica da porta
    const config = loadConfigForPort(port);
    
    if (!config.V8_USERNAME || !config.V8_PASSWORD) {
      throw new Error(`Credenciais V8 não configuradas para porta ${port}`);
    }
    
    const authData = 'grant_type=password&username=' + 
      encodeURIComponent(config.V8_USERNAME) + 
      '&password=' + encodeURIComponent(config.V8_PASSWORD) + 
      '&audience=' + encodeURIComponent(config.V8_AUDIENCE || 'https://bff.v8sistema.com') + 
      '&scope=offline_access&client_id=' + encodeURIComponent(config.V8_CLIENT_ID || 'DHWogdaYmEI8n5bwwxPDzulMlSK7dwIn');

    const response = await axios.post(
      config.V8_AUTH_URL || 'https://auth.v8sistema.com/oauth/token',
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

    // Salvar token no cache isolado da porta
    const cache = getCacheForPort(port);
    cache.token = access_token;
    cache.expiresAt = new Date(Date.now() + (expires_in * 1000));

    console.log(`✅ [Porta ${port}] Token V8 Digital renovado com sucesso`);
    return access_token;
  } catch (error) {
    console.error(`❌ [Porta ${port}] Erro ao renovar token V8 Digital:`, error.response?.data || error.message);
    throw new Error(`Falha na autenticação com V8 Digital (porta ${port})`);
  }
}

/**
 * Limpar cache de uma porta específica
 */
function clearCacheForPort(port) {
  if (portCaches[port]) {
    portCaches[port].token = null;
    portCaches[port].expiresAt = null;
    portCaches[port].isRefreshing = false;
    portCaches[port].refreshPromise = null;
    console.log(`🗑️ [Porta ${port}] Cache de token limpo`);
  }
}

module.exports = {
  getValidToken,
  renewToken,
  clearCacheForPort,
  getCacheForPort
};
