/**
 * Sistema de Configuração Isolada por Porta
 * Cada porta tem sua própria configuração completamente isolada
 */

const path = require('path');
const fs = require('fs');

/**
 * Obter caminho do arquivo de configuração baseado na porta
 * @param {number} port - Porta do servidor
 * @returns {string} Caminho do arquivo de configuração
 */
function getConfigPath(port) {
  const configFileName = `config-${port}.env`;
  const configPath = path.join(__dirname, '..', 'config', configFileName);
  
  // Se o arquivo específico da porta não existir, criar um template
  if (!fs.existsSync(configPath)) {
    console.warn(`⚠️ Arquivo de configuração ${configFileName} não encontrado. Criando template...`);
    createConfigTemplate(port, configPath);
  }
  
  return configPath;
}

/**
 * Criar template de configuração para uma porta
 */
function createConfigTemplate(port, configPath) {
  const template = `# V8 Digital API - Porta ${port}
V8_API_URL=https://api.v8digital.com
V8_CLIENT_ID=DHWogdaYmEI8n5bwwxPDzulMlSK7dwIn
V8_AUDIENCE=https://bff.v8sistema.com
V8_USERNAME=seu_email@dominio.com
V8_PASSWORD=sua_senha

# Kentro API
KENTRO_API_URL=https://lunasdigital.atenderbem.com/int
KENTRO_TOKEN=seu_token_kentro_aqui
KENTRO_API_KEY=cd4d0509169d4e2ea9177ac66c1c9376
KENTRO_QUEUE_ID=25

# Servidor
PORT=${port}
NODE_ENV=production

# Logs
LOG_LEVEL=info
LOG_FILE=logs/app-${port}.log
`;
  
  // Criar diretório se não existir
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, template, 'utf8');
  console.log(`✅ Template de configuração criado: ${configPath}`);
}

/**
 * Carregar configuração para uma porta específica
 * @param {number} port - Porta do servidor
 */
function loadConfigForPort(port) {
  const configPath = getConfigPath(port);
  require('dotenv').config({ path: configPath });
  console.log(`📋 Configuração carregada para porta ${port}: ${configPath}`);
  return configPath;
}

/**
 * Obter valor de uma variável de ambiente do arquivo de configuração da porta
 * @param {number} port - Porta do servidor
 * @param {string} key - Nome da variável
 * @returns {string|null} Valor da variável ou null se não encontrada
 */
function getConfigValue(port, key) {
  const configPath = getConfigPath(port);
  
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  const match = configContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  
  if (match) {
    return match[1].trim().replace(/^["']|["']$/g, ''); // Remove aspas se houver
  }
  
  return null;
}

/**
 * Atualizar valor de uma variável no arquivo de configuração da porta
 * @param {number} port - Porta do servidor
 * @param {string} key - Nome da variável
 * @param {string} value - Novo valor
 */
function setConfigValue(port, key, value) {
  const configPath = getConfigPath(port);
  let configContent = '';
  
  if (fs.existsSync(configPath)) {
    configContent = fs.readFileSync(configPath, 'utf8');
  }
  
  // Atualizar ou adicionar variável
  if (configContent.includes(`${key}=`)) {
    configContent = configContent.replace(
      new RegExp(`^${key}=.*$`, 'm'),
      `${key}=${value}`
    );
  } else {
    configContent += `\n${key}=${value}`;
  }
  
  fs.writeFileSync(configPath, configContent, 'utf8');
  console.log(`✅ Configuração atualizada: ${key} na porta ${port}`);
}

module.exports = {
  getConfigPath,
  loadConfigForPort,
  getConfigValue,
  setConfigValue,
  createConfigTemplate
};
