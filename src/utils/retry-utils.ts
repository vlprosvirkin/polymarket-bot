/**
 * Утилиты для retry логики
 * Унифицированная обработка повторных попыток для API вызовов
 */

interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryable?: (error: unknown) => boolean;
}

/**
 * Выполнить функцию с повторными попытками при ошибках
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = options.baseDelay ?? 1000;
    const maxDelay = options.maxDelay ?? 5000;
    const retryable = options.retryable ?? (() => true);

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Проверяем, можно ли повторить
            if (!retryable(error)) {
                throw error;
            }

            // Если это последняя попытка, выбрасываем ошибку
            if (attempt === maxRetries) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s (но не больше maxDelay)
            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
            
            console.warn(`⏳ Retry attempt ${attempt}/${maxRetries} in ${delay}ms...`);
            await sleep(delay);
        }
    }

    // Должно быть недостижимо, но TypeScript требует
    throw lastError;
}

/**
 * Задержка на указанное количество миллисекунд
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

