# DeepSearch Makefile
# Facilita comandos comuns do projeto

.PHONY: help install setup start stop logs clean test

# Variáveis
DOCKER_COMPOSE = docker-compose
NODE = node
NPM = npm

help: ## Mostra esta ajuda
	@echo "DeepSearch - Comandos Disponíveis:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependências Node.js
	@echo "📦 Instalando dependências..."
	$(NPM) install
	@echo "✅ Dependências instaladas"

setup: install ## Executa configuração inicial completa
	@echo "🚀 Executando setup inicial..."
	$(NODE) scripts/setup.js
	@echo "✅ Setup concluído"

start: ## Inicia todos os serviços (Docker + API)
	@echo "🚀 Iniciando serviços..."
	$(DOCKER_COMPOSE) up -d
	@echo "⏳ Aguardando serviços ficarem prontos..."
	sleep 10
	@echo "✅ Serviços iniciados"
	@echo "💡 Use 'make logs' para ver logs"

start-dev: ## Inicia em modo desenvolvimento
	@echo "🔧 Iniciando em modo desenvolvimento..."
	$(DOCKER_COMPOSE) up -d postgres ollama
	@echo "⏳ Aguardando PostgreSQL..."
	$(DOCKER_COMPOSE) exec postgres pg_isready -U deepsearch_user -d deepsearch
	@echo "🚀 Iniciando API em modo dev..."
	$(NPM) run dev

stop: ## Para todos os serviços
	@echo "🛑 Parando serviços..."
	$(DOCKER_COMPOSE) down
	@echo "✅ Serviços parados"

restart: stop start ## Reinicia todos os serviços

logs: ## Mostra logs dos serviços
	$(DOCKER_COMPOSE) logs -f

logs-api: ## Mostra apenas logs da API
	$(DOCKER_COMPOSE) logs -f api

logs-db: ## Mostra apenas logs do PostgreSQL
	$(DOCKER_COMPOSE) logs -f postgres

logs-llm: ## Mostra apenas logs do Ollama
	$(DOCKER_COMPOSE) logs -f ollama

status: ## Mostra status dos serviços
	@echo "📊 Status dos Serviços:"
	$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "💾 Uso de disco:"
	docker system df
	@echo ""
	@echo "🔍 Modelos LLM disponíveis:"
	-$(DOCKER_COMPOSE) exec ollama ollama list

health: ## Verifica saúde dos serviços
	@echo "🏥 Verificação de saúde:"
	@echo "- API:"
	-curl -s http://localhost:3000/health | jq .
	@echo "- PostgreSQL:"
	-$(DOCKER_COMPOSE) exec postgres pg_isready -U deepsearch_user -d deepsearch
	@echo "- Ollama:"
	-curl -s http://localhost:11434/api/tags | jq '.models | length' 2>/dev/null || echo "Ollama não respondeu"

clean: ## Remove containers, volumes e limpa sistema
	@echo "🧹 Limpando ambiente..."
	$(DOCKER_COMPOSE) down -v --remove-orphans
	docker system prune -f
	@echo "✅ Limpeza concluída"

clean-data: ## Remove APENAS dados (mantem containers)
	@echo "⚠️  ATENÇÃO: Isso removerá todos os dados!"
	@read -p "Tem certeza? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	$(DOCKER_COMPOSE) down -v
	@echo "🗑️  Dados removidos"

pull: ## Atualiza imagens Docker
	@echo "⬇️  Atualizando imagens..."
	$(DOCKER_COMPOSE) pull
	@echo "✅ Imagens atualizadas"

build: ## Reconstrói containers locais
	@echo "🔨 Reconstruindo containers..."
	$(DOCKER_COMPOSE) build --no-cache
	@echo "✅ Containers reconstruídos"

shell-db: ## Abre shell no PostgreSQL
	$(DOCKER_COMPOSE) exec postgres psql -U deepsearch_user -d deepsearch

shell-api: ## Abre shell no container da API
	$(DOCKER_COMPOSE) exec api sh

models-pull: ## Baixa modelos LLM específicos
	@echo "📥 Baixando modelos LLM..."
	$(DOCKER_COMPOSE) exec ollama ollama pull llama3.1:8b
	$(DOCKER_COMPOSE) exec ollama ollama pull gemma2:2b
	$(DOCKER_COMPOSE) exec ollama ollama pull nomic-embed-text
	@echo "✅ Modelos baixados"

models-list: ## Lista modelos LLM instalados
	$(DOCKER_COMPOSE) exec ollama ollama list

test: ## Executa testes
	@echo "🧪 Executando testes..."
	$(NPM) test

test-api: ## Testa endpoints da API
	@echo "🌐 Testando API..."
	@echo "Health check:"
	curl -s http://localhost:3000/health
	@echo "\nModelos disponíveis:"
	curl -s http://localhost:3000/api/models
	@echo "\nHistórico:"
	curl -s http://localhost:3000/api/history

search: ## Executa uma busca de exemplo
	@echo "🔍 Executando busca de exemplo..."
	$(NODE) index.js "inteligência artificial"

backup: ## Faz backup do banco de dados
	@echo "💾 Fazendo backup..."
	mkdir -p ./backups
	$(DOCKER_COMPOSE) exec postgres pg_dump -U deepsearch_user deepsearch > ./backups/backup-$$(date +%Y%m%d-%H%M%S).sql
	@echo "✅ Backup salvo em ./backups/"

restore: ## Restaura backup do banco (especifique BACKUP=arquivo)
	@if [ -z "$(BACKUP)" ]; then echo "❌ Especifique o arquivo: make restore BACKUP=backup.sql"; exit 1; fi
	@echo "🔄 Restaurando backup $(BACKUP)..."
	$(DOCKER_COMPOSE) exec -T postgres psql -U deepsearch_user deepsearch < $(BACKUP)
	@echo "✅ Backup restaurado"

migrate: ## Executa migrações do banco
	@echo "🔄 Executando migrações..."
	$(DOCKER_COMPOSE) exec postgres psql -U deepsearch_user deepsearch -f /docker-entrypoint-initdb.d/init.sql
	@echo "✅ Migrações executadas"

stats: ## Mostra estatísticas do sistema
	@echo "📈 Estatísticas do DeepSearch:"
	@echo "- Containers:"
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo "\n- Volumes:"
	docker volume ls | grep deepsearch
	@echo "\n- Uso de recursos:"
	docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -4

dev-tools: ## Instala ferramentas de desenvolvimento
	@echo "🛠️  Instalando ferramentas de desenvolvimento..."
	$(NPM) install -g nodemon jest supertest
	@echo "✅ Ferramentas instaladas"

# Targets para diferentes ambientes
prod: ## Inicia em modo produção
	@echo "🏭 Iniciando em modo produção..."
	NODE_ENV=production $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d

staging: ## Inicia em modo staging
	@echo "🎭 Iniciando em modo staging..."
	NODE_ENV=staging $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.staging.yml up -d
