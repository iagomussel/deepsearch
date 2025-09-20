/**
 * Serviço para comunicação com modelos LLM locais via Ollama
 */

const axios = require('axios');
const config = require('../../config/default');
const logger = require('../utils/logger');

class LLMService {
  constructor() {
    this.baseUrl = config.llm.baseUrl;
    this.defaultModel = config.llm.defaultModel;
    this.embeddingModel = config.llm.embeddingModel;
    this.codeModel = config.llm.codeModel;
    this.timeout = config.llm.timeout;
    
    // Cliente axios configurado
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Verifica se o serviço está funcionando
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];
      
      return {
        status: 'ok',
        message: `${models.length} modelos disponíveis`,
        models: models.map(m => m.name)
      };
    } catch (error) {
      logger.error('LLM Health check failed', error);
      return {
        status: 'error',
        message: `Erro ao conectar com Ollama: ${error.message}`
      };
    }
  }

  /**
   * Lista modelos disponíveis
   */
  async listModels() {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models.map(model => ({
        name: model.name,
        size: this.formatSize(model.size),
        modified: model.modified_at
      }));
    } catch (error) {
      logger.error('Erro ao listar modelos', error);
      throw new Error(`Erro ao listar modelos: ${error.message}`);
    }
  }

  /**
   * Gera resposta usando um modelo específico
   */
  async generateResponse(prompt, options = {}) {
    const {
      model = this.defaultModel,
      system = null,
      temperature = 0.7,
      maxTokens = 4000,
      stream = false
    } = options;

    try {
      const payload = {
        model,
        prompt,
        system,
        options: {
          temperature,
          num_predict: maxTokens
        },
        stream
      };

      logger.info(`Gerando resposta com modelo ${model}`, { 
        promptLength: prompt.length,
        temperature,
        maxTokens
      });

      const startTime = Date.now();
      const response = await this.client.post('/api/generate', payload);
      const processingTime = Date.now() - startTime;

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      logger.info(`Resposta gerada em ${processingTime}ms`, {
        model,
        responseLength: response.data.response?.length
      });

      return {
        response: response.data.response,
        model,
        processingTime,
        tokenCount: this.estimateTokens(response.data.response),
        done: response.data.done
      };

    } catch (error) {
      logger.error('Erro ao gerar resposta', error);
      throw new Error(`Erro ao gerar resposta: ${error.message}`);
    }
  }

  /**
   * Gera embeddings para texto
   */
  async generateEmbedding(text, model = this.embeddingModel) {
    try {
      const response = await this.client.post('/api/embeddings', {
        model,
        prompt: text
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        embedding: response.data.embedding,
        model,
        textLength: text.length
      };

    } catch (error) {
      logger.error('Erro ao gerar embedding', error);
      throw new Error(`Erro ao gerar embedding: ${error.message}`);
    }
  }

  /**
   * Gera termos de busca baseados na query
   */
  async generateSearchTerms(query) {
    const prompt = `
Análise a seguinte consulta e gere termos de busca otimizados para encontrar informações relevantes na web:

Consulta: "${query}"

Instruções:
1. Gere entre 5-10 termos de busca relacionados
2. Inclua sinônimos e variações da consulta original
3. Considere termos técnicos e populares
4. Formate como lista JSON

Responda apenas com o JSON no formato:
{
  "original_query": "consulta original",
  "search_terms": ["termo1", "termo2", "termo3", ...],
  "categories": ["categoria1", "categoria2", ...]
}`;

    try {
      const result = await this.generateResponse(prompt, {
        temperature: 0.3,
        maxTokens: 1000
      });

      // Tenta parsear JSON da resposta
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: extrai termos manualmente
      return this.extractSearchTermsFallback(query, result.response);

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
   * Analisa e resume conteúdo web
   */
  async analyzeWebContent(content, query) {
    const prompt = `
Analise o seguinte conteúdo web no contexto da consulta "${query}":

CONTEÚDO:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncado]' : ''}

Instruções:
1. Extraia informações relevantes para a consulta
2. Identifique pontos-chave e insights
3. Avalie a credibilidade da fonte
4. Gere um resumo estruturado

Responda no formato JSON:
{
  "relevance_score": 0-100,
  "key_points": ["ponto1", "ponto2", ...],
  "summary": "resumo do conteúdo",
  "insights": ["insight1", "insight2", ...],
  "credibility_score": 0-100,
  "topics": ["tópico1", "tópico2", ...]
}`;

    try {
      const result = await this.generateResponse(prompt, {
        temperature: 0.2,
        maxTokens: 2000
      });

      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Resposta inválida do LLM');

    } catch (error) {
      logger.error('Erro ao analisar conteúdo web', error);
      return {
        relevance_score: 50,
        key_points: ['Conteúdo disponível para análise'],
        summary: content.substring(0, 500) + '...',
        insights: [],
        credibility_score: 50,
        topics: ['geral']
      };
    }
  }

  /**
   * Gera relatório final baseado na análise
   */
  async generateFinalReport(query, analysisData) {
    const prompt = `
Crie um relatório detalhado baseado na pesquisa sobre: "${query}"

DADOS DA ANÁLISE:
${JSON.stringify(analysisData, null, 2)}

Instruções:
1. Crie um relatório estruturado em Markdown
2. Inclua seções: Introdução, Principais Descobertas, Insights, Conclusões
3. Use formatação Markdown apropriada
4. Cite as fontes quando relevante
5. Mantenha tom profissional mas acessível

Responda apenas com o conteúdo Markdown do relatório.`;

    try {
      const result = await this.generateResponse(prompt, {
        temperature: 0.4,
        maxTokens: 6000,
        system: 'Você é um especialista em pesquisa que cria relatórios detalhados e bem estruturados.'
      });

      return result.response;

    } catch (error) {
      logger.error('Erro ao gerar relatório final', error);
      throw new Error(`Erro ao gerar relatório: ${error.message}`);
    }
  }

  /**
   * Métodos utilitários
   */
  formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  estimateTokens(text) {
    // Estimativa grosseira: ~4 chars por token
    return Math.ceil(text.length / 4);
  }

  extractSearchTermsFallback(query, response) {
    // Extrai termos da resposta de forma simples
    const terms = new Set([query]);
    
    // Busca por listas ou enumerações na resposta
    const matches = response.match(/["']([^"']+)["']/g);
    if (matches) {
      matches.forEach(match => {
        const term = match.replace(/["']/g, '').trim();
        if (term.length > 2 && term.length < 50) {
          terms.add(term);
        }
      });
    }

    return {
      original_query: query,
      search_terms: Array.from(terms).slice(0, 10),
      categories: ['geral']
    };
  }
}

module.exports = LLMService;
