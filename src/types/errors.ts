/**
 * Типы для обработки ошибок
 */

/**
 * Базовый тип ошибки с сообщением
 */
export interface ErrorWithMessage {
    message: string;
    name?: string;
    stack?: string;
}

/**
 * Проверяет является ли ошибка объектом с message
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as Record<string, unknown>).message === 'string'
    );
}

/**
 * Извлекает сообщение об ошибке безопасным способом
 */
export function getErrorMessage(error: unknown): string {
    if (isErrorWithMessage(error)) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error occurred';
}

/**
 * HTTP ответ с ошибкой
 */
export interface ErrorResponse {
    success: false;
    error: string;
}

/**
 * HTTP успешный ответ
 */
export interface SuccessResponse<T = unknown> {
    success: true;
    data?: T;
}

