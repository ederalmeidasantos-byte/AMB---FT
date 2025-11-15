const express = require('express');
const https = require('https');
const cors = require('cors');
const helmet = require('helmet');
// const rateLimit = require('express-rate-limit'); // Removido - não queremos rate limiting
const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, 'config', 'config.env') });

// Importar rotas
const cltRoutes = require('./routes/clt');
const processarClientesCompletosEmBackground = cltRoutes.processarClientesCompletosEmBackground;

// Importar funções de estado
const { listarLotes } = require('./utils/estado-processamento-clt');

// Importar funções do CLT
const { 
  buscarOportunidadeKentro,
  buscarTermosExistentes,
  criarSimulacaoPersonalizada,
  obterConfiguracoesSimulacao
} = require('./utils/clt-fluxo');

// Importar funções de cache
const {
  salvarSimulacaoAprovada,
  buscarSimulacaoAprovada,
  listarSimulacoesCache,
  removerSimulacaoCache,
  atualizarSimulacaoCache,
  limparCache
} = require('./utils/cache-simulacoes');

// Configurar logger com rotação e limpeza automática
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log'
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Função para limpar logs antigos (mais de 24 horas)
function limparLogsAntigos() {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) return;
    
    const agora = Date.now();
    const vinteQuatroHoras = 24 * 60 * 60 * 1000; // 24 horas em milissegundos
    
    const arquivos = fs.readdirSync(logsDir);
    let removidos = 0;
    let espacoLiberado = 0;
    
    arquivos.forEach(arquivo => {
      const caminhoArquivo = path.join(logsDir, arquivo);
      const stats = fs.statSync(caminhoArquivo);
      const idadeArquivo = agora - stats.mtime.getTime();
      
      // Remover arquivos com mais de 24 horas
      // Mantém apenas os arquivos principais ativos (error.log e combined.log)
      if (idadeArquivo > vinteQuatroHoras) {
        // Não remover os arquivos principais ativos
        if (arquivo === 'error.log' || arquivo === 'combined.log') {
          // Se o arquivo principal tiver mais de 24 horas e for muito grande (>50MB), truncar
          if (stats.size > 50 * 1024 * 1024) {
            fs.truncateSync(caminhoArquivo, 0);
            console.log(`✂️ Arquivo principal truncado: ${arquivo} (era ${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            removidos++;
            espacoLiberado += stats.size;
          }
        } else {
          // Remover arquivos antigos (backups, logs rotacionados, etc)
          const tamanho = stats.size;
          fs.unlinkSync(caminhoArquivo);
          removidos++;
          espacoLiberado += tamanho;
          console.log(`🗑️ Log antigo removido: ${arquivo} (${(tamanho / 1024 / 1024).toFixed(2)}MB)`);
        }
      }
    });
    
    if (removidos > 0) {
      console.log(`✅ Limpeza de logs: ${removidos} arquivo(s) removido(s), ${(espacoLiberado / 1024 / 1024).toFixed(2)}MB liberado(s)`);
    }
  } catch (error) {
    console.error('❌ Erro ao limpar logs antigos:', error.message);
  }
}

// Executar limpeza de logs a cada 6 horas
setInterval(limparLogsAntigos, 6 * 60 * 60 * 1000);

// Executar limpeza imediatamente ao iniciar (após 10 segundos)
setTimeout(limparLogsAntigos, 10000);

const app = express();
const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;

// Carregar certificados SSL se existirem
let httpsServer = null;
try {
  const certPath = '/etc/letsencrypt/live/lunasdigital.com.br/fullchain.pem';
  const keyPath = '/etc/letsencrypt/live/lunasdigital.com.br/privkey.pem';
  
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const options = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
    
    httpsServer = https.createServer(options, app);
    console.log('✅ Certificados SSL carregados com sucesso');
  } else {
    console.log('⚠️ Certificados SSL não encontrados, servindo apenas HTTP');
  }
} catch (error) {
  console.log('⚠️ Erro ao carregar certificados SSL:', error.message);
}

// Middleware de segurança - DESABILITADO CSP temporariamente para desenvolvimento
app.use(helmet({
  contentSecurityPolicy: false, // Desabilita CSP completamente para desenvolvimento
}));

// Rate limiting removido - não queremos limitar requisições

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Rota para processamento em lote Presença Bank (ANTES das rotas de API)
app.get('/precencabank-lote.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'precencabank-lote.html'));
});

app.get('/teste-fases-precencabank.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teste-fases-precencabank.html'));
});

// Rota para página de crédito consignado CLT
app.get('/consig', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consig.html'));
});

app.get('/consig.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consig.html'));
});

// Rotas para páginas legais
app.get('/politica-privacidade.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'politica-privacidade.html'));
});

app.get('/termos-uso.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'termos-uso.html'));
});

app.get('/lgpd.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lgpd.html'));
});

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de tratamento de erro de JSON parsing
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('❌ Erro de JSON parsing:', error.message);
    console.error('❌ Body raw:', req.body);
    console.error('❌ Headers:', req.headers);
    return res.status(400).json({
      error: 'JSON inválido',
      message: 'O JSON enviado está malformado',
      details: error.message
    });
  }
  next(error);
});

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Configurações de segurança mais permissivas para desenvolvimento
// NOTA: CSP já está configurado no Helmet acima, então não precisamos remover aqui

// Rotas
// Usar rotas
app.use('/clt', cltRoutes);

// Rota separada para cadastro em massa (não mexe na produção)
const cadastroMassaRoutes = require('./routes/cadastro-massa');
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);
app.use('/cadastro-massa', cadastroMassaRoutes);

// ========================================
// ENDPOINTS DE CACHE DE SIMULAÇÕES
// ========================================

// Salvar simulação aprovada no cache
app.post('/cache/simulacao/salvar', async (req, res) => {
  try {
    const { cpf, consultId, dadosSimulacao, dadosCliente } = req.body;
    
    console.log(`💾 [${cpf}] Salvando simulação no cache...`);
    
    if (!cpf || !consultId || !dadosSimulacao) {
      return res.status(400).json({
        success: false,
        message: 'CPF, consultId e dadosSimulacao são obrigatórios'
      });
    }
    
    const resultado = salvarSimulacaoAprovada(cpf, consultId, dadosSimulacao, dadosCliente);
    
    if (resultado.success) {
      res.json({
        success: true,
        message: 'Simulação e dados do cliente salvos no cache com sucesso',
        dados: { cpf, consultId }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar simulação no cache',
        erro: resultado.message
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint salvar cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao salvar cache',
      erro: error.message
    });
  }
});

// Buscar simulação no cache
app.get('/cache/simulacao/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    console.log(`🔍 [${cpf}] Buscando simulação no cache...`);
    
    const resultado = buscarSimulacaoAprovada(cpf);
    
    if (resultado.success) {
      res.json({
        success: true,
        message: 'Simulação encontrada no cache',
        dados: resultado.dados
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Simulação não encontrada no cache',
        erro: resultado.message
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint buscar cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar cache',
      erro: error.message
    });
  }
});

// Atualizar simulação no cache
app.put('/cache/simulacao/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    const dadosAtualizados = req.body;
    
    console.log(`🔄 [${cpf}] Atualizando simulação no cache...`);
    console.log(`📋 [${cpf}] Dados recebidos:`, dadosAtualizados);
    
    if (!dadosAtualizados || Object.keys(dadosAtualizados).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dados para atualização são obrigatórios'
      });
    }
    
    const resultado = atualizarSimulacaoCache(cpf, dadosAtualizados);
    
    if (resultado.success) {
      res.json({
        success: true,
        message: 'Simulação atualizada no cache com sucesso',
        dados: { cpf }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar simulação no cache',
        erro: resultado.message
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint atualizar cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao atualizar cache',
      erro: error.message
    });
  }
});

// Listar todas as simulações no cache
app.get('/cache/simulacoes', async (req, res) => {
  try {
    console.log('📋 Listando simulações do cache...');
    
    const resultado = listarSimulacoesCache();
    
    if (resultado.success) {
      res.json({
        success: true,
        message: 'Simulações listadas com sucesso',
        total: resultado.total,
        simulacoes: resultado.simulacoes
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao listar simulações',
        erro: resultado.message
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint listar cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao listar cache',
      erro: error.message
    });
  }
});

// Listar propostas com informações da empresa
app.get('/cache/propostas', async (req, res) => {
  try {
    console.log('📋 Listando propostas com informações da empresa...');
    
    const resultado = listarSimulacoesCache();
    
    if (resultado.success && resultado.simulacoes) {
      // Formatar propostas com informações da empresa
      const propostas = Object.entries(resultado.simulacoes).map(([cpf, dados]) => {
        const nomeEmpresa = dados.dadosSimulacao?.provider_name || 
                           dados.dadosSimulacao?.provider || 
                           dados.provider || 
                           'QI'; // Default
        
        return {
          cpf: cpf,
          nome: dados.dadosCliente?.nome || dados.dadosCliente?.title || 'N/A',
          email: dados.dadosCliente?.email || dados.dadosCliente?.mainmail || 'N/A',
          telefone: dados.dadosCliente?.telefone || dados.dadosCliente?.mainphone || 'N/A',
          empresa: nomeEmpresa,
          valor_liberado: dados.dadosSimulacao?.disbursement_amount || dados.dadosSimulacao?.operation_amount || 0,
          parcelas: dados.dadosSimulacao?.number_of_installments || 0,
          valor_parcela: dados.dadosSimulacao?.installment_value || dados.dadosSimulacao?.installment_face_value || 0,
          status: dados.status || 'APROVADA',
          timestamp: dados.timestamp,
          formalization_url: dados.formalization_url,
          operation_id: dados.operation_id
        };
      });
      
      res.json({
        success: true,
        message: 'Propostas listadas com sucesso',
        total: propostas.length,
        empresas: [...new Set(propostas.map(p => p.empresa))],
        propostas: propostas.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      });
    } else {
      res.json({
        success: true,
        total: 0,
        empresas: [],
        propostas: []
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint listar propostas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao listar propostas',
      erro: error.message
    });
  }
});

// Listar operações da V8 Digital
app.get('/v8/operacoes', async (req, res) => {
  try {
    console.log('📋 Listando operações da V8 Digital...');
    
    // Obter token
    const { getValidToken } = require('./utils/auth');
    const token = await getValidToken();
    
    // Obter parâmetros da query
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Últimos 30 dias
    const endDate = req.query.endDate || new Date().toISOString();
    const limit = req.query.limit || '50';
    const page = req.query.page || '1';
    const provider = req.query.provider || 'QI';
    
    // Chamar API da V8
    const axios = require('axios');
    const response = await axios.get(`${process.env.V8_API_URL}/private-consignment/operation`, {
      params: {
        startDate,
        endDate,
        limit,
        page,
        provider
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    // Formatar resposta
    const operacoes = response.data.map(op => ({
      operationId: op.operationId,
      contractNumber: op.contractNumber,
      nome: op.name,
      cpf: op.documentNumber,
      empresa: provider, // Provedor da query
      valor_liberado: op.disbursedIssueAmount || op.issueAmount || 0,
      status: op.status,
      partnerId: op.partnerId,
      createdAt: op.createdAt,
      history: op.history || []
    }));
    
    res.json({
      success: true,
      message: 'Operações listadas com sucesso',
      total: operacoes.length,
      empresas: [provider],
      operacoes: operacoes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar operações da V8:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar operações da V8 Digital',
      erro: error.message
    });
  }
});

// Remover simulação do cache
app.delete('/cache/simulacao/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    console.log(`🗑️ [${cpf}] Removendo simulação do cache...`);
    
    const resultado = removerSimulacaoCache(cpf);
    
    if (resultado.success) {
      res.json({
        success: true,
        message: 'Simulação removida do cache com sucesso'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Erro ao remover simulação do cache',
        erro: resultado.message
      });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint remover cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao remover cache',
      erro: error.message
    });
  }
});

// Endpoint para simulação personalizada usando cache
app.post('/clt/simular-cache', async (req, res) => {
  try {
    const { cpf, valor, prazo } = req.body;
    
    console.log(`🔄 [${cpf}] Simulação personalizada solicitada:`, { valor, prazo });
    
    // Buscar simulação atual no cache
    const cacheResult = buscarSimulacaoAprovada(cpf);
    
    if (!cacheResult.success) {
      return res.status(404).json({
        success: false,
        message: 'Simulação não encontrada no cache',
        erro: 'É necessário ter uma simulação aprovada no cache'
      });
    }
    
    // Usar dados do cache como base e ajustar valores
    const dadosSimulacao = cacheResult.dados.dadosSimulacao;
    
    // Usar função existente do fluxo completo para simular
    const { executarFluxoCompletoCLT } = require('./routes/clt');
    
    console.log(`🔄 [${cpf}] Executando simulação via fluxo completo...`);
    
    // Executar fluxo completo que já tem a simulação funcionando
    const resultadoFluxo = await executarFluxoCompletoCLT(cpf);
    
    if (resultadoFluxo.sucesso && resultadoFluxo.simulacao_resultado) {
      console.log(`✅ [${cpf}] Simulação realizada com sucesso`);
      
      res.json({
        success: true,
        message: 'Simulação realizada com sucesso',
        resultado: resultadoFluxo.simulacao_resultado
      });
    } else {
      console.log(`❌ [${cpf}] Erro na simulação:`, resultadoFluxo.motivo_falha);
      
      res.status(400).json({
        success: false,
        message: 'Erro na simulação',
        erro: resultadoFluxo.motivo_falha || 'Erro desconhecido'
      });
    }
    
  } catch (error) {
    console.error('❌ Erro no endpoint simular-cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na simulação personalizada',
      erro: error.message
    });
  }
});

// Rota para simulação personalizada
app.post('/clt/simular-personalizada', async (req, res) => {
  try {
    const { cpf, installment_face_value, number_of_installments } = req.body;
    
    console.log(`🔄 [${cpf}] Simulação personalizada solicitada:`, {
      installment_face_value,
      number_of_installments
    });

    // Buscar dados do cliente na Kentro (apenas se necessário)
    let dadosCliente = { success: true }; // Assumir que já temos os dados

    // Buscar termos existentes
    const termosExistentes = await buscarTermosExistentes(cpf);
    if (!termosExistentes.success) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao buscar termos existentes',
        erro: termosExistentes.message
      });
    }

    // Encontrar termo aprovado
    const termoAprovado = termosExistentes.dados.find(termo => 
      termo.status === 'SUCCESS' || termo.status === 'CONSENT_APPROVED'
    );

    if (!termoAprovado) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum termo aprovado encontrado para simulação',
        erro: 'É necessário ter um termo aprovado para realizar simulações'
      });
    }

    console.log(`✅ [${cpf}] Termo aprovado encontrado:`, termoAprovado.id);

    // Obter configurações de simulação
    const configs = await obterConfiguracoesSimulacao();
    if (!configs.success) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao obter configurações de simulação',
        erro: configs.message
      });
    }

    // Usar primeira configuração disponível
    const configId = configs.dados[0].id;
    console.log(`⚙️ [${cpf}] Usando configuração:`, configId);

    // Criar simulação personalizada
    const simulacao = await criarSimulacaoPersonalizada({
      consult_id: termoAprovado.id,
      config_id: configId,
      installment_face_value: installment_face_value,
      number_of_installments: number_of_installments,
      provider: 'QI'
    });

    if (!simulacao.success) {
      return res.status(400).json({
        success: false,
        message: 'Erro ao criar simulação personalizada',
        erro: simulacao.message
      });
    }

    console.log(`✅ [${cpf}] Simulação personalizada criada com sucesso`);

    res.json({
      success: true,
      message: 'Simulação personalizada realizada com sucesso',
      resultado: simulacao.dados
    });

  } catch (error) {
    console.error(`❌ [${req.body.cpf || 'N/A'}] Erro na simulação personalizada:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na simulação personalizada',
      erro: error.message
    });
  }
});

// Rota para o formulário de proposta CLT
app.get('/formulario', (req, res) => {
  res.sendFile(path.join(__dirname, 'formulario-proposta-clt.html'));
});

// Rota para o formulário modelo INSS
app.get('/formulario-modelo', (req, res) => {
  res.sendFile(path.join(__dirname, 'formulario-clt-modelo-inss.html'));
});

// Rota para o formulário de cadastro de proposta
app.get('/formulario-cadastro-proposta.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'formulario-cadastro-proposta.html'));
});

// Rota para o formulário novo
app.get('/formulario-novo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'formulario-novo.html'));
});

// Rota para disparo em lote completo
app.get('/disparo-lote-completo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'disparo-lote-completo.html'));
});

// Rota para sincronizar CPFs específicos
app.get('/sincronizar-cpfs-especificos.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sincronizar-cpfs-especificos.html'));
});

app.get('/teste-estilo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'teste-estilo.html'));
});

// Rota para página de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Rota para página de pesquisa de empresas e funcionários
app.get('/pesquisar-empresas', (req, res) => {
  res.sendFile(path.join(__dirname, 'pesquisar-empresas-funcionarios.html'));
});

// Rota para resumo de proposta com CPF na URL
app.get('/resumo=:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    // Validar CPF
    if (!cpf || cpf.length < 10) {
      return res.status(400).send(`
        <div style="padding: 2rem; text-align: center; font-family: Arial;">
          <h2>❌ CPF Inválido</h2>
          <p>O CPF fornecido não é válido.</p>
          <a href="/resumo-modelo" style="color: #007bff;">Voltar ao formulário</a>
        </div>
      `);
    }

    console.log(`🔍 [${cpf}] Carregando página de resumo...`);

    // Ler o arquivo HTML
    const fs = require('fs');
    const path = require('path');
                 const htmlPath = path.join(__dirname, 'resumo-clt-modelo-inss.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Adicionar script para carregar dados automaticamente
    const scriptCarregar = `
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          console.log('🚀 DOM carregado, carregando dados do CPF: ${cpf}');
          
          // Definir CPF na URL para o JavaScript
          if (!window.location.search.includes('cpf=')) {
            const url = new URL(window.location);
            url.searchParams.set('cpf', '${cpf}');
            window.history.replaceState({}, '', url);
          }
        });
      </script>
    `;
    
    htmlContent = htmlContent.replace('</body>', scriptCarregar + '</body>');
    res.send(htmlContent);

  } catch (error) {
    console.error(`❌ [${req.params.cpf || 'N/A'}] Erro ao carregar resumo:`, error);
    res.status(500).send(`
      <div style="padding: 2rem; text-align: center; font-family: Arial;">
        <h2>❌ Erro Interno</h2>
        <p>Erro ao carregar página de resumo: ${error.message}</p>
        <a href="/resumo-modelo" style="color: #007bff;">Voltar ao formulário</a>
      </div>
    `);
  }
});

// Rota para formulário com CPF na URL
app.get('/formulario=:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    // Validar CPF
    if (!cpf || cpf.length !== 11) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Erro</h2>
            <p>CPF deve ter 11 dígitos</p>
            <a href="/formulario-modelo">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Buscar dados na Kentro
    const buscarOportunidadeKentro = require('./utils/clt-fluxo').buscarOportunidadeKentro;
    const oportunidade = await buscarOportunidadeKentro(cpf);
    
    if (!oportunidade) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Cliente não encontrado</h2>
            <p>CPF ${cpf} não foi encontrado na Kentro</p>
            <a href="/formulario-modelo">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Buscar dados completos
    const buscarOportunidadePorId = require('./utils/clt-fluxo').buscarOportunidadePorId;
    const dadosCompletos = await buscarOportunidadePorId(oportunidade.id);
    
    if (!dadosCompletos) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Erro nos dados</h2>
            <p>Não foi possível obter dados completos do cliente</p>
            <a href="/formulario-modelo">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Função para converter data da Kentro (DD/MM/YYYY) para formato HTML (YYYY-MM-DD)
    function converterDataKentroParaHTML(dataKentro) {
      if (!dataKentro) return null;
      
      // Se já está no formato YYYY-MM-DD, retorna como está
      if (dataKentro.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dataKentro;
      }
      
      // Se está no formato DD/MM/YYYY, converte para YYYY-MM-DD
      if (dataKentro.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [dia, mes, ano] = dataKentro.split('/');
        return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      return null;
    }
    
    // Preparar dados para o formulário
    const dadosFormatados = {
      id: dadosCompletos.id,
      nome: dadosCompletos.title,
      cpf: dadosCompletos.mainmail,
      telefone: dadosCompletos.mainphone,
      email: dadosCompletos.formsdata?.['9e7f92b0'] || null,
      dataNascimento: converterDataKentroParaHTML(dadosCompletos.formsdata?.['0bfc6250']) || '1990-07-03', // Converter data DD/MM/YYYY para YYYY-MM-DD
      nomeMae: dadosCompletos.formsdata?.['917456f0'] || 'MARIA MONTEIRO', // Usar o campo correto da Kentro
      rg: dadosCompletos.formsdata?.['rg'] || null, // Deixar vazio se não existir na Kentro
      estadoCivil: dadosCompletos.formsdata?.['estado_civil'] || 'solteiro', // Valor padrão se não existir
      status: dadosCompletos.status || 'ativo',
      fkStage: dadosCompletos.fkStage || null,
      formsdata: dadosCompletos.formsdata || {}
    };
    
    // Ler o arquivo HTML
                 const fs = require('fs');
                 const path = require('path');
                 const htmlPath = path.join(__dirname, 'formulario-clt-simples.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Substituir os valores dos campos diretamente no HTML
    htmlContent = htmlContent.replace(
      'id="nome"',
      `id="nome" value="${dadosFormatados.nome || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="cpf"',
      `id="cpf" value="${dadosFormatados.cpf || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="telefone"',
      `id="telefone" value="${dadosFormatados.telefone || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="email"',
      `id="email" value="${dadosFormatados.email || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="dataNascimento"',
      `id="dataNascimento" value="${dadosFormatados.dataNascimento || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="nomeMae"',
      `id="nomeMae" value="${dadosFormatados.nomeMae || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="rg"',
      `id="rg" value="${dadosFormatados.rg || ''}"`
    );
    htmlContent = htmlContent.replace(
      'id="estadoCivil"',
      `id="estadoCivil" value="${dadosFormatados.estadoCivil || ''}"`
    );
    
    // Para o campo select, precisamos selecionar a opção correta
    if (dadosFormatados.estadoCivil) {
      htmlContent = htmlContent.replace(
        'option "Solteiro(a)"',
        `option "Solteiro(a)" ${dadosFormatados.estadoCivil === 'solteiro' ? 'selected' : ''}`
      );
    }
    
    // Adicionar mensagem de sucesso no topo
    const mensagemSucesso = `
      <div style="background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 1rem; color: #065f46; margin-bottom: 1rem;">
        ✅ <strong>Cliente encontrado na Kentro!</strong> Dados carregados automaticamente.
      </div>
    `;
    
    // Inserir mensagem após o header
    htmlContent = htmlContent.replace(
      '<div class="header">',
      `<div class="header">${mensagemSucesso}`
    );
    
    // Adicionar script para avançar automaticamente para próxima etapa
    const scriptAvancar = `
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          console.log('🚀 DOM carregado, dados da Kentro carregados automaticamente');
          
          // Mostrar mensagem de sucesso
          console.log('✅ Cliente encontrado na Kentro! Dados carregados automaticamente.');
          
          // NÃO avançar automaticamente - deixar usuário preencher manualmente
          console.log('ℹ️ Usuário deve preencher os dados restantes e avançar manualmente');
        });
      </script>
    `;
    
    // Inserir o script antes do fechamento do body
    htmlContent = htmlContent.replace('</body>', scriptAvancar + '</body>');
    
    // Enviar HTML modificado
    res.send(htmlContent);
    
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h2>❌ Erro interno</h2>
          <p>Erro interno do servidor: ${error.message}</p>
          <a href="/formulario-modelo">← Voltar ao formulário</a>
        </body>
      </html>
    `);
  }
});

// Rota para buscar dados do cliente na Kentro via URL
app.get('/formulario/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    // Validar CPF
    if (!cpf || cpf.length !== 11) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Erro</h2>
            <p>CPF deve ter 11 dígitos</p>
            <a href="/formulario">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Buscar dados na Kentro
    const buscarOportunidadeKentro = require('./utils/clt-fluxo').buscarOportunidadeKentro;
    const oportunidade = await buscarOportunidadeKentro(cpf);
    
    if (!oportunidade) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Cliente não encontrado</h2>
            <p>CPF ${cpf} não foi encontrado na Kentro</p>
            <a href="/formulario">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Buscar dados completos
    const buscarOportunidadePorId = require('./utils/clt-fluxo').buscarOportunidadePorId;
    const dadosCompletos = await buscarOportunidadePorId(oportunidade.id);
    
    if (!dadosCompletos) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; padding: 20px; text-align: center;">
            <h2>❌ Erro nos dados</h2>
            <p>Não foi possível obter dados completos do cliente</p>
            <a href="/formulario">← Voltar ao formulário</a>
          </body>
        </html>
      `);
    }
    
    // Função para converter data da Kentro (DD/MM/YYYY) para formato HTML (YYYY-MM-DD)
    function converterDataKentroParaHTML(dataKentro) {
      if (!dataKentro) return null;
      
      // Se já está no formato YYYY-MM-DD, retorna como está
      if (dataKentro.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dataKentro;
      }
      
      // Se está no formato DD/MM/YYYY, converte para YYYY-MM-DD
      if (dataKentro.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [dia, mes, ano] = dataKentro.split('/');
        return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
      
      return null;
    }
    
    // Preparar dados para o formulário
    const dadosFormatados = {
      id: dadosCompletos.id,
      nome: dadosCompletos.title,
      cpf: dadosCompletos.mainmail,
      telefone: dadosCompletos.mainphone,
      email: dadosCompletos.formsdata?.['9e7f92b0'] || null,
      dataNascimento: converterDataKentroParaHTML(dadosCompletos.formsdata?.['0bfc6250']) || '1990-07-03', // Converter data DD/MM/YYYY para YYYY-MM-DD
      nomeMae: dadosCompletos.formsdata?.['917456f0'] || 'MARIA MONTEIRO', // Usar o campo correto da Kentro
      rg: dadosCompletos.formsdata?.['rg'] || null, // Deixar vazio se não existir na Kentro
      estadoCivil: dadosCompletos.formsdata?.['estado_civil'] || 'solteiro', // Valor padrão se não existir
      status: dadosCompletos.status || 'ativo',
      fkStage: dadosCompletos.fkStage || null,
      formsdata: dadosCompletos.formsdata || {}
    };
    
    // Ler o arquivo HTML
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.join(__dirname, 'formulario-proposta-clt.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Substituir o JavaScript para pré-carregar os dados
    const scriptPreload = `
        <script>
            // Dados pré-carregados do servidor
            window.clienteDataPreload = ${JSON.stringify(dadosFormatados)};
            
            // Executar após o DOM carregar
            document.addEventListener('DOMContentLoaded', function() {
                if (window.clienteDataPreload) {
                    // Preencher campos automaticamente
                    document.getElementById('cpfSearch').value = '${dadosFormatados.cpf}';
                    
                    // Mostrar dados do cliente
                    mostrarDadosCliente(window.clienteDataPreload);
                    document.getElementById('clientData').classList.remove('hidden');
                    
                    // Mostrar mensagem de sucesso
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-success';
                    alertDiv.innerHTML = '✅ <strong>Cliente encontrado!</strong> Dados carregados automaticamente.';
                    document.querySelector('.container').insertBefore(alertDiv, document.querySelector('.container').firstChild);
                }
            });
        </script>
    `;
    
    // Inserir o script antes do fechamento do body
    htmlContent = htmlContent.replace('</body>', scriptPreload + '</body>');
    
    // Enviar HTML modificado
    res.send(htmlContent);
    
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h2>❌ Erro interno</h2>
          <p>Erro interno do servidor: ${error.message}</p>
          <a href="/formulario">← Voltar ao formulário</a>
        </body>
      </html>
    `);
  }
});

// Rota de health check
app.get('/health', (req, res) => {
  try {
    // Verificar cache PrecençaBank
    let precencabankCache = { total: 0, processando: 0, concluidos: 0, erros: 0 };
    try {
      const { carregarCache } = require('./utils/cache-precencabank');
      const cache = carregarCache();
      precencabankCache.total = Object.keys(cache).length;
      Object.values(cache).forEach(item => {
        if (item.status === 'PROCESSANDO') precencabankCache.processando++;
        else if (item.status === 'CONCLUIDO') precencabankCache.concluidos++;
        else if (item.status === 'ERRO') precencabankCache.erros++;
      });
    } catch (error) {
      console.error('Erro ao verificar cache PrecençaBank:', error.message);
    }

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      precencabank: {
        cache: precencabankCache,
        endpoints: {
          fluxoCompleto: '/clt/fluxo-completo-precencabank',
          status: '/clt/status-precencabank/:cpf'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'CLT V8 API - Integração V8 Digital com Kentro',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      clt: '/clt',
      kentro: '/kentro',
      health: '/health'
    }
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  logger.error(err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.details
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Token inválido ou expirado'
    });
  }
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// Servir arquivos estáticos HTML (antes da rota catch-all)
// Servir arquivos estáticos - public primeiro (mais específico)
app.use(express.static(path.join(__dirname, 'public')));
// Depois servir do diretório raiz (menos específico)
app.use(express.static(path.join(__dirname)));

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// Criar diretório de logs se não existir
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  logger.info(`🚀 Servidor CLT V8 HTTP rodando na porta ${PORT}`);
  logger.info(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Retomar processamentos pendentes ao iniciar servidor
  // NOTA: O sistema de fila em routes/clt.js já cuida disso automaticamente
  // Não precisamos retomar aqui para evitar conflitos
  setTimeout(() => {
    try {
      const lotesAtivos = listarLotes(true); // true = apenas não concluídos
      logger.info(`🔄 Encontrados ${lotesAtivos.length} lote(s) pendente(s) - sistema de fila irá processá-los`);
    } catch (error) {
      logger.error(`❌ Erro ao verificar lotes pendentes:`, error.message);
    }
  }, 2000); // Aguardar 2 segundos após iniciar servidor
});

// Iniciar servidor HTTPS se os certificados existirem
if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    logger.info(`🔒 Servidor CLT V8 HTTPS rodando na porta ${HTTPS_PORT}`);
    logger.info(`🔗 Health check: https://localhost:${HTTPS_PORT}/health`);
  });
}

// Enviar sinal ready para PM2
if (process.send) {
  process.send('ready');
}

module.exports = app;