/**
 * Serviço para gerenciamento do banco de dados PostgreSQL com pgvector
 */

const { Pool } = require('pg');
const config = require('../../config/default');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Verifica a saúde da conexão com o banco
   */
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      
      // Testa conexão básica
      const result = await client.query('SELECT NOW()');
      
      // Verifica se pgvector está instalado
      const vectorResult = await client.query(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
      );
      
      client.release();

      return {
        status: 'ok',
        message: 'Banco conectado',
        timestamp: result.rows[0].now,
        vectorEnabled: vectorResult.rows[0].exists
      };
    } catch (error) {
      logger.error('Database health check failed', error);
      return {
        status: 'error',
        message: `Erro de conexão: ${error.message}`
      };
    }
  }

  /**
   * Cria uma nova sessão de busca
   */
  async createSearchSession(query, metadata = {}) {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'INSERT INTO search_sessions (query, metadata) VALUES ($1, $2) RETURNING *',
        [query, JSON.stringify(metadata)]
      );
      
      logger.info(`Sessão de busca criada: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao criar sessão de busca', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atualiza status da sessão
   */
  async updateSearchSession(sessionId, status, metadata = null) {
    const client = await this.pool.connect();
    
    try {
      const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
      const values = [sessionId, status];
      
      if (metadata) {
        updates.push('metadata = $3');
        values.push(JSON.stringify(metadata));
      }
      
      const query = `UPDATE search_sessions SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const result = await client.query(query, values);
      
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao atualizar sessão', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Salva fonte web com embedding
   */
  async saveWebSource(sessionId, sourceData, embedding = null) {
    const client = await this.pool.connect();
    
    try {
      const { url, title, content, summary, domain, metadata = {} } = sourceData;
      
      const result = await client.query(`
        INSERT INTO web_sources 
        (session_id, url, title, content, summary, domain, embedding, metadata) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *
      `, [
        sessionId,
        url,
        title?.substring(0, 500),
        content?.substring(0, config.performance.maxContentLength),
        summary?.substring(0, 2000),
        domain,
        embedding ? `[${embedding.join(',')}]` : null,
        JSON.stringify(metadata)
      ]);
      
      logger.debug(`Fonte web salva: ${url}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao salvar fonte web', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Salva resposta do LLM com embedding
   */
  async saveLLMResponse(sessionId, responseData, embedding = null) {
    const client = await this.pool.connect();
    
    try {
      const { 
        model_name, 
        prompt, 
        response, 
        token_count, 
        processing_time_ms 
      } = responseData;
      
      const result = await client.query(`
        INSERT INTO llm_responses 
        (session_id, model_name, prompt, response, token_count, processing_time_ms, embedding) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *
      `, [
        sessionId,
        model_name,
        prompt?.substring(0, 10000),
        response?.substring(0, 50000),
        token_count,
        processing_time_ms,
        embedding ? `[${embedding.join(',')}]` : null
      ]);
      
      logger.debug(`Resposta LLM salva para sessão ${sessionId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao salvar resposta LLM', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Salva relatório final
   */
  async saveReport(sessionId, reportData) {
    const client = await this.pool.connect();
    
    try {
      const { title, content, file_path, format = 'markdown' } = reportData;
      
      const result = await client.query(`
        INSERT INTO reports (session_id, title, content, file_path, format) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *
      `, [sessionId, title, content, file_path, format]);
      
      logger.info(`Relatório salvo: ${title}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao salvar relatório', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Busca vetorial por similaridade
   */
  async vectorSearch(queryEmbedding, options = {}) {
    const {
      limit = config.performance.maxVectorSearchResults,
      threshold = 0.5,
      table = 'web_sources'
    } = options;

    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT *, 
               1 - (embedding <=> $1::vector) AS similarity
        FROM ${table} 
        WHERE embedding IS NOT NULL 
          AND 1 - (embedding <=> $1::vector) >= $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `;
      
      const result = await client.query(query, [
        `[${queryEmbedding.join(',')}]`,
        threshold,
        limit
      ]);
      
      logger.debug(`Busca vetorial encontrou ${result.rows.length} resultados`);
      return result.rows;
    } catch (error) {
      logger.error('Erro na busca vetorial', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Busca por embeddings em cache
   */
  async getCachedEmbedding(contentHash) {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM embeddings_cache WHERE content_hash = $1',
        [contentHash]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Erro ao buscar embedding em cache', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Salva embedding em cache
   */
  async cacheEmbedding(contentHash, contentPreview, embedding, modelUsed) {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO embeddings_cache 
        (content_hash, content_preview, embedding, model_used) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (content_hash) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model_used = EXCLUDED.model_used,
          created_at = CURRENT_TIMESTAMP
      `, [
        contentHash,
        contentPreview?.substring(0, 500),
        `[${embedding.join(',')}]`,
        modelUsed
      ]);
      
      logger.debug(`Embedding cacheado para hash ${contentHash}`);
    } catch (error) {
      logger.error('Erro ao cachear embedding', error);
    } finally {
      client.release();
    }
  }

  /**
   * Histórico de sessões de busca
   */
  async getSearchHistory(limit = 10, offset = 0) {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT s.*, 
               COUNT(ws.id) as sources_count,
               COUNT(lr.id) as responses_count,
               COUNT(r.id) as reports_count
        FROM search_sessions s
        LEFT JOIN web_sources ws ON s.id = ws.session_id
        LEFT JOIN llm_responses lr ON s.id = lr.session_id
        LEFT JOIN reports r ON s.id = r.session_id
        GROUP BY s.id
        ORDER BY s.timestamp DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      return result.rows;
    } catch (error) {
      logger.error('Erro ao buscar histórico', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Detalhes de uma sessão específica
   */
  async getSessionDetails(sessionId) {
    const client = await this.pool.connect();
    
    try {
      // Busca dados da sessão
      const sessionResult = await client.query(
        'SELECT * FROM search_sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return null;
      }

      const session = sessionResult.rows[0];

      // Busca fontes relacionadas
      const sourcesResult = await client.query(
        'SELECT * FROM web_sources WHERE session_id = $1 ORDER BY scraped_at',
        [sessionId]
      );

      // Busca respostas LLM relacionadas
      const responsesResult = await client.query(
        'SELECT * FROM llm_responses WHERE session_id = $1 ORDER BY created_at',
        [sessionId]
      );

      // Busca relatórios relacionados
      const reportsResult = await client.query(
        'SELECT * FROM reports WHERE session_id = $1 ORDER BY created_at',
        [sessionId]
      );

      return {
        session,
        sources: sourcesResult.rows,
        responses: responsesResult.rows,
        reports: reportsResult.rows
      };
      
    } catch (error) {
      logger.error('Erro ao buscar detalhes da sessão', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Estatísticas gerais
   */
  async getStatistics() {
    const client = await this.pool.connect();
    
    try {
      const stats = {};

      // Contadores básicos
      const countsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM search_sessions) as sessions,
          (SELECT COUNT(*) FROM web_sources) as sources,
          (SELECT COUNT(*) FROM llm_responses) as responses,
          (SELECT COUNT(*) FROM reports) as reports,
          (SELECT COUNT(*) FROM embeddings_cache) as cached_embeddings
      `);
      
      stats.counts = countsResult.rows[0];

      // Top domínios
      const domainsResult = await client.query(`
        SELECT domain, COUNT(*) as count
        FROM web_sources 
        WHERE domain IS NOT NULL
        GROUP BY domain
        ORDER BY count DESC
        LIMIT 10
      `);
      
      stats.topDomains = domainsResult.rows;

      // Modelos mais usados
      const modelsResult = await client.query(`
        SELECT model_name, COUNT(*) as count
        FROM llm_responses 
        GROUP BY model_name
        ORDER BY count DESC
        LIMIT 10
      `);
      
      stats.topModels = modelsResult.rows;

      return stats;
    } catch (error) {
      logger.error('Erro ao buscar estatísticas', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Limpeza de dados antigos
   */
  async cleanupOldData(daysOld = 30) {
    const client = await this.pool.connect();
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await client.query(`
        DELETE FROM search_sessions 
        WHERE created_at < $1
      `, [cutoffDate]);

      logger.info(`Limpeza: ${result.rowCount} sessões antigas removidas`);
      return result.rowCount;
    } catch (error) {
      logger.error('Erro na limpeza de dados', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fecha conexões do pool
   */
  async close() {
    await this.pool.end();
    logger.info('Pool de conexões fechado');
  }
}

module.exports = DatabaseService;
