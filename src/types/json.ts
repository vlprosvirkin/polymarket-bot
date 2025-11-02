/**
 * Типы для JSON данных от AI
 */

/**
 * JSON данные из ответа AI (может быть любым объектом)
 */
export type JSONValue = 
    | string 
    | number 
    | boolean 
    | null 
    | JSONValue[] 
    | { [key: string]: JSONValue };

/**
 * Безопасная версия для неизвестного JSON
 */
export type UnknownJSON = Record<string, unknown> | unknown[] | unknown;

