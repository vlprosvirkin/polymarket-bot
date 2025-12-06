/**
 * Graceful Shutdown Utility
 * Утилита для корректного завершения работы ботов
 */

/**
 * Настройка graceful shutdown для бота
 * 
 * @param bot - Объект бота с методом stop()
 * @param shutdownDelay - Задержка перед выходом в миллисекундах (по умолчанию 1000)
 * 
 * @example
 * ```typescript
 * const bot = new PolymarketBot(strategy);
 * setupGracefulShutdown(bot);
 * await bot.run();
 * ```
 */
export function setupGracefulShutdown(
    bot: { stop: () => Promise<void> | void },
    shutdownDelay: number = 1000
): void {
    const shutdown = async (signal: string) => {
        console.warn(`\n\n⚠️  Получен ${signal}`);
        try {
            await bot.stop();
        } catch (error) {
            console.error('❌ Ошибка при остановке бота:', error);
        }
        setTimeout(() => process.exit(0), shutdownDelay);
    };

    process.on('SIGINT', () => shutdown('SIGINT (Ctrl+C)'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

