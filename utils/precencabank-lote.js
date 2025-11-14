/**
 * Sistema de Processamento em Lote - Presença Bank
 * 
 * Etapas do processamento:
 * 1. Solicitar links do termo (gerarTermoINSS)
 * 2. Assinar com puppeteer (assinarTermoAutomaticamente)
 * 3. Consultar margem (consultarMargem)
 * 4. Simulação (consultarTabelasDisponiveis)
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { gerarTermoINSS } = require('./precencabank-fluxo');
const { assinarTermoAutomaticamente } = require('./precencabank-assinatura-automatica-otimizada');
const { consultarMargem, consultarTabelasDisponiveis } = require('./precencabank-fluxo');
const { buscarOportunidadeKentro, validarDadosOportunidade, formatarDataNascimento, sincronizarOportunidadeKentro } = require('./clt-fluxo');

// Diretório para armazenar estado dos lotes
const LOTE_DIR = path.join(__dirname, '../data/lotes-precencabank');

// Garantir que o diretório existe
async function garantirDiretorio() {
  try {
    await fs.mkdir(LOTE_DIR, { recursive: true });
    await fs.mkdir(path.join(LOTE_DIR, 'logs'), { recursive: true });
  } catch (error) {
    console.error('Erro ao criar diretório:', error);
  }
}

/**
 * Buscar todos os clientes da fila 4 da Kentro
 */
async function buscarClientesFila4() {
  try {
    console.log('🔍 Buscando clientes da fila 4 da Kentro...');
    
    // Validar variáveis de ambiente
    if (!process.env.KENTRO_API_URL) {
      throw new Error('KENTRO_API_URL não configurada. Verifique o arquivo config/config.env');
    }
    
    if (!process.env.KENTRO_API_KEY) {
      throw new Error('KENTRO_API_KEY não configurada. Verifique o arquivo config/config.env');
    }
    
    if (!process.env.KENTRO_QUEUE_ID) {
      throw new Error('KENTRO_QUEUE_ID não configurada. Verifique o arquivo config/config.env');
    }
    
    const url = `${process.env.KENTRO_API_URL}/getPipeOpportunities`;
    console.log(`🌐 URL da requisição: ${url}`);
    
    const requestData = {
      queueId: parseInt(process.env.KENTRO_QUEUE_ID),
      apiKey: process.env.KENTRO_API_KEY,
      pipelineId: 4 // Fila 4
    };
    
    console.log(`📋 Dados da requisição:`, JSON.stringify({ ...requestData, apiKey: '***' }, null, 2));
    
    const response = await axios.post(url, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CLT-V8-API/1.0.0'
      },
      timeout: 30000
    });
    
    console.log(`📊 Status da resposta Kentro:`, response.status);
    console.log(`📄 Resposta completa Kentro:`, JSON.stringify(response.data, null, 2));
    
    // A API pode retornar em diferentes formatos
    let oportunidades = [];
    if (Array.isArray(response.data)) {
      oportunidades = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      oportunidades = response.data.data;
    } else if (response.data?.opportunities && Array.isArray(response.data.opportunities)) {
      oportunidades = response.data.opportunities;
    } else if (response.data?.results && Array.isArray(response.data.results)) {
      oportunidades = response.data.results;
    }
    
    if (oportunidades.length > 0) {
      console.log(`✅ Encontrados ${oportunidades.length} clientes na fila 4`);
      
      // Mapear oportunidades para formato de cliente
      // Filtrar apenas oportunidades com CPF válido
      const clientes = oportunidades
        .map(oportunidade => {
          // Buscar CPF em múltiplos lugares (conforme documentação)
          // Prioridade: mainmail > formsdata['98011220'] > formsdata.cpf > cpf direto
          let cpf = oportunidade.mainmail || '';
          
          // Se não encontrou em mainmail, buscar em formsdata (conforme MAPEAMENTO-CAMPOS-KENTRO.md)
          if (!cpf && oportunidade.formsdata) {
            // Campo ID 98011220 é o CPF conforme documentação
            cpf = oportunidade.formsdata['98011220'] || 
                  oportunidade.formsdata.cpf || 
                  oportunidade.formsdata.CPF || 
                  '';
          }
          
          // Último recurso: campo cpf direto
          if (!cpf) {
            cpf = oportunidade.cpf || '';
          }
          
          // Limpar CPF (remover caracteres não numéricos)
          cpf = String(cpf).replace(/\D/g, '');
          
          // Validar CPF (deve ter 11 dígitos)
          if (!cpf || cpf.length !== 11) {
            return null; // Pular oportunidades sem CPF válido
          }
          
          // Buscar data de nascimento em formsdata e formatar para YYYY-MM-DD
          const dataNascimentoRaw = oportunidade.formsdata?.['0bfc6250'] || 
                                    oportunidade.birthdate || 
                                    oportunidade.dataNascimento || 
                                    '1990-01-01';
          const dataNascimento = formatarDataNascimento(dataNascimentoRaw);
          
          // Buscar email em formsdata
          const email = oportunidade.formsdata?.['9e7f92b0'] || 
                       oportunidade.email || 
                       `${cpf}@gmail.com`;
          
          // Buscar telefone
          const telefone = oportunidade.mainphone || 
                          oportunidade.phone || 
                          oportunidade.telefone || 
                          '';
          
          return {
            cpf: cpf,
            oportunidadeId: oportunidade.id,
            oportunidade: oportunidade,
            nome: oportunidade.name || oportunidade.title || `Cliente ${cpf}`,
            telefone: telefone,
            email: email,
            dataNascimento: dataNascimento
          };
        })
        .filter(cliente => cliente !== null); // Remover nulls (oportunidades sem CPF)
      
      return {
        success: true,
        total: clientes.length,
        clientes: clientes
      };
    } else {
      console.log('⚠️ Resposta vazia da Kentro ou formato não reconhecido');
      console.log('📄 Tipo da resposta:', typeof response.data);
      if (response.data && typeof response.data === 'object') {
        console.log('📄 Estrutura da resposta:', Object.keys(response.data));
      }
      
      // Se não encontrou oportunidades mas a resposta foi bem-sucedida, retornar vazio
      return {
        success: true,
        total: 0,
        clientes: []
      };
    }
  } catch (error) {
    console.error('❌ Erro ao buscar clientes da fila 4:', error.message);
    console.error('📊 Código do erro:', error.code);
    console.error('📋 Stack trace:', error.stack);
    
    // Tratamento específico para erro de URL inválida
    if (error.message.includes('Invalid URL') || error.code === 'ERR_INVALID_URL') {
      const mensagem = `URL inválida. Verifique KENTRO_API_URL no config.env. Valor atual: ${process.env.KENTRO_API_URL || 'não definido'}`;
      console.error('📋', mensagem);
      throw new Error(mensagem);
    }
    
    if (error.response) {
      console.error('📄 Resposta da API (erro):', JSON.stringify(error.response.data, null, 2));
      console.error('📊 Status HTTP:', error.response.status);
      console.error('📋 Headers da resposta:', error.response.headers);
      
      // Se a API retornou um erro específico, usar essa mensagem
      if (error.response.data && error.response.data.message) {
        throw new Error(`Erro na API Kentro: ${error.response.data.message}`);
      } else if (error.response.data && error.response.data.error) {
        throw new Error(`Erro na API Kentro: ${error.response.data.error}`);
      } else if (typeof error.response.data === 'string') {
        throw new Error(`Erro na API Kentro: ${error.response.data}`);
      }
    } else if (error.request) {
      console.error('📡 Erro de conexão. Verifique se a URL está correta:', url);
      console.error('📡 Request:', error.request);
      throw new Error(`Erro de conexão com a API Kentro. Verifique se ${process.env.KENTRO_API_URL} está acessível.`);
    }
    
    throw error;
  }
}

/**
 * Obter estado do lote
 */
async function obterEstadoLote(loteId) {
  try {
    const estadoPath = path.join(LOTE_DIR, `${loteId}/estado.json`);
    const data = await fs.readFile(estadoPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Salvar estado do lote
 */
async function salvarEstadoLote(loteId, estado) {
  await garantirDiretorio();
  const lotePath = path.join(LOTE_DIR, loteId);
  await fs.mkdir(lotePath, { recursive: true });
  
  const estadoPath = path.join(lotePath, 'estado.json');
  await fs.writeFile(estadoPath, JSON.stringify(estado, null, 2), 'utf8');
}

/**
 * Atualizar estado de um CPF específico
 */
async function atualizarEstadoCPF(loteId, cpf, etapa, status, dados = {}, erro = null) {
  const estado = await obterEstadoLote(loteId) || {
    loteId,
    total: 0,
    processados: 0,
    sucessos: 0,
    erros: 0,
    clientes: {},
    concluido: false,
    pausado: false,
    inicio: new Date().toISOString(),
    ultimaAtualizacao: new Date().toISOString()
  };
  
  if (!estado.clientes[cpf]) {
    estado.clientes[cpf] = {
      cpf,
      etapas: {
        termo: { status: 'pendente', dados: null, erro: null, timestamp: null },
        assinatura: { status: 'pendente', dados: null, erro: null, timestamp: null },
        margem: { status: 'pendente', dados: null, erro: null, timestamp: null },
        simulacao: { status: 'pendente', dados: null, erro: null, timestamp: null }
      },
      logs: []
    };
  }
  
  const cliente = estado.clientes[cpf];
  
  // Atualizar etapa
  if (cliente.etapas[etapa]) {
    cliente.etapas[etapa].status = status;
    cliente.etapas[etapa].dados = dados;
    cliente.etapas[etapa].erro = erro;
    cliente.etapas[etapa].timestamp = new Date().toISOString();
    
    // Adicionar log
    const logEntry = {
      timestamp: new Date().toISOString(),
      etapa,
      status,
      erro: erro ? {
        nome: erro.nome || erro.message || 'Erro desconhecido',
        mensagem: erro.message || erro.toString(),
        codigo: erro.codigo || erro.status || null,
        resposta: erro.resposta || null
      } : null,
      dados: dados
    };
    
    cliente.logs.push(logEntry);
    
    // Manter apenas últimos 50 logs
    if (cliente.logs.length > 50) {
      cliente.logs = cliente.logs.slice(-50);
    }
  }
  
  // Atualizar contadores
  const todasEtapasConcluidas = Object.values(cliente.etapas).every(e => 
    e.status === 'concluido' || e.status === 'erro'
  );
  
  if (status === 'concluido' && todasEtapasConcluidas) {
    estado.sucessos++;
    estado.processados++;
  } else if (status === 'erro' && !cliente.etapas[etapa].statusAnterior) {
    estado.erros++;
  }
  
  estado.ultimaAtualizacao = new Date().toISOString();
  await salvarEstadoLote(loteId, estado);
  
  return estado;
}

/**
 * Processar etapa específica de um CPF
 */
async function processarEtapa(loteId, cpf, etapa, dadosCliente = null) {
  try {
    console.log(`🔄 [${loteId}] [${cpf}] Processando etapa: ${etapa}`);
    
    // Buscar dados do cliente se não foram fornecidos
    if (!dadosCliente) {
      const oportunidade = await buscarOportunidadeKentro(cpf);
      if (!oportunidade) {
        throw new Error('Oportunidade não encontrada na Kentro');
      }
      
      const validacao = validarDadosOportunidade(oportunidade);
      if (!validacao.valido) {
        throw new Error(`Dados obrigatórios não preenchidos: ${validacao.dadosFaltantes.join(', ')}`);
      }
      
      dadosCliente = {
        cpf,
        nome: validacao.dados.nome,
        telefone: validacao.dados.telefone,
        email: validacao.dados.email,
        dataNascimento: validacao.dados.data_nascimento,
        nomeMae: validacao.dados.nome_mae,
        sexo: validacao.dados.sexo || 'M',
        endereco: validacao.dados.endereco || {},
        dadosBancarios: validacao.dados.dados_bancarios || {}
      };
    }
    
    let resultado = null;
    let erro = null;
    
    try {
      switch (etapa) {
        case 'termo':
          // Etapa 1: Solicitar links do termo
          resultado = await gerarTermoINSS({
            cpf: dadosCliente.cpf,
            nome: dadosCliente.nome,
            telefone: dadosCliente.telefone,
            produtoId: 28
          });
          
          await atualizarEstadoCPF(loteId, cpf, 'termo', 'concluido', {
            termoId: resultado.id || resultado.autorizacaoId,
            shortUrl: resultado.shortUrl,
            url: resultado.url
          });
          break;
          
        case 'assinatura':
          // Etapa 2: Assinar com puppeteer
          const estado = await obterEstadoLote(loteId);
          const termoData = estado?.clientes[cpf]?.etapas?.termo?.dados;
          
          if (!termoData || !termoData.shortUrl) {
            throw new Error('Termo não foi gerado. Execute a etapa "termo" primeiro.');
          }
          
          resultado = await assinarTermoAutomaticamente(termoData.shortUrl, {
            headless: true,
            timeout: 20000
          });
          
          await atualizarEstadoCPF(loteId, cpf, 'assinatura', 'concluido', {
            assinado: true,
            resultado: resultado
          });
          break;
          
        case 'margem':
          // Etapa 3: Consultar margem
          const estadoMargem = await obterEstadoLote(loteId);
          const termoDataMargem = estadoMargem?.clientes[cpf]?.etapas?.termo?.dados;
          
          if (!termoDataMargem || !termoDataMargem.termoId) {
            throw new Error('Termo não foi gerado. Execute a etapa "termo" primeiro.');
          }
          
          // Primeiro, consultar vínculos para obter matrícula e CNPJ
          const { consultarVinculos } = require('./precencabank-fluxo');
          const vinculosResponse = await consultarVinculos(dadosCliente.cpf, termoDataMargem.termoId);
          
          // A resposta pode vir em diferentes formatos:
          // 1. Array direto: [{ matricula, numeroInscricaoEmpregador }]
          // 2. Objeto com propriedade 'data': { data: [...] }
          // 3. Objeto com propriedade 'vinculos': { vinculos: [...] }
          // 4. Objeto com propriedade 'id': { id: [...] }  <- FORMATO REAL DA API
          // 5. Objeto único: { matricula, numeroInscricaoEmpregador }
          let vinculos = [];
          
          if (Array.isArray(vinculosResponse)) {
            vinculos = vinculosResponse;
          } else if (vinculosResponse?.id && Array.isArray(vinculosResponse.id)) {
            // Formato real da API: { id: [...] }
            vinculos = vinculosResponse.id;
          } else if (vinculosResponse?.data && Array.isArray(vinculosResponse.data)) {
            vinculos = vinculosResponse.data;
          } else if (vinculosResponse?.vinculos && Array.isArray(vinculosResponse.vinculos)) {
            vinculos = vinculosResponse.vinculos;
          } else if (vinculosResponse && typeof vinculosResponse === 'object') {
            // Se for um único objeto, colocar em array
            vinculos = [vinculosResponse];
          }
          
          if (!vinculos || vinculos.length === 0) {
            console.error(`❌ [${loteId}] [${cpf}] Resposta completa:`, JSON.stringify(vinculosResponse, null, 2));
            throw new Error('Nenhum vínculo encontrado. Não é possível consultar margem.');
          }
          
          // Usar o primeiro vínculo
          const vinculo = vinculos[0];
          
          // Log detalhado para debug
          console.log(`📋 [${loteId}] [${cpf}] Estrutura do vínculo:`, JSON.stringify(vinculo, null, 2));
          console.log(`📋 [${loteId}] [${cpf}] Chaves do vínculo:`, Object.keys(vinculo || {}));
          
          // Extrair matrícula e CNPJ (formato real da API usa 'matricula' e 'numeroInscricaoEmpregador')
          let matricula = vinculo.matricula || 
                         vinculo.registroEmpregaticio || 
                         vinculo.numeroMatricula ||
                         vinculo.registro ||
                         '';
          
          let cnpj = vinculo.numeroInscricaoEmpregador ||  // Campo real da API
                    vinculo.cnpj || 
                    vinculo.cnpjEmpregador || 
                    vinculo.numeroInscricao ||
                    vinculo.empregador?.cnpj ||
                    '';
          
          // Limpar CNPJ (apenas números, 14 dígitos)
          const cnpjLimpo = String(cnpj).replace(/\D/g, '');
          if (cnpjLimpo.length !== 14) {
            console.warn(`⚠️ [${loteId}] [${cpf}] CNPJ com formato inválido: ${cnpj} (${cnpjLimpo.length} dígitos, esperado 14)`);
            if (cnpjLimpo.length < 14) {
              cnpj = cnpjLimpo.padStart(14, '0');
            } else if (cnpjLimpo.length > 14) {
              cnpj = cnpjLimpo.slice(-14);
            } else {
              cnpj = cnpjLimpo;
            }
          } else {
            cnpj = cnpjLimpo;
          }
          
          // Limpar matrícula (remover caracteres não numéricos)
          let matriculaLimpa = String(matricula).replace(/\D/g, '');
          
          // Se a matrícula contém o CNPJ no início, remover (conforme precencabank-fluxo.js linha 912-914)
          if (matriculaLimpa.startsWith(cnpj)) {
            console.log(`⚠️ [${loteId}] [${cpf}] Matrícula contém CNPJ no início, removendo...`);
            matriculaLimpa = matriculaLimpa.substring(cnpj.length);
          }
          
          // Validar matrícula
          if (!matriculaLimpa || matriculaLimpa.length === 0) {
            console.warn(`⚠️ [${loteId}] [${cpf}] Matrícula vazia após limpeza, usando valor padrão`);
            matricula = '0001'; // Valor padrão
          } else if (matriculaLimpa.length > 20) {
            console.warn(`⚠️ [${loteId}] [${cpf}] Matrícula muito longa (${matriculaLimpa.length} dígitos), truncando...`);
            matricula = matriculaLimpa.slice(-10); // Pegar últimos 10 dígitos
          } else {
            matricula = matriculaLimpa;
          }
          
          console.log(`📋 [${loteId}] [${cpf}] Matrícula final: "${matricula}"`);
          console.log(`📋 [${loteId}] [${cpf}] CNPJ final: "${cnpj}"`);
          
          if (!matricula || !cnpj) {
            console.error(`❌ [${loteId}] [${cpf}] Vínculo completo:`, JSON.stringify(vinculo, null, 2));
            throw new Error(`Matrícula ou CNPJ não encontrados no vínculo. Matrícula: "${matricula}", CNPJ: "${cnpj}". Chaves disponíveis: ${Object.keys(vinculo || {}).join(', ')}`);
          }
          
          resultado = await consultarMargem({
            cpf: dadosCliente.cpf,
            matricula: matricula,
            cnpj: cnpj,
            termoId: termoDataMargem.termoId
          });
          
          await atualizarEstadoCPF(loteId, cpf, 'margem', 'concluido', {
            margem: resultado,
            matricula: matricula,
            cnpj: cnpj,
            vinculos: vinculos
          });
          break;
          
        case 'simulacao':
          // Etapa 4: Simulação
          // Obter matrícula e CNPJ da etapa de margem
          const estadoSimulacao = await obterEstadoLote(loteId);
          const margemData = estadoSimulacao?.clientes?.[cpf]?.etapas?.margem?.dados;
          const margemResultado = estadoSimulacao?.clientes?.[cpf]?.etapas?.margem?.dados?.margem || 
                                 estadoSimulacao?.clientes?.[cpf]?.etapas?.margem?.dados?.resultado;
          
          const matriculaSimulacao = margemData?.matricula || dadosCliente.matricula || '';
          const cnpjSimulacao = margemData?.cnpj || dadosCliente.cnpj || '';
          
          // Atualizar dados do cliente com informações da margem (data de nascimento, sexo, nome da mãe)
          let dataNascimentoParaSimulacao = dadosCliente.dataNascimento;
          let sexoParaSimulacao = dadosCliente.sexo;
          let nomeMaeParaSimulacao = dadosCliente.nomeMae;
          
          if (margemResultado) {
            // Se a margem retornou um array, usar o primeiro item
            const margemInfo = Array.isArray(margemResultado) ? margemResultado[0] : margemResultado;
            
            if (margemInfo?.dataNascimento) {
              dataNascimentoParaSimulacao = margemInfo.dataNascimento; // Já vem em YYYY-MM-DD
              console.log(`📅 [${loteId}] [${cpf}] Data de nascimento atualizada da margem: ${dataNascimentoParaSimulacao}`);
            }
            if (margemInfo?.sexo) {
              sexoParaSimulacao = margemInfo.sexo === 'Masculino' ? 'M' : (margemInfo.sexo === 'Feminino' ? 'F' : 'M');
              console.log(`👤 [${loteId}] [${cpf}] Sexo atualizado da margem: ${sexoParaSimulacao} (original: ${margemInfo.sexo})`);
            }
            if (margemInfo?.nomeMae) {
              nomeMaeParaSimulacao = margemInfo.nomeMae;
              console.log(`👩 [${loteId}] [${cpf}] Nome da mãe atualizado da margem: ${nomeMaeParaSimulacao}`);
            }
          }
          
          // Formatar data de nascimento para YYYY-MM-DD (formato exigido pela API)
          const dataNascimentoFormatada = formatarDataNascimento(dataNascimentoParaSimulacao);
          console.log(`📅 [${loteId}] [${cpf}] Data de nascimento: "${dataNascimentoParaSimulacao}" → Formatada: "${dataNascimentoFormatada}"`);
          console.log(`📋 [${loteId}] [${cpf}] Matrícula para simulação: "${matriculaSimulacao}"`);
          console.log(`📋 [${loteId}] [${cpf}] CNPJ para simulação: "${cnpjSimulacao}"`);
          console.log(`👤 [${loteId}] [${cpf}] Sexo para simulação: "${sexoParaSimulacao}"`);
          console.log(`👩 [${loteId}] [${cpf}] Nome da mãe para simulação: "${nomeMaeParaSimulacao || 'N/A'}"`);
          
          resultado = await consultarTabelasDisponiveis({
            cpf: dadosCliente.cpf,
            nome: dadosCliente.nome,
            telefone: dadosCliente.telefone,
            dataNascimento: dataNascimentoFormatada,
            nomeMae: nomeMaeParaSimulacao,
            sexo: sexoParaSimulacao,
            endereco: dadosCliente.endereco,
            dadosBancarios: dadosCliente.dadosBancarios,
            // Incluir vínculo empregatício (matrícula e CNPJ) obtidos na etapa de margem
            matricula: matriculaSimulacao,
            cnpj: cnpjSimulacao
          });
          
          await atualizarEstadoCPF(loteId, cpf, 'simulacao', 'concluido', {
            tabelas: resultado
          });
          
          // Disparar na Kentro após simulação bem-sucedida
          try {
            console.log(`🚀 [${loteId}] [${cpf}] Simulação concluída com sucesso. Disparando na Kentro...`);
            
            // Obter dados do cliente para sincronização
            const estadoAtual = await obterEstadoLote(loteId);
            const clienteAtual = estadoAtual?.clientes?.[cpf];
            const oportunidade = clienteAtual?.oportunidade || dadosCliente.oportunidade;
            
            // Preparar dados para sincronização na Kentro
            // Extrair valor da simulação se disponível
            let valorLiberado = 0;
            if (resultado && Array.isArray(resultado) && resultado.length > 0) {
              // Se a resposta é um array de tabelas, tentar extrair valor da primeira tabela
              const primeiraTabela = resultado[0];
              valorLiberado = primeiraTabela?.valorMaximo || 
                            primeiraTabela?.valorLiberado || 
                            primeiraTabela?.valor || 0;
            } else if (resultado && typeof resultado === 'object') {
              valorLiberado = resultado.valorMaximo || 
                            resultado.valorLiberado || 
                            resultado.valor || 0;
            }
            
            const dadosKentro = {
              cpf: cpf,
              nome: dadosCliente.nome || oportunidade?.name || oportunidade?.title || `Cliente ${cpf}`,
              telefone: dadosCliente.telefone || oportunidade?.mainphone || '',
              email: dadosCliente.email || oportunidade?.email || oportunidade?.formsdata?.['9e7f92b0'] || `${cpf}@gmail.com`,
              dataNascimento: dadosCliente.dataNascimento || oportunidade?.formsdata?.['0bfc6250'] || '',
              endereco: dadosCliente.endereco || {
                rua: oportunidade?.address1 || '',
                numero: oportunidade?.address2 || '',
                cidade: oportunidade?.city || '',
                estado: oportunidade?.state || '',
                cep: oportunidade?.postalcode || '',
                bairro: oportunidade?.formsdata?.['3271f710'] || ''
              },
              valorLiberado: valorLiberado,
              dadosSimulacao: resultado
            };
            
            // Sincronizar na Kentro (atualizar ou criar oportunidade)
            const resultadoKentro = await sincronizarOportunidadeKentro(dadosKentro);
            
            console.log(`✅ [${loteId}] [${cpf}] Disparo na Kentro realizado com sucesso!`);
            console.log(`📋 [${loteId}] [${cpf}] Resultado Kentro:`, JSON.stringify(resultadoKentro, null, 2));
            
            // Salvar resultado do disparo no estado
            await atualizarEstadoCPF(loteId, cpf, 'simulacao', 'concluido', {
              tabelas: resultado,
              kentro: {
                sucesso: true,
                oportunidadeId: resultadoKentro?.id || oportunidade?.id,
                timestamp: new Date().toISOString()
              }
            });
            
          } catch (kentroError) {
            console.error(`❌ [${loteId}] [${cpf}] Erro ao disparar na Kentro:`, kentroError.message);
            // Não falhar o processo por erro na Kentro, apenas logar
            await atualizarEstadoCPF(loteId, cpf, 'simulacao', 'concluido', {
              tabelas: resultado,
              kentro: {
                sucesso: false,
                erro: kentroError.message,
                timestamp: new Date().toISOString()
              }
            });
          }
          
          break;
          
        default:
          throw new Error(`Etapa desconhecida: ${etapa}`);
      }
      
      return {
        success: true,
        etapa,
        resultado
      };
      
    } catch (apiError) {
      // Capturar erro da API com detalhes
      erro = {
        nome: apiError.name || 'Erro',
        message: apiError.message || 'Erro desconhecido',
        codigo: apiError.response?.status || null,
        resposta: apiError.response?.data || null,
        stack: apiError.stack
      };
      
      await atualizarEstadoCPF(loteId, cpf, etapa, 'erro', null, erro);
      
      throw apiError;
    }
    
  } catch (error) {
    console.error(`❌ [${loteId}] [${cpf}] Erro ao processar etapa ${etapa}:`, error.message);
    throw error;
  }
}

/**
 * Processar cliente completo (todas as etapas)
 */
async function processarClienteCompleto(loteId, cliente) {
  const cpf = cliente.cpf;
  
  try {
    console.log(`🚀 [${loteId}] [${cpf}] Iniciando processamento completo...`);
    
    // Usar dados do cliente que já vêm da fila 4
    // Não precisa buscar novamente na Kentro
    const dadosCliente = {
      cpf: cliente.cpf,
      nome: cliente.nome || '',
      telefone: cliente.telefone || '',
      email: cliente.email || `${cliente.cpf}@gmail.com`,
      dataNascimento: cliente.dataNascimento || '1990-01-01',
      nomeMae: cliente.oportunidade?.formsdata?.['917456f0'] || '',
      sexo: 'M', // Padrão, será atualizado na consulta de margem
      endereco: {
        cep: cliente.oportunidade?.postalcode || cliente.oportunidade?.formsdata?.['1836e090'] || '',
        rua: cliente.oportunidade?.address1 || cliente.oportunidade?.formsdata?.['1dbfcef0'] || '',
        numero: cliente.oportunidade?.address2 || cliente.oportunidade?.formsdata?.['6ac31450'] || '',
        bairro: cliente.oportunidade?.formsdata?.['3271f710'] || '',
        cidade: cliente.oportunidade?.city || cliente.oportunidade?.formsdata?.['25178280'] || '',
        estado: cliente.oportunidade?.state || cliente.oportunidade?.formsdata?.['f6384400'] || ''
      },
      dadosBancarios: {
        codigoBanco: cliente.oportunidade?.formsdata?.['cd34f870'] || '',
        agencia: cliente.oportunidade?.formsdata?.['7f6a0eb0'] || '',
        conta: cliente.oportunidade?.formsdata?.['769db520'] || '',
        digitoConta: '0',
        formaCredito: '1'
      },
      matricula: '', // Será obtida na consulta de vínculos
      cnpj: '', // Será obtida na consulta de vínculos
      oportunidade: cliente.oportunidade // Incluir oportunidade para uso na sincronização Kentro
    };
    
    // Processar cada etapa sequencialmente
    const etapas = ['termo', 'assinatura', 'margem', 'simulacao'];
    
    for (const etapa of etapas) {
      try {
        await processarEtapa(loteId, cpf, etapa, dadosCliente);
        console.log(`✅ [${loteId}] [${cpf}] Etapa ${etapa} concluída`);
      } catch (etapaError) {
        console.error(`❌ [${loteId}] [${cpf}] Erro na etapa ${etapa}:`, etapaError.message);
        // Continuar para próxima etapa mesmo com erro
        // O erro já foi salvo no estado
      }
    }
    
    return {
      success: true,
      cpf
    };
    
  } catch (error) {
    console.error(`❌ [${loteId}] [${cpf}] Erro ao processar cliente:`, error.message);
    throw error;
  }
}

/**
 * Processar lote completo
 */
async function processarLote(loteId, clientes, maxConcurrent = 5) {
  try {
    await garantirDiretorio();
    
    // Inicializar estado do lote
    const estadoInicial = {
      loteId,
      total: clientes.length,
      processados: 0,
      sucessos: 0,
      erros: 0,
      clientes: {},
      concluido: false,
      pausado: false,
      inicio: new Date().toISOString(),
      ultimaAtualizacao: new Date().toISOString()
    };
    
    await salvarEstadoLote(loteId, estadoInicial);
    
    console.log(`🚀 [${loteId}] Iniciando processamento de ${clientes.length} clientes...`);
    
    // Processar clientes em paralelo (limitado)
    let processando = 0;
    let indiceAtual = 0;
    
    const processarProximo = async () => {
      while (indiceAtual < clientes.length) {
        // Verificar se está pausado antes de processar próximo cliente
        const estado = await obterEstadoLote(loteId);
        if (estado && estado.pausado) {
          console.log(`⏸️ [${loteId}] Lote pausado - parando processamento`);
          break;
        }
        
        if (processando >= maxConcurrent) {
          // Verificar pausado também durante a espera
          const estadoEspera = await obterEstadoLote(loteId);
          if (estadoEspera && estadoEspera.pausado) {
            console.log(`⏸️ [${loteId}] Lote pausado durante espera`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        const cliente = clientes[indiceAtual];
        indiceAtual++;
        processando++;
        
        processarClienteCompleto(loteId, cliente)
          .then(() => {
            processando--;
            // Verificar se está pausado antes de processar próximo
            obterEstadoLote(loteId).then(estado => {
              if (!estado || !estado.pausado) {
                processarProximo();
              } else {
                console.log(`⏸️ [${loteId}] Lote pausado - não processando próximo cliente`);
              }
            });
          })
          .catch(error => {
            console.error(`❌ [${loteId}] Erro ao processar cliente ${cliente.cpf}:`, error.message);
            processando--;
            // Verificar se está pausado antes de processar próximo
            obterEstadoLote(loteId).then(estado => {
              if (!estado || !estado.pausado) {
                processarProximo();
              } else {
                console.log(`⏸️ [${loteId}] Lote pausado - não processando próximo cliente`);
              }
            });
          });
      }
      
      // Verificar se terminou
      if (indiceAtual >= clientes.length && processando === 0) {
        const estadoFinal = await obterEstadoLote(loteId);
        if (estadoFinal) {
          estadoFinal.concluido = true;
          estadoFinal.fim = new Date().toISOString();
          await salvarEstadoLote(loteId, estadoFinal);
          console.log(`✅ [${loteId}] Processamento concluído`);
        }
      }
    };
    
    // Iniciar processamento
    processarProximo();
    
    return {
      success: true,
      loteId
    };
    
  } catch (error) {
    console.error(`❌ [${loteId}] Erro ao processar lote:`, error.message);
    throw error;
  }
}

module.exports = {
  buscarClientesFila4,
  obterEstadoLote,
  salvarEstadoLote,
  atualizarEstadoCPF,
  processarEtapa,
  processarClienteCompleto,
  processarLote
};

