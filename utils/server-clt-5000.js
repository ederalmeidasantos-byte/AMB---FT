import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Configurar ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: './config.env' });

// Importar funções usando dynamic import
let executarFluxoCLT;
let buscarOportunidadeKentro;
let salvarSimulacaoAprovada;
let buscarSimulacaoAprovada;
let atualizarSimulacaoCache;

// Configurações
const PORT = 5000;
const HTTPS_PORT = 5443; // Porta diferente para HTTPS
const NODE_ENV = process.env.NODE_ENV || 'production';
const HOST = process.env.HOST || '0.0.0.0';

// Credenciais V8 - Usar apenas a credencial fornecida
const V8_CREDENTIALS = {
  username: 'promotoraimpactto@gmail.com',
  password: 'Raffa@25%'
};

// Configurar Express
const app = express();

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
    
    httpsServer = createHttpsServer(options, app);
    console.log('✅ Certificados SSL carregados com sucesso para porta 5000');
  } else {
    console.log('⚠️ Certificados SSL não encontrados, servindo apenas HTTP');
  }
} catch (error) {
  console.log('⚠️ Erro ao carregar certificados SSL:', error.message);
}

// Criar servidor HTTP como fallback
const httpServer = createServer(app);

// Configurar timeouts maiores para evitar "socket hang up"
if (httpsServer) {
  httpsServer.keepAliveTimeout = 300000; // 5 minutos
  httpsServer.headersTimeout = 310000; // 5 minutos + 10 segundos
  httpsServer.timeout = 300000; // 5 minutos
}

httpServer.keepAliveTimeout = 300000; // 5 minutos
httpServer.headersTimeout = 310000; // 5 minutos + 10 segundos
httpServer.timeout = 300000; // 5 minutos

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper para verificar se a resposta já foi enviada
function isResponseSent(res) {
  return res.headersSent || res.finished || res.writableEnded;
}

// Função para carregar módulos
async function carregarModulos() {
  if (!executarFluxoCLT) {
    const cltFluxoModule = await import('./utils/clt-fluxo.js');
    executarFluxoCLT = cltFluxoModule.executarFluxoCLT;
    buscarOportunidadeKentro = cltFluxoModule.buscarOportunidadeKentro;
  }
  
  if (!salvarSimulacaoAprovada) {
    const cacheModule = await import('./utils/cache-simulacoes.js');
    salvarSimulacaoAprovada = cacheModule.salvarSimulacaoAprovada;
    buscarSimulacaoAprovada = cacheModule.buscarSimulacaoAprovada;
    atualizarSimulacaoCache = cacheModule.atualizarSimulacaoCache;
  }
}

// ===== ROTAS =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'CLT V8 API',
    port: PORT,
    https: !!httpsServer,
    timestamp: new Date().toISOString()
  });
});

// Rota para resumo de proposta com CPF na URL - Porta 5000 (promotoraimpactto@gmail.com)
app.get('/resumo-clt-modelo-inss.html', async (req, res) => {
  try {
    const { cpf } = req.query;
    
    // Validar CPF
    if (!cpf || !/^\d{11}$/.test(cpf)) {
      return res.status(400).send(`
        <div style="padding: 2rem; text-align: center; font-family: Arial;">
          <h2>❌ CPF Inválido</h2>
          <p>O CPF fornecido não é válido.</p>
        </div>
      `);
    }

    console.log(`🔍 [${cpf}] Carregando página de resumo (Porta 5000 - promotoraimpactto@gmail.com)...`);

    // Ler o arquivo HTML
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
    console.error(`❌ [${req.query.cpf || 'N/A'}] Erro ao carregar resumo:`, error);
    res.status(500).send(`
      <div style="padding: 2rem; text-align: center; font-family: Arial;">
        <h2>❌ Erro Interno</h2>
        <p>Erro ao carregar página de resumo: ${error.message}</p>
      </div>
    `);
  }
});

// Buscar oportunidade na Kentro
app.get('/clt/buscar-oportunidade/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    console.log(`🔍 Buscando oportunidade para CPF: ${cpf}`);
    
    if (!cpf || !/^\d{11}$/.test(cpf)) {
      return res.status(400).json({
        success: false,
        error: 'CPF inválido'
      });
    }
    
    await carregarModulos();
    const oportunidade = await buscarOportunidadeKentro(cpf);
    
    if (!oportunidade) {
      return res.status(404).json({
        success: false,
        error: 'Oportunidade não encontrada na Kentro'
      });
    }
    
    console.log(`✅ Oportunidade encontrada: ID ${oportunidade.id}`);
    
    res.json({
      success: true,
      oportunidade: oportunidade
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar oportunidade:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar oportunidade: ' + error.message
    });
  }
});

// Salvar simulação no cache
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
    
    await carregarModulos();
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
    
    await carregarModulos();
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
    
    if (!dadosAtualizados || Object.keys(dadosAtualizados).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dados para atualização são obrigatórios'
      });
    }
    
    await carregarModulos();
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

// Endpoint principal - Fluxo completo CLT
app.post('/clt/fluxo-completo', async (req, res) => {
  let responseSent = false;
  
  // Tratamento para desconexão do cliente
  req.on('close', () => {
    if (!responseSent) {
      console.log(`⚠️ [${req.body?.cpf || 'N/A'}] Cliente desconectou antes da resposta ser enviada`);
      responseSent = true;
    }
  });

  // Timeout de segurança (5 minutos)
  const timeoutId = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      console.error(`⏰ [${req.body?.cpf || 'N/A'}] Timeout de 5 minutos atingido`);
      if (!isResponseSent(res)) {
        res.status(408).json({
          success: false,
          error: 'Timeout: processamento excedeu 5 minutos',
          origem: 'V8',
          timestamp: new Date().toISOString()
        });
      }
    }
  }, 300000); // 5 minutos

  try {
    const { cpf, valor, prazo } = req.body;

    if (!cpf || !/^\d{11}$/.test(cpf)) {
      clearTimeout(timeoutId);
      if (!isResponseSent(res)) {
        return res.status(400).json({
          success: false,
          error: 'CPF inválido',
          message: 'CPF deve ter 11 dígitos numéricos'
        });
      }
      return;
    }

    console.log(`\n📥 Requisição recebida - CPF: ${cpf}${valor ? `, valor: ${valor}` : ''}${prazo ? `, prazo: ${prazo}` : ''}`);

    await carregarModulos();

    // Executar fluxo completo CLT
    const resultado = await executarFluxoCLT(cpf, valor, prazo);

    clearTimeout(timeoutId);

    if (responseSent || isResponseSent(res)) {
      console.log(`⚠️ [${cpf}] Resposta já foi enviada ou cliente desconectou`);
      return;
    }

    if (resultado.sucesso) {
      responseSent = true;
      res.json({
        success: true,
        message: 'Fluxo CLT executado com sucesso',
        origem: 'V8',
        resultado,
        timestamp: new Date().toISOString()
      });
    } else {
      // Determinar status HTTP baseado no tipo de erro
      const statusCode = resultado.etapa === 'finalizacao_termo' ? 408 : 400;
      
      responseSent = true;
      res.status(statusCode).json({
        success: false,
        origem: 'V8',
        error: resultado.erro,
        etapa: resultado.etapa,
        dadosFaltantes: resultado.dadosFaltantes || null,
        status_termo: resultado.status_termo || null,
        motivo_falha: resultado.motivo_falha || resultado.erro || null,
        resultado: resultado,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Verificar se é erro de conexão (socket hang up, ECONNRESET, etc)
    const isConnectionError = error.code === 'ECONNRESET' || 
                             error.code === 'EPIPE' ||
                             error.message?.includes('socket hang up') ||
                             error.message?.includes('ECONNRESET') ||
                             error.message?.includes('EPIPE');

    if (isConnectionError) {
      console.error(`⚠️ [${req.body?.cpf || 'N/A'}] Erro de conexão (cliente pode ter desconectado):`, error.message);
      if (!responseSent && !isResponseSent(res)) {
        responseSent = true;
        res.status(499).json({
          success: false,
          error: 'Cliente desconectou durante o processamento',
          origem: 'V8',
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    console.error(`❌ Erro no endpoint /clt/fluxo-completo:`, error);
    
    if (!responseSent && !isResponseSent(res)) {
      responseSent = true;
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message || 'Algo deu errado',
        origem: 'V8',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Endpoint GET também (para facilitar testes)
app.get('/clt/fluxo-completo', async (req, res) => {
  let responseSent = false;
  
  // Tratamento para desconexão do cliente
  req.on('close', () => {
    if (!responseSent) {
      console.log(`⚠️ [${req.query?.cpf || 'N/A'}] Cliente desconectou antes da resposta ser enviada (GET)`);
      responseSent = true;
    }
  });

  // Timeout de segurança (5 minutos)
  const timeoutId = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      console.error(`⏰ [${req.query?.cpf || 'N/A'}] Timeout de 5 minutos atingido (GET)`);
      if (!isResponseSent(res)) {
        res.status(408).json({
          success: false,
          error: 'Timeout: processamento excedeu 5 minutos',
          origem: 'V8',
          timestamp: new Date().toISOString()
        });
      }
    }
  }, 300000); // 5 minutos

  try {
    const { cpf, valor, prazo } = req.query;

    if (!cpf || !/^\d{11}$/.test(cpf)) {
      clearTimeout(timeoutId);
      if (!isResponseSent(res)) {
        return res.status(400).json({
          success: false,
          error: 'CPF inválido',
          message: 'CPF deve ter 11 dígitos numéricos',
          exemplo: {
            url: `/clt/fluxo-completo?cpf=12345678900&valor=5000&prazo=84`
          }
        });
      }
      return;
    }

    console.log(`\n📥 Requisição GET recebida - CPF: ${cpf}${valor ? `, valor: ${valor}` : ''}${prazo ? `, prazo: ${prazo}` : ''}`);

    // Converter valor e prazo para número se fornecidos
    const valorNum = valor ? parseFloat(valor) : null;
    const prazoNum = prazo ? parseInt(prazo) : null;

    await carregarModulos();

    // Executar fluxo completo CLT
    const resultado = await executarFluxoCLT(cpf, valorNum, prazoNum);

    clearTimeout(timeoutId);

    if (responseSent || isResponseSent(res)) {
      console.log(`⚠️ [${cpf}] Resposta já foi enviada ou cliente desconectou (GET)`);
      return;
    }

    if (resultado.sucesso) {
      responseSent = true;
      res.json({
        success: true,
        message: 'Fluxo CLT executado com sucesso',
        origem: 'V8',
        resultado,
        timestamp: new Date().toISOString()
      });
    } else {
      // Determinar status HTTP baseado no tipo de erro
      const statusCode = resultado.etapa === 'finalizacao_termo' ? 408 : 400;
      
      responseSent = true;
      res.status(statusCode).json({
        success: false,
        origem: 'V8',
        error: resultado.erro,
        etapa: resultado.etapa,
        dadosFaltantes: resultado.dadosFaltantes || null,
        status_termo: resultado.status_termo || null,
        motivo_falha: resultado.motivo_falha || resultado.erro || null,
        resultado: resultado,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Verificar se é erro de conexão (socket hang up, ECONNRESET, etc)
    const isConnectionError = error.code === 'ECONNRESET' || 
                             error.code === 'EPIPE' ||
                             error.message?.includes('socket hang up') ||
                             error.message?.includes('ECONNRESET') ||
                             error.message?.includes('EPIPE');

    if (isConnectionError) {
      console.error(`⚠️ [${req.query?.cpf || 'N/A'}] Erro de conexão (cliente pode ter desconectado) (GET):`, error.message);
      if (!responseSent && !isResponseSent(res)) {
        responseSent = true;
        res.status(499).json({
          success: false,
          error: 'Cliente desconectou durante o processamento',
          origem: 'V8',
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    console.error(`❌ Erro no endpoint GET /clt/fluxo-completo:`, error);
    
    if (!responseSent && !isResponseSent(res)) {
      responseSent = true;
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message || 'Algo deu errado',
        origem: 'V8',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// ===== INICIALIZAÇÃO DO SERVIDOR =====

// Sempre iniciar servidor HTTP
httpServer.listen(PORT, HOST, () => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 SERVIDOR CLT V8 API - PORTA ${PORT} (HTTP)`);
  console.log(`${'='.repeat(80)}`);
  console.log(`🌐 Servidor HTTP rodando em: http://${HOST}:${PORT}`);
  console.log(`📊 Endpoint principal: http://${HOST}:${PORT}/clt/fluxo-completo`);
  console.log(`📄 Página de resumo: http://${HOST}:${PORT}/resumo-clt-modelo-inss.html?cpf=XXXXXXXXXXX`);
  console.log(`🔧 Ambiente: ${NODE_ENV}`);
  console.log(`👤 Usuário V8: ${V8_CREDENTIALS.username}`);
  console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`${'='.repeat(80)}\n`);
});

// Iniciar servidor HTTPS também se os certificados existirem
if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, HOST, () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 SERVIDOR CLT V8 API - PORTA ${HTTPS_PORT} (HTTPS)`);
    console.log(`${'='.repeat(80)}`);
    console.log(`🔒 Servidor HTTPS rodando em: https://${HOST}:${HTTPS_PORT}`);
    console.log(`📊 Endpoint principal: https://${HOST}:${HTTPS_PORT}/clt/fluxo-completo`);
    console.log(`📄 Página de resumo: https://${HOST}:${HTTPS_PORT}/resumo-clt-modelo-inss.html?cpf=XXXXXXXXXXX`);
    console.log(`🔧 Ambiente: ${NODE_ENV}`);
    console.log(`👤 Usuário V8: ${V8_CREDENTIALS.username}`);
    console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
    console.log(`${'='.repeat(80)}\n`);
  });
}

// ===== TRATAMENTO DE SINAIS =====
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido - encerrando servidor...');
  let closed = 0;
  const totalServers = httpsServer ? 2 : 1;
  
  const checkExit = () => {
    closed++;
    if (closed >= totalServers) {
      process.exit(0);
    }
  };
  
  httpServer.close(() => {
    console.log('✅ Servidor HTTP encerrado');
    checkExit();
  });
  
  if (httpsServer) {
    httpsServer.close(() => {
      console.log('✅ Servidor HTTPS encerrado');
      checkExit();
    });
  }
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT recebido - encerrando servidor...');
  let closed = 0;
  const totalServers = httpsServer ? 2 : 1;
  
  const checkExit = () => {
    closed++;
    if (closed >= totalServers) {
      process.exit(0);
    }
  };
  
  httpServer.close(() => {
    console.log('✅ Servidor HTTP encerrado');
    checkExit();
  });
  
  if (httpsServer) {
    httpsServer.close(() => {
      console.log('✅ Servidor HTTPS encerrado');
      checkExit();
    });
  }
});

