#!/usr/bin/env node

/**
 * DeepSearch CLI - Interface principal
 * Exemplo de uso: node index.js "faça uma pesquisa sobre harmonização sonora"
 */

const { program } = require('commander');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');

// Cores simples compatíveis (sem chalk ES modules issue)
const colors = {
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`, 
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

// Spinner simples
class SimpleSpinner {
  constructor(text) {
    this.text = text;
    this.interval = null;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.current = 0;
  }
  
  start() {
    process.stdout.write(`${this.frames[0]} ${this.text}`);
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.current]} ${this.text}`);
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
    return this;
  }
  
  succeed(text) {
    if (this.interval) clearInterval(this.interval);
    process.stdout.write(`\r${text}\n`);
  }
  
  fail(text) {
    if (this.interval) clearInterval(this.interval);
    process.stdout.write(`\r${text}\n`);
  }
}

const ora = (text) => new SimpleSpinner(text);

const DeepSearchOrchestrator = require('./src/services/DeepSearchOrchestrator');
const LLMService = require('./src/services/LLMService');
const config = require('./config/default');
const logger = require('./src/utils/logger');

class DeepSearchCLI {
  constructor() {
    this.orchestrator = new DeepSearchOrchestrator();
    this.llmService = new LLMService();
    this.spinner = null;
  }

  async init() {
    // Verifica se os diretórios necessários existem
    await fs.ensureDir(config.reports.dir);
    await fs.ensureDir('./logs');
    await fs.ensureDir('./temp');

    logger.info('DeepSearch CLI inicializado');
  }

  async checkServices() {
    this.spinner = ora('Checkando LLM local...').start();
    
    try {
      const health = await this.llmService.healthCheck();
      if (health.status === 'ok') {
        this.spinner.succeed(colors.green('✅ LLM local conectado'));
      } else {
        throw new Error(health.message);
      }
    } catch (error) {
      this.spinner.fail(colors.red('❌ Erro ao conectar com LLM local'));
      console.log(colors.yellow('💡 Certifique-se que o Ollama está rodando: docker-compose up ollama'));
      process.exit(1);
    }
  }

  async performDeepSearch(query) {
    console.log(colors.blue(`\n🔍 Iniciando busca profunda para: "${query}"\n`));

    try {
      // 1. Gerar termos de busca
      this.spinner = ora('Encontrando termos de busca...').start();
      const searchTermsData = await this.orchestrator.generateSearchTerms(query);
      this.spinner.succeed(`Gerados ${searchTermsData.search_terms?.length || 0} termos de busca`);

      // 2. Busca web
      this.spinner = ora('Pesquisando na web...').start();
      const searchResults = await this.orchestrator.performWebSearch(searchTermsData.search_terms);
      this.spinner.succeed(`Pesquisando em ${searchResults.sources.length} sites...`);

      // 3. Análise e contextualização
      this.spinner = ora('Analisando conteúdo com LLM...').start();
      const analysis = await this.orchestrator.analyzeContent(query, searchResults);
      this.spinner.succeed('Análise concluída');

      // 4. Gerar relatório
      this.spinner = ora('Gerando relatório...').start();
      const report = await this.orchestrator.generateReport(query, analysis);
      
      const reportPath = path.join(config.reports.dir, report.filename);
      await fs.writeFile(reportPath, report.content, 'utf8');
      
      this.spinner.succeed(colors.green(`Relatório pronto: "${path.resolve(reportPath)}"`));

      return report;

    } catch (error) {
      if (this.spinner) {
        this.spinner.fail(colors.red('❌ Erro durante a busca'));
      }
      console.error(colors.red(`Erro: ${error.message}`));
      logger.error('Erro durante deep search', error);
      throw error;
    }
  }

  async interactiveMode() {
    console.log(colors.cyan('\n🤖 Modo interativo iniciado\n'));
    console.log(colors.gray('Digite suas sugestões ou \\q para encerrar'));

    while (true) {
      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: colors.blue(':>'),
          prefix: ''
        }
      ]);

      if (input.trim() === '\\q' || input.trim().toLowerCase() === 'quit') {
        console.log(colors.yellow('👋 Até mais!'));
        break;
      }

      if (input.trim().length === 0) {
        continue;
      }

      try {
        // Processa comandos especiais
        if (input.startsWith('/')) {
          await this.handleCommand(input);
        } else {
          // Nova pesquisa
          await this.performDeepSearch(input);
        }
      } catch (error) {
        console.error(colors.red(`❌ ${error.message}`));
      }
    }
  }

  async handleCommand(command) {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;
      
      case 'status':
        await this.showStatus();
        break;
      
      case 'models':
        await this.listModels();
        break;
      
      case 'history':
        await this.showHistory(parseInt(args[0]) || 10);
        break;
      
      default:
        console.log(colors.red(`Comando desconhecido: ${cmd}`));
        this.showHelp();
    }
  }

  showHelp() {
    console.log(colors.cyan(`
📖 Comandos disponíveis:
  /help      - Mostra esta ajuda
  /status    - Status dos serviços
  /models    - Lista modelos LLM disponíveis
  /history   - Histórico de pesquisas
  \\q         - Sair
    `));
  }

  async showStatus() {
    const spinner = ora('Verificando status...').start();
    
    try {
      const llmHealth = await this.llmService.healthCheck();
      const dbHealth = await this.orchestrator.databaseHealth();
      
      spinner.stop();
      
      console.log(colors.cyan('\n📊 Status dos Serviços:'));
      console.log(`LLM Local: ${llmHealth.status === 'ok' ? '✅' : '❌'} ${llmHealth.message}`);
      console.log(`Banco de Dados: ${dbHealth.status === 'ok' ? '✅' : '❌'} ${dbHealth.message}`);
      
    } catch (error) {
      spinner.fail('Erro ao verificar status');
      console.error(colors.red(error.message));
    }
  }

  async listModels() {
    const spinner = ora('Listando modelos...').start();
    
    try {
      const models = await this.llmService.listModels();
      spinner.stop();
      
      console.log(colors.cyan('\n🤖 Modelos LLM Disponíveis:'));
      models.forEach(model => {
        console.log(colors.green(`  • ${model.name} (${model.size})`));
      });
      
    } catch (error) {
      spinner.fail('Erro ao listar modelos');
      console.error(colors.red(error.message));
    }
  }

  async showHistory(limit = 10) {
    try {
      const history = await this.orchestrator.getSearchHistory(limit);
      
      console.log(colors.cyan(`\n📜 Histórico (${history.length} pesquisas):`));
      history.forEach((search, index) => {
        const date = new Date(search.timestamp).toLocaleString('pt-BR');
        console.log(colors.gray(`${index + 1}. [${date}] ${search.query}`));
      });
      
    } catch (error) {
      console.error(colors.red(`Erro ao obter histórico: ${error.message}`));
    }
  }
}

// Configuração do CLI
program
  .version('1.0.0')
  .description('DeepSearch - Sistema de pesquisa profunda com LLMs locais')
  .argument('[query]', 'Query de pesquisa')
  .option('-i, --interactive', 'Modo interativo')
  .option('-v, --verbose', 'Log detalhado')
  .action(async (query, options) => {
    const cli = new DeepSearchCLI();
    
    try {
      await cli.init();
      await cli.checkServices();

      if (query) {
        // Executa pesquisa direta
        await cli.performDeepSearch(query);
        
        if (options.interactive) {
          await cli.interactiveMode();
        }
      } else {
        // Sempre entra no modo interativo se não há query
        await cli.interactiveMode();
      }
      
    } catch (error) {
      console.error(colors.red(`❌ Erro fatal: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Tratamento de sinais
process.on('SIGINT', () => {
  console.log(colors.yellow('\n👋 Encerrando DeepSearch...'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(colors.red('❌ Erro não tratado:'), error.message);
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Executa o programa
if (require.main === module) {
  program.parse();
}
