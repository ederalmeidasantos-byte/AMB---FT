<<<<<<< HEAD
# AMB - FT

Sistema de integração CLT V8 Digital - Servidor API

## 📋 Descrição

Servidor Node.js para integração com a API V8 Digital, processamento de fluxo CLT completo e gerenciamento de simulações.

## 🚀 Instalação

```bash
npm install
```

## ⚙️ Configuração

1. Copie o arquivo `config.env.example` para `config.env`
2. Preencha as variáveis de ambiente necessárias:

```env
# V8 Digital API
V8_API_URL=https://bff.v8sistema.com
V8_CLIENT_ID=seu_client_id
V8_AUDIENCE=https://bff.v8sistema.com
V8_AUTH_URL=https://auth.v8sistema.com/oauth/token
V8_USERNAME=seu_usuario
V8_PASSWORD=sua_senha

# Kentro API
KENTRO_API_URL=https://seu-dominio.atenderbem.com/int
KENTRO_API_KEY=sua_api_key
KENTRO_QUEUE_ID=seu_queue_id
```

## 🏃 Execução

### Desenvolvimento
```bash
node server-clt-5000.js
```

### Produção (PM2)
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## 📡 Endpoints Principais

- `POST /clt/fluxo-completo` - Executa fluxo completo CLT
- `GET /clt/fluxo-completo` - Executa fluxo completo CLT (GET)
- `GET /clt/buscar-oportunidade/:cpf` - Busca oportunidade na Kentro
- `POST /cache/simulacao/salvar` - Salva simulação no cache
- `GET /cache/simulacao/:cpf` - Busca simulação no cache
- `GET /health` - Health check

## 📁 Estrutura

```
.
├── server-clt-5000.js    # Servidor principal
├── utils/                 # Utilitários
│   ├── auth.js           # Autenticação V8
│   ├── clt-fluxo.js      # Fluxo CLT completo
│   └── cache-simulacoes.js # Cache de simulações
├── config.env.example    # Exemplo de configuração
└── package.json          # Dependências
```

## 🔒 Segurança

- Nunca commite arquivos `.env` ou `config.env` com credenciais reais
- Use variáveis de ambiente em produção
- Mantenha as chaves de API seguras

## 📝 Licença

Proprietário - Todos os direitos reservados

=======
# AMB---FT
Repositório AMB - FT
>>>>>>> 9bd929035b52dce30a732015248dc8b0774faa38
