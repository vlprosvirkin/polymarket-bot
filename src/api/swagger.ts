/**
 * Swagger configuration
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Polymarket Bot API',
            version: '1.0.0',
            description: 'REST API для мониторинга позиций и ордеров на Polymarket',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
        tags: [
            {
                name: 'Positions',
                description: 'Endpoints для работы с позициями и ордерами',
            },
            {
                name: 'Health',
                description: 'Проверка состояния сервера',
            },
        ],
        components: {
            schemas: {
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'ID ордера' },
                        market: { type: 'string', description: 'Market ID' },
                        outcome: { type: 'string', description: 'Yes или No' },
                        side: { type: 'string', enum: ['BUY', 'SELL'] },
                        price: { type: 'number', description: 'Цена (0-1)' },
                        pricePercent: { type: 'string', description: 'Цена в процентах' },
                        size: { type: 'number', description: 'Размер ордера' },
                        sizeMatched: { type: 'number', description: 'Исполненный размер' },
                        created: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['open', 'partially_filled'] },
                    },
                },
                Trade: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        market: { type: 'string' },
                        outcome: { type: 'string' },
                        side: { type: 'string', enum: ['BUY', 'SELL'] },
                        price: { type: 'number' },
                        pricePercent: { type: 'string' },
                        size: { type: 'number' },
                        feeRateBps: { type: 'number' },
                        feePercent: { type: 'string' },
                        timestamp: { type: 'number' },
                        date: { type: 'string', format: 'date-time' },
                    },
                },
                Position: {
                    type: 'object',
                    properties: {
                        market: { type: 'string' },
                        outcome: { type: 'string' },
                        tokenId: { type: 'string' },
                        netSize: { type: 'number', description: 'Чистая позиция' },
                        buySize: { type: 'number' },
                        sellSize: { type: 'number' },
                        avgPrice: { type: 'number', description: 'Средняя цена (%)' },
                        totalCost: { type: 'number', description: 'Стоимость в USDC' },
                        trades: { type: 'number' },
                        status: { type: 'string', enum: ['long', 'short'] },
                    },
                },
                Balance: {
                    type: 'object',
                    properties: {
                        usdc: { type: 'number' },
                        allowance: { type: 'number' },
                        raw: {
                            type: 'object',
                            properties: {
                                balance: { type: 'string' },
                                allowance: { type: 'string' },
                            },
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string' },
                    },
                },
            },
        },
        paths: {
            '/health': {
                get: {
                    tags: ['Health'],
                    summary: 'Проверка здоровья сервера',
                    responses: {
                        '200': {
                            description: 'Сервер работает',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'ok' },
                                            timestamp: { type: 'string' },
                                            uptime: { type: 'number' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/orders': {
                get: {
                    tags: ['Positions'],
                    summary: 'Получить открытые ордера',
                    description: 'Возвращает список всех открытых ордеров',
                    responses: {
                        '200': {
                            description: 'Успешный ответ',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            count: { type: 'number' },
                                            orders: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/Order' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        '500': {
                            description: 'Ошибка сервера',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/Error' },
                                },
                            },
                        },
                    },
                },
                delete: {
                    tags: ['Positions'],
                    summary: 'Отменить все ордера',
                    responses: {
                        '200': {
                            description: 'Ордера отменены',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                            cancelled: { type: 'number' },
                                            failed: { type: 'number' },
                                            total: { type: 'number' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/orders/{orderId}': {
                delete: {
                    tags: ['Positions'],
                    summary: 'Отменить ордер',
                    parameters: [
                        {
                            name: 'orderId',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'ID ордера',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'Ордер отменен',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/trades': {
                get: {
                    tags: ['Positions'],
                    summary: 'Получить историю сделок',
                    parameters: [
                        {
                            name: 'limit',
                            in: 'query',
                            schema: { type: 'integer', default: 20 },
                            description: 'Количество сделок',
                        },
                    ],
                    responses: {
                        '200': {
                            description: 'История сделок',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            count: { type: 'number' },
                                            trades: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/Trade' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/active': {
                get: {
                    tags: ['Positions'],
                    summary: 'Получить активные позиции',
                    description: 'Рассчитывает активные позиции из истории сделок',
                    responses: {
                        '200': {
                            description: 'Активные позиции',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            count: { type: 'number' },
                                            positions: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/Position' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/balance': {
                get: {
                    tags: ['Positions'],
                    summary: 'Получить баланс USDC',
                    responses: {
                        '200': {
                            description: 'USDC баланс и allowance',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            balance: { $ref: '#/components/schemas/Balance' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/positions/summary': {
                get: {
                    tags: ['Positions'],
                    summary: 'Получить полную сводку',
                    description: 'Возвращает все данные: ордера, позиции, сделки, баланс',
                    responses: {
                        '200': {
                            description: 'Полная сводка',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            summary: {
                                                type: 'object',
                                                properties: {
                                                    openOrders: { type: 'number' },
                                                    activePositions: { type: 'number' },
                                                    recentTrades: { type: 'number' },
                                                    balance: { type: 'number' },
                                                    totalExposure: { type: 'number' },
                                                },
                                            },
                                            details: {
                                                type: 'object',
                                                properties: {
                                                    orders: { type: 'array' },
                                                    positions: { type: 'array' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: [], // Не используем JSDoc комментарии, все в definition
};

export const swaggerSpec = swaggerJsdoc(options);
