/**
 * Servidor HTTP API do DeepSearch
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const config = require('../../config/default');
const logger = require('../utils/logger');
const DeepSearchOrchestrator = require('../services/DeepSearchOrchestrator');

class DeepSearchAPI {
  constructor() {
    this.app = express();
    this.orchestrator = new DeepSearchOrchestrator();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.api.rateLimit.windowMs,
      max: config.api.rateLimit.max,
      message: {
        error: 'Too many requests, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID e logging
    this.app.use((req, res, next) => {
      req.id = uuidv4();
      logger.info(`${req.method} ${req.path}`, {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Auth middleware para rotas protegidas
    this.app.use('/api/admin', this.authMiddleware.bind(this));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const llmHealth = await this.orchestrator.llmService.healthCheck();
        const dbHealth = await this.orchestrator.databaseHealth();

        const health = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            api: { status: 'ok', message: 'API is running' },
            llm: llmHealth,
            database: dbHealth
          }
        };

        const overallStatus = Object.values(health.services)
          .every(service => service.status === 'ok') ? 'ok' : 'degraded';

        res.status(overallStatus === 'ok' ? 200 : 503).json({
          ...health,
          status: overallStatus
        });

      } catch (error) {
        logger.error('Health check failed', error);
        res.status(503).json({
          status: 'error',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Busca profunda
    this.app.post('/api/search', async (req, res) => {
      try {
        const { query, options = {} } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
          return res.status(400).json({
            error: 'Query is required and must be a non-empty string'
          });
        }

        logger.info(`Starting deep search for: "${query}"`, {
          requestId: req.id,
          options
        });

        const result = await this.orchestrator.performDeepSearch(query, {
          ...options,
          requestId: req.id
        });

        res.json({
          success: true,
          data: result
        });

      } catch (error) {
        logger.error('Deep search failed', error, { requestId: req.id });
        res.status(500).json({
          error: 'Deep search failed',
          message: error.message
        });
      }
    });

    // Busca vetorial
    this.app.post('/api/vector-search', async (req, res) => {
      try {
        const { query, limit = 10, threshold = 0.7 } = req.body;

        if (!query) {
          return res.status(400).json({
            error: 'Query is required'
          });
        }

        const result = await this.orchestrator.vectorSearch(query, {
          limit: Math.min(limit, 50),
          threshold: Math.max(0.1, Math.min(threshold, 1.0))
        });

        res.json({
          success: true,
          data: result
        });

      } catch (error) {
        logger.error('Vector search failed', error, { requestId: req.id });
        res.status(500).json({
          error: 'Vector search failed',
          message: error.message
        });
      }
    });

    // Histórico de buscas
    this.app.get('/api/history', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const history = await this.orchestrator.getSearchHistory(limit);

        res.json({
          success: true,
          data: history
        });

      } catch (error) {
        logger.error('Failed to get history', error, { requestId: req.id });
        res.status(500).json({
          error: 'Failed to get history',
          message: error.message
        });
      }
    });

    // Detalhes de uma sessão
    this.app.get('/api/session/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
          return res.status(400).json({
            error: 'Session ID is required'
          });
        }

        const details = await this.orchestrator.getSessionDetails(sessionId);
        
        if (!details) {
          return res.status(404).json({
            error: 'Session not found'
          });
        }

        res.json({
          success: true,
          data: details
        });

      } catch (error) {
        logger.error('Failed to get session details', error, { requestId: req.id });
        res.status(500).json({
          error: 'Failed to get session details',
          message: error.message
        });
      }
    });

    // Modelos LLM disponíveis
    this.app.get('/api/models', async (req, res) => {
      try {
        const models = await this.orchestrator.llmService.listModels();

        res.json({
          success: true,
          data: models
        });

      } catch (error) {
        logger.error('Failed to list models', error, { requestId: req.id });
        res.status(500).json({
          error: 'Failed to list models',
          message: error.message
        });
      }
    });

    // Estatísticas (Admin)
    this.app.get('/api/admin/stats', async (req, res) => {
      try {
        const stats = await this.orchestrator.databaseService.getStatistics();

        res.json({
          success: true,
          data: stats
        });

      } catch (error) {
        logger.error('Failed to get statistics', error, { requestId: req.id });
        res.status(500).json({
          error: 'Failed to get statistics',
          message: error.message
        });
      }
    });

    // Limpeza de dados antigos (Admin)
    this.app.post('/api/admin/cleanup', async (req, res) => {
      try {
        const { daysOld = 30 } = req.body;
        const deletedCount = await this.orchestrator.databaseService.cleanupOldData(daysOld);

        res.json({
          success: true,
          data: {
            deletedSessions: deletedCount,
            daysOld
          }
        });

      } catch (error) {
        logger.error('Cleanup failed', error, { requestId: req.id });
        res.status(500).json({
          error: 'Cleanup failed',
          message: error.message
        });
      }
    });

    // 404 para rotas não encontradas
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
      });
    });
  }

  setupErrorHandling() {
    // Error handler global
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', error, { requestId: req.id });
      
      res.status(500).json({
        error: 'Internal server error',
        message: config.api.env === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey || apiKey !== config.api.apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    }
    
    next();
  }

  async start() {
    const port = config.api.port;
    
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, (error) => {
        if (error) {
          logger.error('Failed to start server', error);
          reject(error);
        } else {
          logger.info(`DeepSearch API started on port ${port}`);
          resolve(server);
        }
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        server.close(() => {
          logger.info('Server closed');
          this.orchestrator.databaseService.close();
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully');
        server.close(() => {
          logger.info('Server closed');
          this.orchestrator.databaseService.close();
          process.exit(0);
        });
      });
    });
  }
}

// Inicia servidor se executado diretamente
if (require.main === module) {
  const api = new DeepSearchAPI();
  api.start().catch(error => {
    logger.error('Failed to start API server', error);
    process.exit(1);
  });
}

module.exports = DeepSearchAPI;
