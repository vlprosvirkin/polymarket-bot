import { ethers } from 'ethers';
import { WalletService } from './WalletService';
import { Market, Position, TradeParams, ContractAddresses } from '../types';

export class PolymarketService {
  private walletService: WalletService;
  private conditionalTokensContract: ethers.Contract;
  private collateralTokenContract: ethers.Contract;
  private contractAddresses: ContractAddresses;

  constructor(walletService: WalletService) {
    this.walletService = walletService;
    
    this.contractAddresses = {
      conditionalTokens: process.env.POLYMARKET_CONDITIONAL_TOKENS || '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
      collateralToken: process.env.POLYMARKET_COLLATERAL_TOKEN || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      polymarketCore: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'
    };

    // ABI для ConditionalTokens контракта
    const conditionalTokensABI = [
      'function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external',
      'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
      'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external',
      'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
      'function balanceOf(address owner, uint256 id) view returns (uint256)',
      'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external',
      'function setApprovalForAll(address operator, bool approved) external',
      'function isApprovedForAll(address owner, address operator) view returns (bool)'
    ];

    // ABI для ERC20 токена (USDC)
    const erc20ABI = [
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    this.conditionalTokensContract = new ethers.Contract(
      this.contractAddresses.conditionalTokens,
      conditionalTokensABI,
      this.walletService.getWallet()
    );

    this.collateralTokenContract = new ethers.Contract(
      this.contractAddresses.collateralToken,
      erc20ABI,
      this.walletService.getWallet()
    );
  }

  /**
   * Получить баланс коллатерального токена (USDC)
   */
  async getCollateralBalance(): Promise<string> {
    const balance = await this.collateralTokenContract.balanceOf(this.walletService.getAddress());
    const decimals = await this.collateralTokenContract.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  /**
   * Одобрить расходование токенов для контракта
   */
  async approveCollateral(amount: string): Promise<ethers.TransactionResponse> {
    const decimals = await this.collateralTokenContract.decimals();
    const amountWei = ethers.parseUnits(amount, decimals);
    
    return await this.collateralTokenContract.approve(
      this.contractAddresses.conditionalTokens,
      amountWei
    );
  }

  /**
   * Проверить одобрение расходования токенов
   */
  async getCollateralAllowance(): Promise<string> {
    const allowance = await this.collateralTokenContract.allowance(
      this.walletService.getAddress(),
      this.contractAddresses.conditionalTokens
    );
    const decimals = await this.collateralTokenContract.decimals();
    return ethers.formatUnits(allowance, decimals);
  }

  /**
   * Получить баланс позиции в рынке
   */
  async getPositionBalance(conditionId: string, outcomeIndex: number): Promise<string> {
    const positionId = ethers.solidityPackedKeccak256(
      ['address', 'bytes32', 'uint256'],
      [this.contractAddresses.collateralToken, conditionId, outcomeIndex]
    );

    const balance = await this.conditionalTokensContract.balanceOf(
      this.walletService.getAddress(),
      positionId
    );

    const decimals = await this.collateralTokenContract.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  /**
   * Создать условие для рынка
   */
  async createCondition(oracle: string, questionId: string, outcomeSlotCount: number): Promise<ethers.TransactionResponse> {
    return await this.conditionalTokensContract.prepareCondition(
      oracle,
      questionId,
      outcomeSlotCount
    );
  }

  /**
   * Разделить позицию
   */
  async splitPosition(
    parentCollectionId: string,
    conditionId: string,
    partition: number[],
    amount: string
  ): Promise<ethers.TransactionResponse> {
    const decimals = await this.collateralTokenContract.decimals();
    const amountWei = ethers.parseUnits(amount, decimals);

    return await this.conditionalTokensContract.splitPosition(
      this.contractAddresses.collateralToken,
      parentCollectionId,
      conditionId,
      partition,
      amountWei
    );
  }

  /**
   * Объединить позиции
   */
  async mergePositions(
    parentCollectionId: string,
    conditionId: string,
    partition: number[],
    amount: string
  ): Promise<ethers.TransactionResponse> {
    const decimals = await this.collateralTokenContract.decimals();
    const amountWei = ethers.parseUnits(amount, decimals);

    return await this.conditionalTokensContract.mergePositions(
      this.contractAddresses.collateralToken,
      parentCollectionId,
      conditionId,
      partition,
      amountWei
    );
  }

  /**
   * Погасить позиции
   */
  async redeemPositions(
    parentCollectionId: string,
    conditionId: string,
    indexSets: number[]
  ): Promise<ethers.TransactionResponse> {
    return await this.conditionalTokensContract.redeemPositions(
      this.contractAddresses.collateralToken,
      parentCollectionId,
      conditionId,
      indexSets
    );
  }

  /**
   * Перевести токены позиции
   */
  async transferPosition(
    to: string,
    conditionId: string,
    outcomeIndex: number,
    amount: string
  ): Promise<ethers.TransactionResponse> {
    const positionId = ethers.solidityPackedKeccak256(
      ['address', 'bytes32', 'uint256'],
      [this.contractAddresses.collateralToken, conditionId, outcomeIndex]
    );

    const decimals = await this.collateralTokenContract.decimals();
    const amountWei = ethers.parseUnits(amount, decimals);

    return await this.conditionalTokensContract.safeTransferFrom(
      this.walletService.getAddress(),
      to,
      positionId,
      amountWei,
      '0x'
    );
  }

  /**
   * Установить одобрение для оператора
   */
  async setApprovalForAll(operator: string, approved: boolean): Promise<ethers.TransactionResponse> {
    return await this.conditionalTokensContract.setApprovalForAll(operator, approved);
  }

  /**
   * Проверить одобрение для оператора
   */
  async isApprovedForAll(operator: string): Promise<boolean> {
    return await this.conditionalTokensContract.isApprovedForAll(
      this.walletService.getAddress(),
      operator
    );
  }

  /**
   * Получить информацию о контрактах
   */
  getContractAddresses(): ContractAddresses {
    return this.contractAddresses;
  }

  /**
   * Получить экземпляр контракта ConditionalTokens
   */
  getConditionalTokensContract(): ethers.Contract {
    return this.conditionalTokensContract;
  }

  /**
   * Получить экземпляр контракта коллатерального токена
   */
  getCollateralTokenContract(): ethers.Contract {
    return this.collateralTokenContract;
  }
}
