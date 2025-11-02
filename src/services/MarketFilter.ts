/**
 * Модуль для фильтрации рынков
 * Содержит переиспользуемые фильтры для всех стратегий
 *
 * Интегрируется с PolymarketDataService для работы с обогащенными данными
 */

import { Market } from '../types';
import type { EnrichedMarket } from './PolymarketDataService';

export interface MarketFilterConfig {
    // Базовые фильтры
    // ⚠️ minVolume/maxVolume удалены - volume не возвращается API
    // Используйте PolymarketDataService + filterEnrichedForTrading для проверки ликвидности
    minPrice?: number;               // Минимальная цена YES токена
    maxPrice?: number;               // Максимальная цена YES токена
    excludeNegRisk?: boolean;        // Исключить NegRisk рынки

    // Фильтры по времени
    minDaysToResolution?: number;    // Минимум дней до разрешения
    maxDaysToResolution?: number;    // Максимум дней до разрешения

    // Фильтры по категориям
    includedCategories?: string[];   // Только эти категории
    excludedCategories?: string[];   // Исключить эти категории
}

export class MarketFilter {
    /**
     * Базовая фильтрация - применяется ко всем рынкам
     * Проверяет активность, наличие токенов, статус
     */
    static filterBasic(markets: Market[], verbose: boolean = false): Market[] {
        let filteredCount = 0;
        let inactiveCount = 0;
        let noTokensCount = 0;
        
        const result = markets.filter(market => {
            // Только активные рынки
            if (!market.active || market.closed || !market.accepting_orders) {
                inactiveCount++;
                return false;
            }

            // Должны быть токены
            if (!market.tokens || market.tokens.length === 0) {
                noTokensCount++;
                return false;
            }

            filteredCount++;
            return true;
        });
        
        if (verbose && (inactiveCount > 0 || noTokensCount > 0)) {
            console.log(`            Базовая фильтрация:`);
            console.log(`               - Неактивные/закрытые: ${inactiveCount}`);
            console.log(`               - Без токенов: ${noTokensCount}`);
            console.log(`               - Прошло: ${filteredCount}`);
        }
        
        return result;
    }


    /**
     * Фильтрация по цене YES токена
     */
    static filterByPrice(markets: Market[], minPrice?: number, maxPrice?: number): Market[] {
        if (!minPrice && !maxPrice) return markets;

        return markets.filter(market => {
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            if (!yesToken) return false;

            const price = yesToken.price;

            if (minPrice && price < minPrice) return false;
            if (maxPrice && price > maxPrice) return false;

            return true;
        });
    }

    /**
     * Фильтрация по вероятности (диапазон цены YES)
     */
    static filterByProbability(markets: Market[], minProbability: number, maxProbability: number): Market[] {
        return markets.filter(market => {
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            if (!yesToken) return false;

            const probability = yesToken.price;
            return probability >= minProbability && probability <= maxProbability;
        });
    }

    /**
     * Фильтрация по дате разрешения
     */
    static filterByResolutionDate(
        markets: Market[],
        minDays?: number,
        maxDays?: number
    ): Market[] {
        if (!minDays && !maxDays) return markets;

        const now = new Date();

        return markets.filter(market => {
            if (!market.end_date_iso) return false;

            const endDate = new Date(market.end_date_iso);
            const daysUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

            if (minDays && daysUntilEnd < minDays) return false;
            if (maxDays && daysUntilEnd > maxDays) return false;

            return true;
        });
    }

    /**
     * Фильтрация по категориям
     */
    static filterByCategory(
        markets: Market[],
        includedCategories?: string[],
        excludedCategories?: string[]
    ): Market[] {
        if (!includedCategories && !excludedCategories) return markets;

        return markets.filter(market => {
            if (!market.category) return !includedCategories; // Если нет категории, пропускаем только если нет whitelist

            // Whitelist: только эти категории
            if (includedCategories && includedCategories.length > 0) {
                if (!includedCategories.includes(market.category)) return false;
            }

            // Blacklist: исключить эти категории
            if (excludedCategories && excludedCategories.length > 0) {
                if (excludedCategories.includes(market.category)) return false;
            }

            return true;
        });
    }

    /**
     * Фильтрация NegRisk рынков
     */
    static filterNegRisk(markets: Market[], exclude: boolean = true): Market[] {
        if (!exclude) return markets;
        return markets.filter(market => !market.neg_risk);
    }

    /**
     * Комплексная фильтрация с настройками
     */
    static filterWithConfig(markets: Market[], config: MarketFilterConfig, verbose: boolean = false): Market[] {
        let filtered = markets;
        const initialCount = markets.length;

        // Базовая фильтрация всегда применяется
        filtered = this.filterBasic(filtered, verbose);
        const afterBasic = filtered.length;
        if (verbose && initialCount !== afterBasic) {
            console.log(`            Базовые проверки: ${initialCount} → ${afterBasic} (отфильтровано ${initialCount - afterBasic})`);
        }

        // Фильтр по цене
        const beforePrice = filtered.length;
        filtered = this.filterByPrice(filtered, config.minPrice, config.maxPrice);
        const afterPrice = filtered.length;
        if (verbose && beforePrice !== afterPrice) {
            console.log(`            Фильтр по цене: ${beforePrice} → ${afterPrice} (отфильтровано ${beforePrice - afterPrice})`);
        }

        // Фильтр по дате разрешения
        const beforeDate = filtered.length;
        filtered = this.filterByResolutionDate(
            filtered,
            config.minDaysToResolution,
            config.maxDaysToResolution
        );
        const afterDate = filtered.length;
        if (verbose && beforeDate !== afterDate) {
            console.log(`            Фильтр по дате: ${beforeDate} → ${afterDate} (отфильтровано ${beforeDate - afterDate})`);
        }

        // Фильтр по категориям
        const beforeCategory = filtered.length;
        filtered = this.filterByCategory(
            filtered,
            config.includedCategories,
            config.excludedCategories
        );
        const afterCategory = filtered.length;
        if (verbose && beforeCategory !== afterCategory) {
            console.log(`            Фильтр по категориям: ${beforeCategory} → ${afterCategory} (отфильтровано ${beforeCategory - afterCategory})`);
        }

        // Фильтр NegRisk
        if (config.excludeNegRisk) {
            const beforeNegRisk = filtered.length;
            filtered = this.filterNegRisk(filtered, true);
            const afterNegRisk = filtered.length;
            if (verbose && beforeNegRisk !== afterNegRisk) {
                console.log(`            Фильтр NegRisk: ${beforeNegRisk} → ${afterNegRisk} (отфильтровано ${beforeNegRisk - afterNegRisk})`);
            }
        }

        if (verbose) {
            console.log(`            ✅ ИТОГО: ${initialCount} → ${filtered.length} (отфильтровано ${initialCount - filtered.length})`);
        }

        return filtered;
    }

    /**
     * Фильтр для Endgame стратегии (высокая вероятность + близко к разрешению)
     */
    static filterForEndgame(
        markets: Market[],
        minProbability: number = 0.90,
        maxProbability: number = 0.99,
        maxDaysToResolution: number = 14,
        excludeNegRisk: boolean = true
    ): Market[] {
        let         filtered = this.filterBasic(markets);

        filtered = this.filterByProbability(filtered, minProbability, maxProbability);
        filtered = this.filterByResolutionDate(filtered, undefined, maxDaysToResolution);

        if (excludeNegRisk) {
            filtered = this.filterNegRisk(filtered, true);
        }

        return filtered;
    }


    static sortByResolutionDate(markets: Market[], nearest: boolean = true): Market[] {
        const now = Date.now();
        return [...markets].sort((a, b) => {
            const dateA = a.end_date_iso ? new Date(a.end_date_iso).getTime() : Infinity;
            const dateB = b.end_date_iso ? new Date(b.end_date_iso).getTime() : Infinity;

            const daysA = (dateA - now) / (1000 * 60 * 60 * 24);
            const daysB = (dateB - now) / (1000 * 60 * 60 * 24);

            return nearest ? daysA - daysB : daysB - daysA;
        });
    }

    static sortByProbability(markets: Market[], highest: boolean = true): Market[] {
        return [...markets].sort((a, b) => {
            const yesA = a.tokens.find(t => t.outcome === 'Yes');
            const yesB = b.tokens.find(t => t.outcome === 'Yes');

            if (!yesA || !yesB) {
                return 0; // Сохраняем порядок если нет YES токена
            }

            const priceA = yesA.price;
            const priceB = yesB.price;

            return highest ? priceB - priceA : priceA - priceB;
        });
    }

    /**
     * Комплексная сортировка для AI стратегии
     * Учитывает объем, близость к разрешению и категорию
     */
    static sortForAI(
        markets: Market[],
        preferredCategories?: string[]
    ): Market[] {
        return [...markets].sort((a, b) => {
            const scoreA = this.calculateMarketScore(a, preferredCategories);
            const scoreB = this.calculateMarketScore(b, preferredCategories);
            return scoreB - scoreA;
        });
    }

    private static calculateMarketScore(market: Market, preferredCategories?: string[]): number {
        // Дни до разрешения (чем ближе - тем выше приоритет)
        const daysToEnd = market.end_date_iso
            ? (new Date(market.end_date_iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            : 999;

        // Бонус за предпочитаемые категории
        let categoryBonus = 1.0;
        if (market.category && preferredCategories?.includes(market.category)) {
            categoryBonus = 2.0;
        }

        // Используем цену YES токена как фактор ликвидности/популярности
        const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
        const priceFactor = yesToken ? yesToken.price : 0.5;

        // Score = (price * category) / (days + 1)
        // Высокая цена = больше интереса = выше приоритет
        return (priceFactor * categoryBonus) / (daysToEnd + 1);
    }

    /**
     * Статистика по рынкам
     */
    static getMarketStats(markets: Market[]): {
        total: number;
        avgProbability: number;
        avgDaysToResolution: number;
        categories: Map<string, number>;
    } {
        if (markets.length === 0) {
            return {
                total: 0,
                avgProbability: 0,
                avgDaysToResolution: 0,
                categories: new Map()
            };
        }

        const now = Date.now();
        let totalProbability = 0;
        let totalDays = 0;
        let validDaysCount = 0;
        const categories = new Map<string, number>();

        for (const market of markets) {
            // Probability
            const yesToken = market.tokens.find(t => t.outcome === 'Yes');
            if (yesToken) {
                totalProbability += yesToken.price;
            }

            // Days to resolution
            if (market.end_date_iso) {
                const days = (new Date(market.end_date_iso).getTime() - now) / (1000 * 60 * 60 * 24);
                totalDays += days;
                validDaysCount++;
            }

            // Categories
            if (market.category) {
                categories.set(market.category, (categories.get(market.category) || 0) + 1);
            }
        }

        return {
            total: markets.length,
            avgProbability: totalProbability / markets.length,
            avgDaysToResolution: validDaysCount > 0 ? totalDays / validDaysCount : 0,
            categories
        };
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * МЕТОДЫ ДЛЯ РАБОТЫ С ENRICHEDMARKET (интеграция с PolymarketDataService)
     * ═══════════════════════════════════════════════════════════════
     */

    /**
     * Фильтрация обогащенных рынков по ликвидности
     * 
     * Ликвидность = общая сумма всех ордеров на рынке (YES + NO) в USDC
     * - totalMarketLiquidity: общая ликвидность (YES bid + YES ask + NO bid + NO ask)
     * - Если totalMarketLiquidity недоступна, используется только YES (totalBidSize + totalAskSize)
     * 
     * Учитываются оба токена, так как стратегии могут торговать и YES и NO
     * (например, для хеджирования в HighConfidenceStrategy и EndgameStrategy)
     */
    static filterEnrichedByLiquidity(
        markets: EnrichedMarket[],
        minLiquidity: number
    ): EnrichedMarket[] {
        return markets.filter(market => {
            if (!market.liquidityMetrics) {
                return false; // Нет метрик ликвидности
            }

            // Ликвидность = сумма всех ордеров на рынке
            // Используем общую ликвидность (YES + NO), если доступна, иначе только YES
            const totalLiquidity = market.liquidityMetrics.totalMarketLiquidity !== undefined
                ? market.liquidityMetrics.totalMarketLiquidity  // Общая ликвидность (YES + NO)
                : market.liquidityMetrics.totalBidSize + market.liquidityMetrics.totalAskSize; // Только YES

            const passed = totalLiquidity >= minLiquidity && market.liquidityMetrics.hasLiquidity;
            
            if (!passed && markets.length <= 5) {
                // Логируем детали для первых 5 рынков, чтобы понять почему отфильтровались
                console.log(`            ⚠️  ${market.question.substring(0, 30)}...`);
                console.log(`               Ликвидность: $${totalLiquidity.toFixed(2)} (мин: $${minLiquidity})`);
                console.log(`               Bid: $${market.liquidityMetrics.totalBidSize.toFixed(2)}, Ask: $${market.liquidityMetrics.totalAskSize.toFixed(2)}`);
                console.log(`               hasLiquidity: ${market.liquidityMetrics.hasLiquidity}`);
            }
            
            return passed;
        });
    }

    /**
     * Фильтрация по спреду (bid-ask spread)
     * Исключает рынки с высоким спредом (плохая ликвидность)
     */
    static filterEnrichedBySpread(
        markets: EnrichedMarket[],
        maxSpreadPercent: number
    ): EnrichedMarket[] {
        return markets.filter(market => {
            if (!market.liquidityMetrics) return false;
            return market.liquidityMetrics.spreadPercent <= maxSpreadPercent;
        });
    }

    /**
     * Фильтрация по глубине orderbook
     * Проверяет наличие достаточного количества ордеров
     */
    static filterEnrichedByOrderbookDepth(
        markets: EnrichedMarket[],
        minBids: number,
        minAsks: number
    ): EnrichedMarket[] {
        return markets.filter(market => {
            if (!market.orderbook) return false;
            return market.orderbook.bids.length >= minBids &&
                   market.orderbook.asks.length >= minAsks;
        });
    }

    /**
     * Комплексная фильтрация обогащенных рынков
     * Объединяет проверки ликвидности, спреда и orderbook
     */
    static filterEnrichedForTrading(
        markets: EnrichedMarket[],
        minLiquidity: number = 1000,  // Минимум $1000 общей ликвидности (bid + ask) по умолчанию
        maxSpreadPercent: number = 5,
        minOrderbookDepth: number = 3
    ): EnrichedMarket[] {
        let filtered = markets;
        const initialCount = filtered.length;

        // Базовая фильтрация
        filtered = this.filterBasic(filtered as Market[]) as EnrichedMarket[];
        const afterBasic = filtered.length;
        if (initialCount !== afterBasic) {
            console.log(`         - Базовая фильтрация: ${initialCount} → ${afterBasic} (отфильтровано ${initialCount - afterBasic})`);
        }

        // Фильтр по ликвидности
        const beforeLiquidity = filtered.length;
        filtered = this.filterEnrichedByLiquidity(filtered, minLiquidity);
        const afterLiquidity = filtered.length;
        if (beforeLiquidity !== afterLiquidity) {
            console.log(`         - Фильтр ликвидности (мин $${minLiquidity}): ${beforeLiquidity} → ${afterLiquidity} (отфильтровано ${beforeLiquidity - afterLiquidity})`);
        }

        // Фильтр по спреду
        const beforeSpread = filtered.length;
        filtered = this.filterEnrichedBySpread(filtered, maxSpreadPercent);
        const afterSpread = filtered.length;
        if (beforeSpread !== afterSpread) {
            console.log(`         - Фильтр спреда (макс ${maxSpreadPercent}%): ${beforeSpread} → ${afterSpread} (отфильтровано ${beforeSpread - afterSpread})`);
        }

        // Фильтр по глубине orderbook
        const beforeDepth = filtered.length;
        filtered = this.filterEnrichedByOrderbookDepth(filtered, minOrderbookDepth, minOrderbookDepth);
        const afterDepth = filtered.length;
        if (beforeDepth !== afterDepth) {
            console.log(`         - Фильтр глубины orderbook (мин ${minOrderbookDepth} уровней): ${beforeDepth} → ${afterDepth} (отфильтровано ${beforeDepth - afterDepth})`);
        }

        return filtered;
    }

    /**
     * Статистика по обогащенным рынкам
     * Включает метрики ликвидности и orderbook
     */
    static getEnrichedMarketStats(markets: EnrichedMarket[]): {
        total: number;
        avgProbability: number;
        avgDaysToResolution: number;
        avgLiquidity: number;
        avgSpread: number;
        withOrderbook: number;
        withLiquidity: number;
        categories: Map<string, number>;
    } {
        const baseStats = this.getMarketStats(markets as Market[]);

        if (markets.length === 0) {
            return {
                ...baseStats,
                avgLiquidity: 0,
                avgSpread: 0,
                withOrderbook: 0,
                withLiquidity: 0
            };
        }

        let totalLiquidity = 0;
        let totalSpread = 0;
        let liquidityCount = 0;
        let spreadCount = 0;
        let withOrderbook = 0;
        let withLiquidity = 0;

        for (const market of markets) {
            if (market.orderbook) {
                withOrderbook++;
            }

            if (market.liquidityMetrics) {
                withLiquidity++;

                // Ликвидность = общая ликвидность рынка (YES + NO) или только YES
                const marketLiquidity = market.liquidityMetrics.totalMarketLiquidity !== undefined
                    ? market.liquidityMetrics.totalMarketLiquidity
                    : market.liquidityMetrics.totalBidSize + market.liquidityMetrics.totalAskSize;
                totalLiquidity += marketLiquidity;
                liquidityCount++;

                totalSpread += market.liquidityMetrics.spreadPercent;
                spreadCount++;
            }
        }

        return {
            ...baseStats,
            avgLiquidity: liquidityCount > 0 ? totalLiquidity / liquidityCount : 0,
            avgSpread: spreadCount > 0 ? totalSpread / spreadCount : 0,
            withOrderbook,
            withLiquidity
        };
    }
}
