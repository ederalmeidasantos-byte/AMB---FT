# 📋 Product Requirements Document (PRD)
## Sistema CLT V8 - Ambientes Isolados por Porta

**Versão:** 1.0.0  
**Data:** Novembro 2025  
**Autor:** Lunas Digital  
**Status:** Em Produção  
**Última Atualização:** Novembro 2025

---

## 📑 Índice

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura de Ambientes Isolados](#2-arquitetura-de-ambientes-isolados)
3. [APIs da V8 Digital](#3-apis-da-v8-digital)
4. [Endpoints da API](#4-endpoints-da-api)
5. [Funcionamento por Porta](#5-funcionamento-por-porta)
6. [Configuração de Novo Ambiente](#6-configuração-de-novo-ambiente)
7. [Fluxos de Processamento](#7-fluxos-de-processamento)
8. [Integrações Externas](#8-integrações-externas)
9. [Monitoramento e Logs](#9-monitoramento-e-logs)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Visão Geral do Sistema

### 1.1 Descrição

O **Sistema CLT V8** é uma plataforma de automação para processamento de crédito consignado CLT que permite múltiplos ambientes isolados, cada um rodando em uma porta diferente. Cada ambiente representa um cliente diferente com suas próprias credenciais, configurações e dados completamente isolados.

### 1.2 Características Principais

- ✅ **Multi-tenant**: Cada porta = um cliente diferente
- ✅ **Isolamento Total**: Configurações, tokens, logs e dados separados
- ✅ **Escalável**: Fácil adicionar novos ambientes
- ✅ **Automação Completa**: Processamento de lotes, integração com APIs externas
- ✅ **Interface Web**: Configuração via interface gráfica

### 1.3 Tecnologias Utilizadas

- **Backend**: Node.js + Express.js
- **Gerenciador de Processos**: PM2
- **Autenticação**: OAuth 2.0 (V8 Digital)
- **APIs Integradas**: V8 Digital, Kentro CRM, PrecençaBank
- **Cache**: Sistema de cache em memória e persistente

---

## 2. Arquitetura de Ambientes Isolados

### 2.1 Conceito de Isolamento

Cada porta representa um ambiente **completamente isolado**:

```
Porta 4000 → Cliente A → config-4000.env → Cache isolado → Logs isolados
Porta 5000 → Cliente B → config-5000.env → Cache isolado → Logs isolados
Porta 6000 → Cliente C → config-6000.env → Cache isolado → Logs isolados
```

### 2.2 Componentes de Isolamento

#### 2.2.1 Configuração Isolada
- **Arquivo**: `config/config-{PORT}.env`
- **Conteúdo**: Credenciais V8, Kentro, URLs, tokens
- **Carregamento**: Automático via `utils/config-loader.js`

#### 2.2.2 Cache de Tokens Isolado
- **Sistema**: `utils/auth-isolado.js`
- **Armazenamento**: Cache em memória por porta
- **Renovação**: Automática quando expira

#### 2.2.3 Logs Isolados
- **Arquivos**: `logs/out-{PORT}.log`, `logs/error-{PORT}.log`
- **Rotação**: Automática via PM2
- **Localização**: `logs/` no diretório do projeto

#### 2.2.4 Processos Isolados
- **Gerenciamento**: PM2 com processos separados
- **Nomenclatura**: `clt-v8-api-{PORT}`
- **Recursos**: Memória e CPU independentes

### 2.3 Estrutura de Arquivos

```
clt-v8-service/
├── config/
│   ├── config-4000.env          # Configuração Cliente A
│   ├── config-5000.env          # Configuração Cliente B
│   ├── config-6000.env          # Configuração Cliente C (futuro)
│   └── ecosystem.config.cjs     # Configuração PM2
├── server.js                     # Servidor porta 4000
├── server-5000.js                # Servidor porta 5000
├── server-6000.js                # Servidor porta 6000 (futuro)
├── utils/
│   ├── config-loader.js         # Carregador de configuração
│   ├── auth-isolado.js          # Autenticação isolada
│   ├── clt-fluxo.js             # Lógica de fluxo CLT
│   └── cache-simulacoes.js      # Cache de simulações
├── routes/
│   ├── clt.js                   # Rotas CLT
│   ├── auth.js                  # Rotas de autenticação
│   └── kentro.js                # Rotas Kentro
├── public/
│   └── config-v8.html           # Interface de configuração
└── logs/
    ├── out-4000.log
    ├── out-5000.log
    └── error-5000.log
```

---

## 3. APIs da V8 Digital

### 3.1 Autenticação OAuth 2.0

#### 3.1.1 Obter Token de Acesso

**Endpoint**: `https://auth.v8sistema.com/oauth/token`  
**Método**: `POST`  
**Content-Type**: `application/x-www-form-urlencoded`

**Parâmetros**:
```
grant_type=password
username={V8_USERNAME}
password={V8_PASSWORD}
audience=https://bff.v8sistema.com
scope=offline_access
client_id={V8_CLIENT_ID}
```

**Resposta de Sucesso**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "offline_access"
}
```

**Resposta de Erro**:
```json
{
  "error": "invalid_grant",
  "error_description": "Wrong email or password."
}
```

#### 3.1.2 Configuração Necessária

```env
V8_AUTH_URL=https://auth.v8sistema.com/oauth/token
V8_CLIENT_ID=DHWogdaYmEI8n5bwwxPDzulMlSK7dwIn
V8_AUDIENCE=https://bff.v8sistema.com
V8_USERNAME=seu_email@dominio.com
V8_PASSWORD=sua_senha
```

### 3.2 API de Consulta de Termos

#### 3.2.1 Criar Termo CLT

**Endpoint**: `https://bff.v8sistema.com/private-consignment/consult`  
**Método**: `POST`  
**Headers**: `Authorization: Bearer {token}`

**Body**:
```json
{
  "borrowerDocumentNumber": "47426410862",
  "gender": "male",
  "birthDate": "1998-10-14",
  "signerName": "MAXSUEL DOS SANTOS CARVALHO",
  "signerEmail": "mazseihgv1420@gmail.com",
  "signerPhone": {
    "phoneNumber": "991263513",
    "countryCode": "55",
    "areaCode": "18"
  },
  "provider": "QI"
}
```

**Resposta**:
```json
{
  "id": "abc123-def456-ghi789",
  "status": "WAITING_CONSENT"
}
```

#### 3.2.2 Autorizar Termo

**Endpoint**: `https://bff.v8sistema.com/private-consignment/consult/{term_id}/authorize`  
**Método**: `POST`  
**Headers**: `Authorization: Bearer {token}`

#### 3.2.3 Consultar Status

**Endpoint**: `https://bff.v8sistema.com/private-consignment/consult`  
**Método**: `GET`  
**Headers**: `Authorization: Bearer {token}`  
**Query Params**: `startDate=2025-01-01T00:00:00.000Z&endDate=2025-01-25T23:59:59.999Z&limit=100&page=1&provider=QI`

### 3.3 API de Simulação

#### 3.3.1 Consultar Taxas Disponíveis

**Endpoint**: `https://bff.v8sistema.com/private-consignment/simulation/configs`  
**Método**: `GET`  
**Headers**: `Authorization: Bearer {token}`

#### 3.3.2 Criar Simulação

**Endpoint**: `https://bff.v8sistema.com/private-consignment/simulation`  
**Método**: `POST`  
**Headers**: `Authorization: Bearer {token}`

**Body**:
```json
{
  "borrowerDocumentNumber": "47426410862",
  "simulationValue": 5000.00,
  "installmentQuantity": 84,
  "provider": "QI"
}
```

---

## 4. Endpoints da API

### 4.1 Endpoints de Configuração

#### `GET /config-v8`
Exibe interface web para configurar credenciais V8.

**Acesso**: `http://{HOST}:{PORT}/config-v8`

#### `GET /config/v8/atual`
Retorna configuração atual (sem expor senha).

**Resposta**:
```json
{
  "success": true,
  "port": 5000,
  "config": {
    "username": "promotoraimpactto@gmail.com",
    "password": "***"
  }
}
```

#### `POST /config/v8/salvar`
Salva novas credenciais V8.

**Body**:
```json
{
  "username": "novo_email@dominio.com",
  "password": "nova_senha"
}
```

#### `POST /config/v8/testar`
Testa conexão com credenciais fornecidas.

**Body**:
```json
{
  "username": "email@teste.com",
  "password": "senha_teste"
}
```

### 4.2 Endpoints de Fluxo CLT

#### `POST /clt/fluxo-completo` ⭐ **PRINCIPAL**
Executa fluxo completo CLT: busca oportunidade → valida → solicita termo.

**Body**:
```json
{
  "cpf": "46210648860"
}
```

**Resposta de Sucesso**:
```json
{
  "success": true,
  "message": "Fluxo CLT executado com sucesso",
  "resultado": {
    "sucesso": true,
    "oportunidade_id": "12345",
    "dados_validados": {
      "nome": "eder almeida santos",
      "cpf": "46210648860",
      "telefone": "11959088554",
      "data_nascimento": "1993-08-14"
    },
    "termo_resultado": {
      "id": "termo_123",
      "status": "WAITING_CONSENT"
    }
  }
}
```

#### `POST /clt/mensagem-whatsapp`
Gera mensagem do WhatsApp baseada no resultado do fluxo.

**Body**:
```json
{
  "cpf": "46210648860"
}
```

### 4.3 Endpoints de Simulação

#### `POST /clt/simular-personalizada`
Cria simulação personalizada com valores específicos.

**Body**:
```json
{
  "cpf": "46210648860",
  "valor": 5000.00,
  "prazo": 84
}
```

#### `POST /clt/simular-cache`
Simula usando dados do cache.

**Body**:
```json
{
  "cpf": "46210648860"
}
```

### 4.4 Endpoints de Cache

#### `POST /cache/simulacao/salvar`
Salva simulação aprovada no cache.

#### `GET /cache/simulacao/:cpf`
Busca simulação por CPF.

#### `GET /cache/simulacoes`
Lista todas as simulações no cache.

#### `DELETE /cache/simulacao/:cpf`
Remove simulação do cache.

### 4.5 Endpoints de Operações V8

#### `GET /v8/operacoes`
Lista operações da V8 Digital.

**Query Params**:
- `startDate`: Data inicial (ISO 8601)
- `endDate`: Data final (ISO 8601)
- `limit`: Limite de resultados (padrão: 50)

### 4.6 Endpoints de Health Check

#### `GET /health`
Verifica status do servidor.

**Resposta**:
```json
{
  "status": "OK",
  "timestamp": "2025-11-16T01:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

---

## 5. Funcionamento por Porta

### 5.1 Inicialização do Servidor

Quando um servidor inicia em uma porta específica:

1. **Carrega Configuração**: Lê `config/config-{PORT}.env`
2. **Inicializa Cache**: Cria cache isolado para tokens
3. **Configura Logs**: Define arquivos de log específicos
4. **Registra no PM2**: Processo com nome `clt-v8-api-{PORT}`

### 5.2 Processamento de Requisições

Cada requisição é processada usando:
- **Configuração**: Do arquivo específico da porta
- **Token**: Do cache isolado da porta
- **Logs**: Escritos nos arquivos específicos da porta

### 5.3 Exemplo de Fluxo

```
Cliente acessa: http://72.60.159.149:5000/clt/fluxo-completo
    ↓
Servidor detecta porta 5000
    ↓
Carrega config-5000.env
    ↓
Usa token do cache isolado porta 5000
    ↓
Processa requisição
    ↓
Escreve logs em logs/out-5000.log
```

### 5.4 Garantias de Isolamento

✅ **Configuração**: Cada porta lê apenas seu arquivo  
✅ **Tokens**: Cache isolado por porta  
✅ **Logs**: Arquivos separados por porta  
✅ **Processos**: PM2 gerencia processos separados  
✅ **Memória**: Variáveis de ambiente não compartilhadas  
✅ **APIs**: Cada porta pode ter credenciais diferentes

---

## 6. Configuração de Novo Ambiente

### 6.1 Pré-requisitos

- Node.js instalado
- PM2 instalado globalmente
- Acesso SSH ao servidor
- Credenciais V8 Digital do novo cliente
- Credenciais Kentro (se aplicável)

### 6.2 Passo a Passo Completo

#### Passo 1: Criar Arquivo do Servidor

```bash
# No diretório do projeto
cp server-5000.js server-6000.js
```

#### Passo 2: Modificar Porta no Arquivo

Edite `server-6000.js` e altere a primeira linha:

```javascript
// Antes
const PORT_NUMBER = 5000;

// Depois
const PORT_NUMBER = 6000;
```

#### Passo 3: Criar Arquivo de Configuração

O sistema criará automaticamente ao iniciar, ou você pode criar manualmente:

```bash
cp config/config-5000.env config/config-6000.env
```

Edite `config/config-6000.env`:

```env
# V8 Digital API - Porta 6000
V8_API_URL=https://api.v8digital.com
V8_CLIENT_ID=DHWogdaYmEI8n5bwwxPDzulMlSK7dwIn
V8_AUDIENCE=https://bff.v8sistema.com
V8_USERNAME=cliente_novo@email.com
V8_PASSWORD=senha_do_cliente

# Kentro API
KENTRO_API_URL=https://lunasdigital.atenderbem.com/int
KENTRO_TOKEN=token_do_cliente_novo
KENTRO_API_KEY=cd4d0509169d4e2ea9177ac66c1c9376
KENTRO_QUEUE_ID=25

# Servidor
PORT=6000
NODE_ENV=production

# Logs
LOG_LEVEL=info
LOG_FILE=logs/app-6000.log
```

#### Passo 4: Adicionar ao PM2

Edite `config/ecosystem.config.cjs` e adicione:

```javascript
{
  name: 'clt-v8-api-6000',
  script: 'server-6000.js',
  cwd: '/opt/lunas-digital/clt-v8-service',
  instances: 1,
  exec_mode: 'fork',
  node_args: '--max-old-space-size=4096',
  env: {
    NODE_ENV: 'development',
    PORT: 6000,
    NODE_OPTIONS: '--max-old-space-size=4096'
  },
  env_production: {
    NODE_ENV: 'production',
    PORT: 6000,
    NODE_OPTIONS: '--max-old-space-size=4096'
  },
  log_file: 'logs/combined-6000.log',
  out_file: 'logs/out-6000.log',
  error_file: 'logs/error-6000.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
  max_memory_restart: '3584M',
  restart_delay: 4000,
  max_restarts: 10,
  min_uptime: '10s',
  watch: false,
  ignore_watch: ['node_modules', 'logs'],
  kill_timeout: 5000
}
```

#### Passo 5: Enviar Arquivos para o Servidor

```bash
# Enviar arquivo do servidor
scp server-6000.js root@72.60.159.149:/opt/lunas-digital/clt-v8-service/

# Enviar arquivo de configuração
scp config/config-6000.env root@72.60.159.149:/opt/lunas-digital/clt-v8-service/config/

# Enviar configuração PM2 atualizada
scp config/ecosystem.config.cjs root@72.60.159.149:/opt/lunas-digital/clt-v8-service/config/
```

#### Passo 6: Iniciar o Servidor

```bash
# Conectar ao servidor
ssh root@72.60.159.149

# Ir para o diretório
cd /opt/lunas-digital/clt-v8-service

# Iniciar apenas o novo servidor
pm2 start config/ecosystem.config.cjs --only clt-v8-api-6000

# OU recarregar todos
pm2 reload config/ecosystem.config.cjs
```

#### Passo 7: Verificar Status

```bash
# Verificar se está rodando
pm2 status | grep clt-v8-api-6000

# Ver logs
pm2 logs clt-v8-api-6000 --lines 20

# Testar health check
curl http://localhost:6000/health
```

#### Passo 8: Configurar Credenciais via Interface Web

1. Acesse: `http://72.60.159.149:6000/config-v8`
2. Clique em "Editar Login"
3. Preencha usuário e senha V8
4. Clique em "Testar Conexão" para validar
5. Clique em "Salvar Configuração"

### 6.3 Checklist de Configuração

- [ ] Arquivo `server-{PORT}.js` criado e porta alterada
- [ ] Arquivo `config/config-{PORT}.env` criado com credenciais
- [ ] Configuração PM2 adicionada em `ecosystem.config.cjs`
- [ ] Arquivos enviados para o servidor
- [ ] Servidor iniciado no PM2
- [ ] Health check respondendo
- [ ] Credenciais V8 configuradas via interface web
- [ ] Teste de conexão V8 bem-sucedido
- [ ] Logs sendo gerados corretamente

---

## 7. Fluxos de Processamento

### 7.1 Fluxo Completo CLT

```
1. Recebe CPF
   ↓
2. Busca oportunidade no Kentro
   ↓
3. Valida dados da oportunidade
   ↓
4. Consulta taxas disponíveis na V8
   ↓
5. Cria simulação na V8
   ↓
6. Solicita termo CLT na V8
   ↓
7. Atualiza status no Kentro
   ↓
8. Retorna resultado
```

### 7.2 Fluxo de Autenticação

```
1. Verifica cache de token
   ↓
2. Se token válido → retorna token
   ↓
3. Se token expirado → renova token
   ↓
4. Autentica com V8 usando credenciais da porta
   ↓
5. Salva token no cache isolado
   ↓
6. Retorna token
```

### 7.3 Fluxo de Processamento em Lote

```
1. Recebe lista de CPFs
   ↓
2. Cria lote com ID único
   ↓
3. Processa cada CPF em background
   ↓
4. Atualiza status do lote
   ↓
5. Gera logs por CPF
   ↓
6. Retorna status final do lote
```

---

## 8. Integrações Externas

### 8.1 V8 Digital

**Propósito**: Processamento de crédito consignado CLT  
**Autenticação**: OAuth 2.0  
**Endpoints Principais**:
- Autenticação
- Consulta de termos
- Criação de simulações
- Autorização de termos

### 8.2 Kentro CRM

**Propósito**: Gerenciamento de oportunidades  
**Autenticação**: API Key  
**Endpoints Principais**:
- Buscar oportunidades
- Criar oportunidades
- Atualizar oportunidades
- Disparar fluxos

### 8.3 PrecençaBank

**Propósito**: Validação de elegibilidade  
**Autenticação**: Token específico  
**Endpoints Principais**:
- Consulta de elegibilidade
- Validação de margem

---

## 9. Monitoramento e Logs

### 9.1 Verificar Status do Servidor

```bash
# Status PM2
pm2 status

# Status específico
pm2 status clt-v8-api-5000

# Informações detalhadas
pm2 describe clt-v8-api-5000
```

### 9.2 Visualizar Logs

```bash
# Logs em tempo real
pm2 logs clt-v8-api-5000

# Últimas 50 linhas
pm2 logs clt-v8-api-5000 --lines 50

# Apenas erros
pm2 logs clt-v8-api-5000 --err

# Logs de um arquivo específico
tail -f logs/out-5000.log
tail -f logs/error-5000.log
```

### 9.3 Health Check

```bash
# Via curl
curl http://localhost:5000/health

# Via navegador
http://72.60.159.149:5000/health
```

### 9.4 Monitoramento de Recursos

```bash
# Uso de memória e CPU
pm2 monit

# Informações de processo
pm2 info clt-v8-api-5000
```

---

## 10. Troubleshooting

### 10.1 Erro: "Rota não encontrada"

**Causa**: Servidor não está rodando ou arquivo não foi enviado.

**Solução**:
```bash
# Verificar se está rodando
pm2 status

# Reiniciar se necessário
pm2 restart clt-v8-api-5000
```

### 10.2 Erro: "invalid_grant" ou "Wrong email or password"

**Causa**: Credenciais V8 incorretas.

**Solução**:
1. Acesse `/config-v8`
2. Verifique usuário e senha
3. Teste a conexão
4. Salve se estiver correto

### 10.3 Erro: "invalid audience specified"

**Causa**: `V8_AUDIENCE` incorreto no arquivo de configuração.

**Solução**:
```bash
# Verificar valor atual
cat config/config-5000.env | grep V8_AUDIENCE

# Deve ser:
V8_AUDIENCE=https://bff.v8sistema.com
```

### 10.4 Servidor não inicia

**Causa**: Erro no código ou configuração.

**Solução**:
```bash
# Ver logs de erro
pm2 logs clt-v8-api-5000 --err --lines 50

# Verificar se arquivo existe
ls -la server-5000.js

# Verificar configuração PM2
pm2 describe clt-v8-api-5000
```

### 10.5 Porta já em uso

**Causa**: Outro processo usando a porta.

**Solução**:
```bash
# Verificar processo na porta
netstat -tlnp | grep 5000

# Matar processo se necessário
kill -9 {PID}

# Reiniciar servidor
pm2 restart clt-v8-api-5000
```

### 10.6 Cache de token não funciona

**Causa**: Cache isolado não está sendo usado.

**Solução**:
1. Verificar se está usando `auth-isolado.js`
2. Verificar se `PORT_NUMBER` está correto
3. Limpar cache: reiniciar servidor

---

## 11. Boas Práticas

### 11.1 Segurança

- ✅ Nunca commitar arquivos `.env` no Git
- ✅ Usar senhas fortes para V8
- ✅ Rotacionar tokens periodicamente
- ✅ Monitorar logs para atividades suspeitas

### 11.2 Performance

- ✅ Usar cache de tokens (já implementado)
- ✅ Processar lotes em background
- ✅ Limitar tamanho de requisições
- ✅ Monitorar uso de memória

### 11.3 Manutenção

- ✅ Fazer backup antes de alterações
- ✅ Testar em ambiente de desenvolvimento primeiro
- ✅ Documentar mudanças
- ✅ Manter logs organizados

---

## 12. Referências

- **Documentação V8 Digital**: APIs oficiais da V8
- **Documentação Kentro**: APIs do CRM Kentro
- **PM2 Documentation**: https://pm2.keymetrics.io/
- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices

---

## 13. Contato e Suporte

Para dúvidas ou problemas:
- Verificar logs primeiro
- Consultar este documento
- Verificar documentação das APIs externas
- Contatar equipe de desenvolvimento

---

**Última atualização**: Novembro 2025  
**Versão do documento**: 1.0.0
