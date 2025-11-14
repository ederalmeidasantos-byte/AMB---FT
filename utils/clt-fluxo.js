import axios from 'axios';
import dotenv from 'dotenv';
import { getValidToken, globalTokenCache } from './auth.js';

dotenv.config({ path: './config.env' });

/**
 * Limpar caracteres inválidos do nome para V8 Digital
 */
const limparNomeParaV8 = (nome) => {
  if (!nome) return '';
  
  // Remover caracteres especiais que a V8 Digital não aceita
  return nome
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, '') // Manter apenas letras e espaços
    .replace(/\s+/g, ' ') // Remover espaços múltiplos
    .trim(); // Remover espaços no início e fim
};

/**
 * Formatar data de nascimento para o formato YYYY-MM-DD
 */
const formatarDataNascimento = (dataStr) => {
  if (!dataStr) return '1990-01-01'; // Data padrão se não informada
  
  const dataStrLimpa = String(dataStr).trim();
  
  // Se já está no formato YYYY-MM-DD, retornar direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStrLimpa)) {
    return dataStrLimpa;
  }
  
  // Remover espaços e caracteres especiais
  const dataLimpa = dataStrLimpa.replace(/[^\d]/g, '');
  
  // Se tem 8 dígitos (DDMMAAAA), converter para AAAA-MM-DD
  if (dataLimpa.length === 8) {
    const dia = dataLimpa.substring(0, 2);
    const mes = dataLimpa.substring(2, 4);
    const ano = dataLimpa.substring(4, 8);
    
    // Validar se é uma data válida
    const dataObj = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    if (dataObj.getFullYear() == ano && 
        dataObj.getMonth() == parseInt(mes) - 1 && 
        dataObj.getDate() == dia) {
      return `${ano}-${mes}-${dia}`;
    }
  }
  
  // Se tem formato DD/MM/AAAA, converter
  if (dataStrLimpa.includes('/')) {
    const partes = dataStrLimpa.split('/');
    if (partes.length === 3) {
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const ano = partes[2];
      return `${ano}-${mes}-${dia}`;
    }
  }
  
  // Se tem formato DD MM AAAA, converter
  if (dataStrLimpa.includes(' ') && !dataStrLimpa.includes('-')) {
    const partes = dataStrLimpa.split(' ');
    if (partes.length === 3) {
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const ano = partes[2];
      return `${ano}-${mes}-${dia}`;
    }
  }
  
  // Se tem formato DD.MM.AAAA, converter
  if (dataStrLimpa.includes('.')) {
    const partes = dataStrLimpa.split('.');
    if (partes.length === 3) {
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const ano = partes[2];
      return `${ano}-${mes}-${dia}`;
    }
  }
  
  // Se não conseguiu converter, usar data padrão
  console.log(`⚠️ Data de nascimento não reconhecida: "${dataStr}" - usando data padrão`);
  return '1990-01-01';
};

/**
 * Buscar oportunidade na Kentro por CPF
 */
const buscarOportunidadeKentro = async (cpf) => {
  try {
    console.log(`🔍 [${cpf}] Buscando oportunidade na Kentro para CPF: ${cpf}`);
    
    const url = `${process.env.KENTRO_API_URL}/getPipeOpportunities`;
    console.log(`🌐 [${cpf}] URL da requisição: ${url}`);
    console.log(`🔑 [${cpf}] API Key: ${process.env.KENTRO_API_KEY ? 'Presente' : 'Ausente'}`);
    
    // Buscar em múltiplas filas: 1, 3 e 4
    const filas = [1, 3, 4];
    let oportunidadeEncontrada = null;
    
    for (const fila of filas) {
      console.log(`🔍 [${cpf}] Buscando na fila ${fila}...`);
      
      const requestData = {
        queueId: parseInt(process.env.KENTRO_QUEUE_ID),
        apiKey: process.env.KENTRO_API_KEY,
        pipelineId: fila
      };
      
      console.log(`📋 [${cpf}] Dados enviados para Kentro (Fila ${fila}):`, JSON.stringify(requestData, null, 2));

      try {
        const response = await axios.post(
          url,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CLT-V8-API/1.0.0'
            },
            timeout: 30000
          }
        );

        console.log(`📊 [${cpf}] Status da resposta Kentro (Fila ${fila}):`, response.status);
        console.log(`📄 [${cpf}] Resposta completa Kentro (Fila ${fila}):`, JSON.stringify(response.data, null, 2));

        // A API retorna um array de oportunidades
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Buscar oportunidade com o CPF específico
          const oportunidade = response.data.find(opp => opp.mainmail === cpf);
          if (oportunidade) {
            console.log(`✅ [${cpf}] Oportunidade encontrada na fila ${fila}: ID ${oportunidade.id}`);
            oportunidadeEncontrada = oportunidade;
            break; // Parar na primeira oportunidade encontrada
          } else {
            console.log(`⚠️ [${cpf}] Nenhuma oportunidade encontrada na fila ${fila}`);
          }
        } else {
          console.log(`⚠️ [${cpf}] Nenhuma oportunidade encontrada na fila ${fila}`);
        }
      } catch (filaError) {
        console.error(`❌ [${cpf}] Erro ao buscar na fila ${fila}:`, filaError.message);
        // Continuar para próxima fila mesmo com erro
        continue;
      }
    }
    
    if (oportunidadeEncontrada) {
      console.log(`✅ [${cpf}] Oportunidade encontrada: ID ${oportunidadeEncontrada.id}`);
      return oportunidadeEncontrada;
    } else {
      console.log(`❌ [${cpf}] Nenhuma oportunidade encontrada em nenhuma fila (1, 3, 4)`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ [${cpf}] ERRO AO BUSCAR OPORTUNIDADE NA KENTRO:`);
    console.error(`📊 [${cpf}] Status:`, error.response?.status);
    console.error(`📋 [${cpf}] Headers:`, error.response?.headers);
    console.error(`📄 [${cpf}] Resposta completa:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`🔍 [${cpf}] Mensagem:`, error.message);
    console.error(`📝 [${cpf}] Stack:`, error.stack);
    throw new Error('Falha ao buscar oportunidade na Kentro');
  }
};

/**
 * Buscar oportunidade específica por ID na Kentro
 */
const buscarOportunidadePorId = async (oportunidadeId) => {
  try {
    console.log(`🔍 Buscando oportunidade por ID: ${oportunidadeId}`);
    
    // Buscar em múltiplas filas: 1, 3 e 4
    const filas = [1, 3, 4];
    const url = `${process.env.KENTRO_API_URL}/getPipeOpportunities`;
    
    for (const fila of filas) {
      console.log(`🔍 Buscando ID ${oportunidadeId} na fila ${fila}...`);
      
      try {
        const response = await axios.post(
          url,
          {
            queueId: parseInt(process.env.KENTRO_QUEUE_ID),
            apiKey: process.env.KENTRO_API_KEY,
            pipelineId: fila
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CLT-V8-API/1.0.0'
            },
            timeout: 30000
          }
        );

        if (response.data && Array.isArray(response.data)) {
          const oportunidade = response.data.find(opp => opp.id === parseInt(oportunidadeId));
          if (oportunidade) {
            console.log(`✅ Oportunidade encontrada por ID na fila ${fila}`);
            return oportunidade;
          } else {
            console.log(`⚠️ ID ${oportunidadeId} não encontrado na fila ${fila}`);
          }
        } else {
          console.log(`⚠️ Erro na resposta da API da fila ${fila}`);
        }
      } catch (filaError) {
        console.error(`❌ Erro ao buscar na fila ${fila}:`, filaError.message);
        // Continuar para próxima fila mesmo com erro
        continue;
      }
    }
    
    console.log(`❌ Oportunidade ID ${oportunidadeId} não encontrada em nenhuma fila (1, 3, 4)`);
    return null;
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidade por ID:', error.response?.data || error.message);
    throw new Error('Falha ao buscar oportunidade por ID na Kentro');
  }
};

/**
 * Validar dados obrigatórios da oportunidade
 */
const validarDadosOportunidade = (oportunidade) => {
  try {
    // Validação simplificada - verificar CPF, telefone e email
    const dadosObrigatorios = ['mainmail', 'mainphone']; // CPF e telefone principais
    const dadosFaltantes = [];
    
    // Verificar apenas campos principais
    for (const campo of dadosObrigatorios) {
      if (!oportunidade[campo] || oportunidade[campo].toString().trim() === '') {
        dadosFaltantes.push(campo);
      }
    }
    
    // Garantir que formsdata existe
    const formsdata = oportunidade.formsdata || {};
    
    // Email não é mais obrigatório - usar fallback se não tiver
    const cpf = oportunidade.mainmail || '';
    const emailOriginal = formsdata['9e7f92b0'];
    const email = (emailOriginal && emailOriginal !== 'null' && emailOriginal.trim() !== '') 
      ? emailOriginal 
      : `${cpf}@gmail.com`; // Fallback padrão
    
    if (!emailOriginal || emailOriginal === 'null' || emailOriginal.trim() === '') {
      console.log(`⚠️ Email não preenchido na oportunidade ${oportunidade.id} - usando fallback: ${email}`);
    }
    
    return {
      valido: dadosFaltantes.length === 0,
      dadosFaltantes: dadosFaltantes,
      dados: {
        nome: oportunidade.title || '',
        cpf: cpf,
        telefone: oportunidade.mainphone || '',
        data_nascimento: formsdata['0bfc6250'] || '',
        email: email, // Usar email com fallback
        nome_mae: formsdata['917456f0'] || '',
        valor: oportunidade.value || 0,
        fkStage: oportunidade.fkStage || 0,
        provider: formsdata['80b68ec0'] || '',
        tipo_tabela: formsdata['f0a67ce0'] || '',
        // Dados de endereço mapeados da Kentro
        endereco: {
          cep: formsdata['1836e090'] || '',
          rua: formsdata['1dbfcef0'] || '',
          numero: formsdata['6ac31450'] || '',
          bairro: formsdata['3271f710'] || '',
          cidade: formsdata['25178280'] || '',
          estado: formsdata['f6384400'] || ''
        },
        // Dados bancários mapeados da Kentro (se disponíveis)
        dados_bancarios: {
          banco: formsdata['98011220'] || '',
          agencia: formsdata['769db520'] || '',
          conta: formsdata['7f6a0eb0'] || '',
          tipo_conta: 'corrente' // Padrão
        },
        // Dados de documentos
        rg: formsdata['6a93f650'] || '', // Campo RG real da Kentro
        // Dados PIX - IMPORTANTE: Não confundir email com chave PIX
        pix: {
          tipo_chave: formsdata['769db520'] || 'cpf', // Tipo da chave PIX da Kentro
          chave_pix: formsdata['98011220'] || '', // Chave PIX no campo correto
          banco_pix: formsdata['98011220'] || '' // Banco para PIX
        }
      }
    };
  } catch (error) {
    console.error('❌ Erro na validação:', error.message);
    return {
      valido: false,
      dadosFaltantes: ['erro_validacao'],
      dados: {}
    };
  }
};

/**
 * Criar nova oportunidade na Kentro
 */
const criarOportunidadeKentro = async (dadosOportunidade) => {
  try {
    console.log('📝 Criando nova oportunidade na Kentro...');
    
    const oportunidadeData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      fkPipeline: 1,
      fkStage: 4, // Etapa de simulação válida
      responsableid: 0,
      title: `Oportunidade CPF ${dadosOportunidade.cpf}`,
      mainphone: dadosOportunidade.telefone,
      mainmail: dadosOportunidade.cpf,
      value: dadosOportunidade.valor_solicitado || 0
    };

    const response = await axios.post(
      `${process.env.KENTRO_API_URL}/createOpportunity`,
      oportunidadeData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CLT-V8-API/1.0.0'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.id) {
      console.log('✅ Oportunidade criada com sucesso na Kentro');
      return response.data;
    } else {
      console.log('❌ Erro ao criar oportunidade na Kentro');
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao criar oportunidade na Kentro:', error.response?.data || error.message);
    throw new Error('Falha ao criar oportunidade na Kentro');
  }
};

/**
 * Atualizar oportunidade existente na Kentro
 */
const atualizarOportunidadeKentro = async (oportunidadeId, dadosAtualizacao) => {
  try {
    console.log(`🔄 Atualizando oportunidade ${oportunidadeId} na Kentro...`);
    console.log(`📋 Dados para atualização:`, JSON.stringify(dadosAtualizacao, null, 2));
    
    const updateData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      id: parseInt(oportunidadeId),
      formsdata: dadosAtualizacao // Usar diretamente os dados passados
    };

    const response = await axios.post(
      `${process.env.KENTRO_API_URL}/updateOpportunity`,
      updateData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CLT-V8-API/1.0.0'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.success) {
      console.log('✅ Oportunidade atualizada com sucesso na Kentro');
      return response.data.data;
    } else {
      console.log('❌ Erro ao atualizar oportunidade na Kentro');
      return null;
    }
  } catch (error) {
    console.error('❌ ERRO AO ATUALIZAR OPORTUNIDADE NA KENTRO:');
    console.error('📊 Status:', error.response?.status);
    console.error('📋 Headers:', error.response?.headers);
    console.error('📄 Resposta completa:', JSON.stringify(error.response?.data, null, 2));
    console.error('🔍 Mensagem:', error.message);
    console.error('📝 Stack:', error.stack);
    throw new Error('Falha ao atualizar oportunidade na Kentro');
  }
};

/**
 * Sincronizar oportunidade na Kentro após sucesso no cadastro V8
 * Verifica se existe, atualiza ou cria, e move para stage 21
 */
const sincronizarOportunidadeKentro = async (dadosCliente) => {
  try {
    const cpf = dadosCliente.cpf;
    console.log(`🔄 [${cpf}] Iniciando sincronização de oportunidade na Kentro...`);
    
    if (!cpf) {
      throw new Error('CPF é obrigatório para sincronizar oportunidade na Kentro');
    }
    
    // 1. Verificar se existe oportunidade
    const oportunidadeExistente = await buscarOportunidadeKentro(cpf);
    
    // Preparar dados para atualização/criação
    const valorLiberado = dadosCliente.valorLiberado || dadosCliente.dadosSimulacao?.disbursement_amount || 
                          dadosCliente.dadosSimulacao?.operation_amount || 
                          dadosCliente.simulacao_resultado?.disbursement_amount ||
                          dadosCliente.simulacao_resultado?.operation_amount || 0;
    const nome = dadosCliente.nome || dadosCliente.dadosCliente?.nome || dadosCliente.dadosCliente?.title || '';
    const telefone = dadosCliente.telefone || dadosCliente.dadosCliente?.telefone || dadosCliente.dadosCliente?.mainphone || '';
    const email = dadosCliente.email || dadosCliente.dadosCliente?.email || 
                   dadosCliente.dadosCliente?.formsdata?.['9e7f92b0'] || '';
    
    // Data de nascimento - tentar extrair de várias fontes
    const dataNascimento = dadosCliente.dataNascimento || dadosCliente.data_nascimento || 
                          dadosCliente.dadosCliente?.dataNascimento || 
                          dadosCliente.dadosCliente?.data_nascimento || '';
    
    // Endereço - tentar extrair do endereco completo se for string
    const endereco = dadosCliente.endereco || dadosCliente.dadosCliente?.endereco || {};
    let enderecoCompleto, numero, cidade, estado, cep, bairro;
    
    if (typeof endereco === 'string' && endereco.trim() !== '') {
      // Se é uma string, tentar parsear (formato: "Cidade, UF" ou "Rua, Número - Cidade, UF")
      const partes = endereco.split(',');
      if (partes.length >= 2) {
        cidade = partes[0].trim();
        estado = partes[partes.length - 1].trim();
        enderecoCompleto = endereco;
        numero = '';
      } else {
        enderecoCompleto = endereco;
        cidade = '';
        estado = '';
        numero = '';
      }
      cep = '';
    } else if (typeof endereco === 'object') {
      enderecoCompleto = endereco.rua || endereco.address1 || endereco.completo || 'AV PAULISTA';
      numero = endereco.numero || endereco.address2 || '1000';
      cidade = endereco.cidade || endereco.city || 'SAO PAULO';
      estado = endereco.estado || endereco.state || endereco.uf || 'SP';
      cep = endereco.cep || endereco.postalcode || '01310100';
      bairro = endereco.bairro || endereco.neighborhood || '';
    } else {
      enderecoCompleto = 'AV PAULISTA';
      numero = '1000';
      cidade = 'SAO PAULO';
      estado = 'SP';
      cep = '01310100';
      bairro = '';
    }
    
    let oportunidadeId = null;
    
    if (oportunidadeExistente && oportunidadeExistente.id) {
      // 2. Se existe, atualizar
      console.log(`🔄 [${cpf}] Oportunidade encontrada (ID: ${oportunidadeExistente.id}). Atualizando...`);
      
      // Buscar oportunidade completa para preservar etiquetas existentes
      let tagsExistentes = [];
      try {
        const oportunidadeCompleta = await buscarOportunidadePorId(oportunidadeExistente.id);
        if (oportunidadeCompleta && oportunidadeCompleta.tags) {
          tagsExistentes = Array.isArray(oportunidadeCompleta.tags) 
            ? oportunidadeCompleta.tags 
            : (oportunidadeCompleta.tags.split ? oportunidadeCompleta.tags.split(',') : []);
        }
      } catch (error) {
        console.log(`⚠️ [${cpf}] Não foi possível buscar etiquetas existentes:`, error.message);
      }
      
      // Adicionar etiqueta 6 se não existir
      const tagsAtualizadas = [...new Set([...tagsExistentes, 6])].map(t => parseInt(t));
      
      const dadosAtualizacao = {
        queueId: parseInt(process.env.KENTRO_QUEUE_ID),
        apiKey: process.env.KENTRO_API_KEY,
        id: parseInt(oportunidadeExistente.id),
        // NOTA: fkStage não é aceito em updateOpportunity, usar changeOpportunityStage separadamente
        title: nome || oportunidadeExistente.title || `Cliente ${cpf}`,
        mainphone: telefone || oportunidadeExistente.mainphone || '',
        mainmail: cpf, // CPF no mainmail
        value: parseFloat(valorLiberado) || oportunidadeExistente.value || 0,
        description: `Crédito consignado CLT - Valor liberado: R$ ${parseFloat(valorLiberado).toFixed(2)}`,
        formattedlocation: `${enderecoCompleto}, ${numero} - ${cidade}, ${estado}`,
        address1: enderecoCompleto,
        address2: numero,
        city: cidade,
        state: estado,
        postalcode: cep,
        country: 'Brasil',
        countrycode: 'BR',
        formsdata: {
          ...(email ? { '9e7f92b0': email } : {}),
          ...(dataNascimento ? { '0bfc6250': dataNascimento } : {}),
          // Campos de endereço nos formsdata
          ...(cep ? { '1836e090': cep } : {}),
          ...(enderecoCompleto ? { '1dbfcef0': enderecoCompleto } : {}),
          ...(numero ? { '6ac31450': numero } : {}),
          ...(bairro ? { '3271f710': bairro } : {}),
          ...(cidade ? { '25178280': cidade } : {}),
          ...(estado ? { 'f6384400': estado } : {})
        },
        tags: tagsAtualizadas // Preservar etiquetas existentes e adicionar 6
      };
      
      try {
        console.log(`📤 [${cpf}] Enviando atualização para Kentro (ID: ${oportunidadeExistente.id})...`);
        const response = await axios.post(
          `${process.env.KENTRO_API_URL}/updateOpportunity`,
          dadosAtualizacao,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CLT-V8-API/1.0.0'
            },
            timeout: 30000
          }
        );
        
        if (response.data && (response.data.success || response.data.id)) {
          console.log(`✅ [${cpf}] Oportunidade atualizada com sucesso na Kentro`);
          oportunidadeId = oportunidadeExistente.id;
        } else {
          console.log(`⚠️ [${cpf}] Resposta inesperada ao atualizar oportunidade:`, JSON.stringify(response.data, null, 2));
          oportunidadeId = oportunidadeExistente.id; // Usar ID existente mesmo com resposta inesperada
        }
      } catch (updateError) {
        console.error(`❌ [${cpf}] Erro ao atualizar oportunidade:`, updateError.message);
        if (updateError.response) {
          console.error(`   Status: ${updateError.response.status}`);
          console.error(`   Dados:`, JSON.stringify(updateError.response.data, null, 2));
        }
        // Continuar com o ID existente mesmo com erro
        oportunidadeId = oportunidadeExistente.id;
      }
    } else {
      // 3. Se não existe, criar nova
      console.log(`📝 [${cpf}] Oportunidade não encontrada. Criando nova...`);
      
      const dadosCriacao = {
        queueId: parseInt(process.env.KENTRO_QUEUE_ID),
        apiKey: process.env.KENTRO_API_KEY,
        fkPipeline: 4, // Pipeline ID conforme especificação
        fkStage: 21, // Stage inicial conforme especificação
        responsableid: 0,
        title: nome || `Cliente ${cpf}`,
        clientid: cpf,
        mainphone: telefone || '',
        mainmail: cpf, // CPF no mainmail
        description: `Crédito consignado CLT - Valor liberado: R$ ${parseFloat(valorLiberado).toFixed(2)}`,
        value: parseFloat(valorLiberado) || 0,
        formattedlocation: `${enderecoCompleto}, ${numero} - ${cidade}, ${estado}`,
        address1: enderecoCompleto,
        address2: numero,
        city: cidade,
        state: estado,
        postalcode: cep,
        country: 'Brasil',
        countrycode: 'BR',
        probability: 100,
        formsdata: {
          ...(email ? { '9e7f92b0': email } : {}),
          ...(dataNascimento ? { '0bfc6250': dataNascimento } : {}),
          // Campos de endereço nos formsdata
          ...(cep ? { '1836e090': cep } : {}),
          ...(enderecoCompleto ? { '1dbfcef0': enderecoCompleto } : {}),
          ...(numero ? { '6ac31450': numero } : {}),
          ...(bairro ? { '3271f710': bairro } : {}),
          ...(cidade ? { '25178280': cidade } : {}),
          ...(estado ? { 'f6384400': estado } : {})
        },
        tags: [6] // Etiqueta 6
      };
      
      try {
        const response = await axios.post(
          `${process.env.KENTRO_API_URL}/createOpportunity`,
          dadosCriacao,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CLT-V8-API/1.0.0'
            },
            timeout: 30000
          }
        );
        
        if (response.data && response.data.id) {
          console.log(`✅ [${cpf}] Oportunidade criada com sucesso na Kentro (ID: ${response.data.id})`);
          oportunidadeId = response.data.id;
        } else {
          throw new Error('Resposta da API não contém ID da oportunidade');
        }
      } catch (createError) {
        console.error(`❌ [${cpf}] Erro ao criar oportunidade:`, createError.message);
        throw createError;
      }
    }
    
    // 4. Mover para stage 21 se tiver oportunidade ID (CRÍTICO - SEMPRE EXECUTAR)
    if (oportunidadeId) {
      console.log(`🚀 [${cpf}] MOVENDO oportunidade ${oportunidadeId} para stage 21 (OBRIGATÓRIO)...`);
      
      try {
        const fluxoData = {
          queueId: parseInt(process.env.KENTRO_QUEUE_ID),
          apiKey: process.env.KENTRO_API_KEY,
          id: parseInt(oportunidadeId),
          destStageId: 21
        };
        
        console.log(`📤 [${cpf}] Dados enviados para changeOpportunityStage:`, JSON.stringify(fluxoData, null, 2));
        
        const response = await axios.post(
          `${process.env.KENTRO_API_URL}/changeOpportunityStage`,
          fluxoData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CLT-V8-API/1.0.0'
            },
            timeout: 30000
          }
        );
        
        console.log(`📥 [${cpf}] Resposta changeOpportunityStage:`, JSON.stringify(response.data, null, 2));
        
        // Verificar sucesso: success, id, status === 'success', ou result === true
        const sucesso = response.data && (
          response.data.success === true || 
          response.data.success === 'true' ||
          response.data.id || 
          response.data.status === 'success' ||
          response.data.result === true ||
          response.data.result === 'true'
        );
        
        if (sucesso) {
          console.log(`✅✅✅ [${cpf}] Oportunidade ${oportunidadeId} MOVIDA PARA STAGE 21 COM SUCESSO! ✅✅✅`);
          
          // Verificar se realmente está na fase 21 após 2 segundos
          await new Promise(resolve => setTimeout(resolve, 2000));
          const oportunidadeVerificada = await buscarOportunidadeKentro(cpf);
          if (oportunidadeVerificada && oportunidadeVerificada.fkStage === 21) {
            console.log(`✅✅✅ [${cpf}] CONFIRMADO: Oportunidade ${oportunidadeId} está na fase 21!`);
          } else {
            console.error(`❌❌❌ [${cpf}] ATENÇÃO: Resposta indicou sucesso, mas oportunidade está na fase ${oportunidadeVerificada?.fkStage || 'N/A'}!`);
          }
        } else {
          console.error(`❌❌❌ [${cpf}] FALHA ao mover oportunidade para stage 21! Resposta:`, JSON.stringify(response.data, null, 2));
          // Tentar novamente após 1 segundo
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            const retryResponse = await axios.post(
              `${process.env.KENTRO_API_URL}/changeOpportunityStage`,
              fluxoData,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'User-Agent': 'CLT-V8-API/1.0.0'
                },
                timeout: 30000
              }
            );
            const retrySucesso = retryResponse.data && (
              retryResponse.data.success || 
              retryResponse.data.id || 
              retryResponse.data.status === 'success' ||
              retryResponse.data.result === true ||
              retryResponse.data.result === 'true'
            );
            
            if (retrySucesso) {
              console.log(`✅ [${cpf}] Oportunidade movida para stage 21 na segunda tentativa!`);
            } else {
              console.error(`❌ [${cpf}] FALHA também na segunda tentativa:`, JSON.stringify(retryResponse.data, null, 2));
            }
          } catch (retryError) {
            console.error(`❌ [${cpf}] Erro na segunda tentativa:`, retryError.message);
          }
        }
      } catch (stageError) {
        console.error(`❌❌❌ [${cpf}] ERRO CRÍTICO ao mover oportunidade ${oportunidadeId} para stage 21:`, stageError.message);
        if (stageError.response) {
          console.error(`   Status: ${stageError.response.status}`);
          console.error(`   Dados:`, JSON.stringify(stageError.response.data, null, 2));
          console.error(`   Headers:`, JSON.stringify(stageError.response.headers, null, 2));
        }
        console.error(`   Stack:`, stageError.stack);
        // Tentar novamente uma vez
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const retryData = {
            queueId: parseInt(process.env.KENTRO_QUEUE_ID),
            apiKey: process.env.KENTRO_API_KEY,
            id: parseInt(oportunidadeId),
            destStageId: 21
          };
          const retryResponse = await axios.post(
            `${process.env.KENTRO_API_URL}/changeOpportunityStage`,
            retryData,
            {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'CLT-V8-API/1.0.0'
              },
              timeout: 30000
            }
          );
          console.log(`✅ [${cpf}] Segunda tentativa - Resposta:`, JSON.stringify(retryResponse.data, null, 2));
        } catch (retryError) {
          console.error(`❌ [${cpf}] Segunda tentativa também falhou:`, retryError.message);
        }
      }
    } else {
      console.error(`❌❌❌ [${cpf}] ERRO: oportunidadeId é null - NÃO FOI POSSÍVEL MOVER PARA STAGE 21!`);
    }
    
    // Verificar se realmente está na fase 21 antes de retornar sucesso
    let faseConfirmada = false;
    let faseAtualVerificada = null;
    if (oportunidadeId) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2 segundos
        const oportunidadeVerificada = await buscarOportunidadeKentro(cpf);
        faseAtualVerificada = oportunidadeVerificada?.fkStage || null;
        if (oportunidadeVerificada && oportunidadeVerificada.fkStage === 21) {
          faseConfirmada = true;
          console.log(`✅✅✅ [${cpf}] CONFIRMADO: Oportunidade ${oportunidadeId} está na fase 21!`);
        } else {
          console.error(`❌❌❌ [${cpf}] ATENÇÃO: Oportunidade ${oportunidadeId} NÃO está na fase 21! Fase atual: ${faseAtualVerificada || 'N/A'}`);
        }
      } catch (verificacaoError) {
        console.error(`❌ [${cpf}] Erro ao verificar fase após sincronização:`, verificacaoError.message);
      }
    }
    
    // Retornar sucesso apenas se fase foi confirmada
    // Se não conseguiu confirmar, ainda retorna success: true mas com faseConfirmada: false
    // para que o código que chama possa verificar
    return {
      success: !!oportunidadeId, // Retorna true se tem ID (oportunidade foi criada/atualizada)
      oportunidadeId: oportunidadeId,
      acao: oportunidadeExistente ? 'atualizada' : 'criada',
      faseConfirmada: faseConfirmada, // Indica se realmente está na fase 21
      faseAtual: faseAtualVerificada // Fase atual verificada
    };
    
  } catch (error) {
    console.error(`❌ Erro ao sincronizar oportunidade na Kentro:`, error.message);
    // Não falhar o processo principal por erro na Kentro
    return {
      success: false,
      error: error.message,
      oportunidadeId: null
    };
  }
};

/**
 * Disparar fluxo de oportunidade na Kentro
 */
const dispararFluxoKentro = async (oportunidadeId, destStageId = 4) => {
  try {
    console.log(`🚀 [${oportunidadeId}] Disparando fluxo da oportunidade ${oportunidadeId} para etapa ${destStageId}...`);
    
    const fluxoData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      id: oportunidadeId.toString(),
      destStageId: destStageId
    };

    const response = await axios.post(
      `${process.env.KENTRO_API_URL}/changeOpportunityStage`,
      fluxoData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CLT-V8-API/1.0.0'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.success) {
      console.log(`✅ [${oportunidadeId}] Fluxo disparado com sucesso na Kentro`);
      return response.data.data;
    } else {
      console.log(`❌ [${oportunidadeId}] Erro ao disparar fluxo na Kentro`);
      return null;
    }
  } catch (error) {
    console.error(`❌ [${oportunidadeId}] Erro ao disparar fluxo na Kentro:`, error.response?.data || error.message);
    throw new Error('Falha ao disparar fluxo na Kentro');
  }
};

/**
 * Solicitar termo CLT na V8 Digital
 */
const solicitarTermoCLT = async (dadosOportunidade) => {
  const cpf = dadosOportunidade.mainmail || 'N/A';
  try {
    console.log(`📝 [${cpf}] Solicitando termo CLT na V8 Digital...`);
    
    const token = await getValidToken();
    const formsdata = dadosOportunidade.formsdata || {};
    
    // Converter data de nascimento do formato DD/MM/YYYY para YYYY-MM-DD
    // Formatar data de nascimento para YYYY-MM-DD
    const dataNascimento = formsdata['0bfc6250'] || '';
    const dataFormatada = formatarDataNascimento(dataNascimento);
    
    // Extrair DDD do telefone (countryCode fixo = 55)
    const telefone = dadosOportunidade.mainphone || '';
    let phoneNumber = telefone.replace(/\D/g, ''); // Remove caracteres não numéricos
    const countryCode = '55'; // Brasil - FIXO
    let areaCode = '';
    
    // Validar se o telefone tem pelo menos 10 dígitos
    if (phoneNumber.length < 10) {
      console.log(`❌ [${cpf}] Telefone incorreto: ${phoneNumber} (${phoneNumber.length} dígitos)`);
      throw new Error('Telefone incorreto');
    }
    
    if (phoneNumber.length >= 10) {
      if (phoneNumber.startsWith('55') && phoneNumber.length >= 12) {
        // Formato: 55 + DDD + número
        areaCode = phoneNumber.substring(2, 4);
        phoneNumber = phoneNumber.substring(4);
      } else if (phoneNumber.length === 11) {
        // Formato: DDD + número (9 dígitos)
        areaCode = phoneNumber.substring(0, 2);
        phoneNumber = phoneNumber.substring(2);
      } else if (phoneNumber.length === 10) {
        // Formato: DDD + número (8 dígitos)
        areaCode = phoneNumber.substring(0, 2);
        phoneNumber = phoneNumber.substring(2);
      }
    }
    
    // Garantir que o telefone tenha 9 dígitos (V8 Digital exige)
    if (phoneNumber.length === 8) {
      phoneNumber = '9' + phoneNumber; // Adicionar dígito 9 no início
      console.log(`📱 [${cpf}] Telefone ajustado para 9 dígitos: ${phoneNumber}`);
    }
    
    let email = formsdata['9e7f92b0'] || '';
    
    // Se não tem email válido, usar email baseado no CPF: cpf@gmail.com
    if (!email || email.trim() === '' || email === 'null' || !email.includes('@')) {
      email = `${cpf}@gmail.com`;
      console.log(`⚠️ [${cpf}] Email não encontrado. Usando email baseado no CPF: ${email}`);
      formsdata['9e7f92b0'] = email;
    }
    
    // Validar formato básico do email (deve ter @ e domínio válido)
    const emailFinal = formsdata['9e7f92b0'].trim();
    if (!emailFinal.includes('@') || emailFinal.split('@').length !== 2 || !emailFinal.split('@')[1].includes('.')) {
      // Se o formato ainda estiver inválido, usar email baseado no CPF
      const emailCpf = `${cpf}@gmail.com`;
      console.log(`⚠️ [${cpf}] Email com formato inválido: "${emailFinal}". Usando: ${emailCpf}`);
      formsdata['9e7f92b0'] = emailCpf;
    } else {
      // Atualizar formsdata com email validado
      formsdata['9e7f92b0'] = emailFinal;
    }
    
    // Validar se o nome existe
    const nome = limparNomeParaV8(dadosOportunidade.title || '');
    if (!nome || nome.trim() === '') {
      console.error(`❌ [${cpf}] Nome não encontrado ou vazio no title`);
      throw new Error('Nome não encontrado no title da oportunidade. Preencha o campo de nome na Kentro antes de processar.');
    }
    
    const termoData = {
      borrowerDocumentNumber: dadosOportunidade.mainmail, // CPF
      gender: "male", // Por enquanto fixo, pode ser extraído de outro campo se necessário
      birthDate: dataFormatada, // Data no formato YYYY-MM-DD
      signerName: nome, // Nome limpo para V8 Digital
      signerEmail: email, // Email (com fallback se não tiver na Kentro)
      signerPhone: {
        phoneNumber: phoneNumber,
        countryCode: countryCode,
        areaCode: areaCode
      },
      provider: "QI" // Provider - FIXO
    };

    console.log(`📋 [${cpf}] Dados para termo CLT:`, JSON.stringify(termoData, null, 2));

    const response = await axios.post(
      `${process.env.V8_API_URL}/private-consignment/consult`,
      termoData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log(`✅ [${cpf}] Termo CLT solicitado com sucesso`);
    console.log(`📋 [${cpf}] FLUXO: termo gerado`);
    
    const termoId = response.data.id;
    console.log(`🆔 [${cpf}] ID do termo:`, termoId);
    
    // Autorizar o termo automaticamente
    console.log(`🔐 [${cpf}] Autorizando termo CLT...`);
    console.log(`📋 [${cpf}] FLUXO: assinando termo`);
    console.log(`🌐 [${cpf}] URL de autorização:`, `${process.env.V8_API_URL}/private-consignment/consult/${termoId}/authorize`);
    
    try {
      const authorizeResponse = await axios.post(
        `${process.env.V8_API_URL}/private-consignment/consult/${termoId}/authorize`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      
      console.log(`✅ [${cpf}] Termo CLT autorizado com sucesso`);
      console.log(`📊 [${cpf}] Status da autorização:`, authorizeResponse.status);
      console.log(`📄 [${cpf}] Resposta da autorização:`, JSON.stringify(authorizeResponse.data, null, 2));
      
    } catch (authorizeError) {
      console.error(`❌ [${cpf}] ERRO AO AUTORIZAR TERMO CLT:`);
      console.error(`📊 [${cpf}] Status:`, authorizeError.response?.status);
      console.error(`📄 [${cpf}] Resposta:`, JSON.stringify(authorizeError.response?.data, null, 2));
      console.error(`📋 [${cpf}] Mensagem:`, authorizeError.message);
      
      // Continuar mesmo com erro de autorização
      console.log(`⚠️ [${cpf}] Continuando fluxo mesmo com erro de autorização...`);
    }
    
    // Verificar status do termo usando o novo endpoint de consulta
    console.log(`⏳ [${cpf}] Aguardando processamento do termo...`);
    console.log(`📋 [${cpf}] FLUXO: consultando termo`);
    const startTime = Date.now();
    const timeoutMs = 120000; // 2 minutos (aumentado para dar mais tempo)
    let tentativaConsulta = 0;

    while (Date.now() - startTime < timeoutMs) {
      try {
        tentativaConsulta++;
        // Buscar o termo na lista de consultas usando o novo endpoint
        const hoje = new Date();
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(hoje.getDate() - 30);
        
        const startDate = trintaDiasAtras.toISOString();
        const endDate = hoje.toISOString();
        
        console.log(`🔍 [${cpf}] Consultando status do termo... (Tentativa ${tentativaConsulta})`);
        console.log(`📋 [${cpf}] FLUXO: consultando termo (tentativa ${tentativaConsulta})`);
        const statusResponse = await axios.get(
          `${process.env.V8_API_URL}/private-consignment/consult?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=100&page=1&provider=QI`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            },
            timeout: 15000
          }
        );

        // Procurar o termo específico na lista
        const termoEncontrado = statusResponse.data.data.find(termo => termo.id === termoId);
        
        if (termoEncontrado) {
          console.log(`📊 [${cpf}] Status do termo:`, termoEncontrado.status);
          console.log(`📋 [${cpf}] Descrição:`, termoEncontrado.description);
          console.log(`💰 [${cpf}] Margem disponível:`, termoEncontrado.availableMarginValue);
          
          // Se o termo foi processado (não está mais WAITING_CONSENT), retornar resultado
          if (termoEncontrado.status !== 'WAITING_CONSENT') {
            console.log(`✅ [${cpf}] Termo CLT processado:`, termoEncontrado.status);
            return {
              id: termoId,
              authorized: true,
              finalized: true,
              status: termoEncontrado.status,
              description: termoEncontrado.description,
              availableMarginValue: termoEncontrado.availableMarginValue,
              partnerId: termoEncontrado.partnerId,
              documentNumber: termoEncontrado.documentNumber,
              name: termoEncontrado.name
            };
          } else {
            console.log(`⏳ [${cpf}] Termo ainda aguardando consentimento...`);
          }
        } else {
          console.log(`⚠️ [${cpf}] Termo não encontrado na lista ainda`);
        }

        // Aguardar 10 segundos antes da próxima verificação
        await new Promise(resolve => setTimeout(resolve, 10000));

      } catch (statusError) {
        console.log(`⚠️ [${cpf}] Erro ao verificar status do termo:`, statusError.message);
        console.log(`📄 [${cpf}] Resposta do erro:`, JSON.stringify(statusError.response?.data, null, 2));
        // Continuar tentando mesmo com erro de status
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // Timeout atingido - termo não foi processado em 2 minutos
    console.log(`⏰ [${cpf}] Timeout: Termo não foi processado em 2 minutos`);
    return {
      id: termoId,
      authorized: true,
      finalized: false,
      timeout: true,
      message: 'Termo não processado - tente mais tarde'
    };
  } catch (error) {
    console.error(`❌ [${cpf}] ===== ERRO AO SOLICITAR TERMO CLT =====`);
    console.error(`❌ [${cpf}] Mensagem:`, error.message);
    console.error(`📊 [${cpf}] Status HTTP:`, error.response?.status);
    console.error(`📋 [${cpf}] Headers:`, JSON.stringify(error.response?.headers, null, 2));
    console.error(`📄 [${cpf}] Resposta completa da API V8:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`📄 [${cpf}] Error completo:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error(`📝 [${cpf}] Stack:`, error.stack);
    
    // Capturar mensagem de erro específica da V8 - tentar todos os campos possíveis
    let mensagemErro = 'Falha ao solicitar termo CLT na V8 Digital';
    if (error.response?.data) {
      const errorData = error.response.data;
      // Tentar todos os campos possíveis da API V8
      mensagemErro = errorData.title || 
                     errorData.detail || 
                     errorData.message || 
                     errorData.error || 
                     errorData.description ||
                     (typeof errorData === 'string' ? errorData : null) ||
                     JSON.stringify(errorData).substring(0, 200) ||
                     mensagemErro;
      
      // Log completo para debug
      console.error(`📋 [${cpf}] Dados completos do erro V8:`, JSON.stringify(errorData, null, 2));
    }
    
    console.error(`❌ [${cpf}] Mensagem de erro final: ${mensagemErro}`);
    throw new Error(mensagemErro);
  }
};

/**
 * Consultar status de um termo específico
 */
const consultarStatusTermo = async (termoId) => {
  try {
    console.log(`🔍 [${termoId}] Consultando status do termo: ${termoId}`);
    
    const token = await getValidToken();
    
    // Buscar o termo na lista de consultas
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    
    const startDate = trintaDiasAtras.toISOString();
    const endDate = hoje.toISOString();
    
    const response = await axios.get(
      `${process.env.V8_API_URL}/private-consignment/consult?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=100&page=1&provider=QI`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    // Procurar o termo específico na lista
    const termoEncontrado = response.data.data.find(termo => termo.id === termoId);
    
    if (termoEncontrado) {
      console.log(`✅ [${termoId}] Termo encontrado:`);
      console.log(`📊 [${termoId}] Status:`, termoEncontrado.status);
      console.log(`📋 [${termoId}] Descrição:`, termoEncontrado.description);
      console.log(`💰 [${termoId}] Margem disponível:`, termoEncontrado.availableMarginValue);
      
      return {
        encontrado: true,
        id: termoEncontrado.id,
        status: termoEncontrado.status,
        description: termoEncontrado.description,
        availableMarginValue: termoEncontrado.availableMarginValue,
        partnerId: termoEncontrado.partnerId,
        documentNumber: termoEncontrado.documentNumber,
        name: termoEncontrado.name
      };
    } else {
      console.log(`⚠️ [${termoId}] Termo não encontrado na lista`);
      return {
        encontrado: false,
        id: termoId,
        message: 'Termo não encontrado na lista de consultas'
      };
    }
    
  } catch (error) {
    console.error(`❌ [${termoId}] ERRO AO CONSULTAR STATUS DO TERMO:`);
    console.error(`📊 [${termoId}] Status:`, error.response?.status);
    console.error(`📄 [${termoId}] Resposta completa:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`❌ [${termoId}] ===== ERRO AO CONSULTAR STATUS DO TERMO =====`);
    console.error(`❌ [${termoId}] Mensagem:`, error.message);
    console.error(`📊 [${termoId}] Status HTTP:`, error.response?.status);
    console.error(`📋 [${termoId}] Headers:`, JSON.stringify(error.response?.headers, null, 2));
    console.error(`📄 [${termoId}] Resposta completa da API V8:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`📄 [${termoId}] Error completo:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error(`📝 [${termoId}] Stack:`, error.stack);
    
    // Capturar mensagem de erro específica da V8
    let mensagemErro = 'Falha ao consultar status do termo';
    if (error.response?.data) {
      const errorData = error.response.data;
      mensagemErro = errorData.title || 
                     errorData.detail || 
                     errorData.message || 
                     errorData.error || 
                     errorData.description ||
                     (typeof errorData === 'string' ? errorData : JSON.stringify(errorData).substring(0, 200)) ||
                     error.message;
      console.error(`📋 [${termoId}] Dados completos do erro V8:`, JSON.stringify(errorData, null, 2));
      console.error(`📋 [${termoId}] Mensagem de erro extraída da V8: ${mensagemErro}`);
    }
    
    console.error(`❌ [${termoId}] Mensagem de erro final: ${mensagemErro}`);
    console.error(`❌ [${termoId}] ===== FIM ERRO AO CONSULTAR STATUS DO TERMO =====`);
    
    throw new Error(mensagemErro);
  }
};

/**
 * Verificar se já existe termo para o CPF
 * Consulta termos existentes usando GET antes de criar um novo
 * Busca termos dos últimos 30 dias (período válido do termo)
 */
const verificarTermoExistente = async (cpf) => {
  try {
    console.log(`🔍 [${cpf}] Verificando se já existe termo para CPF: ${cpf}`);
    
    const token = await getValidToken();
    
    // Buscar termos dos últimos 30 dias (período válido do termo)
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    
    const startDate = trintaDiasAtras.toISOString();
    const endDate = hoje.toISOString();
    
    console.log(`📅 [${cpf}] Buscando termos entre ${startDate} e ${endDate}`);
    
    const response = await axios.get(
      `${process.env.V8_API_URL}/private-consignment/consult`,
      {
        params: {
          startDate: startDate,
          endDate: endDate,
          limit: 100,
          page: 1,
          provider: 'QI',
          search: cpf.replace(/\D/g, '') // CPF apenas números
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      console.log(`⚠️ [${cpf}] Resposta inválida ao consultar termos`);
      return null;
    }

    // Filtrar pelo CPF exato (sem formatação)
    const cpfLimpo = cpf.replace(/\D/g, '');
    const termosCPF = response.data.data.filter(t => {
      const docNumber = t.documentNumber ? t.documentNumber.replace(/\D/g, '') : '';
      return docNumber === cpfLimpo;
    });
    
    if (termosCPF.length > 0) {
      // Ordenar por data (mais recente primeiro) e retornar o termo mais recente
      const termosOrdenados = termosCPF.sort((a, b) => {
        // Se tiver data de criação, usar ela, senão usar ordem da lista
        return 0; // A lista já vem ordenada do mais recente
      });
      
      const termoMaisRecente = termosOrdenados[0];
      const status = termoMaisRecente.status;
      
      // IMPORTANTE: Se o termo está WAITING_CONSULT, consultar novamente para ver se mudou de status
      // Pode ter sido processado e rejeitado enquanto aguardava
      if (status === 'WAITING_CONSULT') {
        console.log(`⏳ [${cpf}] Termo encontrado com status WAITING_CONSULT - consultando status atualizado...`);
        console.log(`📋 [${cpf}] FLUXO: consultando termo existente (WAITING_CONSULT)`);
        
        try {
          // Consultar o status atualizado do termo
          const statusAtualizado = await consultarStatusTermo(termoMaisRecente.id);
          
          if (statusAtualizado) {
            console.log(`📊 [${cpf}] Status atualizado do termo: ${statusAtualizado.status}`);
            console.log(`📋 [${cpf}] Descrição atualizada: ${statusAtualizado.description || 'N/A'}`);
            
            // Se mudou para REJECTED ou FAILED, retornar com o status atualizado
            if (statusAtualizado.status === 'REJECTED' || statusAtualizado.status === 'FAILED') {
              console.log(`❌ [${cpf}] Termo foi rejeitado/falhou após consulta: ${statusAtualizado.status}`);
              return {
                id: statusAtualizado.id || termoMaisRecente.id,
                status: statusAtualizado.status,
                description: statusAtualizado.description,
                availableMarginValue: statusAtualizado.availableMarginValue,
                partnerId: statusAtualizado.partnerId || termoMaisRecente.partnerId,
                documentNumber: statusAtualizado.documentNumber || termoMaisRecente.documentNumber,
                name: statusAtualizado.name || termoMaisRecente.name
              };
            }
            
            // Se mudou para SUCCESS ou WAITING_CREDIT_ANALYSIS, usar o status atualizado
            if (statusAtualizado.status === 'SUCCESS' || statusAtualizado.status === 'WAITING_CREDIT_ANALYSIS') {
              console.log(`✅ [${cpf}] Termo aprovado após consulta: ${statusAtualizado.status}`);
              return {
                id: statusAtualizado.id || termoMaisRecente.id,
                status: statusAtualizado.status,
                description: statusAtualizado.description,
                availableMarginValue: statusAtualizado.availableMarginValue,
                partnerId: statusAtualizado.partnerId || termoMaisRecente.partnerId,
                documentNumber: statusAtualizado.documentNumber || termoMaisRecente.documentNumber,
                name: statusAtualizado.name || termoMaisRecente.name,
                authorized: true,
                finalized: true
              };
            }
            
            // Se ainda está WAITING_CONSULT, retornar para aguardar no fluxo principal
            if (statusAtualizado.status === 'WAITING_CONSULT') {
              console.log(`⏳ [${cpf}] Termo ainda aguardando consulta (WAITING_CONSULT) - será aguardado no fluxo principal`);
              return {
                id: statusAtualizado.id || termoMaisRecente.id,
                status: statusAtualizado.status,
                description: statusAtualizado.description,
                availableMarginValue: statusAtualizado.availableMarginValue,
                partnerId: statusAtualizado.partnerId || termoMaisRecente.partnerId,
                documentNumber: statusAtualizado.documentNumber || termoMaisRecente.documentNumber,
                name: statusAtualizado.name || termoMaisRecente.name,
                authorized: false,
                finalized: false
              };
            }
          }
        } catch (error) {
            console.log(`⚠️ [${cpf}] Erro ao consultar status atualizado do termo WAITING_CONSULT:`, error.message);
            // Se der erro, retornar o termo original para aguardar no fluxo principal
            console.log(`⏳ [${cpf}] Retornando termo original para aguardar no fluxo principal`);
            return {
              id: termoMaisRecente.id,
              status: termoMaisRecente.status,
              description: termoMaisRecente.description,
              availableMarginValue: termoMaisRecente.availableMarginValue,
              partnerId: termoMaisRecente.partnerId,
              documentNumber: termoMaisRecente.documentNumber,
              name: termoMaisRecente.name,
              authorized: false,
              finalized: false
            };
          }
      }
      
      // Status válidos para reutilizar: SUCCESS, WAITING_CREDIT_ANALYSIS, CONSENT_APPROVED
      const statusValidos = ['SUCCESS', 'WAITING_CREDIT_ANALYSIS', 'CONSENT_APPROVED'];
      
      if (statusValidos.includes(status)) {
        console.log(`✅ [${cpf}] Termo existente válido encontrado: ${termoMaisRecente.id} (Status: ${status})`);
        console.log(`📋 [${cpf}] Descrição: ${termoMaisRecente.description || 'N/A'}`);
        console.log(`💰 [${cpf}] Margem disponível: ${termoMaisRecente.availableMarginValue || 'N/A'}`);
        
        return {
          id: termoMaisRecente.id,
          status: termoMaisRecente.status,
          description: termoMaisRecente.description,
          availableMarginValue: termoMaisRecente.availableMarginValue,
          partnerId: termoMaisRecente.partnerId,
          documentNumber: termoMaisRecente.documentNumber,
          name: termoMaisRecente.name,
          authorized: status !== 'WAITING_CONSENT',
          finalized: status === 'SUCCESS' || status === 'WAITING_CREDIT_ANALYSIS'
        };
      } else {
        console.log(`⚠️ [${cpf}] Termo existente encontrado mas com status inválido: ${status}`);
        console.log(`📋 [${cpf}] Descrição: ${termoMaisRecente.description || 'N/A'}`);
        
        // Se for REJECTED ou FAILED, retornar para que o fluxo possa tratar
        if (status === 'REJECTED' || status === 'FAILED') {
          console.log(`❌ [${cpf}] Termo rejeitado/falhou: ${status}`);
          return {
            id: termoMaisRecente.id,
            status: termoMaisRecente.status,
            description: termoMaisRecente.description,
            availableMarginValue: termoMaisRecente.availableMarginValue,
            partnerId: termoMaisRecente.partnerId,
            documentNumber: termoMaisRecente.documentNumber,
            name: termoMaisRecente.name
          };
        }
        
        // Para outros status (WAITING_CONSENT), retornar null para criar novo
        return null;
      }
    }
    
    console.log(`❌ [${cpf}] Nenhum termo existente encontrado`);
    return null;
    
  } catch (error) {
    console.log(`⚠️ [${cpf}] Erro ao verificar termo existente:`, error.message);
    console.log(`📄 [${cpf}] Resposta do erro:`, JSON.stringify(error.response?.data, null, 2));
    console.log(`📊 [${cpf}] Status HTTP:`, error.response?.status);
    // Em caso de erro, retornar null para criar novo termo (não bloquear o fluxo)
    console.log(`⚠️ [${cpf}] Continuando fluxo mesmo com erro na verificação - será criado novo termo`);
    return null;
  }
};

/**
 * Executar fluxo completo CLT
 * @param {string} cpf - CPF do cliente
 * @param {number|null} valorPersonalizado - Valor personalizado para simulação
 * @param {number|null} prazoPersonalizado - Prazo personalizado em meses
 * @param {boolean} forcarNovoTermo - Se true, força criação de novo termo mesmo se existir um
 * @param {object|null} dadosCliente - Dados do cliente (nome, telefone, dataNascimento, email, endereco) - se fornecido, só busca na Kentro se faltar algum dado obrigatório
 * @param {boolean} buscarEmailKentro - Se true, busca email na Kentro mesmo quando tem dados completos
 */
const executarFluxoCLT = async (cpf, valorPersonalizado = null, prazoPersonalizado = null, forcarNovoTermo = false, dadosCliente = null, buscarEmailKentro = false) => {
  try {
    console.log(`🚀 Iniciando fluxo CLT para CPF: ${cpf}${valorPersonalizado ? `, valor personalizado: ${valorPersonalizado}` : ''}${prazoPersonalizado ? `, prazo personalizado: ${prazoPersonalizado}` : ''}${forcarNovoTermo ? ', FORÇAR NOVO TERMO' : ''}${dadosCliente ? ', dados do cliente fornecidos' : ''}${buscarEmailKentro ? ', buscar email na Kentro' : ''}`);
    
    let oportunidadeCompleta = null;
    let validacao = null;
    let emailKentro = null;
    
    // Verificar se dados do cliente foram fornecidos e se estão completos
    console.log(`🔍 [${cpf}] Verificando dadosCliente:`, {
      temDadosCliente: !!dadosCliente,
      temNome: !!(dadosCliente?.nome),
      temTelefone: !!(dadosCliente?.telefone),
      temDataNasc: !!(dadosCliente?.dataNascimento),
      nome: dadosCliente?.nome?.substring(0, 20) || 'N/A',
      telefone: dadosCliente?.telefone || 'N/A',
      dataNasc: dadosCliente?.dataNascimento || 'N/A'
    });
    
    if (dadosCliente && dadosCliente.nome && dadosCliente.telefone && dadosCliente.dataNascimento) {
      console.log(`✅ [${cpf}] Dados do cliente fornecidos - NÃO buscando na Kentro, usando apenas dados da base`);
      
      // NÃO buscar nada na Kentro quando dados já estão na base
      // Se não tiver email, usar cpf@gmail.com
      const emailFinal = dadosCliente.email && dadosCliente.email.trim() !== '' && dadosCliente.email !== 'null' && dadosCliente.email !== 'undefined'
        ? dadosCliente.email.trim()
        : `${cpf}@gmail.com`;
      
      if (!dadosCliente.email || dadosCliente.email.trim() === '' || dadosCliente.email === 'null' || dadosCliente.email === 'undefined') {
        console.log(`📧 [${cpf}] Email não fornecido na base - usando email gerado: ${emailFinal}`);
      }
      
      // Criar objeto de validação com dados fornecidos
      validacao = {
        valido: true,
        dados: {
          cpf: cpf,
          nome: dadosCliente.nome,
          telefone: dadosCliente.telefone,
          dataNascimento: dadosCliente.dataNascimento,
          email: emailFinal,
          endereco: dadosCliente.endereco || {}
        },
        dadosFaltantes: []
      };
      
      // Criar oportunidadeCompleta simulada para compatibilidade com o resto do código
      // IMPORTANTE: mainmail deve ser o CPF sem formatação (apenas números)
      const cpfLimpo = String(cpf).replace(/\D/g, '').slice(-11);
      oportunidadeCompleta = {
        id: null, // Não tem ID da Kentro
        mainmail: cpfLimpo, // CPF sem formatação (11 dígitos) - OBRIGATÓRIO para V8 Digital
        mainphone: dadosCliente.telefone,
        title: dadosCliente.nome,
        formsdata: {
          '0bfc6250': dadosCliente.dataNascimento,
          '9e7f92b0': emailFinal
        }
      };
      
      console.log(`📋 [${cpf}] OportunidadeCompleta criada:`, {
        mainmail: oportunidadeCompleta.mainmail,
        mainphone: oportunidadeCompleta.mainphone,
        title: oportunidadeCompleta.title?.substring(0, 30),
        dataNasc: oportunidadeCompleta.formsdata['0bfc6250'],
        email: oportunidadeCompleta.formsdata['9e7f92b0']
      });
      
      console.log(`📋 [${cpf}] Dados preparados: Nome=${dadosCliente.nome}, Telefone=${dadosCliente.telefone}, Email=${emailFinal}`);
    } else {
      // Se não tem dados completos, buscar na Kentro
      console.log(`🔍 [${cpf}] Dados do cliente não fornecidos ou incompletos - buscando na Kentro...`);
      
      // Se buscarEmailKentro = true, buscar email na Kentro
      if (buscarEmailKentro) {
        console.log(`📧 [${cpf}] Buscando email na Kentro...`);
        try {
          const oportunidade = await buscarOportunidadeKentro(cpf);
          if (oportunidade) {
            const oportunidadeCompletaTemp = await buscarOportunidadePorId(oportunidade.id);
            if (oportunidadeCompletaTemp) {
              emailKentro = oportunidadeCompletaTemp.formsdata?.['9e7f92b0'] || oportunidadeCompletaTemp.mainmail || null;
              console.log(`📧 [${cpf}] Email encontrado na Kentro: ${emailKentro || 'não encontrado'}`);
            }
          }
        } catch (error) {
          console.log(`⚠️ [${cpf}] Erro ao buscar email na Kentro:`, error.message);
        }
      }
      
      // 0. PRIMEIRO: Verificar se já existe termo recente (menos de 24 horas) ANTES de iniciar processamento
      let termoRecente = null;
      if (!forcarNovoTermo) {
        console.log(`🔍 [${cpf}] Verificando termo recente ANTES de iniciar processamento...`);
        termoRecente = await verificarTermoExistente(cpf);
        
        if (termoRecente) {
          console.log(`✅ [${cpf}] Termo recente encontrado (ID: ${termoRecente.id}) - será usado este termo ao invés de criar novo`);
        } else {
          console.log(`ℹ️ [${cpf}] Nenhum termo recente encontrado - será criado novo termo após validar dados`);
        }
      } else {
        console.log(`🔄 [${cpf}] Modo FORÇAR NOVO TERMO ativado - ignorando verificação de termos recentes`);
      }
      
      // 1. Buscar oportunidade na Kentro pelo CPF
      const oportunidade = await buscarOportunidadeKentro(cpf);
      if (!oportunidade) {
        return {
          sucesso: false,
          erro: 'Oportunidade não encontrada na Kentro',
          etapa: 'busca_oportunidade'
        };
      }
      
      // 2. Buscar oportunidade com o ID
      oportunidadeCompleta = await buscarOportunidadePorId(oportunidade.id);
      if (!oportunidadeCompleta) {
        return {
          sucesso: false,
          erro: 'Não foi possível obter dados completos da oportunidade',
          etapa: 'busca_oportunidade_id'
        };
      }
      
      // 3. Verificar se os dados estão preenchidos
      validacao = validarDadosOportunidade(oportunidadeCompleta);
      
      // Email não é mais obrigatório - validarDadosOportunidade já aplica fallback
      // Mas ainda precisamos verificar outros campos obrigatórios
      if (!validacao.valido) {
        // Email não é mais obrigatório, então removê-lo dos dados faltantes se estiver lá
        const dadosFaltantesFiltrados = validacao.dadosFaltantes.filter(d => d !== 'email');
        
        if (dadosFaltantesFiltrados.length > 0) {
          return {
            sucesso: false,
            erro: 'Dados obrigatórios não preenchidos',
            dadosFaltantes: dadosFaltantesFiltrados,
            etapa: 'validacao_dados'
          };
        }
        
        // Se só faltava email, continuar (já foi aplicado fallback)
        console.log(`✅ [${cpf}] Email não encontrado na Kentro, usando fallback: ${validacao.dados.email}`);
      }
    }
    
    // 4. Verificar se já existe termo válido antes de criar um novo (SEMPRE verificar, exceto se forçar novo termo)
    let termoResultado = null;
    
    if (!forcarNovoTermo) {
      // SEMPRE verificar se já existe termo válido, independente de ter dadosCliente ou não
      console.log(`🔍 [${cpf}] Verificando se já existe termo para este CPF...`);
      console.log(`📋 [${cpf}] FLUXO: verificando termo existente`);
      const cpfParaBusca = validacao && validacao.dados ? (validacao.dados.cpf || cpf) : cpf;
      termoResultado = await verificarTermoExistente(cpfParaBusca);
      
      if (termoResultado) {
        console.log(`✅ [${cpf}] Termo existente encontrado: ${termoResultado.id} (Status: ${termoResultado.status})`);
        console.log(`📋 [${cpf}] FLUXO: termo existente encontrado (Status: ${termoResultado.status})`);
        if (termoResultado.description) {
          console.log(`📋 [${cpf}] Descrição do termo: ${termoResultado.description}`);
        }
      } else {
        console.log(`❌ [${cpf}] Nenhum termo existente válido encontrado - será criado novo termo`);
        console.log(`📋 [${cpf}] FLUXO: nenhum termo existente - criando novo termo`);
      }
    } else {
      console.log(`🔄 [${cpf}] Modo FORÇAR NOVO TERMO ativado - ignorando termos existentes`);
      termoResultado = null;
    }
    
    // Verificar se o termo existente tem erro de data de nascimento
    let deveCriarNovoTermo = false;
    // Só tentar corrigir data na Kentro se dadosCliente NÃO foi fornecido (tem oportunidade na Kentro)
    if (termoResultado && termoResultado.status === 'REJECTED' && 
        termoResultado.description && 
        termoResultado.description.includes('Data de nascimento nao confere') &&
        !dadosCliente && oportunidadeCompleta && oportunidadeCompleta.id) {
      console.log(`⚠️ [${cpf}] Termo existente com erro de data de nascimento - corrigindo na Kentro`);
      
      // Tentar corrigir a data de nascimento na Kentro
      try {
        const dataNascimentoAtual = oportunidadeCompleta.formsdata?.['0bfc6250'];
        if (dataNascimentoAtual) {
          console.log(`🔄 [${cpf}] Data atual na Kentro: ${dataNascimentoAtual}`);
          
          // Formatar a data corretamente
          const dataFormatada = formatarDataNascimento(dataNascimentoAtual);
          console.log(`📅 [${cpf}] Data formatada: ${dataFormatada}`);
          
          // Converter de volta para formato DD/MM/YYYY para a Kentro
          if (dataFormatada) {
            const [ano, mes, dia] = dataFormatada.split('-');
            const dataCorrigida = `${dia}/${mes}/${ano}`;
          
          if (dataCorrigida !== dataNascimentoAtual) {
            console.log(`🔄 [${cpf}] Atualizando data na Kentro: ${dataNascimentoAtual} → ${dataCorrigida}`);
            
            const dadosAtualizacao = {
              "0bfc6250": dataCorrigida
            };
            
            await atualizarOportunidadeKentro(oportunidadeCompleta.id, dadosAtualizacao);
            console.log(`✅ [${cpf}] Data de nascimento corrigida na Kentro`);
            
            // Aguardar um pouco para a atualização ser processada
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Buscar os dados atualizados
            const oportunidadeAtualizada = await buscarOportunidadePorId(oportunidadeCompleta.id);
            if (oportunidadeAtualizada) {
              console.log(`✅ [${cpf}] Dados atualizados obtidos da Kentro`);
              // Usar os dados atualizados para criar o novo termo
              oportunidadeCompleta = oportunidadeAtualizada;
            }
          }
          }
        }
      } catch (error) {
        console.log(`⚠️ [${cpf}] Erro ao corrigir data na Kentro:`, error.message);
        // Continuar mesmo com erro na correção
      }
      
      console.log(`📝 [${cpf}] Criando novo termo após correção da data`);
      deveCriarNovoTermo = true;
    }
    
    // IMPORTANTE: Se o termo existente é REJECTED ou FAILED (e não é erro de data de nascimento), retornar erro imediatamente
    if (termoResultado && (termoResultado.status === 'REJECTED' || termoResultado.status === 'FAILED') && !deveCriarNovoTermo) {
      const statusTermo = termoResultado.status;
      const mensagemErro = termoResultado.description || (statusTermo === 'REJECTED' ? 'Termo rejeitado pela análise' : 'Termo falhou');
      
      console.log(`❌ [${cpf}] Termo existente ${statusTermo.toLowerCase()} - retornando erro imediatamente`);
      console.log(`📋 [${cpf}] Mensagem da API V8: ${mensagemErro}`);
      
      return {
        sucesso: false,
        erro: mensagemErro,
        oportunidade_id: oportunidadeCompleta?.id || null,
        dados_validados: validacao.dados,
        termo_resultado: {
          ...termoResultado,
          description: mensagemErro
        },
        status_termo: statusTermo,
        motivo_falha: mensagemErro,
        simulacao_criada: false,
        timestamp: new Date().toISOString()
      };
    }
    
    if (!termoResultado || deveCriarNovoTermo) {
      // 5. Solicitar novo termo CLT na V8 Digital
      console.log(`📝 [${cpf}] Criando novo termo CLT na V8 Digital...`);
      try {
        termoResultado = await solicitarTermoCLT(oportunidadeCompleta);
      } catch (termoError) {
        // Verificar se é erro de email - mas não retornar erro, email já foi tratado com fallback
        if (termoError.message && (termoError.message.includes('Email não encontrado') || termoError.message.includes('signer_email'))) {
          console.log(`⚠️ [${cpf}] Erro de email na V8 - mas email já foi tratado com fallback: ${validacao.dados.email}`);
          // Email já foi tratado com fallback em validarDadosOportunidade e solicitarTermoCLT
          // Se ainda assim falhou, pode ser outro problema - relançar o erro
          throw termoError;
        }
        // Verificar se é erro de nome
        if (termoError.message && termoError.message.includes('Nome não encontrado')) {
          console.log(`❌ [${cpf}] Nome não encontrado na Kentro!`);
          return {
            sucesso: false,
            erro: 'Nome não encontrado na oportunidade da Kentro',
            dadosFaltantes: ['nome'],
            motivoFalha: 'Preencha o campo de nome na oportunidade da Kentro antes de processar',
            etapa: 'validacao_nome'
          };
        }
        // Outros erros
        throw termoError;
      }
    } else {
      console.log(`✅ [${cpf}] Usando termo existente:`, termoResultado.id);
      
      // Se o termo existente está aguardando consentimento, autorizar ele
      if (termoResultado.status === 'WAITING_CONSENT') {
        console.log(`🔐 [${cpf}] Autorizando termo existente...`);
        try {
          const token = await getValidToken();
          const authorizeResponse = await axios.post(
            `${process.env.V8_API_URL}/private-consignment/consult/${termoResultado.id}/authorize`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 30000
            }
          );
          
          console.log(`✅ [${cpf}] Termo existente autorizado com sucesso`);
          console.log(`📊 [${cpf}] Status da autorização:`, authorizeResponse.status);
          
          // Aguardar um pouco para o termo atualizar
          console.log(`⏳ [${cpf}] Aguardando 3 segundos para o termo atualizar após autorização...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Consultar novamente o status do termo após autorização
          console.log(`🔍 [${cpf}] Consultando novo status do termo após autorização...`);
          const novoStatus = await consultarStatusTermo(termoResultado.id);
          if (novoStatus) {
            termoResultado = novoStatus;
            console.log(`📊 [${cpf}] Novo status do termo após autorização:`, termoResultado.status);
          }
          
        } catch (authorizeError) {
          console.error(`❌ [${cpf}] ERRO AO AUTORIZAR TERMO EXISTENTE:`);
          console.error(`📊 [${cpf}] Status:`, authorizeError.response?.status);
          console.error(`📄 [${cpf}] Resposta:`, JSON.stringify(authorizeError.response?.data, null, 2));
          console.error(`📋 [${cpf}] Mensagem:`, authorizeError.message);
          
          // Retornar erro se não conseguir autorizar
          return {
            sucesso: false,
            erro: 'Não foi possível autorizar o termo - aguardando consentimento do usuário',
            oportunidade_id: oportunidadeCompleta?.id || null,
            dados_validados: validacao.dados,
            termo_resultado: termoResultado,
            status_termo: 'WAITING_CONSENT',
            motivo_falha: 'Aguardando consentimento',
            simulacao_criada: false,
            timestamp: new Date().toISOString()
          };
        }
      }
    }
    
    // Verificar se houve timeout na finalização do termo
    if (termoResultado.timeout) {
      return {
        sucesso: false,
        erro: 'Termo não finalizado - tente mais tarde',
        oportunidade_id: oportunidadeCompleta?.id || null,
        dados_validados: validacao.dados,
        termo_resultado: termoResultado,
        etapa: 'finalizacao_termo',
        timestamp: new Date().toISOString()
      };
    }
    
    // Verificar o status do termo para determinar se foi sucesso ou falha
    const statusTermo = termoResultado.status;
    // IMPORTANTE: WAITING_CREDIT_ANALYSIS também é considerado sucesso pois tem margem disponível
    const isSucesso = statusTermo === 'SUCCESS' || statusTermo === 'WAITING_CREDIT_ANALYSIS';
    const podeSimular = statusTermo === 'SUCCESS' || statusTermo === 'WAITING_CREDIT_ANALYSIS';
    
    console.log(`🔍 [${cpf}] Status do termo: ${statusTermo}, isSucesso: ${isSucesso}, podeSimular: ${podeSimular}, availableMarginValue: ${termoResultado.availableMarginValue}`);
    
    // Tratar description null para melhor experiência do usuário
    const motivoFalha = !isSucesso ? 
      (termoResultado.description || 'Aguardando retorno da consulta') : 
      null;
    
    // Se o termo foi rejeitado, falhou ou está aguardando consentimento, retornar erro imediatamente
    if (statusTermo === 'REJECTED' || statusTermo === 'FAILED' || statusTermo === 'WAITING_CONSENT') {
      // SEMPRE usar description do termo se disponível (mensagem da API V8)
      const mensagemErro = termoResultado.description || motivoFalha || `Termo ${statusTermo.toLowerCase()}`;
      
      console.log(`❌ [${cpf}] Termo ${statusTermo.toLowerCase()} - retornando erro`);
      console.log(`📋 [${cpf}] Mensagem da API V8:`, termoResultado.description);
      console.log(`📋 [${cpf}] Termo completo:`, JSON.stringify(termoResultado, null, 2));
      
      return {
        sucesso: false,
        erro: mensagemErro, // SEMPRE usar description se disponível
        oportunidade_id: oportunidadeCompleta?.id || null,
        dados_validados: validacao.dados,
        termo_resultado: {
          ...termoResultado,
          description: mensagemErro // Garantir que description está sempre preenchida
        },
        status_termo: statusTermo,
        motivo_falha: mensagemErro, // Usar mesma mensagem
        simulacao_criada: false,
        timestamp: new Date().toISOString()
      };
    }
    
    // 5. Verificar se existe termo aprovado para simular
    let simulacaoResultado = null;
    let termoAprovado = null;
    
    // Primeiro, verificar se o termo atual já está aprovado
    // IMPORTANTE: WAITING_CREDIT_ANALYSIS também tem margem disponível e permite simulação
    if ((statusTermo === 'SUCCESS' || statusTermo === 'WAITING_CREDIT_ANALYSIS') && termoResultado.availableMarginValue) {
      termoAprovado = termoResultado;
      console.log(`✅ [${cpf}] Termo já aprovado encontrado (Status: ${statusTermo}):`, termoAprovado.id);
      console.log(`💰 [${cpf}] Margem disponível:`, termoAprovado.availableMarginValue);
    } else if (statusTermo === 'FAILED' || statusTermo === 'REJECTED') {
      console.log(`❌ [${cpf}] Termo ${statusTermo.toLowerCase()} - não aguardando aprovação`);
      // Não aguardar para termos rejeitados
    } else {
      // Inclui WAITING_CONSULT e outros status que precisam aguardar
      if (statusTermo === 'WAITING_CONSULT') {
        console.log(`⏳ [${cpf}] Termo aguardando retorno da consulta (WAITING_CONSULT) - aguardando análise...`);
      } else {
        console.log(`⏳ [${cpf}] Termo ainda não aprovado, aguardando análise...`);
      }
      
      // Verificar a cada 10 segundos com máximo de 30 tentativas (otimizado: total de ~5 minutos)
      // Reduzido intervalo de 20s para 10s para acelerar verificação, mas aumentado tentativas para 30
      const maxTentativas = 30; // 30 tentativas × 10s = ~5 minutos (mais rápido que 20×20s)
      const intervalo = 10000; // 10 segundos (reduzido de 20s para acelerar)
      
      for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        console.log(`⏰ [${cpf}] Aguardando ${intervalo / 1000} segundos... (Tentativa ${tentativa}/${maxTentativas})`);
        console.log(`📋 [${cpf}] FLUXO: termo pendente aguardar ${intervalo / 1000} segundos ${tentativa}/${maxTentativas}`);
        await new Promise(resolve => setTimeout(resolve, intervalo));
        
        console.log(`🔍 [${cpf}] Consultando status do termo... (Tentativa ${tentativa}/${maxTentativas})`);
        console.log(`📋 [${cpf}] FLUXO: consultando termo (tentativa ${tentativa}/${maxTentativas})`);
        try {
          // Adicionar timeout de segurança para evitar travamento
          const novoStatus = await Promise.race([
            consultarStatusTermo(termoResultado.id),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na consulta de status')), 30000))
          ]);
          
          // IMPORTANTE: WAITING_CREDIT_ANALYSIS também tem margem disponível e permite simulação
          if (novoStatus && (novoStatus.status === 'SUCCESS' || novoStatus.status === 'WAITING_CREDIT_ANALYSIS') && novoStatus.availableMarginValue) {
            termoAprovado = novoStatus;
            console.log(`✅ [${cpf}] Termo aprovado encontrado na tentativa ${tentativa} (Status: ${novoStatus.status}):`, termoAprovado.id);
            console.log(`💰 [${cpf}] Margem disponível:`, termoAprovado.availableMarginValue);
            break; // Sair do loop quando encontrar termo aprovado
          } else if (novoStatus && (novoStatus.status === 'FAILED' || novoStatus.status === 'REJECTED')) {
            console.log(`❌ [${cpf}] Termo ${novoStatus.status.toLowerCase()} na tentativa ${tentativa} - parando verificação`);
            console.log(`📋 [${cpf}] Descrição do termo rejeitado: ${novoStatus.description || 'N/A'}`);
            // Atualizar termoResultado com o status rejeitado e descrição para garantir que seja retornado corretamente
            termoResultado = {
              ...termoResultado,
              ...novoStatus,
              status: novoStatus.status,
              description: novoStatus.description || termoResultado.description
            };
            break; // Parar se termo foi rejeitado
          } else if (novoStatus && novoStatus.status === 'WAITING_CONSULT') {
            console.log(`⏳ [${cpf}] Tentativa ${tentativa}: Termo ainda aguardando retorno da consulta (WAITING_CONSULT) - continuando aguardar...`);
            // Atualizar termoResultado com o novo status para manter sincronizado
            termoResultado = {
              ...termoResultado,
              ...novoStatus,
              status: novoStatus.status
            };
            // Continuar aguardando se ainda está WAITING_CONSULT
          } else {
            console.log(`⏳ [${cpf}] Tentativa ${tentativa}: Termo ainda não aprovado (Status: ${novoStatus?.status || 'N/A'})`);
            // Atualizar termoResultado mesmo que não seja aprovado
            if (novoStatus) {
              termoResultado = {
                ...termoResultado,
                ...novoStatus,
                status: novoStatus.status
              };
            }
          }
        } catch (error) {
          console.log(`⚠️ [${cpf}] Erro na tentativa ${tentativa}:`, error.message);
          // Se for timeout, parar o loop
          if (error.message.includes('Timeout')) {
            console.log(`⏰ [${cpf}] Timeout na consulta - parando verificação`);
            break;
          }
        }
      }
      
      if (!termoAprovado) {
        // Se ainda está WAITING_CONSULT após todas as tentativas, logar mas não tratar como erro fatal
        const statusFinal = termoResultado.status;
        if (statusFinal === 'WAITING_CONSULT') {
          console.log(`⏳ [${cpf}] Termo ainda aguardando retorno da consulta após ${maxTentativas} tentativas - pode ser processado mais tarde`);
        } else {
          console.log(`❌ [${cpf}] Termo não foi aprovado após verificação (Status final: ${statusFinal})`);
        }
      }
    }
    
    // Se encontrou termo aprovado, criar simulação
    if (termoAprovado && termoAprovado.availableMarginValue) {
      try {
        console.log(`🧮 [${cpf}] Criando simulação CLT...`);
        const margemDisponivel = parseFloat(termoAprovado.availableMarginValue);
        console.log(`💰 [${cpf}] Margem disponível:`, margemDisponivel);
        console.log(`📊 [${cpf}] Tipo da margem:`, typeof termoAprovado.availableMarginValue);
        console.log(`📊 [${cpf}] Valor original:`, termoAprovado.availableMarginValue);
        
        if (margemDisponivel > 0) {
          // Buscar taxas disponíveis
          console.log(`📊 [${cpf}] Buscando taxas disponíveis...`);
          const taxasResponse = await consultarTaxasDisponiveis();
          console.log(`📋 [${cpf}] Taxas encontradas:`, taxasResponse ? 'sim' : 'não');
          
          if (taxasResponse && taxasResponse.configs && taxasResponse.configs.length > 0) {
            // Tentar simulação mesmo com margem baixa - deixar V8 Digital decidir
            
            // Tentar diferentes prazos do maior para o menor
            const prazos = prazoPersonalizado ? [prazoPersonalizado] : [24, 12, 6]; // Usar prazo personalizado se fornecido
            // REMOVIDO: let simulacaoResultado = null; // Esta linha estava causando shadowing!
            
            for (const prazo of prazos) {
              try {
                console.log(`🎯 [${cpf}] Tentando simulação com prazo de ${prazo} meses...`);
                
                // Usar valor personalizado se fornecido, senão usar margem disponível
                const valorSimulacao = valorPersonalizado || margemDisponivel;
                console.log(`💰 [${cpf}] Valor da simulação: ${valorSimulacao} (${valorPersonalizado ? 'personalizado' : 'margem disponível'})`);
                
                const simulacaoAtual = await criarSimulacaoCLT({
                  consult_id: termoAprovado.id,
                  config_id: taxasResponse.configs[0].id,
                  installment_face_value: valorSimulacao,
                  number_of_installments: prazo,
                  provider: 'QI'
                });
                
                console.log(`✅ [${cpf}] Simulação CLT criada com sucesso para prazo de ${prazo} meses!`);
                console.log(`📊 [${cpf}] Dados da simulação criada:`, JSON.stringify(simulacaoAtual, null, 2));
                console.log(`🔍 [${cpf}] Tipo do retorno:`, typeof simulacaoAtual);
                console.log(`🔍 [${cpf}] Tem disbursement_amount?`, !!simulacaoAtual?.disbursement_amount);
                console.log(`🔍 [${cpf}] Tem operation_amount?`, !!simulacaoAtual?.operation_amount);
                console.log(`🔍 [${cpf}] Valor disbursement_amount:`, simulacaoAtual?.disbursement_amount);
                console.log(`🔍 [${cpf}] Valor operation_amount:`, simulacaoAtual?.operation_amount);
                
                // Se for 24 meses, usar esta simulação e parar
                if (prazo === 24) {
                  console.log(`🎯 [${cpf}] CONSEGUIU 24 MESES! Salvando e parando...`);
                  simulacaoResultado = simulacaoAtual;
                  break;
                }
                
                // Se não for 24 meses, salvar como fallback APENAS se 24 meses ainda não foi tentado ou falhou
                // Nunca salvar 12 meses se ainda vamos tentar 24 meses
                if (prazo < 24 && !simulacaoResultado) {
                  // Se ainda vamos tentar 24 meses, não salvar este fallback ainda
                  // Simulação será salva após o loop se nenhum 24 meses for criado
                  console.log(`⚠️ [${cpf}] Simulação de ${prazo} meses criada, mas aguardando tentativa de 24 meses primeiro...`);
                  simulacaoResultado = simulacaoAtual;
                } else if (prazo < 24 && simulacaoResultado) {
                  console.log(`⚠️ [${cpf}] Simulação de ${prazo} meses criada, mas não sobrescrevendo pois já temos fallback...`);
                }
                console.log(`🔄 [${cpf}] Simulação de ${prazo} meses criada, continuando loop para tentar 24 meses...`);
                
              } catch (error) {
                console.error(`❌ [${cpf}] ===== ERRO AO CRIAR SIMULAÇÃO COM PRAZO ${prazo} =====`);
                console.error(`❌ [${cpf}] Mensagem:`, error.message);
                console.error(`📊 [${cpf}] Status HTTP:`, error.response?.status);
                console.error(`📋 [${cpf}] Headers:`, JSON.stringify(error.response?.headers, null, 2));
                console.error(`📄 [${cpf}] Resposta completa da API V8:`, JSON.stringify(error.response?.data, null, 2));
                console.error(`📄 [${cpf}] Error completo:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                
                // Capturar mensagem de erro específica da V8
                let mensagemErroSimulacao = error.message;
                if (error.response?.data) {
                  const errorData = error.response.data;
                  mensagemErroSimulacao = errorData.title || 
                                         errorData.detail || 
                                         errorData.message || 
                                         errorData.error || 
                                         errorData.description ||
                                         (typeof errorData === 'string' ? errorData : JSON.stringify(errorData).substring(0, 200)) ||
                                         error.message;
                  console.error(`📋 [${cpf}] Mensagem de erro extraída da V8: ${mensagemErroSimulacao}`);
                }
                console.error(`❌ [${cpf}] ===== FIM ERRO AO CRIAR SIMULAÇÃO =====`);
                
                // Se for erro de margem insuficiente, tentar próximo prazo
                if (error.response?.data?.type === 'simulation_installment_value_above_margin') {
                  console.log(`⚠️ [${cpf}] Margem insuficiente para prazo ${prazo}, tentando próximo...`);
                  continue;
                }
                
                // Se for erro de simulação já existente, tentar próximo prazo
                if (error.response?.data?.type === 'simulation_already_exists') {
                  console.log(`⚠️ [${cpf}] Simulação já existe para prazo ${prazo}, tentando próximo...`);
                  continue;
                }
                
                // Se for outro erro, tentar próximo prazo também
                console.log(`⚠️ [${cpf}] Erro diferente, tentando próximo prazo...`);
                continue;
              }
            }
            
            if (!simulacaoResultado) {
              console.log(`❌ [${cpf}] Não foi possível criar simulação com nenhum prazo`);
            }
            
          } else {
            console.log(`❌ [${cpf}] Nenhuma taxa encontrada`);
          }
        } else {
          console.log(`❌ [${cpf}] Margem não disponível`);
        }
      } catch (error) {
        console.log(`⚠️ [${cpf}] Erro geral ao criar simulação CLT:`, error.message);
        console.log(`📄 [${cpf}] Stack:`, error.stack);
        // Não falhar o fluxo por erro na simulação
      }
    } else {
      console.log(`❌ [${cpf}] Nenhum termo aprovado encontrado para simulação`);
    }

    // Salvar dados do cliente SEMPRE, independente da simulação
    const { salvarSimulacaoAprovada } = await import('./cache-simulacoes.js');
    
    // Buscar dados completos da Kentro (renomeado para evitar conflito com parâmetro dadosCliente)
    const dadosClienteCompleto = {
      nome: validacao.dados.nome,
      cpf: cpf,
      telefone: validacao.dados.telefone,
      email: validacao.dados.email,
      dataNascimento: validacao.dados.data_nascimento,
      gender: validacao.dados.gender || 'Masculino',
      nomeMae: validacao.dados.nome_mae || '',
      rg: validacao.dados.rg || '',
      endereco: validacao.dados.endereco || {},
      dadosBancarios: validacao.dados.dados_bancarios || {
        tipoPagamento: 'pix',
        tipoPix: 'CPF',
        chavePix: cpf
      },
      oportunidadeId: oportunidadeCompleta?.id || null,
      termoId: termoResultado?.id,
      statusTermo: termoResultado?.status
    };

    // Salvar se a simulação foi criada com sucesso
    if (simulacaoResultado) {
      console.log(`💾 [${cpf}] Salvando simulação no cache...`);
      console.log(`🔍 [${cpf}] simulacaoResultado:`, JSON.stringify(simulacaoResultado, null, 2));
      
      await salvarSimulacaoAprovada(
        cpf,
        termoResultado.id,
        simulacaoResultado,
        dadosClienteCompleto
      );
      
      console.log(`✅ [${cpf}] Simulação salva no cache com sucesso!`);
    } else {
      console.log(`⚠️ [${cpf}] Simulação não foi criada, mas salvando dados do cliente...`);
      
      // Salvar dados do cliente mesmo sem simulação
      await salvarSimulacaoAprovada(
        cpf,
        termoResultado?.id || 'N/A',
        null, // Sem simulação
        dadosClienteCompleto
      );
      
      console.log(`✅ [${cpf}] Dados do cliente salvos no cache!`);
    }
    
    // Log detalhado para debug
    console.log(`🔍 [${cpf}] Verificando resultado da simulação:`, {
      isSucesso: isSucesso,
      statusTermo: statusTermo,
      temSimulacaoResultado: !!simulacaoResultado,
      simulacaoResultado: simulacaoResultado ? JSON.stringify(simulacaoResultado).substring(0, 200) : 'null',
      temDisbursementAmount: !!simulacaoResultado?.disbursement_amount,
      temOperationAmount: !!simulacaoResultado?.operation_amount,
      disbursementAmount: simulacaoResultado?.disbursement_amount,
      operationAmount: simulacaoResultado?.operation_amount
    });
    
    // Se o termo foi aprovado mas não foi possível criar simulação
    // IMPORTANTE: Verificar se simulacaoResultado existe E tem valor válido (disbursement_amount ou operation_amount > 0)
    // Converter para número e verificar se é maior que 0 (pode vir como string ou número)
    // DECLARAR PRIMEIRO antes de usar em mensagemFinal
    const temSimulacaoValida = simulacaoResultado && (
      (simulacaoResultado.disbursement_amount && !isNaN(parseFloat(simulacaoResultado.disbursement_amount)) && parseFloat(simulacaoResultado.disbursement_amount) > 0) ||
      (simulacaoResultado.operation_amount && !isNaN(parseFloat(simulacaoResultado.operation_amount)) && parseFloat(simulacaoResultado.operation_amount) > 0)
    );
    
    // Determinar mensagem final baseado no resultado da simulação
    // IMPORTANTE: Se tem simulação válida, NÃO usar "Aguardando retorno da consulta"
    // Só usar essa mensagem se realmente não tiver simulação e o termo estiver aguardando
    let mensagemFinal = null;
    if (temSimulacaoValida) {
      mensagemFinal = null; // Não precisa de mensagem se tem simulação válida
    } else if (termoResultado.description && termoResultado.description !== 'Aguardando retorno da consulta') {
      // Usar description da API V8, mas evitar "Aguardando retorno da consulta" genérico
      mensagemFinal = termoResultado.description;
    } else if (statusTermo === 'WAITING_CONSENT') {
      mensagemFinal = 'Aguardando consentimento do usuário'; // Mensagem mais específica
    } else if (statusTermo === 'WAITING_CONSULT') {
      // Se aguardou todas as tentativas e ainda está WAITING_CONSULT, usar mensagem mais específica
      // Verificar se aguardou todas as tentativas (termoAprovado é null e statusTermo é WAITING_CONSULT)
      if (!termoAprovado && termoResultado.status === 'WAITING_CONSULT') {
        mensagemFinal = 'Consulta em processamento - aguarde alguns minutos e tente novamente';
      } else {
        mensagemFinal = 'Aguardando retorno da consulta'; // Só usar se realmente estiver aguardando consulta
      }
    } else if (statusTermo === 'REJECTED') {
      // SEMPRE usar description do termo se disponível (mensagem específica da V8)
      mensagemFinal = termoResultado.description || termoResultado.termo_resultado?.description || 'Termo rejeitado pela análise';
      console.log(`📋 [${cpf}] Termo REJECTED - usando descrição: ${mensagemFinal}`);
    } else if (statusTermo === 'FAILED') {
      // SEMPRE usar description do termo se disponível (mensagem específica da V8)
      mensagemFinal = termoResultado.description || termoResultado.termo_resultado?.description || 'Termo falhou';
      console.log(`📋 [${cpf}] Termo FAILED - usando descrição: ${mensagemFinal}`);
    } else if (termoResultado.description) {
      mensagemFinal = termoResultado.description; // Usar description se disponível
    } else {
      // Fallback: usar status do termo ao invés de "Aguardando retorno da consulta" genérico
      mensagemFinal = statusTermo ? `Termo com status: ${statusTermo}` : null;
    }
    
    // Log detalhado para debug
    console.log(`🔍 [${cpf}] Validação de simulação:`, {
      temSimulacaoResultado: !!simulacaoResultado,
      disbursement_amount: simulacaoResultado?.disbursement_amount,
      operation_amount: simulacaoResultado?.operation_amount,
      disbursementParsed: simulacaoResultado?.disbursement_amount ? parseFloat(simulacaoResultado.disbursement_amount) : null,
      operationParsed: simulacaoResultado?.operation_amount ? parseFloat(simulacaoResultado.operation_amount) : null,
      temSimulacaoValida: temSimulacaoValida
    });
    
    if (isSucesso && statusTermo === 'SUCCESS' && !temSimulacaoValida) {
      console.log(`⚠️ [${cpf}] Termo aprovado mas simulação inválida ou sem valor - marcando como erro`);
      mensagemFinal = 'Não foi possível criar simulação em nenhuma parcela (24, 12 ou 6 meses)';
    } else if (isSucesso && statusTermo === 'SUCCESS' && temSimulacaoValida) {
      console.log(`✅ [${cpf}] Simulação válida encontrada - NÃO deve mostrar erro`);
    }
    
    // Determinar motivo_falha corretamente
    // Se tem simulação válida, não deve ter motivo_falha
    // Se não tem simulação mas termo foi aprovado, motivo é falta de simulação
    // Se termo foi rejeitado, usar description do termo (mensagem específica da V8)
    let motivoFalhaFinal = null;
    if (temSimulacaoValida) {
      // Tem simulação válida - não é falha
      motivoFalhaFinal = null;
    } else if (isSucesso && statusTermo === 'SUCCESS' && !temSimulacaoValida) {
      // Termo aprovado mas sem simulação válida
      motivoFalhaFinal = 'Não foi possível criar simulação em nenhuma parcela';
    } else if (!isSucesso) {
      // Termo rejeitado/falhou - SEMPRE usar description do termo se disponível (mensagem específica da V8)
      if (statusTermo === 'REJECTED' || statusTermo === 'FAILED') {
        motivoFalhaFinal = termoResultado.description || motivoFalha || mensagemFinal;
        console.log(`📋 [${cpf}] Termo ${statusTermo} - motivo_falha: ${motivoFalhaFinal}`);
      } else {
        motivoFalhaFinal = motivoFalha || mensagemFinal;
      }
    }
    
    console.log(`🔍 [${cpf}] Definindo motivo_falha:`, {
      temSimulacaoValida: temSimulacaoValida,
      isSucesso: isSucesso,
      statusTermo: statusTermo,
      motivoFalhaFinal: motivoFalhaFinal
    });
    
    return {
      sucesso: isSucesso && temSimulacaoValida, // Só é sucesso se tiver simulação válida
      oportunidade_id: oportunidadeCompleta?.id || null,
      dados_validados: validacao.dados,
      termo_resultado: {
        ...termoResultado,
        // IMPORTANTE: Se tem simulação válida, não precisa de description
        // Se não tem simulação, usar mensagemFinal ou description original, mas evitar "Aguardando retorno da consulta" genérico
        description: temSimulacaoValida ? null : (
          mensagemFinal && mensagemFinal !== 'Aguardando retorno da consulta' ? mensagemFinal :
          termoResultado.description && termoResultado.description !== 'Aguardando retorno da consulta' ? termoResultado.description :
          statusTermo === 'WAITING_CONSENT' ? 'Aguardando consentimento do usuário' :
          statusTermo === 'WAITING_CONSULT' ? (!termoAprovado ? 'Consulta em processamento - aguarde alguns minutos e tente novamente' : 'Aguardando retorno da consulta') :
          statusTermo === 'REJECTED' ? (termoResultado.description || 'Termo rejeitado pela análise') :
          statusTermo === 'FAILED' ? (termoResultado.description || 'Termo falhou') :
          mensagemFinal || termoResultado.description || null
        )
      },
      simulacao_resultado: simulacaoResultado,
      simulacao_criada: temSimulacaoValida, // Usar temSimulacaoValida ao invés de apenas !!simulacaoResultado
      status_termo: statusTermo,
      motivo_falha: motivoFalhaFinal,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ [${cpf}] ===== ERRO NO FLUXO CLT =====`);
    console.error(`❌ [${cpf}] Mensagem:`, error.message);
    console.error(`❌ [${cpf}] Stack:`, error.stack);
    console.error(`❌ [${cpf}] Error completo:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Tentar obter mensagem específica da API V8 se disponível
    let mensagemErroFinal = error.message;
    if (error.response?.data) {
      const errorData = error.response.data;
      mensagemErroFinal = errorData.title || 
                          errorData.detail || 
                          errorData.message || 
                          errorData.error || 
                          errorData.description ||
                          (typeof errorData === 'string' ? errorData : JSON.stringify(errorData).substring(0, 200)) ||
                          error.message;
      console.error(`📋 [${cpf}] Dados completos do erro V8:`, JSON.stringify(errorData, null, 2));
    }
    
    console.error(`❌ [${cpf}] Mensagem de erro final: ${mensagemErroFinal}`);
    console.error(`❌ [${cpf}] ===== FIM ERRO NO FLUXO CLT =====`);
    
    return {
      sucesso: false,
      erro: mensagemErroFinal,
      etapa: 'fluxo_completo',
      termo_resultado: error.response?.data ? { description: mensagemErroFinal } : null
    };
  }
};

// Função para consultar taxas disponíveis para simulação CLT
const consultarTaxasDisponiveis = async () => {
  try {
    console.log('📊 Consultando taxas disponíveis para simulação CLT...');
    
    const token = await getValidToken();
    
    const response = await axios.get(
      `${process.env.V8_API_URL}/private-consignment/simulation/configs`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Taxas disponíveis consultadas com sucesso');
    return response.data;
  } catch (error) {
    console.error('❌ Erro ao consultar taxas disponíveis:', error.response?.data || error.message);
    throw new Error('Falha ao consultar taxas disponíveis para simulação CLT');
  }
};

// Função para criar simulação CLT
const criarSimulacaoCLT = async (dadosSimulacao) => {
  try {
    console.log('🧮 Criando simulação CLT...');
    
    const token = await getValidToken();
    
    const simulacaoData = {
      consult_id: dadosSimulacao.consult_id, // ID do termo autorizado
      config_id: dadosSimulacao.config_id, // ID da tabela de taxa
      number_of_installments: dadosSimulacao.number_of_installments, // Quantidade de parcelas
      provider: "QI" // Provider fixo
    };

    // Adicionar apenas um dos campos de valor
    if (dadosSimulacao.installment_face_value) {
      simulacaoData.installment_face_value = dadosSimulacao.installment_face_value;
    } else if (dadosSimulacao.disbursed_amount) {
      simulacaoData.disbursed_amount = dadosSimulacao.disbursed_amount;
    }

    console.log('📋 Dados para simulação CLT:', JSON.stringify(simulacaoData, null, 2));
    console.log('🌐 URL da simulação:', `${process.env.V8_API_URL}/private-consignment/simulation`);

    const response = await axios.post(
      `${process.env.V8_API_URL}/private-consignment/simulation`,
      simulacaoData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('📊 Status da resposta simulação:', response.status);
    console.log('📄 Resposta completa simulação:', JSON.stringify(response.data, null, 2));
    console.log('✅ Simulação CLT criada com sucesso');
    return response.data;
  } catch (error) {
    const cpf = dadosSimulacao.consult_id || 'N/A';
    console.error(`❌ [${cpf}] ===== ERRO AO CRIAR SIMULAÇÃO CLT =====`);
    console.error(`❌ [${cpf}] Mensagem:`, error.message);
    console.error(`📊 [${cpf}] Status HTTP:`, error.response?.status);
    console.error(`📋 [${cpf}] Headers:`, JSON.stringify(error.response?.headers, null, 2));
    console.error(`📄 [${cpf}] Resposta completa da API V8:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`📄 [${cpf}] Error completo:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error(`📝 [${cpf}] Stack:`, error.stack);
    
    // Capturar mensagem de erro específica da V8 - tentar todos os campos possíveis
    let mensagemErro = 'Falha ao criar simulação CLT';
    if (error.response?.data) {
      const errorData = error.response.data;
      // Tentar todos os campos possíveis da API V8
      mensagemErro = errorData.title || 
                     errorData.detail || 
                     errorData.message || 
                     errorData.error || 
                     errorData.description ||
                     errorData.type ||
                     (typeof errorData === 'string' ? errorData : null) ||
                     JSON.stringify(errorData).substring(0, 200) ||
                     mensagemErro;
      
      console.error(`📋 [${cpf}] Dados completos do erro V8:`, JSON.stringify(errorData, null, 2));
      console.error(`📋 [${cpf}] Mensagem de erro extraída da V8: ${mensagemErro}`);
    }
    
    console.error(`❌ [${cpf}] Mensagem de erro final: ${mensagemErro}`);
    console.error(`❌ [${cpf}] ===== FIM ERRO AO CRIAR SIMULAÇÃO CLT =====`);
    
    throw new Error(mensagemErro);
  }
};

// Função para executar fluxo completo de simulação CLT
const executarSimulacaoCLT = async (cpf, dadosSimulacao) => {
  try {
    console.log(`🚀 Iniciando simulação CLT para CPF: ${cpf}`);

    // 1. Buscar oportunidade na Kentro pelo CPF
    const oportunidade = await buscarOportunidadeKentro(cpf);
    if (!oportunidade) {
      return {
        sucesso: false,
        erro: 'Oportunidade não encontrada na Kentro',
        etapa: 'busca_oportunidade'
      };
    }

    // 2. Buscar oportunidade com o ID
    const oportunidadeCompleta = await buscarOportunidadePorId(oportunidade.id);
    if (!oportunidadeCompleta) {
      return {
        sucesso: false,
        erro: 'Não foi possível obter dados completos da oportunidade',
        etapa: 'busca_oportunidade_id'
      };
    }

    // 3. Verificar se os dados estão preenchidos
    const validacao = validarDadosOportunidade(oportunidadeCompleta);
    
    // Email não é mais obrigatório - validarDadosOportunidade já aplica fallback
    // Mas ainda precisamos verificar outros campos obrigatórios
    if (!validacao.valido) {
      // Email não é mais obrigatório, então removê-lo dos dados faltantes se estiver lá
      const dadosFaltantesFiltrados = validacao.dadosFaltantes.filter(d => d !== 'email');
      
      if (dadosFaltantesFiltrados.length > 0) {
        return {
          sucesso: false,
          erro: 'Dados obrigatórios não preenchidos',
          dadosFaltantes: dadosFaltantesFiltrados,
          etapa: 'validacao_dados'
        };
      }
      
      // Se só faltava email, continuar (já foi aplicado fallback)
      console.log(`✅ [${cpf}] Email não encontrado na Kentro, usando fallback: ${validacao.dados.email}`);
    }

    // 4. Gerar e autorizar termo CLT (se necessário)
    let termoResultado;
    try {
      termoResultado = await solicitarTermoCLT(oportunidadeCompleta);
    } catch (termoError) {
      // Verificar se é erro de email - mas não retornar erro, email já foi tratado com fallback
      if (termoError.message && (termoError.message.includes('Email não encontrado') || termoError.message.includes('signer_email'))) {
        console.log(`⚠️ [${cpf}] Erro de email na V8 - mas email já foi tratado com fallback`);
        // Email já foi tratado com fallback em validarDadosOportunidade e solicitarTermoCLT
        // Se ainda assim falhou, pode ser outro problema - relançar o erro
        throw termoError;
      }
      // Verificar se é erro de nome
      if (termoError.message && termoError.message.includes('Nome não encontrado')) {
        console.log(`❌ [${cpf}] Nome não encontrado na Kentro!`);
        return {
          sucesso: false,
          erro: 'Nome não encontrado na oportunidade da Kentro',
          dadosFaltantes: ['nome'],
          motivoFalha: 'Preencha o campo de nome na oportunidade da Kentro antes de processar',
          etapa: 'validacao_nome'
        };
      }
      // Outros erros
      throw termoError;
    }
    
    // 5. Consultar taxas disponíveis
    const taxasDisponiveis = await consultarTaxasDisponiveis();
    
    // 6. Criar simulação com os dados fornecidos
    const dadosSimulacaoCompletos = {
      ...dadosSimulacao,
      consult_id: termoResultado.id // Usar o ID do termo autorizado
    };
    
    // Só criar nova simulação se não tiver uma já criada
    if (!simulacaoResultado) {
      simulacaoResultado = await criarSimulacaoCLT(dadosSimulacaoCompletos);
    }

    // Salvar no cache se a simulação foi criada com sucesso
    if (simulacaoResultado) {
      console.log(`💾 [${cpf}] Salvando simulação no cache...`);
      console.log(`🔍 [${cpf}] simulacaoResultado:`, JSON.stringify(simulacaoResultado, null, 2));
      
      const { salvarSimulacaoAprovada } = require('./cache-simulacoes');
      
      // Renomeado para evitar conflito com parâmetro dadosCliente
      const dadosClienteCompleto = {
        nome: validacao.dados.nome,
        cpf: cpf,
        telefone: validacao.dados.telefone,
        email: validacao.dados.email,
        dataNascimento: validacao.dados.data_nascimento,
        gender: validacao.dados.gender || 'Masculino',
        nomeMae: validacao.dados.nome_mae || '',
        rg: validacao.dados.rg || '',
        endereco: validacao.dados.endereco,
        dadosBancarios: validacao.dados.dados_bancarios || {
          tipoPagamento: 'pix',
          tipoPix: 'CPF',
          chavePix: cpf
        }
      };

      await salvarSimulacaoAprovada(
        cpf,
        termoResultado.id,
        simulacaoResultado,
        dadosClienteCompleto
      );
      
      console.log(`✅ [${cpf}] Simulação salva no cache com sucesso!`);
    } else {
      console.log(`❌ [${cpf}] simulacaoResultado é null/undefined - não salvando no cache`);
    }

    return {
      sucesso: true,
      oportunidade_id: oportunidadeCompleta?.id || null,
      dados_validados: validacao.dados,
      termo_resultado: termoResultado,
      taxas_disponiveis: taxasDisponiveis,
      simulacao_resultado: simulacaoResultado,
      simulacao_criada: !!simulacaoResultado,
      status_termo: termoResultado.status,
      motivo_falha: null,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erro na simulação CLT:', error.message);
    return {
      sucesso: false,
      erro: error.message,
      etapa: 'simulacao_completa'
    };
  }
};

// Função para buscar termos existentes
const buscarTermosExistentes = async (cpf) => {
  try {
    console.log(`🔍 [${cpf}] Buscando termos existentes...`);
    
    const token = await getValidToken();
    if (!token.success) {
      return { success: false, message: 'Erro ao obter token V8' };
    }

    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const url = `https://bff.v8sistema.com/private-consignment/consult?startDate=${inicioMes.toISOString()}&endDate=${fimMes.toISOString()}&limit=50&page=1&provider=QI&search=${cpf}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ [${cpf}] Termos encontrados:`, response.data.data.length);
    
    return {
      success: true,
      dados: response.data.data
    };

  } catch (error) {
    console.error(`❌ [${cpf}] Erro ao buscar termos existentes:`, error.message);
    return {
      success: false,
      message: error.message
    };
  }
};

// Função para criar simulação personalizada
const criarSimulacaoPersonalizada = async (dadosSimulacao) => {
  try {
    console.log(`🔄 [${dadosSimulacao.consult_id}] Criando simulação personalizada...`);
    
    const token = await getValidToken();
    if (!token.success) {
      return { success: false, message: 'Erro ao obter token V8' };
    }

    const url = 'https://bff.v8sistema.com/private-consignment/simulation';
    
    const response = await axios.post(url, dadosSimulacao, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ [${dadosSimulacao.consult_id}] Simulação personalizada criada:`, response.data.id);
    
    return {
      success: true,
      dados: response.data
    };

  } catch (error) {
    console.error(`❌ [${dadosSimulacao.consult_id}] Erro ao criar simulação personalizada:`, error.message);
    return {
      success: false,
      message: error.message
    };
  }
};

/**
 * Converter dados da Kentro para formato V8 Digital (COMPLETO)
 */
const formatarParaV8Digital = (dadosKentro, simulationId) => {
  // Extrair DDD e número do telefone
  const telefone = dadosKentro.telefone || '';
  let ddd = '';
  let numero = '';
  
  // Formato: 5511981565248 (55 + 11 + 981565248)
  if (telefone.length === 13 && telefone.startsWith('55')) {
    ddd = telefone.substring(2, 4); // 11
    numero = telefone.substring(4);  // 981565248
  } else if (telefone.length === 11) {
    // Formato: 11981565248 (11 + 981565248)
    ddd = telefone.substring(0, 2);  // 11
    numero = telefone.substring(2);   // 981565248
  } else if (telefone.length === 10) {
    // Formato: 1181565248 (11 + 81565248) - adicionar 9
    ddd = telefone.substring(0, 2);  // 11
    numero = '9' + telefone.substring(2); // 981565248
  } else {
    // Fallback
    ddd = telefone.substring(0, 2);
    numero = telefone.substring(2);
  }
  
  // Limpar CPF para garantir formato correto (apenas números, 11 dígitos)
  const cpfLimpo = String(dadosKentro.cpf || '').replace(/\D/g, '').slice(-11);
  
  return {
    simulation_id: simulationId,
    provider: "QI",
    borrower: {
      // DADOS PESSOAIS OBRIGATÓRIOS
      document_number: cpfLimpo, // Campo obrigatório pela V8 Digital
      name: dadosKentro.nome,
      email: dadosKentro.email,
      phone: {
        area_code: ddd,
        country_code: "55",
        number: numero
      },
      political_exposition: false,
      
      // ENDEREÇO COMPLETO
      address: {
        street: dadosKentro.endereco.rua,
        number: dadosKentro.endereco.numero,
        complement: "", // Opcional
        neighborhood: dadosKentro.endereco.bairro,
        city: dadosKentro.endereco.cidade,
        state: dadosKentro.endereco.estado,
        postal_code: dadosKentro.endereco.cep
      },
      
      // DOCUMENTOS COMPLETOS
      birth_date: formatarDataNascimento(dadosKentro.data_nascimento), // DD/MM/YYYY → YYYY-MM-DD
      mother_name: dadosKentro.nomeMae || dadosKentro.nome_mae || "Nome da Mãe",
      nationality: "brasileira",
      document_issuer: "SSP",
      gender: "male",  // Padrão, pode ser inferido
      person_type: "natural",
      marital_status: "single",  // Padrão
      individual_document_number: cpfLimpo,
      document_identification_date: "2020-10-10",  // Fixo
      document_identification_type: "rg",
      document_identification_number: dadosKentro.rg || "000000",  // RG real da Kentro
      
      // DADOS BANCÁRIOS/PIX COMPLETOS
      // V8 Digital aceita apenas PIX, valores válidos para pix_key_type: cpf, email, phone, random
      bank: {
        transfer_method: "pix",
        pix_key: dadosKentro.pix?.chave_pix || dadosKentro.cpf,  // Chave PIX real ou CPF como fallback
        pix_key_type: (dadosKentro.pix?.tipo_chave === 'aleatoria' || dadosKentro.pix?.tipo_chave === 'chave aleatória') ? 'random' : (dadosKentro.pix?.tipo_chave || 'cpf')  // cpf, email, phone, random
      }
    }
  };
};

/**
 * Consultar se CPF existe na Fila 4 da Kentro
 */
const consultarCPFNaFila4 = async (cpf) => {
  try {
    console.log(`🔍 [${cpf}] Consultando se CPF existe na Fila 4...`);
    
    const url = `${process.env.KENTRO_API_URL}/getPipeOpportunities`;
    
    const requestData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      pipelineId: 4 // Fila 4
    };
    
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CLT-V8-API/1.0.0'
      },
      timeout: 30000
    });
    
    if (response.data && Array.isArray(response.data)) {
      // Buscar oportunidade com CPF correspondente (mainmail)
      const oportunidade = response.data.find(op => {
        const cpfOportunidade = op.mainmail || op.cpf || '';
        return cpfOportunidade === cpf;
      });
      
      if (oportunidade) {
        console.log(`✅ [${cpf}] CPF encontrado na Fila 4 - Oportunidade ID: ${oportunidade.id}`);
        return {
          existe: true,
          opportunityId: oportunidade.id,
          oportunidade: oportunidade
        };
      } else {
        console.log(`❌ [${cpf}] CPF NÃO encontrado na Fila 4`);
        return {
          existe: false,
          opportunityId: null,
          oportunidade: null
        };
      }
    } else {
      console.log(`⚠️ [${cpf}] Resposta vazia da Kentro - assumindo que não existe`);
      return {
        existe: false,
        opportunityId: null,
        oportunidade: null
      };
    }
  } catch (error) {
    console.error(`❌ [${cpf}] Erro ao consultar CPF na Fila 4:`, error.message);
    // Em caso de erro, assumir que não existe para criar nova oportunidade
    return {
      existe: false,
      opportunityId: null,
      oportunidade: null,
      erro: error.message
    };
  }
};

/**
 * Mover oportunidade para Fase 21
 */
const moverParaFase21 = async (opportunityId, cpf, valorLiberado = null) => {
  try {
    console.log(`🔄 [${cpf}] Movendo oportunidade ${opportunityId} para Fase 21...`);
    
    const url = `${process.env.KENTRO_API_URL}/changeOpportunityStage`;
    
    const requestData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      id: opportunityId,
      fkStage: 21 // Fase 21 - Aprovado
    };
    
    // Se tiver valor liberado, incluir
    if (valorLiberado) {
      requestData.value = parseFloat(valorLiberado);
    }
    
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CLT-V8-API/1.0.0'
      },
      timeout: 30000
    });
    
    console.log(`✅ [${cpf}] Oportunidade ${opportunityId} movida para Fase 21 com sucesso`);
    
    return {
      success: true,
      message: 'Oportunidade movida para Fase 21 com sucesso',
      opportunityId: opportunityId
    };
  } catch (error) {
    console.error(`❌ [${cpf}] Erro ao mover oportunidade ${opportunityId} para Fase 21:`, error.message);
    return {
      success: false,
      message: error.message,
      opportunityId: opportunityId
    };
  }
};

/**
 * Criar nova oportunidade na Kentro (Fila 4, Fase 21)
 */
const criarOportunidadeKentroFila4 = async (dadosCliente, valorLiberado = null) => {
  try {
    const cpf = dadosCliente.cpf || dadosCliente.mainmail;
    console.log(`➕ [${cpf}] Criando nova oportunidade na Fila 4, Fase 21...`);
    
    const url = `${process.env.KENTRO_API_URL}/createOpportunity`;
    
    // Preparar formsdata com os dados do cliente
    const formsdata = {
      '9e7f92b0': dadosCliente.email || `${cpf}@gmail.com`, // Email
      '0bfc6250': dadosCliente.dataNascimento || '', // Data de nascimento
      '98167d80': dadosCliente.telefone || '', // Telefone
      '917456f0': dadosCliente.nomeMae || '', // Nome da mãe
      '6a93f650': dadosCliente.rg || '', // RG
      '1836e090': dadosCliente.endereco?.cep || '', // CEP
      '1dbfcef0': dadosCliente.endereco?.rua || '', // Rua
      '6ac31450': dadosCliente.endereco?.numero || '', // Número
      '3271f710': dadosCliente.endereco?.bairro || '', // Bairro
      '25178280': dadosCliente.endereco?.cidade || '', // Cidade
      'f6384400': dadosCliente.endereco?.estado || '', // Estado
      '98011220': dadosCliente.pix?.chave_pix || cpf, // Chave PIX
      '769db520': dadosCliente.pix?.tipo_chave || 'CPF', // Tipo PIX
      '7f6a0eb0': 'PIX' // Tipo de pagamento
    };
    
    const requestData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      fkPipeline: 4, // Fila 4
      fkStage: 21, // Fase 21 - Aprovado
      title: dadosCliente.nome || `Cliente ${cpf}`,
      mainphone: dadosCliente.telefone || '',
      mainmail: cpf, // CPF como campo principal
      value: valorLiberado ? parseFloat(valorLiberado) : 0,
      description: `Aprovado via Fila 1 - Processamento automático CLT V8`,
      formsdata: formsdata,
      tags: [6] // Etiqueta 6 obrigatória
    };
    
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CLT-V8-API/1.0.0'
      },
      timeout: 30000
    });
    
    const opportunityId = response.data?.id || response.data?.opportunityId || null;
    
    console.log(`✅ [${cpf}] Oportunidade criada com sucesso na Fila 4, Fase 21 - ID: ${opportunityId}`);
    
    return {
      success: true,
      message: 'Oportunidade criada com sucesso na Fila 4, Fase 21',
      opportunityId: opportunityId,
      data: response.data
    };
  } catch (error) {
    console.error(`❌ [${dadosCliente.cpf}] Erro ao criar oportunidade na Fila 4:`, error.message);
    return {
      success: false,
      message: error.message,
      opportunityId: null
    };
  }
};

export {
  buscarOportunidadeKentro,
  buscarOportunidadePorId,
  validarDadosOportunidade,
  solicitarTermoCLT,
  executarFluxoCLT,
  consultarTaxasDisponiveis,
  criarSimulacaoCLT,
  executarSimulacaoCLT,
  criarOportunidadeKentro,
  atualizarOportunidadeKentro,
  sincronizarOportunidadeKentro,
  dispararFluxoKentro,
  formatarDataNascimento,
  buscarTermosExistentes,
  criarSimulacaoPersonalizada,
  formatarParaV8Digital,
  limparNomeParaV8,
  consultarCPFNaFila4,
  moverParaFase21,
  criarOportunidadeKentroFila4
};
