/**
 * Утилиты для работы с рынками и токенами
 * Устраняет дублирование кода получения токенов (40+ мест в коде)
 */

import { Market, MarketToken } from '../types/market';

/**
 * Получить YES токен из рынка
 */
export function getYesToken(market: Market): MarketToken | undefined {
    return market.tokens?.find(t => t.outcome === 'Yes');
}

/**
 * Получить NO токен из рынка
 */
export function getNoToken(market: Market): MarketToken | undefined {
    return market.tokens?.find(t => t.outcome === 'No');
}

/**
 * Получить токен по outcome
 */
export function getTokenByOutcome(market: Market, outcome: 'Yes' | 'No'): MarketToken | undefined {
    return market.tokens?.find(t => t.outcome === outcome);
}

/**
 * Получить цену токена по outcome
 */
export function getTokenPrice(market: Market, outcome: 'Yes' | 'No'): number | null {
    const token = outcome === 'Yes' ? getYesToken(market) : getNoToken(market);
    return token?.price ?? null;
}

/**
 * Проверить, есть ли у рынка валидные токены
 */
export function hasValidTokens(market: Market): boolean {
    return !!(market.tokens && market.tokens.length > 0 && getYesToken(market));
}

