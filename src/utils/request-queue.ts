/**
 * Request Queue - очередь запросов с rate limiting
 * Используется для ограничения параллельных запросов к API (например, OpenAI)
 * 
 * Особенности:
 * - Максимальное количество одновременных запросов (maxConcurrent)
 * - Задержка между запросами (delayMs)
 * - Retry с exponential backoff для rate limit errors (429)
 * - Логирование rate limit hits
 */

export interface QueueOptions {
    maxConcurrent?: number;  // Максимальное количество одновременных запросов (по умолчанию 3)
    delayMs?: number;        // Задержка между запросами в мс (по умолчанию 150)
    maxRetries?: number;     // Максимальное количество повторных попыток (по умолчанию 3)
    retryDelayBase?: number; // Базовая задержка для exponential backoff в мс (по умолчанию 1000)
}

interface QueueItem<T> {
    id: string;
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    retries: number;
}

export class RequestQueue {
    private queue: Array<QueueItem<unknown>> = [];
    private running: number = 0;
    private readonly maxConcurrent: number;
    private readonly delayMs: number;
    private readonly maxRetries: number;
    private readonly retryDelayBase: number;
    private rateLimitHits: number = 0;

    constructor(options: QueueOptions = {}) {
        this.maxConcurrent = options.maxConcurrent ?? 3;
        this.delayMs = options.delayMs ?? 150;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryDelayBase = options.retryDelayBase ?? 1000;
    }

    /**
     * Добавить задачу в очередь
     * @param task - Функция, возвращающая Promise
     * @param id - Уникальный идентификатор задачи (для логирования)
     * @returns Promise, который разрешится когда задача выполнится
     */
    async add<T>(task: () => Promise<T>, id?: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const item = {
                id: id || `task-${Date.now()}-${Math.random()}`,
                task: task as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject: reject,
                retries: 0
            } as QueueItem<unknown>;

            this.queue.push(item);
            this.process();
        });
    }

    /**
     * Обработка очереди
     */
    private async process(): Promise<void> {
        // Если уже запущено максимальное количество или очередь пуста
        if (this.running >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        if (!item) {
            return;
        }

        this.running++;

        try {
            // Выполняем задачу
            const result = await item.task();
            (item.resolve as (value: unknown) => void)(result);

            // Задержка перед следующим запросом
            if (this.delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delayMs));
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimit = errorMessage.includes('429') || 
                               errorMessage.includes('rate limit') ||
                               errorMessage.includes('Rate limit');

            if (isRateLimit) {
                this.rateLimitHits++;
                console.warn(`⚠️  Rate limit hit for task ${item.id} (attempt ${item.retries + 1}/${this.maxRetries})`);

                // Retry с exponential backoff
                if (item.retries < this.maxRetries) {
                    item.retries++;
                    const delay = this.retryDelayBase * Math.pow(2, item.retries - 1);
                    console.warn(`   Retrying in ${delay}ms...`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // Возвращаем в очередь для повторной попытки
                    this.queue.unshift(item);
                } else {
                    console.error(`❌ Max retries reached for task ${item.id} after rate limit`);
                    item.reject(error);
                }
            } else {
                // Не rate limit ошибка - сразу отклоняем
                item.reject(error);
            }
        } finally {
            this.running--;
            // Продолжаем обработку очереди
            this.process();
        }
    }

    /**
     * Получить статистику очереди
     */
    getStats(): {
        queueLength: number;
        running: number;
        rateLimitHits: number;
    } {
        return {
            queueLength: this.queue.length,
            running: this.running,
            rateLimitHits: this.rateLimitHits
        };
    }

    /**
     * Очистить очередь
     */
    clear(): void {
        this.queue.forEach(item => {
            item.reject(new Error('Queue cleared'));
        });
        this.queue = [];
    }
}

