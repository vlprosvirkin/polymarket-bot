/**
 * Обработка ошибок API
 * Унифицированная обработка ошибок для всех API вызовов
 */

interface ApiError {
    message?: string;
    response?: {
        status?: number;
        data?: {
            error?: string;
        };
    };
}

/**
 * Получить сообщение об ошибке
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}

/**
 * Обработать ошибку API и вернуть понятное сообщение
 */
export function handleAPIError(error: unknown): string {
    const apiError = error as ApiError;
    
    // Cloudflare блокировка
    if (apiError.response?.status === 403) {
        return 'Cloudflare блокирует запросы. Включи VPN и попробуй позже';
    }
    
    // Ошибка от API с деталями
    if (apiError.response?.data?.error) {
        return apiError.response.data.error;
    }
    
    // Rate limit
    if (apiError.response?.status === 429) {
        return 'Превышен лимит запросов. Подожди и попробуй позже';
    }
    
    // Server error
    if (apiError.response?.status === 500 || apiError.response?.status === 503) {
        return 'Ошибка сервера. Попробуй позже';
    }
    
    // Общая ошибка
    return getErrorMessage(error);
}

/**
 * Проверить, можно ли повторить запрос после ошибки
 */
export function isRetryableError(error: unknown): boolean {
    const apiError = error as ApiError;
    const errorMessage = getErrorMessage(error).toLowerCase();
    
    // Сетевые ошибки
    if (errorMessage.includes('econnreset') ||
        errorMessage.includes('etimedout') ||
        errorMessage.includes('connection error') ||
        errorMessage.includes('request timed out') ||
        errorMessage.includes('timeout')) {
        return true;
    }
    
    // HTTP ошибки, которые можно повторить
    const status = apiError.response?.status;
    if (status === 429 || status === 500 || status === 503) {
        return true;
    }
    
    return false;
}

