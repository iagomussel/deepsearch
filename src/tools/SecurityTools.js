/**
 * Ferramentas seguras para operações de sistema, web-search e fetch
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');

const config = require('../../config/default');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

class SecurityTools {
  constructor() {
    this.allowedCommands = [
      'ls', 'dir', 'pwd', 'whoami', 'date', 'echo',
      'cat', 'head', 'tail', 'wc', 'grep', 'find'
    ];
    
    this.blockedPatterns = [
      'rm ', 'del ', 'format', 'mkfs',
      'dd ', 'fdisk', 'parted',
      'kill', 'killall', 'pkill',
      'chmod +x', 'su ', 'sudo ',
      'wget', 'curl -', 'nc ', 'netcat',
      '&', '|', ';', '>', '>>', '<',
      '$', '`', '$(', '\\', '"', "'"
    ];

    // Cliente HTTP seguro
    this.httpClient = axios.create({
      timeout: config.search.timeout,
      maxRedirects: 3,
      headers: {
        'User-Agent': config.search.userAgent
      }
    });
  }

  /**
   * Executa comandos shell de forma segura
   */
  async executeShellCommand(command, options = {}) {
    const { allowDangerous = false, cwd = process.cwd() } = options;

    // Verifica se shell tools estão habilitadas
    if (!config.security.enableShellTools && !allowDangerous) {
      throw new Error('Shell tools are disabled for security reasons');
    }

    try {
      // Limpa e valida o comando
      const cleanCommand = this.sanitizeCommand(command);
      
      if (!allowDangerous) {
        this.validateCommand(cleanCommand);
      }

      logger.info(`Executing shell command: ${cleanCommand}`, { cwd });

      const result = await execAsync(cleanCommand, {
        cwd,
        timeout: 30000, // 30 segundos máximo
        maxBuffer: 1024 * 1024, // 1MB máximo
        env: {
          ...process.env,
          PATH: process.env.PATH // Mantém PATH mas limita outras vars
        }
      });

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        command: cleanCommand
      };

    } catch (error) {
      logger.error('Shell command execution failed', error);
      
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        command: command
      };
    }
  }

  /**
   * Fetch seguro de URLs
   */
  async secureFetch(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      data = null,
      timeout = config.search.timeout,
      maxSize = 10 * 1024 * 1024, // 10MB max
      allowedContentTypes = ['text/', 'application/json', 'application/xml']
    } = options;

    try {
      // Valida URL
      const urlObj = this.validateUrl(url);
      
      logger.info(`Secure fetch: ${method} ${url}`);

      const response = await this.httpClient({
        method,
        url: urlObj.href,
        headers: {
          ...headers,
          'Accept': allowedContentTypes.join(', ')
        },
        data,
        timeout,
        maxContentLength: maxSize,
        maxBodyLength: maxSize,
        validateStatus: status => status < 500 // Permite 4xx mas não 5xx
      });

      // Valida content type
      const contentType = response.headers['content-type'] || '';
      const isAllowedType = allowedContentTypes.some(type => 
        contentType.toLowerCase().startsWith(type)
      );

      if (!isAllowedType) {
        throw new Error(`Content type not allowed: ${contentType}`);
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: response.config.url,
        contentType
      };

    } catch (error) {
      logger.error('Secure fetch failed', error);
      
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        statusText: error.response?.statusText || '',
        url
      };
    }
  }

  /**
   * Download seguro de arquivos
   */
  async secureDownload(url, destination, options = {}) {
    const {
      maxSize = 50 * 1024 * 1024, // 50MB max
      allowedExtensions = ['.txt', '.json', '.xml', '.csv', '.pdf', '.md'],
      overwrite = false
    } = options;

    try {
      // Valida URL e destino
      const urlObj = this.validateUrl(url);
      const safePath = this.validatePath(destination);

      // Verifica extensão
      const ext = path.extname(safePath).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        throw new Error(`File extension not allowed: ${ext}`);
      }

      // Verifica se arquivo já existe
      if (!overwrite && await fs.pathExists(safePath)) {
        throw new Error(`File already exists: ${safePath}`);
      }

      logger.info(`Secure download: ${url} -> ${safePath}`);

      const response = await this.httpClient({
        method: 'GET',
        url: urlObj.href,
        responseType: 'stream',
        timeout: 60000, // 1 minuto para downloads
        maxContentLength: maxSize
      });

      // Cria diretório se não existe
      await fs.ensureDir(path.dirname(safePath));

      // Stream para arquivo
      const writer = fs.createWriteStream(safePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve({
            success: true,
            path: safePath,
            size: fs.statSync(safePath).size,
            url
          });
        });

        writer.on('error', error => {
          reject(error);
        });

        response.data.on('error', error => {
          reject(error);
        });
      });

    } catch (error) {
      logger.error('Secure download failed', error);
      
      return {
        success: false,
        error: error.message,
        url,
        destination
      };
    }
  }

  /**
   * Lista arquivos de forma segura
   */
  async secureListFiles(directory, options = {}) {
    const {
      maxDepth = 3,
      includeHidden = false,
      extensions = null // null = todos, array = filtrar
    } = options;

    try {
      const safePath = this.validatePath(directory);
      
      if (!await fs.pathExists(safePath)) {
        throw new Error(`Directory not found: ${safePath}`);
      }

      const stats = await fs.stat(safePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${safePath}`);
      }

      logger.debug(`Listing files in: ${safePath}`);

      const files = await this.listFilesRecursive(safePath, {
        maxDepth,
        includeHidden,
        extensions,
        currentDepth: 0
      });

      return {
        success: true,
        directory: safePath,
        files,
        count: files.length
      };

    } catch (error) {
      logger.error('Secure list files failed', error);
      
      return {
        success: false,
        error: error.message,
        directory
      };
    }
  }

  /**
   * Leitura segura de arquivos
   */
  async secureReadFile(filePath, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB max
      encoding = 'utf8'
    } = options;

    try {
      const safePath = this.validatePath(filePath);
      
      if (!await fs.pathExists(safePath)) {
        throw new Error(`File not found: ${safePath}`);
      }

      const stats = await fs.stat(safePath);
      
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${safePath}`);
      }

      if (stats.size > maxSize) {
        throw new Error(`File too large: ${stats.size} bytes (max ${maxSize})`);
      }

      logger.debug(`Reading file: ${safePath}`);

      const content = await fs.readFile(safePath, encoding);

      return {
        success: true,
        path: safePath,
        content,
        size: stats.size,
        modified: stats.mtime
      };

    } catch (error) {
      logger.error('Secure read file failed', error);
      
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  /**
   * Métodos de validação
   */
  sanitizeCommand(command) {
    return command
      .trim()
      .replace(/[\r\n]+/g, ' ') // Remove quebras de linha
      .replace(/\s+/g, ' '); // Normaliza espaços
  }

  validateCommand(command) {
    // Verifica comandos permitidos
    const firstWord = command.split(' ')[0];
    if (!this.allowedCommands.includes(firstWord)) {
      throw new Error(`Command not allowed: ${firstWord}`);
    }

    // Verifica padrões bloqueados
    for (const pattern of this.blockedPatterns) {
      if (command.includes(pattern)) {
        throw new Error(`Dangerous pattern detected: ${pattern}`);
      }
    }

    // Verifica tamanho
    if (command.length > 500) {
      throw new Error('Command too long');
    }
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);

      // Verifica protocolos permitidos
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error(`Protocol not allowed: ${urlObj.protocol}`);
      }

      // Verifica domínios bloqueados
      const hostname = urlObj.hostname.toLowerCase();
      const blockedDomains = config.security.blockedDomains;
      
      for (const blocked of blockedDomains) {
        if (blocked.includes('*')) {
          const regex = new RegExp(blocked.replace(/\*/g, '.*'));
          if (regex.test(hostname)) {
            throw new Error(`Domain blocked: ${hostname}`);
          }
        } else if (hostname.includes(blocked)) {
          throw new Error(`Domain blocked: ${hostname}`);
        }
      }

      return urlObj;
    } catch (error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  validatePath(filePath) {
    // Resolve path absoluto
    const resolved = path.resolve(filePath);
    
    // Verifica se está dentro de diretórios permitidos
    const allowedDirs = [
      process.cwd(),
      config.reports.dir,
      './temp',
      './logs'
    ].map(dir => path.resolve(dir));

    const isAllowed = allowedDirs.some(allowedDir => 
      resolved.startsWith(allowedDir)
    );

    if (!isAllowed) {
      throw new Error(`Path not allowed: ${resolved}`);
    }

    // Verifica traversal attacks
    if (resolved.includes('..') || resolved.includes('~')) {
      throw new Error(`Suspicious path: ${resolved}`);
    }

    return resolved;
  }

  async listFilesRecursive(directory, options) {
    const { maxDepth, includeHidden, extensions, currentDepth } = options;
    
    if (currentDepth >= maxDepth) {
      return [];
    }

    const files = [];
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      // Pula arquivos ocultos se não permitido
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (entry.isDirectory()) {
        // Recursão em diretórios
        const subFiles = await this.listFilesRecursive(fullPath, {
          ...options,
          currentDepth: currentDepth + 1
        });
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Filtro por extensão se especificado
        if (extensions) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extensions.includes(ext)) {
            continue;
          }
        }

        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: relativePath,
          size: stats.size,
          modified: stats.mtime,
          extension: path.extname(entry.name)
        });
      }
    }

    return files;
  }
}

module.exports = SecurityTools;
