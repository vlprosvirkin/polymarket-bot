/**
 * Structured logger for better debugging and monitoring
 */

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

interface LogContext {
    [key: string]: string | number | boolean | undefined | null;
}

class Logger {
    private serviceName: string;

    constructor(serviceName: string) {
        this.serviceName = serviceName;
    }

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${contextStr}`;
    }

    debug(message: string, context?: LogContext): void {
        console.log(this.formatMessage(LogLevel.DEBUG, message, context));
    }

    info(message: string, context?: LogContext): void {
        console.log(this.formatMessage(LogLevel.INFO, message, context));
    }

    warn(message: string, context?: LogContext): void {
        console.warn(this.formatMessage(LogLevel.WARN, message, context));
    }

    error(message: string, error?: Error | unknown, context?: LogContext): void {
        const errorContext = error instanceof Error
            ? { error: error.message, stack: error.stack, ...context }
            : { error: String(error), ...context };
        console.error(this.formatMessage(LogLevel.ERROR, message, errorContext));
    }
}

/**
 * Create a logger instance for a service
 */
export function createLogger(serviceName: string): Logger {
    return new Logger(serviceName);
}
