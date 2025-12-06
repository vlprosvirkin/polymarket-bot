/**
 * Интеграционный тест для API после деплоя
 * 
 * Запуск:
 *   npm run test:integration
 * 
 * Или вручную:
 *   ts-node src/test/integration/api-integration.test.ts
 * 
 * Требования:
 *   - API сервер должен быть запущен на http://localhost:3000
 *   - Или установить BASE_URL через переменную окружения
 */

import axios, { AxiosInstance } from 'axios';

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
}

class APIIntegrationTest {
    private client: AxiosInstance;
    private baseUrl: string;
    private results: TestResult[] = [];

    constructor(baseUrl: string = process.env.BASE_URL || 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000,
            validateStatus: () => true // Не выбрасывать ошибки для проверки статусов
        });
    }

    async runAll(): Promise<void> {
        console.warn('\n🧪 Запуск интеграционных тестов API');
        console.warn(`📍 Base URL: ${this.baseUrl}\n`);

        try {
            // 1. Health check
            await this.testHealthCheck();

            // 2. API Info
            await this.testAPIInfo();

            // 3. Markets API
            await this.testMarketsAnalyze();
            await this.testMarketsFilter();
            const marketId = await this.testMarketsDetails();
            if (marketId) {
                await this.testMarketsAIAnalysis(marketId);
            }

            // 4. Positions API (read-only)
            await this.testPositionsBalance();
            await this.testPositionsOrders();
            await this.testPositionsTrades();
            await this.testPositionsActive();
            await this.testPositionsSummary();

            // 5. Order Status (если есть ордера)
            await this.testOrderStatus();

            // Вывод результатов
            this.printResults();
        } catch (error) {
            console.error('❌ Критическая ошибка:', error);
            this.addResult('Critical Error', false, String(error));
            this.printResults();
            process.exit(1);
        }
    }

    private addResult(name: string, passed: boolean, error?: string, details?: any): void {
        this.results.push({ name, passed, error, details });
    }

    private async testHealthCheck(): Promise<void> {
        try {
            const response = await this.client.get('/health');
            
            if (response.status === 200 && response.data.status === 'ok') {
                this.addResult('Health Check', true, undefined, {
                    uptime: response.data.uptime,
                    timestamp: response.data.timestamp
                });
            } else {
                this.addResult('Health Check', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Health Check', false, error.message);
        }
    }

    private async testAPIInfo(): Promise<void> {
        try {
            const response = await this.client.get('/');
            
            if (response.status === 200 && response.data.name === 'Polymarket Bot API') {
                this.addResult('API Info', true, undefined, {
                    version: response.data.version,
                    endpointsCount: Object.keys(response.data.endpoints || {}).length
                });
            } else {
                this.addResult('API Info', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('API Info', false, error.message);
        }
    }

    private async testMarketsAnalyze(): Promise<void> {
        try {
            const response = await this.client.get('/api/markets/analyze?limit=10');
            
            if (response.status === 200 && response.data.success) {
                const markets = response.data.markets || [];
                const hasMarkets = markets.length > 0;
                
                if (hasMarkets) {
                    const firstMarket = markets[0];
                    const hasRequiredFields = 
                        firstMarket.condition_id &&
                        firstMarket.question &&
                        firstMarket.tokens;
                    
                    this.addResult('Markets Analyze', hasRequiredFields, 
                        hasRequiredFields ? undefined : 'Missing required fields',
                        {
                            count: response.data.count,
                            total: response.data.total,
                            firstMarketId: firstMarket.condition_id
                        }
                    );
                } else {
                    this.addResult('Markets Analyze', false, 'No markets returned');
                }
            } else {
                this.addResult('Markets Analyze', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Markets Analyze', false, error.message);
        }
    }

    private async testMarketsFilter(): Promise<void> {
        try {
            const response = await this.client.post('/api/markets/filter', {
                filters: {
                    minPrice: 0.1,
                    maxPrice: 0.9
                }
            });
            
            if (response.status === 200 && response.data.success) {
                this.addResult('Markets Filter', true, undefined, {
                    filteredCount: response.data.filtered_count,
                    totalCount: response.data.total_count
                });
            } else {
                this.addResult('Markets Filter', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Markets Filter', false, error.message);
        }
    }

    private async testMarketsDetails(): Promise<string | null> {
        try {
            // Сначала получаем список рынков
            const listResponse = await this.client.get('/api/markets/analyze?limit=1');
            
            if (listResponse.status !== 200 || !listResponse.data.success) {
                this.addResult('Markets Details', false, 'Cannot get markets list');
                return null;
            }

            const markets = listResponse.data.markets || [];
            if (markets.length === 0) {
                this.addResult('Markets Details', false, 'No markets available');
                return null;
            }

            const marketId = markets[0].condition_id;
            const response = await this.client.get(`/api/markets/${marketId}`);
            
            if (response.status === 200 && response.data.success && response.data.market) {
                const market = response.data.market;
                const hasRequiredFields = 
                    market.condition_id &&
                    market.question &&
                    market.tokens &&
                    market.status;
                
                this.addResult('Markets Details', hasRequiredFields,
                    hasRequiredFields ? undefined : 'Missing required fields',
                    {
                        marketId: market.condition_id,
                        hasLiquidity: !!market.liquidity,
                        hasOrderbook: !!market.liquidity?.orderbook
                    }
                );
                
                return marketId;
            } else {
                this.addResult('Markets Details', false, `Unexpected response: ${JSON.stringify(response.data)}`);
                return null;
            }
        } catch (error: any) {
            this.addResult('Markets Details', false, error.message);
            return null;
        }
    }

    private async testMarketsAIAnalysis(marketId: string): Promise<void> {
        try {
            const response = await this.client.post(`/api/markets/${marketId}/ai-analysis`, {
                useDeepAnalysis: false
            });
            
            if (response.status === 503) {
                // AI не доступен - это нормально
                this.addResult('Markets AI Analysis', true, undefined, {
                    note: 'AI not available (expected if no API keys)'
                });
            } else if (response.status === 200 && response.data.success && response.data.analysis) {
                const analysis = response.data.analysis;
                const hasRequiredFields = 
                    typeof analysis.shouldTrade === 'boolean' &&
                    typeof analysis.confidence === 'number' &&
                    typeof analysis.attractiveness === 'number' &&
                    analysis.reasoning;
                
                this.addResult('Markets AI Analysis', hasRequiredFields,
                    hasRequiredFields ? undefined : 'Missing required fields',
                    {
                        shouldTrade: analysis.shouldTrade,
                        confidence: analysis.confidence,
                        hasEstimatedProbability: analysis.estimatedProbability !== undefined
                    }
                );
            } else {
                this.addResult('Markets AI Analysis', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Markets AI Analysis', false, error.message);
        }
    }

    private async testPositionsBalance(): Promise<void> {
        try {
            const response = await this.client.get('/api/positions/balance');
            
            if (response.status === 200 && response.data.success) {
                const hasBalance = typeof response.data.balance === 'number';
                this.addResult('Positions Balance', hasBalance, 
                    hasBalance ? undefined : 'Balance is not a number',
                    {
                        balance: response.data.balance,
                        currency: response.data.currency
                    }
                );
            } else {
                this.addResult('Positions Balance', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Positions Balance', false, error.message);
        }
    }

    private async testPositionsOrders(): Promise<void> {
        try {
            const response = await this.client.get('/api/positions/orders');
            
            if (response.status === 200 && response.data.success) {
                this.addResult('Positions Orders', true, undefined, {
                    count: response.data.count,
                    ordersCount: response.data.orders?.length || 0
                });
            } else {
                this.addResult('Positions Orders', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Positions Orders', false, error.message);
        }
    }

    private async testPositionsTrades(): Promise<void> {
        try {
            const response = await this.client.get('/api/positions/trades?limit=5');
            
            if (response.status === 200 && response.data.success) {
                this.addResult('Positions Trades', true, undefined, {
                    count: response.data.count,
                    tradesCount: response.data.trades?.length || 0
                });
            } else {
                this.addResult('Positions Trades', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Positions Trades', false, error.message);
        }
    }

    private async testPositionsActive(): Promise<void> {
        try {
            const response = await this.client.get('/api/positions/active');
            
            if (response.status === 200 && response.data.success) {
                this.addResult('Positions Active', true, undefined, {
                    count: response.data.count,
                    positionsCount: response.data.positions?.length || 0
                });
            } else {
                this.addResult('Positions Active', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Positions Active', false, error.message);
        }
    }

    private async testPositionsSummary(): Promise<void> {
        try {
            const response = await this.client.get('/api/positions/summary');
            
            if (response.status === 200 && response.data.success) {
                const hasSummary = 
                    typeof response.data.balance === 'number' &&
                    typeof response.data.openOrders === 'number' &&
                    typeof response.data.activePositions === 'number';
                
                this.addResult('Positions Summary', hasSummary,
                    hasSummary ? undefined : 'Missing required fields',
                    {
                        balance: response.data.balance,
                        openOrders: response.data.openOrders,
                        activePositions: response.data.activePositions
                    }
                );
            } else {
                this.addResult('Positions Summary', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Positions Summary', false, error.message);
        }
    }

    private async testOrderStatus(): Promise<void> {
        try {
            // Сначала получаем список ордеров
            const ordersResponse = await this.client.get('/api/positions/orders');
            
            if (ordersResponse.status !== 200 || !ordersResponse.data.success) {
                this.addResult('Order Status', true, undefined, {
                    note: 'No orders to test (expected)'
                });
                return;
            }

            const orders = ordersResponse.data.orders || [];
            if (orders.length === 0) {
                this.addResult('Order Status', true, undefined, {
                    note: 'No orders to test (expected)'
                });
                return;
            }

            const orderId = orders[0].id;
            const response = await this.client.get(`/api/positions/orders/${orderId}`);
            
            if (response.status === 200 && response.data.success && response.data.order) {
                const order = response.data.order;
                const hasRequiredFields = 
                    order.id &&
                    order.status &&
                    typeof order.price === 'number';
                
                this.addResult('Order Status', hasRequiredFields,
                    hasRequiredFields ? undefined : 'Missing required fields',
                    {
                        orderId: order.id,
                        status: order.status
                    }
                );
            } else if (response.status === 404) {
                // Ордер не найден - возможно уже выполнен
                this.addResult('Order Status', true, undefined, {
                    note: 'Order not found (may be filled)'
                });
            } else {
                this.addResult('Order Status', false, `Unexpected response: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            this.addResult('Order Status', false, error.message);
        }
    }

    private printResults(): void {
        console.warn('\n' + '='.repeat(70));
        console.warn('📊 РЕЗУЛЬТАТЫ ТЕСТОВ');
        console.warn('='.repeat(70) + '\n');

        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        const total = this.results.length;

        this.results.forEach(result => {
            const icon = result.passed ? '✅' : '❌';
            console.warn(`${icon} ${result.name}`);
            
            if (result.details) {
                Object.entries(result.details).forEach(([key, value]) => {
                    console.warn(`   ${key}: ${value}`);
                });
            }
            
            if (result.error) {
                console.warn(`   ⚠️  ${result.error}`);
            }
            
            console.warn('');
        });

        console.warn('='.repeat(70));
        console.warn(`Всего: ${total} | ✅ Успешно: ${passed} | ❌ Провалено: ${failed}`);
        console.warn('='.repeat(70) + '\n');

        if (failed > 0) {
            console.warn('⚠️  Некоторые тесты провалились. Проверьте логи выше.\n');
            process.exit(1);
        } else {
            console.warn('🎉 Все тесты прошли успешно!\n');
            process.exit(0);
        }
    }
}

// Запуск тестов
if (require.main === module) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const tester = new APIIntegrationTest(baseUrl);
    tester.runAll().catch(error => {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    });
}

export { APIIntegrationTest };

