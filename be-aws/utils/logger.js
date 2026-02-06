import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    // Skip file logging on Vercel/serverless (read-only filesystem)
    this.isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    this.logDir = './logs';
    
    if (!this.isServerless) {
      this.ensureLogDir();
    }
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  async writeToFile(filename, message) {
    // Skip file writing on serverless (Vercel logs capture console output)
    if (this.isServerless) return;
    
    try {
      const filePath = path.join(this.logDir, filename);
      // Using async appendFile to prevent blocking the event loop, which can cause 504 timeouts
      await fs.promises.appendFile(filePath, message);
    } catch (err) {
      console.error(`Failed to write to log file ${filename}:`, err.message);
    }
  }

  info(message, meta = {}) {
    const formattedMessage = this.formatMessage('info', message, meta);
    console.log(formattedMessage.trim());
    this.writeToFile('combined.log', formattedMessage);
  }

  error(message, meta = {}) {
    const formattedMessage = this.formatMessage('error', message, meta);
    console.error(formattedMessage.trim());
    this.writeToFile('err.log', formattedMessage);
    this.writeToFile('combined.log', formattedMessage);
  }

  warn(message, meta = {}) {
    const formattedMessage = this.formatMessage('warn', message, meta);
    console.warn(formattedMessage.trim());
    this.writeToFile('combined.log', formattedMessage);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      const formattedMessage = this.formatMessage('debug', message, meta);
      console.log(formattedMessage.trim());
      this.writeToFile('combined.log', formattedMessage);
    }
  }

  // Request logging
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };
    
    if (res.statusCode >= 400) {
      this.error('HTTP Request', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  // Error logging with stack trace
  logError(error, req = null) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name
    };

    if (req) {
      errorData.request = {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body
      };
    }

    this.error('Application Error', errorData);
  }
}

export default new Logger();
