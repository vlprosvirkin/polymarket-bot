/**
 * Утилиты для работы с ценами
 * Устраняет дублирование форматирования (66+ мест в коде)
 */

/**
 * Форматировать цену в проценты
 * @param price Цена в диапазоне 0.0 - 1.0
 * @param decimals Количество знаков после запятой
 * @returns Строка вида "85.50%"
 */
export function formatPrice(price: number, decimals: number = 2): string {
    return (price * 100).toFixed(decimals) + '%';
}

/**
 * Форматировать цену без процента
 * @param price Цена в диапазоне 0.0 - 1.0
 * @param decimals Количество знаков после запятой
 * @returns Строка вида "85.50"
 */
export function formatPriceNumber(price: number, decimals: number = 2): string {
    return (price * 100).toFixed(decimals);
}

/**
 * Расчет P&L (Profit & Loss)
 * @param size Размер позиции
 * @param averagePrice Средняя цена входа
 * @param currentPrice Текущая цена
 * @returns P&L в USDC
 */
export function calculatePnL(size: number, averagePrice: number, currentPrice: number): number {
    const costBasis = size * averagePrice;
    const currentValue = size * currentPrice;
    return currentValue - costBasis;
}

