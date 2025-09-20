
# 🔍 DeepSearch

Sistema avançado de pesquisa profunda que combina **LLMs locais**, **busca web inteligente** e **indexação vetorial** para gerar relatórios detalhados e contextualizados.

## ✨ Características

- 🤖 **LLMs Locais**: Ollama com Gemma2, Llama3.1 e modelos de embedding
- 🌐 **Busca Web Avançada**: DuckDuckGo com dorks e scraping inteligente  
- 🗄️ **Vector Database**: PostgreSQL + pgvector para indexação semântica
- 📊 **Relatórios Inteligentes**: Geração automática de markdown estruturado
- 🛡️ **Ferramentas Seguras**: Web-search, fetch e shell com controles de segurança
- 🔌 **API REST**: Interface HTTP completa para integrações
- 💻 **CLI Interativo**: Interface de linha de comando rica e intuitiva

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 18+
- Docker & Docker Compose
- 8GB+ RAM (para modelos LLM)

### Instalação

```bash
# Clone e setup
git clone <repo-url> deepsearch
cd deepsearch
make setup

# Inicia serviços
make start

# Primeira pesquisa
node index.js "inteligência artificial"
```

## 🎯 Uso Esperado

```bash
$ node index.js "faça uma pesquisa sobre harmonização sonora"

🔍 Iniciando busca profunda para: "faça uma pesquisa sobre harmonização sonora"

✅ LLM local conectado
✓ Gerados 8 termos de busca
✓ Pesquisando em 32 sites...
✓ Análise concluída
✅ Relatório pronto: "F:\deepsearch\reports\20240920_1430_harmonizacao_sonora.md"

🤖 Modo interativo iniciado

Digite suas sugestões ou \q para encerrar
:> 
```

## 📁 Estrutura do Projeto

```
deepsearch/
├── src/
│   ├── api/           # API HTTP Express
│   ├── services/      # Serviços core (LLM, Web, DB)
│   ├── tools/         # Ferramentas seguras
│   └── utils/         # Utilitários (logger, etc)
├── docker/            # Configurações Docker
├── config/            # Configurações da aplicação
├── scripts/           # Scripts de setup e manutenção
├── reports/           # Relatórios gerados
├── logs/              # Logs da aplicação
├── index.js           # CLI principal
├── Makefile           # Comandos do projeto
└── docker-compose.yml # Orquestração de containers
```

## 🛠️ Comandos Principais

```bash
# Setup e Instalação
make setup              # Configuração inicial completa
make install            # Instala dependências Node.js

# Controle de Serviços  
make start              # Inicia todos os serviços
make stop               # Para todos os serviços
make restart            # Reinicia serviços
make status             # Status dos containers

# Desenvolvimento
make start-dev          # Modo desenvolvimento (sem API container)
make logs               # Logs em tempo real
make health             # Verifica saúde dos serviços

# Modelos LLM
make models-pull        # Baixa modelos específicos
make models-list        # Lista modelos instalados

# Manutenção
make clean              # Limpa containers e volumes
make backup             # Backup do banco de dados
make stats              # Estatísticas do sistema
```

## 📡 API REST

A API REST está disponível em `http://localhost:3000` com os seguintes endpoints:

### Principais Endpoints

```bash
# Health check
GET /health

# Busca profunda
POST /api/search
{
  "query": "sua pesquisa aqui",
  "options": {
    "maxSources": 50,
    "useAdvancedSearch": true
  }
}

# Busca vetorial por similaridade
POST /api/vector-search
{
  "query": "termo de busca",
  "limit": 10,
  "threshold": 0.7
}

# Histórico de pesquisas
GET /api/history?limit=20

# Detalhes de uma sessão
GET /api/session/{sessionId}

# Modelos LLM disponíveis
GET /api/models
```

### Exemplos com curl

```bash
# Busca simples
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning"}'

# Histórico
curl http://localhost:3000/api/history

# Health check
curl http://localhost:3000/health
```

## 🔧 CLI Interativo

O CLI oferece comandos especiais no modo interativo:

```bash
:> /help        # Mostra comandos disponíveis
:> /status      # Status dos serviços
:> /models      # Lista modelos LLM
:> /history     # Histórico de pesquisas
:> \q           # Sair
```

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_LLM_MODEL=llama3.1:8b
EMBEDDING_MODEL=nomic-embed-text

# API Settings
PORT=3000
API_KEY=sua-api-key-aqui

# Security
ENABLE_SHELL_TOOLS=false
ALLOWED_DOMAINS=*
BLOCKED_DOMAINS=localhost,127.0.0.1,10.*

# Performance
MAX_SEARCH_RESULTS=50
MAX_CONCURRENT_SCRAPES=5
PARALLEL_PROCESSING_LIMIT=5
```

### Modelos LLM Suportados

- **Llama 3.1** (8B, 70B) - Modelo principal para análise
- **Gemma2** (2B, 9B) - Modelo alternativo rápido  
- **CodeLlama** (7B) - Especializado em código
- **Nomic Embed Text** - Geração de embeddings

## 🛡️ Segurança

O sistema inclui várias camadas de segurança:

- ✅ **Validação de URLs** - Apenas HTTP/HTTPS
- ✅ **Domínios Bloqueados** - IPs locais/privados bloqueados
- ✅ **Rate Limiting** - API com limites de requisições
- ✅ **Sanitização de Comandos** - Shell tools com whitelist
- ✅ **Validação de Paths** - Prevenção de path traversal
- ✅ **Content-Type Validation** - Apenas tipos permitidos

## 📈 Performance

### Otimizações Implementadas

- **Cache de Embeddings** - Evita reprocessamento
- **Processamento Paralelo** - Scraping concorrente
- **Indexação Vetorial** - Busca semântica rápida
- **Rate Limiting Inteligente** - Evita bloqueios
- **Pool de Conexões** - PostgreSQL otimizado

### Métricas Típicas

- **Geração de Termos**: 2-5 segundos
- **Busca Web**: 30-60 segundos (50 sites)
- **Análise de Conteúdo**: 5-10 segundos/página
- **Geração de Relatório**: 10-30 segundos

## 🚨 Troubleshooting

### Problemas Comuns

```bash
# Ollama não responde
make logs-llm
docker-compose restart ollama

# PostgreSQL não conecta  
make logs-db
docker-compose restart postgres

# Modelos não baixam
make shell-ollama
ollama pull llama3.1:8b

# API não responde
make health
make logs-api
```

### Logs e Debugging

```bash
# Logs específicos
make logs-api           # API logs
make logs-db            # Database logs  
make logs-llm           # Ollama logs

# Debug mode
LOG_LEVEL=debug node index.js "teste"
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m 'Adiciona nova funcionalidade'`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- [Ollama](https://ollama.ai/) - LLMs locais
- [pgvector](https://github.com/pgvector/pgvector) - Extensão vetorial PostgreSQL
- [DuckDuckGo](https://duckduckgo.com/) - Motor de busca web
- Comunidade Open Source
