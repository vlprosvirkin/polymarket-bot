import { ethers } from 'ethers';
import { ClobClient, AssetType } from '@polymarket/clob-client';
import { WalletService } from './WalletService';
import { POLYMARKET_CONSTANTS } from '../utils/constants';

export class PolymarketService {
  private walletService: WalletService;
  private clobClient!: ClobClient;
  private contractAddresses: any;
  private config: any;

  constructor(walletService: WalletService) {
    this.walletService = walletService;

    this.contractAddresses = {
      conditionalTokens: process.env.POLYMARKET_CONDITIONAL_TOKENS || POLYMARKET_CONSTANTS.CONDITIONAL_TOKENS,
      collateralToken: process.env.POLYMARKET_COLLATERAL_TOKEN || POLYMARKET_CONSTANTS.COLLATERAL_TOKEN,
      polymarketCore: POLYMARKET_CONSTANTS.PROXY_WALLET,
      proxyWallet: POLYMARKET_CONSTANTS.PROXY_WALLET
    };

    this.config = {
      baseUrl: process.env.CLOB_API_URL || POLYMARKET_CONSTANTS.CLOB_API_URL,
      chainId: parseInt(process.env.CHAIN_ID || POLYMARKET_CONSTANTS.POLYGON_CHAIN_ID.toString()),
      privateKey: process.env.PRIVATE_KEY || '',
      rpcUrl: process.env.RPC_URL || POLYMARKET_CONSTANTS.POLYGON_RPC
    };

    // Инициализация CLOB клиента
    this.initializeClobClient();
  }

  /**
   * Инициализация CLOB клиента
   */
  private initializeClobClient(): void {
    try {
      // Инициализация официального CLOB клиента
      this.clobClient = new ClobClient(
        this.config.baseUrl,
        this.config.chainId,
        this.walletService.getWallet() as any
      );

      console.log('✅ CLOB Client успешно инициализирован');
    } catch (error) {
      console.error('❌ Ошибка инициализации CLOB клиента:', error);
      throw error;
    }
  }

  /**
   * Получить список рынков
   */
  async getMarkets(cursor?: string): Promise<any> {
    try {
      console.log(`📊 Запрос рынков: cursor=${cursor || 'initial'}`);

      const response = await this.clobClient.getMarkets(cursor);

      console.log(`✅ Получено ${(response as any).results?.length || 0} рынков`);
      return response;
    } catch (error) {
      console.error('❌ Ошибка получения рынков:', error);
      throw error;
    }
  }

  /**
   * Получить упрощенный список рынков
   */
  async getSimplifiedMarkets(cursor?: string): Promise<any> {
    try {
      console.log(`📊 Запрос упрощенных рынков: cursor=${cursor || 'initial'}`);

      const response = await this.clobClient.getSimplifiedMarkets(cursor);

      console.log(`✅ Получено ${(response as any).results?.length || 0} упрощенных рынков`);
      return response;
    } catch (error) {
      console.error('❌ Ошибка получения упрощенных рынков:', error);
      throw error;
    }
  }

  /**
   * Получить информацию о рынке по condition ID
   */
  async getMarket(conditionId: string): Promise<any> {
    try {
      console.log(`📈 Запрос информации о рынке: ${conditionId}`);

      const market = await this.clobClient.getMarket(conditionId);

      console.log(`✅ Получена информация о рынке: ${market?.question || 'N/A'}`);
      return market;
    } catch (error) {
      console.error('❌ Ошибка получения информации о рынке:', error);
      throw error;
    }
  }

  /**
   * Получить ордербук для токена
   */
  async getOrderBook(tokenId: string): Promise<any> {
    try {
      console.log(`📋 Запрос ордербука: tokenId=${tokenId}`);

      const orderbook = await this.clobClient.getOrderBook(tokenId);

      console.log(`✅ Получен ордербук: ${orderbook?.bids?.length || 0} bids, ${orderbook?.asks?.length || 0} asks`);
      return orderbook;
    } catch (error) {
      console.error('❌ Ошибка получения ордербука:', error);
      throw error;
    }
  }

  /**
   * Получить размер тика для токена
   */
  async getTickSize(tokenId: string): Promise<any> {
    try {
      console.log(`📏 Запрос размера тика: tokenId=${tokenId}`);

      const tickSize = await this.clobClient.getTickSize(tokenId);

      console.log(`✅ Получен размер тика: ${tickSize || 'N/A'}`);
      return tickSize;
    } catch (error) {
      console.error('❌ Ошибка получения размера тика:', error);
      throw error;
    }
  }

  /**
   * Получить комиссию для токена
   */
  async getFeeRate(tokenId: string): Promise<number> {
    try {
      console.log(`💰 Запрос комиссии: tokenId=${tokenId}`);

      const feeRate = await this.clobClient.getFeeRateBps(tokenId);

      console.log(`✅ Получена комиссия: ${feeRate} bps`);
      return feeRate;
    } catch (error) {
      console.error('❌ Ошибка получения комиссии:', error);
      throw error;
    }
  }

  /**
   * Получить среднюю цену для токена
   */
  async getMidpoint(tokenId: string): Promise<any> {
    try {
      console.log(`📊 Запрос средней цены: tokenId=${tokenId}`);

      const midpoint = await this.clobClient.getMidpoint(tokenId);

      console.log(`✅ Получена средняя цена: ${midpoint?.price || 'N/A'}`);
      return midpoint;
    } catch (error) {
      console.error('❌ Ошибка получения средней цены:', error);
      throw error;
    }
  }

  /**
   * Получить спред для токена
   */
  async getSpread(tokenId: string): Promise<any> {
    try {
      console.log(`📊 Запрос спреда: tokenId=${tokenId}`);

      const spread = await this.clobClient.getSpread(tokenId);

      console.log(`✅ Получен спред: ${spread?.spread || 'N/A'}`);
      return spread;
    } catch (error) {
      console.error('❌ Ошибка получения спреда:', error);
      throw error;
    }
  }

  /**
   * Получить последнюю цену сделки
   */
  async getLastTradePrice(tokenId: string): Promise<any> {
    try {
      console.log(`📊 Запрос последней цены сделки: tokenId=${tokenId}`);

      const lastPrice = await this.clobClient.getLastTradePrice(tokenId);

      console.log(`✅ Получена последняя цена: ${lastPrice?.price || 'N/A'}`);
      return lastPrice;
    } catch (error) {
      console.error('❌ Ошибка получения последней цены:', error);
      throw error;
    }
  }

  /**
   * Получить историю цен
   */
  async getPriceHistory(params: any): Promise<any[]> {
    try {
      console.log(`📈 Запрос истории цен: tokenId=${params.tokenID}`);

      const priceHistory = await this.clobClient.getPricesHistory(params);

      console.log(`✅ Получено ${priceHistory.length} точек истории цен`);
      return priceHistory;
    } catch (error) {
      console.error('❌ Ошибка получения истории цен:', error);
      throw error;
    }
  }

  /**
   * Создать ордер
   */
  async createOrder(params: any): Promise<any> {
    try {
      console.log('📝 Создание ордера:', params);

      // Валидация параметров
      this.validateOrderParams(params);

      const order = await this.clobClient.createOrder(params);

      console.log(`✅ Ордер создан: ${order?.id || 'N/A'}`);
      return order;
    } catch (error) {
      console.error('❌ Ошибка создания ордера:', error);
      throw error;
    }
  }

  /**
   * Получить ордер по ID
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      console.log(`📋 Запрос ордера: ${orderId}`);

      const order = await this.clobClient.getOrder(orderId);

      console.log(`✅ Получен ордер: ${order?.id || 'N/A'}`);
      return order;
    } catch (error) {
      console.error('❌ Ошибка получения ордера:', error);
      throw error;
    }
  }

  /**
   * Получить открытые ордера пользователя
   */
  async getOpenOrders(params?: any): Promise<any[]> {
    try {
      console.log('📋 Запрос открытых ордеров:', params);

      const response = await this.clobClient.getOpenOrders(params);

      console.log(`✅ Получено ${(response as any).results?.length || 0} открытых ордеров`);
      return (response as any).results || [];
    } catch (error) {
      console.error('❌ Ошибка получения открытых ордеров:', error);
      throw error;
    }
  }

  /**
   * Получить историю сделок
   */
  async getTrades(params?: any): Promise<any[]> {
    try {
      console.log('📊 Запрос истории сделок:', params);

      const trades = await this.clobClient.getTrades(params);

      console.log(`✅ Получено ${trades.length} сделок`);
      return trades;
    } catch (error) {
      console.error('❌ Ошибка получения истории сделок:', error);
      throw error;
    }
  }

  /**
   * Получить баланс и allowance для токена
   */
  async getBalanceAndAllowance(tokenId: string): Promise<any> {
    try {
      console.log(`💰 Запрос баланса и allowance: tokenId=${tokenId}`);

      const params = {
        tokenID: tokenId,
        owner: this.walletService.getAddress(),
        asset_type: AssetType.CONDITIONAL
      };

      const response = await this.clobClient.getBalanceAllowance(params);

      console.log(`✅ Баланс: ${response.balance}, Allowance: ${response.allowance}`);
      return response;
    } catch (error) {
      console.error('❌ Ошибка получения баланса и allowance:', error);
      throw error;
    }
  }

  /**
   * Получить баланс коллатерального токена (USDC)
   */
  async getCollateralBalance(): Promise<string> {
    try {
      const balance = await this.walletService.getTokenBalance(this.contractAddresses.collateralToken);
      return balance;
    } catch (error) {
      console.error('❌ Ошибка получения баланса USDC:', error);
      throw error;
    }
  }

  /**
   * Одобрить расходование токенов для контракта
   */
  async approveCollateral(amount: string): Promise<ethers.TransactionResponse> {
    try {
      const contract = new ethers.Contract(
        this.contractAddresses.collateralToken,
        ['function approve(address spender, uint256 amount) returns (bool)', 'function decimals() view returns (uint8)'],
        this.walletService.getWallet()
      );

      const decimals = await contract.decimals();
      const amountWei = ethers.parseUnits(amount, decimals);

      return await contract.approve(this.contractAddresses.conditionalTokens, amountWei);
    } catch (error) {
      console.error('❌ Ошибка одобрения USDC:', error);
      throw error;
    }
  }

  /**
   * Проверить одобрение расходования токенов
   */
  async getCollateralAllowance(): Promise<string> {
    try {
      const contract = new ethers.Contract(
        this.contractAddresses.collateralToken,
        ['function allowance(address owner, address spender) view returns (uint256)', 'function decimals() view returns (uint8)'],
        this.walletService.getWallet()
      );

      const allowance = await contract.allowance(
        this.walletService.getAddress(),
        this.contractAddresses.conditionalTokens
      );
      const decimals = await contract.decimals();

      return ethers.formatUnits(allowance, decimals);
    } catch (error) {
      console.error('❌ Ошибка проверки allowance:', error);
      throw error;
    }
  }

  /**
   * Валидация параметров ордера
   */
  validateOrderParams(params: any): void {
    if (!params.tokenID) {
      throw new Error('tokenID обязателен');
    }
    if (!params.side || !['BUY', 'SELL'].includes(params.side)) {
      throw new Error('side должен быть "BUY" или "SELL"');
    }
    if (!params.price || params.price <= 0 || params.price > 1) {
      throw new Error('price должен быть между 0 и 1');
    }
    if (!params.size || params.size <= 0) {
      throw new Error('size должен быть больше 0');
    }
  }

  /**
   * Получить информацию о контрактах
   */
  getContractAddresses(): any {
    return this.contractAddresses;
  }

  /**
   * Получить конфигурацию CLOB
   */
  getClobConfig(): any {
    return this.config;
  }

  /**
   * Проверить статус подключения к CLOB API
   */
  async checkConnection(): Promise<boolean> {
    try {
      console.log('🔍 Проверка подключения к CLOB API...');

      // Проверяем подключение через простой запрос
      await this.clobClient.getOk();
      const health = true;

      console.log(`✅ CLOB API доступен: ${health ? 'Да' : 'Нет'}`);
      return health;
    } catch (error) {
      console.error('❌ Ошибка проверки подключения:', error);
      return false;
    }
  }

  /**
   * Получить время сервера
   */
  async getServerTime(): Promise<number> {
    try {
      const serverTime = await this.clobClient.getServerTime();
      console.log(`🕐 Время сервера: ${new Date(serverTime).toISOString()}`);
      return serverTime;
    } catch (error) {
      console.error('❌ Ошибка получения времени сервера:', error);
      throw error;
    }
  }
}