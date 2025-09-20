// Configurações padrão do DeepSearch
require('dotenv').config();

const config = {
  // Banco de dados PostgreSQL
  database: {
    url: process.env.DATABASE_URL || 'postgresql://deepsearch_user:deepsearch_pass@localhost:5432/deepsearch',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'deepsearch',
    user: process.env.DB_USER || 'deepsearch_user',
    password: process.env.DB_PASS || 'deepsearch_pass'
  },

  // Ollama (LLMs locais)
  llm: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: process.env.DEFAULT_LLM_MODEL || 'llama3.1:8b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    codeModel: process.env.CODE_MODEL || 'codellama:7b',
    timeout: parseInt(process.env.LLM_TIMEOUT_MS) || 120000
  },

  // API Configuration
  api: {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
    apiKey: process.env.API_KEY || 'deepsearch-dev-key',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15min
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    }
  },

  // Web Search Settings
  search: {
    timeout: parseInt(process.env.SEARCH_TIMEOUT_MS) || 30000,
    maxResults: parseInt(process.env.MAX_SEARCH_RESULTS) || 50,
    maxConcurrentScrapes: parseInt(process.env.MAX_CONCURRENT_SCRAPES) || 5,
    userAgent: process.env.USER_AGENT || 'DeepSearch Bot 1.0',
    duckduckgo: {
      safeSearch: process.env.DDG_SAFE_SEARCH || 'moderate',
      region: process.env.DDG_REGION || 'br-pt'
    }
  },

  // Relatórios
  reports: {
    dir: process.env.REPORTS_DIR || './reports',
    format: process.env.REPORTS_FORMAT || 'markdown',
    autoSave: process.env.AUTO_SAVE_REPORTS === 'true'
  },

  // Logs
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/deepsearch.log',
    maxSize: process.env.LOG_MAX_SIZE || '10mb',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  },

  // Redis (Opcional)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    cacheTtl: parseInt(process.env.CACHE_TTL_SECONDS) || 3600
  },

  // Segurança
  security: {
    enableShellTools: process.env.ENABLE_SHELL_TOOLS === 'true',
    allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || ['*'],
    blockedDomains: process.env.BLOCKED_DOMAINS?.split(',') || [
      'localhost', '127.0.0.1', '10.*', '192.168.*', '172.16.*'
    ]
  },

  // Performance
  performance: {
    maxVectorSearchResults: parseInt(process.env.MAX_VECTOR_SEARCH_RESULTS) || 10,
    embeddingBatchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 100,
    maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH) || 50000,
    parallelProcessingLimit: parseInt(process.env.PARALLEL_PROCESSING_LIMIT) || 5
  }
};

module.exports = config;
