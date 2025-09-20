# Dockerfile para a API do DeepSearch
FROM node:20-alpine

# Instala dependências do sistema
RUN apk add --no-cache \
    curl \
    bash \
    git \
    python3 \
    make \
    g++

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./

# Instala dependências do Node.js
RUN npm ci --only=production && npm cache clean --force

# Copia código fonte
COPY . .

# Cria diretórios necessários
RUN mkdir -p /app/reports /app/logs /app/temp

# Define permissões
RUN chmod +x docker/ollama/entrypoint.sh

# Expõe porta da API
EXPOSE 3000

# Define variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando de inicialização
CMD ["npm", "start"]
