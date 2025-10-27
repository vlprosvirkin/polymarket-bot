import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

export interface WalletConfig {
  privateKey: string;
  rpcUrl: string;
  chainId: number;
}

export class WalletService {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private config: WalletConfig;

  constructor() {
    this.config = {
      privateKey: process.env.PRIVATE_KEY || '',
      rpcUrl: process.env.RPC_URL || 'https://polygon-rpc.com',
      chainId: parseInt(process.env.CHAIN_ID || '137')
    };

    if (!this.config.privateKey) {
      throw new Error('PRIVATE_KEY is required in environment variables');
    }

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);
  }

  /**
   * Получить адрес кошелька
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Получить баланс кошелька в ETH
   */
  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  /**
   * Получить баланс токена по адресу контракта
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.wallet
    );
    
    const balance = await contract.balanceOf(this.wallet.address);
    return ethers.formatEther(balance);
  }

  /**
   * Отправить транзакцию
   */
  async sendTransaction(to: string, value: string, data?: string): Promise<ethers.TransactionResponse> {
    const tx = {
      to,
      value: ethers.parseEther(value),
      data: data || '0x'
    };

    return await this.wallet.sendTransaction(tx);
  }

  /**
   * Подписать сообщение
   */
  async signMessage(message: string): Promise<string> {
    return await this.wallet.signMessage(message);
  }

  /**
   * Получить провайдер для работы с контрактами
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Получить кошелек для подписи транзакций
   */
  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  /**
   * Проверить подключение к сети
   */
  async checkConnection(): Promise<boolean> {
    try {
      const network = await this.provider.getNetwork();
      return network.chainId === BigInt(this.config.chainId);
    } catch (error) {
      console.error('Connection check failed:', error);
      return false;
    }
  }

  /**
   * Получить информацию о сети
   */
  async getNetworkInfo(): Promise<{ chainId: bigint; name: string }> {
    const network = await this.provider.getNetwork();
    return {
      chainId: network.chainId,
      name: network.name
    };
  }
}
