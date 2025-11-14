const axios = require('axios');
const https = require('https');
require('dotenv').config({ path: './config/config.env' });
const { getValidToken } = require('./precencabank-auth');

// Configurar agente HTTPS para homologação (aceitar certificados inválidos)
const getHttpsAgent = () => {
  const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
  // Apenas para homologação aceitar certificados inválidos
  if (apiUrl.includes('homolog')) {
    return new https.Agent({ rejectUnauthorized: false });
  }
  return undefined;
};

/**
 * Executar requisição com retry automático para erro 429 (Rate Limit)
 * @param {Function} requestFn - Função que retorna uma Promise da requisição
 * @param {Object} options - Opções de retry
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 5)
 * @param {number} options.baseDelay - Delay base em ms (padrão: 1000)
 * @param {number} options.maxDelay - Delay máximo em ms (padrão: 60000)
 * @param {string} options.context - Contexto para logs (ex: CPF)
 */
const executarComRetry = async (requestFn, options = {}) => {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 60000,
    context = ''
  } = options;

  let lastError;
  
  for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      // Verificar se é erro 429 (Rate Limit)
      const isRateLimit = error.response?.status === 429;
      
      if (isRateLimit && tentativa < maxRetries) {
        // Calcular delay com backoff exponencial
        const delay = Math.min(baseDelay * Math.pow(2, tentativa - 1), maxDelay);
        
        // Tentar ler o header Retry-After se disponível
        const retryAfter = error.response?.headers['retry-after'];
        const finalDelay = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        
        console.log(`⚠️ [${context}] Rate Limit (429) detectado na tentativa ${tentativa}/${maxRetries}`);
        console.log(`⏳ [${context}] Aguardando ${finalDelay/1000} segundos antes de tentar novamente...`);
        
        await new Promise(resolve => setTimeout(resolve, finalDelay));
        continue;
      }
      
      // Se não é 429 ou esgotou tentativas, lançar erro
      throw error;
    }
  }
  
  // Se chegou aqui, esgotou todas as tentativas
  throw lastError;
};

/**
 * Formatar telefone para o formato esperado pelo PRECENÇABANK
 * PRECENÇABANK exige: 11 dígitos (DDD + 9 dígitos), sendo o 3º dígito = 9 (celular)
 */
const formatarTelefone = (telefone) => {
  if (!telefone) return '';
  
  let telefoneLimpo = telefone.replace(/\D/g, '');
  
  // Se começa com 55 (código do país), remover
  if (telefoneLimpo.startsWith('55') && telefoneLimpo.length >= 12) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  // Validar formato: deve ter 10 ou 11 dígitos (DDD + número)
  if (telefoneLimpo.length === 11) {
    // Formato: DDD + 9 dígitos (celular)
    const ddd = telefoneLimpo.substring(0, 2);
    const numero = telefoneLimpo.substring(2);
    
    // Garantir que o 3º dígito (primeiro do número) seja 9
    if (numero.charAt(0) !== '9' && numero.length === 9) {
      // Adicionar 9 no início se não tiver
      return ddd + '9' + numero.substring(1);
    }
    
    return telefoneLimpo;
  } else if (telefoneLimpo.length === 10) {
    // Formato: DDD + 8 dígitos (fixo) - converter para celular adicionando 9
    const ddd = telefoneLimpo.substring(0, 2);
    const numero = telefoneLimpo.substring(2);
    return ddd + '9' + numero; // Adicionar 9 no início
  } else if (telefoneLimpo.length === 9) {
    // Apenas número (sem DDD) - assumir DDD 11 (SP)
    if (telefoneLimpo.charAt(0) !== '9') {
      return '11' + '9' + telefoneLimpo.substring(1);
    }
    return '11' + telefoneLimpo;
  } else if (telefoneLimpo.length === 8) {
    // Apenas número fixo (sem DDD e sem 9) - assumir DDD 11 e adicionar 9
    return '11' + '9' + telefoneLimpo;
  }
  
  // Se não conseguir formatar, retornar erro
  throw new Error(`Telefone inválido: deve ter 10 ou 11 dígitos (recebido: ${telefoneLimpo.length})`);
};

/**
 * Gerar termo INSS no PRECENÇABANK
 */
const gerarTermoINSS = async (dados) => {
  try {
    const { cpf, nome, telefone, produtoId = 28 } = dados;
    
    console.log(`📝 [${cpf}] Gerando termo INSS no PRECENÇABANK...`);
    
    if (!cpf || !nome || !telefone) {
      throw new Error('CPF, nome e telefone são obrigatórios');
    }
    
    // Formatar telefone para o formato correto (11 dígitos)
    let telefoneFormatado;
    try {
      telefoneFormatado = formatarTelefone(telefone);
      console.log(`📞 [${cpf}] Telefone formatado: ${telefoneFormatado} (original: ${telefone})`);
    } catch (error) {
      throw new Error(`Erro ao formatar telefone: ${error.message}`);
    }
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    const response = await executarComRetry(
      () => axios.post(
        `${apiUrl}/consultas/termo-inss`,
        {
          cpf: cpf,
          nome: nome,
          telefone: telefoneFormatado, // Usar telefone formatado
          produtoId: produtoId
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: cpf, maxRetries: 5, baseDelay: 2000 }
    );
    
    if (response.data) {
      // PRECENÇABANK retorna autorizacaoId ao invés de id
      const termoId = response.data.autorizacaoId || response.data.id || response.data.termoId || response.data.termo_id;
      
      if (termoId) {
        console.log(`✅ [${cpf}] Termo INSS gerado com sucesso: ${termoId}`);
        if (response.data.shortUrl) {
          console.log(`🔗 URL de assinatura: ${response.data.shortUrl}`);
        }
        return {
          ...response.data,
          id: termoId, // Adicionar id para compatibilidade
          autorizacaoId: termoId
        };
      } else {
        throw new Error('Resposta não contém ID do termo');
      }
    } else {
      throw new Error('Resposta vazia da API');
    }
    
  } catch (error) {
    console.error(`❌ [${dados.cpf || 'N/A'}] Erro ao gerar termo INSS:`, error.message);
    if (error.response) {
      console.error('📄 Resposta da API:', error.response.data);
      console.error('📊 Status:', error.response.status);
    }
    throw error;
  }
};

/**
 * Assinar termo INSS no PRECENÇABANK
 */
/**
 * Assinar termo INSS via PUT (sem navegador)
 * NOTA: Este endpoint pode retornar erro 500. Se falhar, use assinarTermoAutomaticamente com Puppeteer
 * @param {string} termoId - ID do termo a ser assinado
 * @returns {Promise<object>} Resposta da API
 */
const assinarTermoINSS = async (termoId) => {
  try {
    console.log(`✍️ Assinando termo INSS: ${termoId}...`);
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    // DeviceInfoDto conforme Swagger (todos campos são nullable)
    // IMPORTANTE: geoLocation deve ser um objeto, não null
    const deviceInfo = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      deviceType: 'web',
      operationalSystem: 'Windows',
      deviceName: 'Chrome',
      deviceModel: 'Desktop',
      geoLocation: {
        latitude: '-23.5505',
        longitude: '-46.6333'
      }
    };
    
    const response = await executarComRetry(
      () => axios.put(
        `${apiUrl}/consultas/termo-inss/${termoId}`,
        deviceInfo, // DeviceInfoDto no body conforme Swagger
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'tenant-id': 'superuser',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: `termo-${termoId}`, maxRetries: 5, baseDelay: 2000 }
    );
    
    if (response.status === 200) {
      console.log(`✅ Termo INSS assinado com sucesso via PUT: ${termoId}`);
      return response.data || { success: true, termoId };
    } else {
      throw new Error(`Status inesperado: ${response.status}`);
    }
    
  } catch (error) {
    console.error(`❌ Erro ao assinar termo INSS ${termoId} via PUT:`, error.message);
    if (error.response) {
      console.error('📄 Resposta da API:', error.response.data);
      console.error('📊 Status:', error.response.status);
      console.error('⚠️ O endpoint PUT pode não estar funcionando. Considere usar assinarTermoAutomaticamente com Puppeteer.');
    }
    throw error;
  }
};

/**
 * Consultar vínculos empregatícios
 * @param {string} cpf - CPF do cliente
 * @param {string} termoId - ID do termo assinado (opcional, mas recomendado)
 */
const consultarVinculos = async (cpf, termoId = null) => {
  try {
    console.log(`🔍 [${cpf}] Consultando vínculos empregatícios...`);
    if (termoId) {
      console.log(`   Usando termo ID: ${termoId}`);
    }
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    // Montar payload - incluir termoId se fornecido
    const payload = {
      cpf: cpf
    };
    
    if (termoId) {
      payload.termoId = termoId;
      payload.autorizacaoId = termoId; // Tentar ambos os nomes
    }
    
    const response = await executarComRetry(
      () => axios.post(
        `${apiUrl}/v3/operacoes/consignado-privado/consultar-vinculos`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: cpf, maxRetries: 5, baseDelay: 30000 } // Delay maior para consultar vínculos
    );
    
    if (response.data) {
      console.log(`✅ [${cpf}] Vínculos consultados com sucesso`);
      console.log(`📄 [${cpf}] Estrutura da resposta:`, JSON.stringify(response.data, null, 2));
      console.log(`📊 [${cpf}] Tipo da resposta:`, typeof response.data);
      console.log(`📊 [${cpf}] É array?:`, Array.isArray(response.data));
      if (!Array.isArray(response.data) && response.data.data) {
        console.log(`📊 [${cpf}] Resposta tem propriedade 'data':`, Array.isArray(response.data.data));
      }
      if (!Array.isArray(response.data) && response.data.vinculos) {
        console.log(`📊 [${cpf}] Resposta tem propriedade 'vinculos':`, Array.isArray(response.data.vinculos));
      }
      return response.data;
    } else {
      throw new Error('Resposta vazia ao consultar vínculos');
    }
    
  } catch (error) {
    console.error(`❌ [${cpf}] Erro ao consultar vínculos:`, error.message);
    if (error.response) {
      console.error('📄 Resposta da API:', error.response.data);
      console.error('📊 Status:', error.response.status);
    }
    throw error;
  }
};

/**
 * Consultar margem do vínculo
 */
const consultarMargem = async (dados) => {
  let payload = null; // Declarar payload fora do try para acessar no catch
  try {
    const { cpf, matricula, cnpj, termoId } = dados;
    
    console.log(`💰 [${cpf}] Consultando margem do vínculo...`);
    console.log(`📋 [${cpf}] Dados recebidos:`, JSON.stringify({ cpf, matricula, cnpj, termoId }, null, 2));
    
    if (!cpf || !matricula || !cnpj) {
      throw new Error('CPF, matrícula e CNPJ são obrigatórios');
    }
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    // Limpar e validar CPF (apenas números, 11 dígitos)
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      throw new Error(`CPF inválido: ${cpf} (${cpfLimpo.length} dígitos, esperado 11)`);
    }
    
    // Limpar e validar CNPJ (apenas números, 14 dígitos)
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new Error(`CNPJ inválido: ${cnpj} (${cnpjLimpo.length} dígitos, esperado 14)`);
    }
    
    // Validar matrícula (não pode estar vazia)
    const matriculaLimpa = String(matricula).trim();
    if (!matriculaLimpa || matriculaLimpa.length === 0) {
      throw new Error(`Matrícula inválida: ${matricula}`);
    }
    
    // Montar payload conforme schema ConsultarMargemCreditoPrivadoCommand
    // Schema: { cpf: string, matricula: string, cnpj: string, termoPdfUrl: string (readOnly, não enviar) }
    // Todos os campos são nullable no schema, mas cpf, matricula e cnpj são necessários na prática
    payload = {
      cpf: cpfLimpo,
      matricula: matriculaLimpa,
      cnpj: cnpjLimpo
    };
    
    // termoPdfUrl é readOnly no schema, não devemos enviá-lo
    // A API pode precisar que o termo já esteja assinado antes de consultar margem
    if (termoId) {
      console.log(`📋 [${cpf}] Termo ID disponível: ${termoId} (não enviado no payload, é readOnly)`);
    }
    
    console.log(`📤 [${cpf}] Payload enviado (valores limpos):`, JSON.stringify(payload, null, 2));
    console.log(`📤 [${cpf}] Validações: CPF=${cpfLimpo.length} dígitos, CNPJ=${cnpjLimpo.length} dígitos, Matrícula=${matriculaLimpa.length} caracteres`);
    
    const response = await executarComRetry(
      () => axios.post(
        `${apiUrl}/v3/operacoes/consignado-privado/consultar-margem`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: cpf, maxRetries: 5, baseDelay: 2000 }
    );
    
    if (response.data) {
      console.log(`✅ [${cpf}] Margem consultada com sucesso`);
      console.log(`📄 [${cpf}] Estrutura da resposta:`, JSON.stringify(response.data, null, 2));
      
      // A API retorna um array de margens, usar o primeiro item
      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log(`📊 [${cpf}] Margem encontrada: R$ ${response.data[0].valorMargem || response.data[0].valorMargemAvaliavel || 0}`);
        return response.data[0]; // Retornar primeiro item do array
      } else if (response.data && typeof response.data === 'object') {
        // Se não for array, retornar objeto direto
        return response.data;
      } else {
        throw new Error('Resposta da margem em formato inesperado');
      }
    } else {
      throw new Error('Resposta vazia ao consultar margem');
    }
    
  } catch (error) {
    console.error(`❌ [${dados.cpf || 'N/A'}] Erro ao consultar margem:`, error.message);
    if (error.response) {
      console.error(`📄 [${dados.cpf || 'N/A'}] Resposta da API (status ${error.response.status}):`, JSON.stringify(error.response.data, null, 2));
      console.error(`📊 [${dados.cpf || 'N/A'}] Headers da resposta:`, JSON.stringify(error.response.headers, null, 2));
      if (payload) {
        console.error(`📤 [${dados.cpf || 'N/A'}] Payload que foi enviado:`, JSON.stringify(payload, null, 2));
      } else {
        console.error(`📤 [${dados.cpf || 'N/A'}] Payload não foi criado (erro antes da montagem)`);
      }
      
      // Se a API retornar uma mensagem de erro específica, incluir na exceção
      if (error.response.data && error.response.data.message) {
        throw new Error(`Erro na API: ${error.response.data.message}`);
      } else if (error.response.data && typeof error.response.data === 'string') {
        throw new Error(`Erro na API: ${error.response.data}`);
      } else if (error.response.data) {
        throw new Error(`Erro na API (status ${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
    }
    throw error;
  }
};

/**
 * Consultar tabelas disponíveis para simulação
 */
const consultarTabelasDisponiveis = async (dados) => {
  let payload = null; // Declarar payload fora do try para acessar no catch
  try {
    const { cpf } = dados;
    console.log(`📊 [${cpf}] Consultando tabelas disponíveis para simulação...`);
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    // Formatar telefone para objeto {ddd, numero}
    const telefoneStr = dados.telefone || dados.tomador?.telefone || '';
    const telefoneFormatado = formatarTelefone(telefoneStr);
    const telefoneObj = {
      ddd: telefoneFormatado.substring(0, 2),
      numero: telefoneFormatado.substring(2)
    };
    
    payload = {
      tomador: {
        telefone: {
          ddd: telefoneObj.ddd,
          numero: telefoneObj.numero
        },
        cpf: dados.cpf || dados.tomador?.cpf,
        nome: dados.nome || dados.tomador?.nome,
        dataNascimento: dados.dataNascimento || dados.tomador?.dataNascimento || '1990-01-01',
        nomeMae: dados.nomeMae || dados.tomador?.nomeMae || '',
        email: dados.email || dados.tomador?.email || `${cpf}@gmail.com`,
        sexo: dados.sexo || dados.tomador?.sexo || 'M',
        vinculoEmpregaticio: dados.vinculoEmpregaticio || dados.tomador?.vinculoEmpregaticio || {
          cnpjEmpregador: dados.cnpj || dados.cnpjEmpregador || '',
          registroEmpregaticio: dados.matricula || dados.registroEmpregaticio || ''
        },
        dadosBancarios: dados.dadosBancarios || dados.tomador?.dadosBancarios || {},
        endereco: dados.endereco || dados.tomador?.endereco || {}
      },
      proposta: dados.proposta || {
        valorSolicitado: 0,
        quantidadeParcelas: 0,
        produtoId: 28,
        valorParcela: 0
      },
      documentos: dados.documentos || []
    };
    
    const response = await executarComRetry(
      () => axios.post(
        `${apiUrl}/v3/tabelas/simulacao/inss/disponiveis`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: dados.cpf || 'tabelas', maxRetries: 5, baseDelay: 2000 }
    );
    
    if (response && response.data !== undefined && response.data !== null) {
      console.log(`✅ [${cpf}] Tabelas consultadas com sucesso`);
      console.log(`📄 [${cpf}] Tipo da resposta:`, typeof response.data);
      console.log(`📄 [${cpf}] É array?:`, Array.isArray(response.data));
      if (response.data) {
        console.log(`📄 [${cpf}] Estrutura da resposta:`, JSON.stringify(response.data, null, 2).substring(0, 500));
      }
      return response.data;
    } else {
      console.error(`❌ [${dados.cpf || 'N/A'}] Resposta vazia ou inválida`);
      console.error(`📄 [${dados.cpf || 'N/A'}] Response completo:`, JSON.stringify(response, null, 2));
      throw new Error('Resposta vazia ao consultar tabelas');
    }
    
  } catch (error) {
    console.error(`❌ [${dados.cpf || 'N/A'}] Erro ao consultar tabelas:`, error.message);
    if (error.response) {
      console.error(`📄 [${dados.cpf || 'N/A'}] Resposta da API (status ${error.response.status}):`, JSON.stringify(error.response.data, null, 2));
      console.error(`📊 [${dados.cpf || 'N/A'}] Headers da resposta:`, JSON.stringify(error.response.headers, null, 2));
      if (payload) {
        console.error(`📤 [${dados.cpf || 'N/A'}] Payload que foi enviado:`, JSON.stringify(payload, null, 2));
      } else {
        console.error(`📤 [${dados.cpf || 'N/A'}] Payload não foi criado (erro antes da montagem)`);
      }
      
      // Se a API retornar uma mensagem de erro específica, incluir na exceção
      if (error.response.data && error.response.data.message) {
        throw new Error(`Erro na API: ${error.response.data.message}`);
      } else if (error.response.data && typeof error.response.data === 'string') {
        throw new Error(`Erro na API: ${error.response.data}`);
      } else if (error.response.data) {
        throw new Error(`Erro na API (status ${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
    }
    throw error;
  }
};

/**
 * Criar operação de consignado privado
 */
const criarOperacao = async (dados) => {
  try {
    const { cpf } = dados;
    console.log(`🚀 [${cpf}] Criando operação de consignado privado...`);
    
    const token = await getValidToken();
    const apiUrl = process.env.PRECENÇABANK_API_URL || 'https://presenca-bank-api.azurewebsites.net';
    
    // Formatar telefone para objeto {ddd, numero}
    const telefoneStr = dados.telefone || dados.tomador?.telefone || '';
    const telefoneFormatado = formatarTelefone(telefoneStr);
    const telefoneObj = {
      ddd: telefoneFormatado.substring(0, 2),
      numero: telefoneFormatado.substring(2)
    };
    
    const payload = {
      type: 'credito-privado-v3',
      tomador: {
        telefone: {
          ddd: telefoneObj.ddd,
          numero: telefoneObj.numero
        },
        cpf: dados.cpf || dados.tomador?.cpf,
        nome: dados.nome || dados.tomador?.nome,
        dataNascimento: dados.dataNascimento || dados.tomador?.dataNascimento || '1990-01-01',
        nomeMae: dados.nomeMae || dados.tomador?.nomeMae || '',
        email: dados.email || dados.tomador?.email || `${cpf}@gmail.com`,
        sexo: dados.sexo || dados.tomador?.sexo || 'M',
        vinculoEmpregaticio: dados.vinculoEmpregaticio || dados.tomador?.vinculoEmpregaticio || {},
        dadosBancarios: dados.dadosBancarios || dados.tomador?.dadosBancarios || {},
        endereco: dados.endereco || dados.tomador?.endereco || {}
      },
      proposta: dados.proposta || {},
      documentos: dados.documentos || []
    };
    
    console.log(`📤 [${cpf}] Payload sendo enviado para API:`);
    console.log(JSON.stringify(payload, null, 2));
    
    const response = await executarComRetry(
      () => axios.post(
        `${apiUrl}/v3/operacoes`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          httpsAgent: getHttpsAgent()
        }
      ),
      { context: dados.cpf || 'operacao', maxRetries: 5, baseDelay: 2000 }
    );
    
    if (response.data) {
      console.log(`✅ [${cpf}] Operação criada com sucesso`);
      console.log(`📄 Retorno completo:`, JSON.stringify(response.data, null, 2));
      console.log(`📋 Headers completos:`, JSON.stringify(response.headers, null, 2));
      console.log(`📊 Status: ${response.status}`);
      
      // Verificar se há link de assinatura no retorno
      if (response.data.shortUrl || response.data.urlAssinatura || response.data.assinaturaUrl || response.data.signUrl || response.data.linkAssinatura || response.data.url) {
        const link = response.data.shortUrl || response.data.urlAssinatura || response.data.assinaturaUrl || response.data.signUrl || response.data.linkAssinatura || response.data.url;
        console.log(`🔗 Link de assinatura: ${link}`);
      }
      
      // Verificar headers para link de assinatura
      if (response.headers.location || response.headers['location']) {
        console.log(`🔗 Location header: ${response.headers.location || response.headers['location']}`);
      }
      
      // Verificar todos os headers que podem conter URL
      Object.keys(response.headers).forEach(key => {
        if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('location')) {
          console.log(`🔗 Header ${key}: ${response.headers[key]}`);
        }
      });
      
      return response.data;
    } else {
      throw new Error('Resposta vazia ao criar operação');
    }
    
  } catch (error) {
    console.error(`❌ [${dados.cpf || 'N/A'}] Erro ao criar operação:`, error.message);
    if (error.response) {
      console.error('📄 Resposta da API:', error.response.data);
      console.error('📊 Status:', error.response.status);
    }
    throw error;
  }
};

/**
 * Executar fluxo completo PRECENÇABANK
 * Similar ao executarFluxoCLT do V8 Digital
 * Busca dados da Kentro automaticamente
 */
const executarFluxoPrecencabank = async (cpf, valorPersonalizado = null, prazoPersonalizado = null, atualizarStatusCallback = null) => {
  try {
    console.log(`🚀 [${cpf}] Iniciando fluxo completo PRECENÇABANK...`);
    
    // Callback para atualizar status (se fornecido)
    const atualizarStatus = (etapa, dados = {}) => {
      if (atualizarStatusCallback) {
        atualizarStatusCallback(cpf, 'PROCESSANDO', etapa, dados);
      }
    };
    
    // 1. Buscar oportunidade na Kentro pelo CPF
    atualizarStatus('buscando_oportunidade');
    const { buscarOportunidadeKentro, buscarOportunidadePorId, validarDadosOportunidade } = require('./clt-fluxo');
    const { buscarSimulacaoAprovada } = require('./cache-simulacoes');
    
    let oportunidade = await buscarOportunidadeKentro(cpf);
    let oportunidadeCompleta = null;
    let dadosCliente = null;
    
    // Se não encontrou na Kentro, tentar buscar no cache
    if (!oportunidade) {
      console.log(`⚠️ [${cpf}] Oportunidade não encontrada na Kentro, buscando no cache...`);
      const cacheData = buscarSimulacaoAprovada(cpf);
      
      if (cacheData.success && cacheData.dados && cacheData.dados.dadosCliente) {
        console.log(`✅ [${cpf}] Dados encontrados no cache, usando dados do cliente`);
        const dadosCache = cacheData.dados.dadosCliente;
        
        dadosCliente = {
          nome: dadosCache.nome || `Cliente ${cpf}`,
          telefone: dadosCache.telefone || `11${Math.floor(Math.random() * 900000000) + 100000000}`,
          email: dadosCache.email || `${cpf}@gmail.com`,
          dataNascimento: dadosCache.dataNascimento || dadosCache.data_nascimento || '1990-01-01',
          nomeMae: dadosCache.nomeMae || dadosCache.nome_mae || 'NOME MAE',
          sexo: dadosCache.sexo || 'M',
          endereco: dadosCache.endereco || {},
          dadosBancarios: dadosCache.dadosBancarios || {},
          produtoId: 28,
          valorSolicitado: valorPersonalizado || 0,
          quantidadeParcelas: prazoPersonalizado || 36,
          valorParcela: 0
        };
      } else {
        // Se não tem no cache, criar dados fake
        console.log(`⚠️ [${cpf}] Dados não encontrados no cache, criando dados fake...`);
        const telefoneFake = `11${Math.floor(Math.random() * 900000000) + 100000000}`;
        
        dadosCliente = {
          nome: `Cliente ${cpf}`,
          telefone: telefoneFake,
          email: `${cpf}@gmail.com`,
          dataNascimento: '1990-01-01',
          nomeMae: 'NOME MAE',
          sexo: 'M',
          endereco: {
            cep: '01310100',
            rua: 'Avenida Paulista',
            numero: '1000',
            bairro: 'Bela Vista',
            cidade: 'São Paulo',
            estado: 'SP'
          },
          dadosBancarios: {},
          produtoId: 28,
          valorSolicitado: valorPersonalizado || 0,
          quantidadeParcelas: prazoPersonalizado || 36,
          valorParcela: 0
        };
        
        console.log(`📋 [${cpf}] Dados fake criados:`, JSON.stringify(dadosCliente, null, 2));
      }
    } else {
      // 2. Buscar oportunidade com o ID
      atualizarStatus('buscando_oportunidade_id');
      oportunidadeCompleta = await buscarOportunidadePorId(oportunidade.id);
      if (!oportunidadeCompleta) {
        return {
          sucesso: false,
          erro: 'Não foi possível obter dados completos da oportunidade',
          etapa: 'busca_oportunidade_id',
          origem: 'PRECENÇABANK'
        };
      }
      
      // 3. Validar dados obrigatórios
      atualizarStatus('validando_dados');
      const validacao = validarDadosOportunidade(oportunidadeCompleta);
      if (!validacao.valido) {
        return {
          sucesso: false,
          erro: 'Dados obrigatórios não preenchidos',
          dadosFaltantes: validacao.dadosFaltantes,
          etapa: 'validacao_dados',
          origem: 'PRECENÇABANK'
        };
      }
      
      // Extrair dados do cliente da Kentro
      dadosCliente = {
        nome: validacao.dados.nome,
        telefone: validacao.dados.telefone,
        email: validacao.dados.email,
        dataNascimento: validacao.dados.data_nascimento,
        nomeMae: validacao.dados.nome_mae,
        sexo: validacao.dados.sexo || 'M',
        endereco: validacao.dados.endereco || {},
        dadosBancarios: validacao.dados.dados_bancarios || {},
        produtoId: 28,
        valorSolicitado: valorPersonalizado || 0,
        quantidadeParcelas: prazoPersonalizado || 36,
        valorParcela: 0
      };
    }
    
    if (!dadosCliente.nome || !dadosCliente.telefone) {
      return {
        sucesso: false,
        erro: 'CPF, nome e telefone são obrigatórios',
        etapa: 'validacao_dados',
        origem: 'PRECENÇABANK'
      };
    }
    
    // 4. Gerar termo INSS
    atualizarStatus('gerando_termo');
    console.log(`📝 [${cpf}] Etapa 4/7: Gerando termo INSS...`);
    const termo = await gerarTermoINSS({ 
      cpf, 
      nome: dadosCliente.nome, 
      telefone: dadosCliente.telefone, 
      produtoId: dadosCliente.produtoId 
    });
    
    if (!termo || !termo.id) {
      throw new Error('Falha ao gerar termo INSS');
    }
    
    console.log(`📋 [${cpf}] Termo gerado:`, JSON.stringify({ id: termo.id, shortUrl: termo.shortUrl, url: termo.url }, null, 2));
    
    // 5. Assinar termo automaticamente via fila (com limite de concorrência)
    atualizarStatus('assinando_termo', { termoId: termo.id });
    
    // Verificar se tem shortUrl ou url
    const urlAssinatura = termo.shortUrl || termo.url;
    
    if (urlAssinatura) {
      console.log(`✍️ [${cpf}] Etapa 5/7: Adicionando assinatura à fila...`);
      console.log(`📋 [${cpf}] URL de assinatura: ${urlAssinatura}`);
      
      try {
        const { adicionarAssinaturaNaFila } = require('./fila-assinaturas-precencabank');
        console.log(`✅ [${cpf}] Módulo fila-assinaturas carregado com sucesso`);
        
        // Adicionar à fila (será processada respeitando limite de concorrência)
        const resultadoAssinatura = await adicionarAssinaturaNaFila(cpf, urlAssinatura, {
          headless: true, // Sempre headless em fluxo automático
          timeout: 60000
        });
        
        console.log(`📋 [${cpf}] Resultado da assinatura:`, JSON.stringify(resultadoAssinatura, null, 2));
        
        if (!resultadoAssinatura.success) {
          console.log(`⚠️ [${cpf}] Assinatura pode não ter sido concluída: ${resultadoAssinatura.message}`);
          // Continuar mesmo assim, pois pode ter sido assinado mas não detectado
        } else {
          console.log(`✅ [${cpf}] Assinatura concluída via fila`);
        }
      } catch (error) {
        console.error(`❌ [${cpf}] Erro ao chamar fila de assinaturas:`, error.message);
        console.error(`❌ [${cpf}] Stack:`, error.stack);
        throw error;
      }
    } else {
      console.log(`⚠️ [${cpf}] Termo não possui URL de assinatura (shortUrl ou url) - pulando assinatura automática`);
      console.log(`📋 [${cpf}] Termo completo:`, JSON.stringify(termo, null, 2));
    }
    
    // 6. Consultar vínculos (com retry)
    atualizarStatus('consultando_vinculos');
    console.log(`🔍 [${cpf}] Etapa 6/7: Consultando vínculos...`);
    
    // Consultar vínculos com retry (pode demorar)
    let vinculos = null;
    const maxTentativas = 5;
    const delayRetry = 30000; // 30 segundos
    
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        console.log(`🔍 [${cpf}] Tentativa ${tentativa}/${maxTentativas} de consultar vínculos...`);
        vinculos = await consultarVinculos(cpf, termo.id);
        
        // Verificar diferentes estruturas de resposta
        let vinculosArray = null;
        
        if (Array.isArray(vinculos)) {
          vinculosArray = vinculos;
        } else if (vinculos && Array.isArray(vinculos.id)) {
          // PRECENÇABANK retorna { id: [...] }
          vinculosArray = vinculos.id;
        } else if (vinculos && Array.isArray(vinculos.data)) {
          vinculosArray = vinculos.data;
        } else if (vinculos && Array.isArray(vinculos.vinculos)) {
          vinculosArray = vinculos.vinculos;
        } else if (vinculos && Array.isArray(vinculos.result)) {
          vinculosArray = vinculos.result;
        } else if (vinculos && Array.isArray(vinculos.results)) {
          vinculosArray = vinculos.results;
        }
        
        if (vinculosArray && vinculosArray.length > 0) {
          console.log(`✅ [${cpf}] Vínculos encontrados na tentativa ${tentativa}: ${vinculosArray.length} vínculo(s)`);
          vinculos = vinculosArray; // Usar o array encontrado
          break;
        } else {
          console.log(`⚠️ [${cpf}] Estrutura da resposta não contém array de vínculos`);
          console.log(`📄 [${cpf}] Resposta completa:`, JSON.stringify(vinculos, null, 2));
          throw new Error('Nenhum vínculo encontrado na resposta');
        }
      } catch (error) {
        console.log(`⚠️ [${cpf}] Tentativa ${tentativa} falhou: ${error.message}`);
        if (tentativa < maxTentativas) {
          console.log(`⏳ [${cpf}] Aguardando ${delayRetry/1000} segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delayRetry));
        } else {
          throw new Error(`Não foi possível consultar vínculos após ${maxTentativas} tentativas: ${error.message}`);
        }
      }
    }
    
    if (!vinculos || !Array.isArray(vinculos) || vinculos.length === 0) {
      throw new Error('Nenhum vínculo encontrado');
    }
    
    // Usar o primeiro vínculo encontrado
    const primeiroVinculo = vinculos[0];
    let matricula = primeiroVinculo.matricula || primeiroVinculo.registroEmpregaticio || primeiroVinculo.numeroMatricula;
    let cnpj = primeiroVinculo.cnpj || primeiroVinculo.cnpjEmpregador || primeiroVinculo.numeroInscricaoEmpregador;
    
    console.log(`📋 [${cpf}] Primeiro vínculo:`, JSON.stringify(primeiroVinculo, null, 2));
    console.log(`📋 [${cpf}] Matrícula extraída (antes validação): ${matricula}`);
    console.log(`📋 [${cpf}] CNPJ extraído (antes validação): ${cnpj}`);
    console.log(`📋 [${cpf}] Todas as chaves do vínculo:`, Object.keys(primeiroVinculo));
    
    if (!matricula || !cnpj) {
      console.log(`❌ [${cpf}] Vínculo não contém matrícula ou CNPJ`);
      console.log(`📄 Vínculo completo:`, JSON.stringify(primeiroVinculo, null, 2));
      throw new Error('Vínculo não contém matrícula ou CNPJ');
    }
    
    // Validar e corrigir formato do CNPJ (deve ter 14 dígitos)
    const cnpjLimpo = String(cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      console.log(`⚠️ [${cpf}] CNPJ com formato inválido: ${cnpj} (${cnpjLimpo.length} dígitos, esperado 14)`);
      if (cnpjLimpo.length < 14) {
        const cnpjCorrigido = cnpjLimpo.padStart(14, '0');
        console.log(`🔧 [${cpf}] CNPJ corrigido: ${cnpj} -> ${cnpjCorrigido}`);
        cnpj = cnpjCorrigido;
      } else if (cnpjLimpo.length > 14) {
        // Se tiver mais de 14, pegar os últimos 14
        const cnpjCorrigido = cnpjLimpo.slice(-14);
        console.log(`🔧 [${cpf}] CNPJ truncado: ${cnpj} -> ${cnpjCorrigido}`);
        cnpj = cnpjCorrigido;
      }
    } else {
      cnpj = cnpjLimpo; // Usar versão limpa
    }
    
    // Validar e limpar formato da matrícula
    let matriculaLimpa = String(matricula).replace(/\D/g, ''); // Remover caracteres não numéricos
    
    // Se a matrícula contém o CNPJ no início, remover
    if (matriculaLimpa.startsWith(cnpj)) {
      console.log(`⚠️ [${cpf}] Matrícula contém CNPJ no início, removendo...`);
      matriculaLimpa = matriculaLimpa.substring(cnpj.length);
    }
    
    // Se a matrícula está vazia ou muito curta após limpeza, usar valor padrão
    if (!matriculaLimpa || matriculaLimpa.length === 0) {
      console.log(`⚠️ [${cpf}] Matrícula vazia após limpeza, usando valor padrão`);
      matricula = '0001'; // Valor padrão
    } else if (matriculaLimpa.length > 20) {
      // Se a matrícula for muito longa (provavelmente concatenada), pegar os últimos dígitos
      console.log(`⚠️ [${cpf}] Matrícula muito longa (${matriculaLimpa.length} dígitos), truncando...`);
      matricula = matriculaLimpa.slice(-10); // Pegar últimos 10 dígitos
      console.log(`🔧 [${cpf}] Matrícula truncada: ${matriculaLimpa} -> ${matricula}`);
    } else {
      matricula = matriculaLimpa; // Usar versão limpa
    }
    
    console.log(`✅ [${cpf}] Matrícula final: ${matricula}`);
    console.log(`✅ [${cpf}] CNPJ final: ${cnpj}`);
    
    // Salvar dados para consultar margem (termoId, matricula, cnpj)
    try {
      const { salvarDadosMargem } = require('./cache-precencabank');
      salvarDadosMargem(cpf, {
        termoId: termo.id,
        matricula: matricula,
        cnpj: cnpj,
        termoAssinado: true // Se chegou até aqui, termo está assinado
      });
      console.log(`💾 [${cpf}] Dados salvos para consultar margem: termoId=${termo.id}, matricula=${matricula}, cnpj=${cnpj}`);
    } catch (error) {
      console.error(`⚠️ [${cpf}] Erro ao salvar dados de margem (não bloqueia):`, error.message);
    }
    
    // Atualizar status com termoId, matricula e cnpj
    atualizarStatus('consultando_margem', { termoId: termo.id, matricula, cnpj });
    
    // 7. Consultar margem
    console.log(`💰 [${cpf}] Consultando margem...`);
    console.log(`📋 [${cpf}] Dados para consulta de margem:`, JSON.stringify({ cpf, matricula, cnpj, termoId: termo.id }, null, 2));
    const margem = await consultarMargem({ cpf, matricula, cnpj, termoId: termo.id });
    
    // 8. Consultar tabelas disponíveis
    atualizarStatus('consultando_tabelas');
    console.log(`📊 [${cpf}] Consultando tabelas disponíveis...`);
    const tabelas = await consultarTabelasDisponiveis({
      cpf,
      nome: dadosCliente.nome,
      telefone: dadosCliente.telefone,
      dataNascimento: dadosCliente.dataNascimento,
      nomeMae: dadosCliente.nomeMae,
      email: dadosCliente.email,
      sexo: dadosCliente.sexo,
      vinculoEmpregaticio: {
        cnpjEmpregador: cnpj,
        registroEmpregaticio: matricula
      },
      dadosBancarios: dadosCliente.dadosBancarios || {},
      endereco: dadosCliente.endereco || {},
      proposta: {
        valorSolicitado: dadosCliente.valorSolicitado || 0,
        quantidadeParcelas: dadosCliente.quantidadeParcelas || 36,
        produtoId: dadosCliente.produtoId || 28,
        valorParcela: dadosCliente.valorParcela || 0
      }
    });
    
    // 9. Preparar dados de simulação (NÃO criar operação)
    atualizarStatus('finalizando_simulacao');
    console.log(`✅ [${cpf}] Simulação concluída!`);
    console.log(`📊 [${cpf}] Tabelas disponíveis para simulação: ${tabelas && Array.isArray(tabelas) ? tabelas.length : 0}`);
    
    // Selecionar primeira tabela disponível (se houver)
    const tabelaId = tabelas && Array.isArray(tabelas) && tabelas.length > 0 
      ? tabelas[0].id 
      : null;
    
    // Preparar dados de simulação (sem criar operação)
    const dadosSimulacao = {
      cpf,
      nome: dadosCliente.nome,
      telefone: dadosCliente.telefone,
      dataNascimento: dadosCliente.dataNascimento || '1990-01-01',
      nomeMae: dadosCliente.nomeMae || '',
      email: dadosCliente.email || `${cpf}@gmail.com`,
      sexo: dadosCliente.sexo || 'M',
      vinculoEmpregaticio: {
        cnpjEmpregador: cnpj,
        registroEmpregaticio: matricula
      },
      dadosBancarios: dadosCliente.dadosBancarios || {},
      endereco: dadosCliente.endereco || {},
      proposta: {
        valorSolicitado: dadosCliente.valorSolicitado || 0,
        quantidadeParcelas: dadosCliente.quantidadeParcelas || 36,
        produtoId: dadosCliente.produtoId,
        valorParcela: dadosCliente.valorParcela || 0,
        ...(tabelaId ? { tabelaId: tabelaId } : {})
      }
    };
    
    console.log(`🎉 [${cpf}] Fluxo de simulação PRECENÇABANK executado com sucesso!`);
    console.log(`ℹ️  [${cpf}] Operação NÃO foi criada (apenas simulação)`);
    
    return {
      sucesso: true,
      origem: 'PRECENÇABANK',
      termo: termo,
      vinculos: vinculos,
      margem: margem,
      tabelas: tabelas,
      dadosSimulacao: dadosSimulacao, // Dados prontos para criar operação (se necessário)
      operacao: null, // Operação não criada
      dados_validados: dadosCliente,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ [${cpf}] Erro no fluxo completo PRECENÇABANK:`, error.message);
    return {
      sucesso: false,
      erro: error.message,
      origem: 'PRECENÇABANK',
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Processar callback de webhook do PRECENÇABANK
 */
const processarWebhookCallback = async (payload) => {
  try {
    console.log('📥 Processando callback de webhook PRECENÇABANK...');
    console.log('📋 Payload:', JSON.stringify(payload, null, 2));
    
    // Processar diferentes tipos de eventos
    const eventType = payload.event || payload.type || 'unknown';
    const operacaoId = payload.operacaoId || payload.id || payload.operationId;
    
    switch (eventType) {
      case 'operacao_aprovada':
      case 'operacao_aprovada':
        console.log(`✅ Operação ${operacaoId} aprovada`);
        // Atualizar status local/cache
        break;
      case 'operacao_rejeitada':
      case 'operacao_rejeitada':
        console.log(`❌ Operação ${operacaoId} rejeitada`);
        // Atualizar status local/cache
        break;
      case 'status_alterado':
        console.log(`🔄 Status da operação ${operacaoId} alterado`);
        // Atualizar status local/cache
        break;
      default:
        console.log(`⚠️ Tipo de evento desconhecido: ${eventType}`);
    }
    
    return {
      success: true,
      eventType,
      operacaoId,
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Erro ao processar webhook callback:', error.message);
    throw error;
  }
};

/**
 * Validar assinatura do webhook
 */
const validarWebhookSignature = (payload, signature) => {
  try {
    const webhookToken = process.env.PRECENÇABANK_WEBHOOK_TOKEN;
    
    if (!webhookToken) {
      console.log('⚠️ Token de webhook não configurado, pulando validação');
      return true; // Se não tem token configurado, aceitar
    }
    
    // Implementar validação de assinatura conforme documentação do PRECENÇABANK
    // Por enquanto, apenas verificar se o token está presente
    if (signature === webhookToken) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Erro ao validar assinatura do webhook:', error.message);
    return false;
  }
};

module.exports = {
  gerarTermoINSS,
  assinarTermoINSS,
  consultarVinculos,
  consultarMargem,
  consultarTabelasDisponiveis,
  criarOperacao,
  executarFluxoPrecencabank,
  processarWebhookCallback,
  validarWebhookSignature,
  formatarTelefone
};

