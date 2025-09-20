/**
 * Orquestrador principal que coordena busca web, LLMs e banco de dados
 */

const crypto = require('crypto');
const path = require('path');
const LLMService = require('./LLMService');
const WebSearchService = require('./WebSearchService');
const DatabaseService = require('./DatabaseService');
const config = require('../../config/default');
const logger = require('../utils/logger');

class DeepSearchOrchestrator {
  constructor() {
    this.llmService = new LLMService();
    this.webSearchService = new WebSearchService();
    this.databaseService = new DatabaseService();
  }

  /**
   * Executa busca profunda completa
   */
  async performDeepSearch(query, options = {}) {
    const {
      useAdvancedSearch = true,
      generateEmbeddings = true,
      maxSources = config.search.maxResults,
      saveToDatabase = true
    } = options;

    logger.info(`Iniciando deep search para: "${query}"`);

    let session = null;
    
    try {
      // 1. Criar sessão no banco
      if (saveToDatabase) {
        session = await this.databaseService.createSearchSession(query, {
          options,
          startTime: new Date().toISOString()
        });
      }

      // 2. Gerar termos de busca usando LLM
      const searchTermsData = await this.generateSearchTerms(query);
      logger.info(`Termos gerados: ${searchTermsData.search_terms.length}`);

      // 3. Busca web com múltiplos termos
      const webResults = await this.performWebSearch(searchTermsData.search_terms, {
        maxResults: maxSources,
        useAdvancedSearch
      });

      // 4. Análise do conteúdo com LLM
      const analysis = await this.analyzeContent(query, webResults, {
        generateEmbeddings,
        sessionId: session?.id
      });

      // 5. Gerar relatório final
      const report = await this.generateReport(query, analysis, {
        sessionId: session?.id
      });

      // 6. Atualizar sessão como concluída
      if (session) {
        await this.databaseService.updateSearchSession(
          session.id, 
          'completed', 
          {
            ...session.metadata,
            completedTime: new Date().toISOString(),
            sourcesFound: webResults.sources.length,
            reportGenerated: !!report
          }
        );
      }

      return {
        sessionId: session?.id,
        query,
        searchTerms: searchTermsData,
        webResults,
        analysis,
        report
      };

    } catch (error) {
      logger.error('Erro durante deep search', error);
      
      // Marcar sessão como erro
      if (session) {
        await this.databaseService.updateSearchSession(
          session.id,
          'error',
          {
            ...session.metadata,
            error: error.message,
            errorTime: new Date().toISOString()
          }
        );
      }
      
      throw error;
    }
  }

  /**
   * Gera termos de busca usando LLM
   */
  async generateSearchTerms(query) {
    try {
      const searchTermsData = await this.llmService.generateSearchTerms(query);
      
      logger.debug(`Termos de busca gerados:`, searchTermsData);
      return searchTermsData;
      
    } catch (error) {
      logger.error('Erro ao gerar termos de busca', error);
      
      // Fallback simples
      return {
        original_query: query,
        search_terms: [query],
        categories: ['geral']
      };
    }
  }

  /**
   * Executa busca web
   */
  async performWebSearch(searchTerms, options = {}) {
    const {
      maxResults = config.search.maxResults,
      useAdvancedSearch = true
    } = options;

    logger.info('Iniciando busca web', { termsCount: searchTerms.length });

    try {
      let searchResults = [];

      if (useAdvancedSearch) {
        // Usa dorks para busca avançada no primeiro termo
        const primaryTerm = searchTerms[0];
        const dorkResults = await this.webSearchService.searchWithDorks(primaryTerm, {
          maxResults: Math.ceil(maxResults / 2)
        });
        searchResults.push(...dorkResults);

        // Busca normal nos outros termos
        const otherTerms = searchTerms.slice(1);
        if (otherTerms.length > 0) {
          const normalResults = await this.webSearchService.multiSearch(otherTerms, {
            maxResults: Math.ceil(maxResults / 2)
          });
          searchResults.push(...normalResults);
        }
      } else {
        // Busca normal em todos os termos
        searchResults = await this.webSearchService.multiSearch(searchTerms, {
          maxResults
        });
      }

      logger.info(`Encontrados ${searchResults.length} resultados de busca`);

      // Scraping do conteúdo das páginas
      const scrapedContent = await this.webSearchService.scrapeContent(searchResults);
      
      logger.info(`Scraping concluído: ${scrapedContent.length} páginas processadas`);

      // Estatísticas
      const stats = await this.webSearchService.getSearchStats(scrapedContent);

      return {
        searchTerms,
        sources: scrapedContent,
        stats
      };

    } catch (error) {
      logger.error('Erro durante busca web', error);
      throw new Error(`Falha na busca web: ${error.message}`);
    }
  }

  /**
   * Analisa conteúdo usando LLM
   */
  async analyzeContent(query, webResults, options = {}) {
    const {
      generateEmbeddings = true,
      sessionId = null
    } = options;

    logger.info(`Analisando ${webResults.sources.length} fontes`);

    const analyses = [];
    const embeddings = [];

    try {
      // Processa fontes em lotes
      const batchSize = config.performance.parallelProcessingLimit;
      const batches = this.chunkArray(webResults.sources, batchSize);

      for (const batch of batches) {
        const batchPromises = batch.map(source => 
          this.analyzeSingleSource(query, source, {
            generateEmbeddings,
            sessionId
          })
        );

        const batchResults = await Promise.all(batchPromises);
        analyses.push(...batchResults.filter(result => result !== null));
        
        // Pequena pausa entre lotes
        await this.sleep(1000);
      }

      // Análise consolidada usando LLM
      const consolidatedAnalysis = await this.consolidateAnalyses(query, analyses);

      return {
        individualAnalyses: analyses,
        consolidatedAnalysis,
        totalSources: webResults.sources.length,
        successfulAnalyses: analyses.length
      };

    } catch (error) {
      logger.error('Erro durante análise de conteúdo', error);
      throw error;
    }
  }

  /**
   * Analisa uma fonte individual
   */
  async analyzeSingleSource(query, source, options = {}) {
    const { generateEmbeddings = true, sessionId = null } = options;

    try {
      // Análise com LLM
      const analysis = await this.llmService.analyzeWebContent(source.content, query);
      
      let embedding = null;
      
      // Gera embedding se solicitado
      if (generateEmbeddings && analysis.relevance_score > 30) {
        const contentForEmbedding = `${source.title}\n\n${source.content}`.substring(0, 8000);
        const contentHash = crypto.createHash('md5').update(contentForEmbedding).digest('hex');
        
        // Verifica cache primeiro
        const cached = await this.databaseService.getCachedEmbedding(contentHash);
        
        if (cached && cached.embedding) {
          embedding = cached.embedding;
          logger.debug(`Embedding encontrado em cache para ${source.domain}`);
        } else {
          try {
            const embeddingResult = await this.llmService.generateEmbedding(contentForEmbedding);
            embedding = embeddingResult.embedding;
            
            // Salva no cache
            await this.databaseService.cacheEmbedding(
              contentHash, 
              contentForEmbedding.substring(0, 500),
              embedding,
              embeddingResult.model
            );
          } catch (embeddingError) {
            logger.warn(`Erro ao gerar embedding para ${source.url}`, embeddingError);
          }
        }
      }

      // Salva no banco se há sessão ativa
      if (sessionId) {
        await this.databaseService.saveWebSource(sessionId, {
          ...source,
          summary: analysis.summary
        }, embedding);
      }

      return {
        source,
        analysis,
        embedding: embedding ? embedding.slice(0, 10) + '...' : null, // Trunca para log
        processingTime: Date.now()
      };

    } catch (error) {
      logger.error(`Erro ao analisar fonte ${source.url}`, error);
      return null;
    }
  }

  /**
   * Consolida análises individuais
   */
  async consolidateAnalyses(query, analyses) {
    try {
      // Prepara dados para consolidação
      const summaryData = {
        query,
        totalSources: analyses.length,
        highRelevanceSources: analyses.filter(a => a.analysis.relevance_score >= 70).length,
        mediumRelevanceSources: analyses.filter(a => a.analysis.relevance_score >= 40 && a.analysis.relevance_score < 70).length,
        lowRelevanceSources: analyses.filter(a => a.analysis.relevance_score < 40).length,
        topKeyPoints: [],
        topInsights: [],
        topTopics: [],
        sources: analyses.map(a => ({
          url: a.source.url,
          domain: a.source.domain,
          title: a.source.title,
          relevance: a.analysis.relevance_score,
          credibility: a.analysis.credibility_score,
          summary: a.analysis.summary
        }))
      };

      // Consolida pontos-chave
      const allKeyPoints = analyses.flatMap(a => a.analysis.key_points || []);
      summaryData.topKeyPoints = this.getTopItems(allKeyPoints, 10);

      // Consolida insights
      const allInsights = analyses.flatMap(a => a.analysis.insights || []);
      summaryData.topInsights = this.getTopItems(allInsights, 10);

      // Consolida tópicos
      const allTopics = analyses.flatMap(a => a.analysis.topics || []);
      summaryData.topTopics = this.getTopItems(allTopics, 10);

      return summaryData;

    } catch (error) {
      logger.error('Erro ao consolidar análises', error);
      throw error;
    }
  }

  /**
   * Gera relatório final
   */
  async generateReport(query, analysis, options = {}) {
    const { sessionId = null } = options;

    try {
      logger.info('Gerando relatório final');

      // Gera conteúdo do relatório usando LLM
      const reportContent = await this.llmService.generateFinalReport(query, analysis);

      // Cria nome do arquivo
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[:\-T]/g, '');
      const querySlug = query.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, '_') // Substitui espaços por underscore
        .substring(0, 50);
      
      const filename = `${timestamp}_${querySlug}.md`;
      const filepath = path.join(config.reports.dir, filename);

      const report = {
        title: this.generateReportTitle(query),
        content: reportContent,
        filename,
        filepath,
        query,
        timestamp: new Date().toISOString(),
        sourceCount: analysis.totalSources,
        successfulAnalyses: analysis.successfulAnalyses
      };

      // Salva no banco se há sessão
      if (sessionId) {
        await this.databaseService.saveReport(sessionId, {
          title: report.title,
          content: reportContent,
          file_path: filepath
        });
      }

      logger.info(`Relatório gerado: ${filename}`);
      return report;

    } catch (error) {
      logger.error('Erro ao gerar relatório', error);
      throw error;
    }
  }

  /**
   * Busca vetorial por conteúdo similar
   */
  async vectorSearch(query, options = {}) {
    const { limit = 10, threshold = 0.7 } = options;

    try {
      // Gera embedding da query
      const queryEmbedding = await this.llmService.generateEmbedding(query);
      
      // Busca similar no banco
      const results = await this.databaseService.vectorSearch(
        queryEmbedding.embedding,
        { limit, threshold }
      );

      return {
        query,
        results,
        totalFound: results.length
      };

    } catch (error) {
      logger.error('Erro na busca vetorial', error);
      throw error;
    }
  }

  /**
   * Histórico de buscas
   */
  async getSearchHistory(limit = 10) {
    try {
      return await this.databaseService.getSearchHistory(limit);
    } catch (error) {
      logger.error('Erro ao obter histórico', error);
      throw error;
    }
  }

  /**
   * Detalhes de uma sessão
   */
  async getSessionDetails(sessionId) {
    try {
      return await this.databaseService.getSessionDetails(sessionId);
    } catch (error) {
      logger.error('Erro ao obter detalhes da sessão', error);
      throw error;
    }
  }

  /**
   * Verifica saúde do banco
   */
  async databaseHealth() {
    try {
      return await this.databaseService.healthCheck();
    } catch (error) {
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Métodos utilitários
   */
  generateReportTitle(query) {
    const words = query.split(' ');
    const titleWords = words.slice(0, 8).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
    return titleWords.join(' ');
  }

  getTopItems(items, limit = 10) {
    const itemCounts = {};
    items.forEach(item => {
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    });
    
    return Object.entries(itemCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([item, count]) => ({ item, count }));
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DeepSearchOrchestrator;
