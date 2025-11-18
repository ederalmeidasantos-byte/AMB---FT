# 🚀 Porta 5000 - Ambiente Isolado CLT V8

Documentação específica para o ambiente da **Porta 5000** - Ambiente completamente isolado para cliente B.

## 🔒 Isolamento Completo

Cada porta representa um ambiente de cliente diferente com:

- ✅ **Login V8 Digital exclusivo** - Cada porta tem suas próprias credenciais
- ✅ **Pipeline Kentro exclusiva** - Cada porta busca em sua própria pipeline
- ✅ **Cache completamente isolado** - Cada porta tem seu próprio cache de:
  - **Tokens V8 Digital** (`token-v8-{PORT}.json`)
  - **Simulações aprovadas** (`simulacoes-aprovadas-{PORT}.json`)
  - **Termos CLT** (armazenados junto com simulações)
  - **Dados de clientes** (armazenados junto com simulações)
- ✅ **Configuração isolada** - Arquivo `.env` separado por porta
- ✅ **Processo PM2 separado** - Cada porta roda em processo independente

## 📋 Configuração da Porta 5000

### 1. Credenciais V8 Digital

**Arquivo:** `config/config-5000.env`

```env
V8_USERNAME=promotoraimpactto@gmail.com
V8_PASSWORD=Raffa@25%
V8_API_URL=https://bff.v8sistema.com
V8_AUDIENCE=https://bff.v8sistema.com
V8_AUTH_URL=https://auth.v8sistema.com/oauth/token
```

### 2. Configuração Kentro

```env
KENTRO_API_URL=https://api.kentro.com.br
KENTRO_QUEUE_ID=38
```

**Pipeline ID:** `11` (configurado em `utils/clt-fluxo.js`)

### 3. Portas

```env
PORT=5000
HTTPS_PORT=5443
```

## 📁 Estrutura de Arquivos

```
clt-v8-service-5000/
├── server-5000.js              # Servidor principal (porta 5000)
├── routes/
│   └── clt.js                  # Rotas da API CLT
├── utils/
│   ├── clt-fluxo.js            # Lógica do fluxo CLT
│   ├── auth-isolado.js         # Autenticação isolada por porta
│   ├── cache-simulacoes.js      # Cache de simulações
│   └── config-loader.js         # Carregador de configuração
├── config/
│   ├── config-5000.env         # Configuração da porta 5000
│   └── ecosystem.config.cjs     # Configuração PM2
├── public/
│   └── config-v8.html          # Interface de configuração
├── data/
│   └── cache/
│       ├── token-v8-5000.json              # Token V8 isolado (válido 1h)
│       └── simulacoes-aprovadas-5000.json  # Cache isolado contendo:
│           ├── Simulações aprovadas         # Dados completos de simulações CLT
│           ├── Termos CLT                  # IDs e status dos termos V8
│           └── Dados de clientes           # Informações completas da Kentro
├── resumo-clt-modelo-inss.html # Página de resumo
├── formulario-cadastro-proposta-v2.html  # Formulário de cadastro
└── package.json                # Dependências Node.js
```

## 🔄 Fluxo Completo

1. **Busca Oportunidade** → Kentro (Pipeline 11, Queue 38)
2. **Valida Dados** → Verifica CPF, nome, telefone, data nascimento
3. **Autentica V8** → Obtém token do cache isolado da porta 5000 (`token-v8-5000.json`) ou renova
4. **Verifica Termo** → Busca termos existentes na V8 ou no cache isolado (`simulacoes-aprovadas-5000.json`)
5. **Cria Termo** → Se não existir, cria novo termo
6. **Autoriza Termo** → Autoriza termo criado
7. **Aguarda Aprovação** → Loop de consultas até status final
8. **Cria Simulação** → Tenta múltiplos prazos até aprovar
9. **Salva Cache Isolado** → Armazena no cache exclusivo da porta 5000 (`simulacoes-aprovadas-5000.json`):
   - ✅ **Simulação aprovada** - Dados completos da simulação CLT
   - ✅ **Termo CLT** - ID, status e dados do termo criado na V8
   - ✅ **Dados do cliente** - Informações completas do cliente da Kentro
   - ✅ **Consult ID** - ID da consulta V8 Digital
   - ✅ **Timestamp** - Data/hora de criação (válido por 24 horas)
10. **Retorna Sucesso** → Dados completos para o cliente

**⚠️ IMPORTANTE:** Todo o cache é isolado por porta. A porta 5000 NUNCA acessa o cache da porta 4000 e vice-versa.

## 🌐 URLs da Porta 5000

### HTTP
- API: `http://72.60.159.149:5000`
- Health: `http://72.60.159.149:5000/health`
- Config: `http://72.60.159.149:5000/config-v8`

### HTTPS
- API: `https://lunasdigital.com.br:5443`
- Resumo: `https://lunasdigital.com.br:5443/resumo-clt-modelo-inss.html?cpf={CPF}`
- Formulário: `https://lunasdigital.com.br:5443/formulario-cadastro-proposta-v2.html?cpf={CPF}`

## 📡 Endpoints da API

### Fluxo CLT
- `POST /clt/fluxo-completo` - Executa fluxo completo CLT
- `POST /clt/mensagem-whatsapp` - Gera mensagem WhatsApp

### Cache (Isolado por Porta)
- `GET /cache/simulacao/:cpf` - Busca simulação, termo e dados do cliente no cache
- `POST /cache/simulacao/salvar` - Salva simulação, termo e dados do cliente no cache

**⚠️ IMPORTANTE:** Cada porta tem seu próprio cache isolado:
- **Porta 5000:** `simulacoes-aprovadas-5000.json` (contém simulações, termos CLT e dados de clientes)
- **Porta 4000:** `simulacoes-aprovadas-4000.json` (contém simulações, termos CLT e dados de clientes)

## 🔧 Comandos PM2

```bash
# Iniciar servidor porta 5000
pm2 start config/ecosystem.config.cjs --only clt-v8-api-5000

# Ver logs
pm2 logs clt-v8-api-5000

# Reiniciar
pm2 restart clt-v8-api-5000

# Parar
pm2 stop clt-v8-api-5000

# Status
pm2 status
```

## 🚀 Instalação e Configuração

### 1. Clonar Repositório

```bash
cd /opt/lunas-digital
git clone https://github.com/ederalmeidasantos-byte/AMB---FT.git clt-v8-service-5000
cd clt-v8-service-5000
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Ambiente

```bash
cp config/config.env.example config/config-5000.env
```

Edite `config/config-5000.env` com as credenciais da porta 5000.

### 4. Iniciar Servidor

```bash
pm2 start config/ecosystem.config.cjs --only clt-v8-api-5000
pm2 save
```

## 🔄 Replicar para Nova Porta

Para criar um novo ambiente (ex: porta 6000):

1. **Copiar estrutura:**
```bash
cp -r /opt/lunas-digital/clt-v8-service-5000/* /opt/lunas-digital/clt-v8-service-6000/
```

2. **Criar configuração:**
```bash
cd /opt/lunas-digital/clt-v8-service-6000
cp config/config-5000.env config/config-6000.env
```

3. **Editar configuração:**
```env
PORT=6000
HTTPS_PORT=6443
V8_USERNAME=<novo_login>
V8_PASSWORD=<nova_senha>
KENTRO_QUEUE_ID=<nova_queue>
```

4. **Renomear servidor:**
```bash
mv server-5000.js server-6000.js
```

5. **Atualizar `server-6000.js`:**
```javascript
const PORT_NUMBER = 6000;
```

6. **Atualizar `utils/clt-fluxo.js`:**
```javascript
const filas = [<nova_pipeline>];
```

7. **Atualizar PM2:**
```bash
# Editar config/ecosystem.config.cjs e adicionar nova entrada
pm2 start config/ecosystem.config.cjs --only clt-v8-api-6000
```

## ⚠️ Isolamento Total

- ✅ **NÃO compartilha** configuração com outras portas
- ✅ **NÃO compartilha** tokens V8 com outras portas
- ✅ **NÃO compartilha** cache de simulações com outras portas
- ✅ **NÃO compartilha** cache de termos CLT com outras portas
- ✅ **NÃO compartilha** dados de clientes com outras portas
- ✅ **NÃO interfere** em outras portas

## 📚 Documentação Completa

Consulte `docs/PRD-SISTEMA-CLT-V8-COMPLETO.md` para documentação completa do sistema.

## 🆘 Suporte

Para problemas:
1. Verifique logs: `pm2 logs clt-v8-api-5000`
2. Verifique health: `curl http://localhost:5000/health`
3. Verifique cache: `ls -la data/cache/`
4. Consulte documentação em `docs/`
