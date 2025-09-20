/**
 * Serviço para busca web usando DuckDuckGo e scraping de conteúdo
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const config = require('../../config/default');
const logger = require('../utils/logger');

class WebSearchService {
  constructor() {
    this.searchConfig = config.search;
    this.timeout = this.searchConfig.timeout;
    this.maxResults = this.searchConfig.maxResults;
    this.maxConcurrentScrapes = this.searchConfig.maxConcurrentScrapes;
    this.userAgent = this.searchConfig.userAgent;

    // Cliente axios configurado para buscas
    this.searchClient = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Cliente para scraping de conteúdo
    this.scrapeClient = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  }

  /**
   * Busca no DuckDuckGo
   */
  async searchDuckDuckGo(query, options = {}) {
    const {
      maxResults = this.maxResults,
      safeSearch = this.searchConfig.duckduckgo.safeSearch,
      region = this.searchConfig.duckduckgo.region
    } = options;

    try {
      logger.info(`Buscando no DuckDuckGo: "${query}"`);

      // DuckDuckGo Instant Answer API
      const searchUrl = 'https://html.duckduckgo.com/html/';
      
      const params = {
        q: query,
        kl: region,
        safe: safeSearch,
        s: '0',
        dc: maxResults
      };

      const response = await this.searchClient.get(searchUrl, { params });
      const results = this.parseDuckDuckGoResults(response.data);

      logger.info(`Encontrados ${results.length} resultados para "${query}"`);
      
      return results.slice(0, maxResults);

    } catch (error) {
      logger.error('Erro na busca DuckDuckGo', error);
      return [];
    }
  }

  /**
   * Busca com múltiplos termos
   */
  async multiSearch(searchTerms, options = {}) {
    const allResults = [];
    const seenUrls = new Set();

    for (const term of searchTerms) {
      try {
        const results = await this.searchDuckDuckGo(term, options);
        
        // Deduplica resultados por URL
        for (const result of results) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url);
            allResults.push({
              ...result,
              searchTerm: term
            });
          }
        }

        // Pequena pausa entre buscas para evitar rate limiting
        await this.sleep(1000);

      } catch (error) {
        logger.error(`Erro ao buscar termo "${term}"`, error);
      }
    }

    logger.info(`Total de ${allResults.length} resultados únicos encontrados`);
    return allResults;
  }

  /**
   * Scraping de conteúdo das páginas
   */
  async scrapeContent(urls) {
    const results = [];
    const chunks = this.chunkArray(urls, this.maxConcurrentScrapes);

    for (const chunk of chunks) {
      const promises = chunk.map(urlInfo => 
        this.scrapePage(urlInfo).catch(error => {
          logger.error(`Erro ao fazer scraping de ${urlInfo.url}`, error);
          return null;
        })
      );

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults.filter(result => result !== null));

      // Pausa entre chunks
      await this.sleep(500);
    }

    return results;
  }

  /**
   * Scraping de uma página individual
   */
  async scrapePage(urlInfo) {
    try {
      // Verificações de segurança
      if (!this.isAllowedDomain(urlInfo.url)) {
        logger.warn(`Domínio não permitido: ${urlInfo.url}`);
        return null;
      }

      logger.debug(`Fazendo scraping: ${urlInfo.url}`);
      
      const response = await this.scrapeClient.get(urlInfo.url, {
        maxRedirects: 5,
        validateStatus: status => status < 400
      });

      if (!response.data) {
        throw new Error('Resposta vazia');
      }

      const $ = cheerio.load(response.data);
      
      // Remove elementos desnecessários
      $('script, style, nav, footer, header, aside, .ads, .advertisement').remove();

      // Extrai conteúdo
      const title = $('title').text().trim() || urlInfo.title || '';
      const description = $('meta[name="description"]').attr('content') || '';
      
      // Tenta extrair o conteúdo principal
      let content = '';
      const contentSelectors = [
        'article',
        '[role="main"]',
        '.content',
        '.post-content',
        '.entry-content',
        'main',
        '#content',
        '.main-content'
      ];

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length && element.text().length > content.length) {
          content = element.text();
        }
      }

      // Fallback para body se não encontrou conteúdo específico
      if (!content || content.length < 100) {
        content = $('body').text();
      }

      // Limpa e normaliza o conteúdo
      content = this.cleanContent(content);

      if (content.length < 100) {
        logger.warn(`Conteúdo muito pequeno para ${urlInfo.url}`);
        return null;
      }

      // Extrai domain info
      const urlObj = new URL(urlInfo.url);
      const domain = urlObj.hostname;

      const result = {
        url: urlInfo.url,
        title: title.substring(0, 500),
        description: description.substring(0, 1000),
        content: content.substring(0, config.performance.maxContentLength),
        domain,
        searchTerm: urlInfo.searchTerm,
        scrapedAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).length,
        contentLength: content.length
      };

      logger.debug(`Scraping concluído: ${domain} (${result.wordCount} palavras)`);
      return result;

    } catch (error) {
      logger.error(`Erro no scraping de ${urlInfo.url}`, error);
      return null;
    }
  }

  /**
   * Parseia resultados do DuckDuckGo HTML
   */
  parseDuckDuckGoResults(html) {
    const results = [];
    const $ = cheerio.load(html);

    // Busca por resultados orgânicos
    $('.result').each((index, element) => {
      try {
        const $result = $(element);
        
        const titleElement = $result.find('.result__title a');
        const title = titleElement.text().trim();
        const url = titleElement.attr('href');
        
        const snippet = $result.find('.result__snippet').text().trim();
        
        if (title && url) {
          results.push({
            title,
            url: this.normalizeUrl(url),
            snippet,
            source: 'duckduckgo'
          });
        }
      } catch (error) {
        logger.error('Erro ao parsear resultado DuckDuckGo', error);
      }
    });

    return results;
  }

  /**
   * Busca avançada com dorks
   */
  async searchWithDorks(baseQuery, options = {}) {
    const dorks = [
      `"${baseQuery}"`,                    // Busca exata
      `${baseQuery} filetype:pdf`,         // PDFs
      `${baseQuery} site:wikipedia.org`,   // Wikipedia
      `${baseQuery} site:edu`,             // Sites educacionais  
      `${baseQuery} site:org`,             // Organizações
      `${baseQuery} inurl:blog`,           // Blogs
      `${baseQuery} intitle:"${baseQuery}"` // No título
    ];

    const allResults = [];
    
    for (const dork of dorks) {
      try {
        const results = await this.searchDuckDuckGo(dork, {
          ...options,
          maxResults: Math.ceil(this.maxResults / dorks.length)
        });
        
        allResults.push(...results.map(result => ({
          ...result,
          dork: dork,
          searchTerm: baseQuery
        })));

        await this.sleep(2000); // Pausa maior entre dorks
        
      } catch (error) {
        logger.error(`Erro com dork "${dork}"`, error);
      }
    }

    // Remove duplicatas
    const uniqueResults = [];
    const seenUrls = new Set();
    
    for (const result of allResults) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        uniqueResults.push(result);
      }
    }

    return uniqueResults;
  }

  /**
   * Métodos utilitários
   */
  cleanContent(content) {
    return content
      .replace(/\s+/g, ' ')           // Múltiplos espaços em um
      .replace(/\n+/g, '\n')          // Múltiplas quebras em uma
      .replace(/[^\S\n]+/g, ' ')      // Remove espaços especiais exceto \n
      .trim();
  }

  normalizeUrl(url) {
    try {
      // DuckDuckGo às vezes retorna URLs com redirects
      if (url.includes('/l/?uddg=')) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      
      return new URL(url).href;
    } catch (error) {
      return url;
    }
  }

  isAllowedDomain(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Verifica domínios bloqueados
      const blocked = config.security.blockedDomains;
      for (const blockedPattern of blocked) {
        if (blockedPattern.includes('*')) {
          const regex = new RegExp(blockedPattern.replace(/\*/g, '.*'));
          if (regex.test(domain)) return false;
        } else if (domain.includes(blockedPattern)) {
          return false;
        }
      }

      // Verifica domínios permitidos
      const allowed = config.security.allowedDomains;
      if (allowed.includes('*')) return true;
      
      return allowed.some(allowedPattern => {
        if (allowedPattern.includes('*')) {
          const regex = new RegExp(allowedPattern.replace(/\*/g, '.*'));
          return regex.test(domain);
        }
        return domain.includes(allowedPattern);
      });

    } catch (error) {
      return false;
    }
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

  /**
   * Estatísticas de busca
   */
  async getSearchStats(results) {
    const stats = {
      totalResults: results.length,
      domains: {},
      averageContentLength: 0,
      totalWords: 0,
      topDomains: []
    };

    let totalContentLength = 0;
    let totalWords = 0;

    results.forEach(result => {
      // Domínios
      const domain = result.domain || 'unknown';
      stats.domains[domain] = (stats.domains[domain] || 0) + 1;

      // Conteúdo
      if (result.contentLength) {
        totalContentLength += result.contentLength;
      }
      if (result.wordCount) {
        totalWords += result.wordCount;
      }
    });

    stats.averageContentLength = Math.round(totalContentLength / results.length);
    stats.totalWords = totalWords;

    // Top domínios
    stats.topDomains = Object.entries(stats.domains)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    return stats;
  }
}

module.exports = WebSearchService;
