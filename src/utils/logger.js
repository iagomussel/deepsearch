/**
 * Sistema de logging configurável
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../../config/default');

// Garante que o diretório de logs existe
const logDir = path.dirname(config.logging.file);
fs.ensureDirSync(logDir);

// Formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Configuração do logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // Console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // Arquivo
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      tailable: true
    }),
    
    // Arquivo de erros separado
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      tailable: true
    })
  ]
});

// Adiciona transporte para debug em desenvolvimento
if (config.api.env === 'development') {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'debug.log'),
    level: 'debug',
    maxsize: '5mb',
    maxFiles: 3,
    tailable: true
  }));
}

module.exports = logger;
