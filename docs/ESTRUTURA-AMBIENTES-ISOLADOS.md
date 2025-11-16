# 🏗️ Estrutura de Ambientes Isolados por Porta

## 📋 Visão Geral

Cada porta representa um ambiente **completamente isolado** de um cliente diferente. Não há interferência entre portas.

## 🔒 Isolamento Garantido

### 1. **Configuração Isolada**
- Cada porta tem seu próprio arquivo: `config/config-{PORT}.env`
- Exemplo:
  - Porta 4000 → `config/config-4000.env`
  - Porta 5000 → `config/config-5000.env`
  - Porta 6000 → `config/config-6000.env`

### 2. **Cache de Tokens Isolado**
- Cada porta tem seu próprio cache de tokens V8
- Tokens não são compartilhados entre portas
- Cache limpo independentemente por porta

### 3. **Logs Isolados**
- Cada porta tem seus próprios arquivos de log:
  - `logs/out-{PORT}.log`
  - `logs/error-{PORT}.log`
  - `logs/combined-{PORT}.log`

### 4. **Variáveis de Ambiente Isoladas**
- Cada servidor carrega apenas seu próprio arquivo de configuração
- Não há fallback para outros arquivos
- Variáveis não são compartilhadas entre processos

## 📁 Estrutura de Arquivos

```
clt-v8-service/
├── config/
│   ├── config-4000.env    # Ambiente Cliente A (Porta 4000)
│   ├── config-5000.env    # Ambiente Cliente B (Porta 5000)
│   └── config-6000.env    # Ambiente Cliente C (Porta 6000)
├── server.js              # Servidor porta 4000
├── server-5000.js         # Servidor porta 5000
├── server-6000.js         # Servidor porta 6000 (futuro)
├── utils/
│   ├── config-loader.js   # Carregador de configuração por porta
│   └── auth-isolado.js    # Autenticação isolada por porta
└── logs/
    ├── out-4000.log
    ├── out-5000.log
    └── error-5000.log
```

## 🚀 Como Adicionar uma Nova Porta

### Passo 1: Criar arquivo de servidor
```bash
cp server-5000.js server-6000.js
```

### Passo 2: Modificar o arquivo
```javascript
// No início do arquivo server-6000.js
const PORT_NUMBER = 6000; // Mudar para a nova porta
```

### Passo 3: Criar arquivo de configuração
```bash
# O sistema criará automaticamente ou você pode criar manualmente:
cp config/config-5000.env config/config-6000.env
# Editar com as credenciais do novo cliente
```

### Passo 4: Adicionar ao PM2
Editar `config/ecosystem.config.cjs`:
```javascript
{
  name: 'clt-v8-api-6000',
  script: 'server-6000.js',
  env: {
    PORT: 6000
  },
  // ... outras configurações
}
```

### Passo 5: Iniciar
```bash
pm2 start config/ecosystem.config.cjs --only clt-v8-api-6000
```

## 🔐 Configuração de Credenciais

### Via Interface Web
Acesse: `http://72.60.159.149:{PORT}/config-v8`

A página detecta automaticamente a porta e salva no arquivo correto.

### Via Arquivo
Edite diretamente: `config/config-{PORT}.env`

```env
V8_USERNAME=cliente@email.com
V8_PASSWORD=senha_segura
KENTRO_TOKEN=token_do_cliente
# ... outras configurações
```

## ✅ Garantias de Isolamento

1. ✅ **Configuração**: Cada porta lê apenas seu próprio arquivo
2. ✅ **Tokens**: Cache isolado por porta
3. ✅ **Logs**: Arquivos separados por porta
4. ✅ **Processos**: Cada porta roda em processo PM2 separado
5. ✅ **Memória**: Variáveis de ambiente não compartilhadas
6. ✅ **APIs**: Cada porta pode ter credenciais diferentes

## 🚨 Importante

- **NUNCA** compartilhe arquivos de configuração entre portas
- **SEMPRE** use o sistema de configuração isolado
- **VERIFIQUE** que cada porta está usando seu próprio arquivo
- **TESTE** isoladamente antes de adicionar mais portas

## 📊 Monitoramento

Verificar qual porta está usando qual configuração:
```bash
# Ver logs de inicialização
pm2 logs clt-v8-api-5000 --lines 20

# Verificar arquivo de configuração
cat config/config-5000.env | grep V8_USERNAME
```

## 🔄 Migração de Configuração Existente

Se você já tem uma configuração e quer isolá-la:

1. Copiar `config/config.env` para `config/config-4000.env`
2. Atualizar `server.js` para usar `config-loader.js`
3. Reiniciar o servidor
