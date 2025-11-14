import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho do arquivo de cache
const CACHE_FILE = path.join(__dirname, '../data/cache/simulacoes-aprovadas.json');

// Garantir que o diretório existe
const cacheDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Carrega o cache de simulações do arquivo
 */
function carregarCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('❌ Erro ao carregar cache:', error.message);
        return {};
    }
}

/**
 * Salva o cache de simulações no arquivo
 */
function salvarCache(cache) {
    try {
        console.log('💾 Tentando salvar cache:', JSON.stringify(cache, null, 2));
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        console.log('✅ Cache salvo com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar cache:', error.message);
        console.error('❌ Stack trace:', error.stack);
        return false;
    }
}

/**
 * Salva uma simulação aprovada no cache com dados completos do cliente
 * @param {string} cpf - CPF do cliente
 * @param {string} consultId - ID da consulta V8
 * @param {object} dadosSimulacao - Dados completos da simulação
 * @param {object} dadosCliente - Dados completos do cliente da Kentro (opcional)
 */
function salvarSimulacaoAprovada(cpf, consultId, dadosSimulacao, dadosCliente = null) {
    try {
        console.log(`💾 [${cpf}] Salvando simulação aprovada no cache...`);
        console.log(`🔍 [${cpf}] dadosCliente recebido:`, dadosCliente);
        
        const cache = carregarCache();
        
        // Criar entrada no cache com dados completos
        cache[cpf] = {
            cpf: cpf,
            consultId: consultId,
            dadosSimulacao: dadosSimulacao,
            dadosCliente: dadosCliente, // Dados do cliente da Kentro
            timestamp: new Date().toISOString(),
            status: 'APROVADA'
        };
        
        console.log(`🔍 [${cpf}] Cache antes de salvar:`, cache[cpf]);
        
        // Salvar no arquivo
        if (salvarCache(cache)) {
            console.log(`✅ [${cpf}] Simulação e dados do cliente salvos no cache:`, consultId);
            return { success: true, message: 'Simulação e dados do cliente salvos no cache' };
        } else {
            return { success: false, message: 'Erro ao salvar cache' };
        }
    } catch (error) {
        console.error(`❌ [${cpf}] Erro ao salvar simulação no cache:`, error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Busca uma simulação aprovada no cache
 * @param {string} cpf - CPF do cliente
 */
function buscarSimulacaoAprovada(cpf) {
    try {
        console.log(`🔍 [${cpf}] Buscando simulação no cache...`);
        
        const cache = carregarCache();
        
        if (cache[cpf]) {
            console.log(`✅ [${cpf}] Simulação encontrada no cache`);
            return {
                success: true,
                dados: cache[cpf]
            };
        } else {
            console.log(`❌ [${cpf}] Simulação não encontrada no cache`);
            return {
                success: false,
                message: 'Simulação não encontrada no cache'
            };
        }
    } catch (error) {
        console.error(`❌ [${cpf}] Erro ao buscar simulação no cache:`, error.message);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Lista todas as simulações no cache
 */
function listarSimulacoesCache() {
    try {
        const cache = carregarCache();
        const simulacoes = Object.values(cache);
        
        console.log(`📋 Total de simulações no cache: ${simulacoes.length}`);
        return {
            success: true,
            total: simulacoes.length,
            simulacoes: simulacoes
        };
    } catch (error) {
        console.error('❌ Erro ao listar cache:', error.message);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Remove uma simulação do cache
 * @param {string} cpf - CPF do cliente
 */
function removerSimulacaoCache(cpf) {
    try {
        console.log(`🗑️ [${cpf}] Removendo simulação do cache...`);
        
        const cache = carregarCache();
        
        if (cache[cpf]) {
            delete cache[cpf];
            
            if (salvarCache(cache)) {
                console.log(`✅ [${cpf}] Simulação removida do cache`);
                return { success: true, message: 'Simulação removida do cache' };
            } else {
                return { success: false, message: 'Erro ao salvar cache' };
            }
        } else {
            return { success: false, message: 'Simulação não encontrada no cache' };
        }
    } catch (error) {
        console.error(`❌ [${cpf}] Erro ao remover simulação do cache:`, error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Atualiza dados de uma simulação existente no cache
 * @param {string} cpf - CPF do cliente
 * @param {object} dadosAtualizados - Dados atualizados para salvar
 */
function atualizarSimulacaoCache(cpf, dadosAtualizados) {
    try {
        console.log(`🔄 [${cpf}] Atualizando simulação no cache...`);
        
        const cache = carregarCache();
        
        if (!cache[cpf]) {
            console.log(`❌ [${cpf}] Simulação não encontrada no cache para atualizar`);
            return { success: false, message: 'Simulação não encontrada no cache' };
        }
        
        // Atualizar dados mantendo estrutura existente
        cache[cpf] = {
            ...cache[cpf], // Dados existentes
            ...dadosAtualizados, // Dados atualizados
            timestamp: new Date().toISOString() // Atualizar timestamp
        };
        
        console.log(`🔍 [${cpf}] Cache atualizado:`, cache[cpf]);
        
        // Salvar no arquivo
        if (salvarCache(cache)) {
            console.log(`✅ [${cpf}] Simulação atualizada no cache com sucesso`);
            return { success: true, message: 'Simulação atualizada no cache' };
        } else {
            return { success: false, message: 'Erro ao salvar cache atualizado' };
        }
    } catch (error) {
        console.error(`❌ [${cpf}] Erro ao atualizar simulação no cache:`, error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Limpa todo o cache
 */
function limparCache() {
    try {
        console.log('🧹 Limpando todo o cache...');
        
        const cacheVazio = {};
        
        if (salvarCache(cacheVazio)) {
            console.log('✅ Cache limpo com sucesso');
            return { success: true, message: 'Cache limpo com sucesso' };
        } else {
            return { success: false, message: 'Erro ao limpar cache' };
        }
    } catch (error) {
        console.error('❌ Erro ao limpar cache:', error.message);
        return { success: false, message: error.message };
    }
}

export {
    salvarSimulacaoAprovada,
    buscarSimulacaoAprovada,
    listarSimulacoesCache,
    removerSimulacaoCache,
    atualizarSimulacaoCache,
    limparCache,
    carregarCache
};
