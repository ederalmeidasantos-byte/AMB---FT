# 🚀 CLT V8 API - Ambiente VPS

Sistema de integração CLT V8 Digital com ambientes isolados por porta para múltiplos clientes.

## 📋 Descrição

Sistema Node.js para integração com a API V8 Digital, processamento de fluxo CLT completo e gerenciamento de simulações. Suporta múltiplos ambientes isolados, cada um rodando em uma porta diferente.

## 🏗️ Arquitetura

Cada porta representa um ambiente **completamente isolado** de um cliente diferente:
- **Porta 4000**: Cliente A
- **Porta 5000**: Cliente B
- **Porta 6000**: Cliente C (futuro)

Cada ambiente tem:
- ✅ Configuração isolada (`config/config-{PORT}.env`)
- ✅ Cache de tokens isolado
- ✅ Logs isolados
- ✅ Processo PM2 separado

## 🚀 Instalação no VPS

### 1. Clonar Repositório

```bash
cd /opt/lunas-digital
git clone https://github.com/ederalmeidasantos-byte/AMB---FT.git clt-v8-service
cd clt-v8-service
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Ambiente

Para cada porta, crie um arquivo de configuração:

```bash
# Exemplo para porta 5000
cp config/env-example.txt config/config-5000.env
```

Edite `config/config-5000.env` com suas credenciais.

### 4. Configurar PM2

Edite `config/ecosystem.config.cjs` e adicione a configuração da nova porta.

### 5. Iniciar Servidores

```bash
# Iniciar todos os servidores
pm2 start config/ecosystem.config.cjs

# OU iniciar apenas uma porta específica
pm2 start config/ecosystem.config.cjs --only clt-v8-api-5000

# Salvar configuração PM2
pm2 save
```

## ⚙️ Configuração via Interface Web

1. Acesse: `http://{SEU_IP}:{PORT}/config-v8`
2. Clique em "Editar Login"
3. Preencha credenciais V8
4. Teste a conexão
5. Salve a configuração

## 📡 Endpoints Principais

### Configuração
- `GET /config-v8` - Interface de configuração
- `GET /config/v8/atual` - Obter configuração atual
- `POST /config/v8/salvar` - Salvar credenciais
- `POST /config/v8/testar` - Testar conexão

### Fluxo CLT
- `POST /clt/fluxo-completo` - Executa fluxo completo CLT
- `POST /clt/mensagem-whatsapp` - Gera mensagem WhatsApp

### Health Check
- `GET /health` - Status do servidor

## 📁 Estrutura do Projeto

```
clt-v8-service/
├── server.js              # Servidor porta 4000
├── server-5000.js         # Servidor porta 5000
├── config/
│   ├── config-4000.env    # Config Cliente A (não commitado)
│   ├── config-5000.env    # Config Cliente B (não commitado)
│   ├── env-example.txt    # Exemplo de configuração
│   └── ecosystem.config.cjs # PM2 config
├── utils/
│   ├── config-loader.js   # Carregador de config
│   ├── auth-isolado.js    # Auth isolada por porta
│   ├── clt-fluxo.js       # Lógica CLT
│   └── cache-simulacoes.js # Cache
├── routes/
│   ├── clt.js            # Rotas CLT
│   └── auth.js           # Rotas auth
├── public/
│   └── config-v8.html    # Interface config
└── docs/
    └── PRD-AMBIENTES-ISOLADOS-V8.md # Documentação completa
```

## 🔧 Comandos Úteis

### PM2

```bash
# Status
pm2 status

# Logs
pm2 logs clt-v8-api-5000

# Reiniciar
pm2 restart clt-v8-api-5000

# Parar
pm2 stop clt-v8-api-5000

# Monitorar
pm2 monit
```

### Verificar Servidor

```bash
# Health check
curl http://localhost:5000/health

# Verificar porta
netstat -tlnp | grep 5000
```

## 🔒 Segurança

- ✅ Nunca commite arquivos `config-*.env` com credenciais
- ✅ Use senhas fortes
- ✅ Mantenha tokens seguros
- ✅ Monitore logs regularmente

## 📚 Documentação Completa

Consulte `docs/PRD-AMBIENTES-ISOLADOS-V8.md` para:
- Arquitetura completa
- APIs da V8 Digital
- Todos os endpoints
- Como adicionar novas portas
- Troubleshooting

## 🆘 Suporte

Para problemas:
1. Verifique logs: `pm2 logs clt-v8-api-{PORT}`
2. Verifique health: `curl http://localhost:{PORT}/health`
3. Consulte documentação em `docs/`

## 📝 Licença

Proprietário - Todos os direitos reservados
