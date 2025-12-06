/**
 * Хранилище кошельков (PostgreSQL + JSON файл как fallback)
 */

import * as fs from 'fs';
import * as path from 'path';
import { WatchedWallet, WalletsData, WalletStats } from '../types';
import { COPY_TRADING_CONFIG } from '../config';
import { getDatabase, PostgresAdapter } from '../../database';

const DATA_DIR = path.join(process.cwd(), COPY_TRADING_CONFIG.paths.dataDir);
const WALLETS_FILE = path.join(DATA_DIR, COPY_TRADING_CONFIG.paths.walletsFile);

export class WalletStore {
    private db: PostgresAdapter | null = null;

    constructor() {
        // Пытаемся использовать БД если она доступна
        if (process.env.DATABASE_URL) {
            try {
                this.db = getDatabase();
            } catch {
                this.db = null;
            }
        }
    }
    private ensureDataDir(): void {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    private readData(): WalletsData {
        this.ensureDataDir();

        if (!fs.existsSync(WALLETS_FILE)) {
            return { wallets: [] };
        }

        try {
            const content = fs.readFileSync(WALLETS_FILE, 'utf-8');
            return JSON.parse(content);
        } catch {
            return { wallets: [] };
        }
    }

    private writeData(data: WalletsData): void {
        this.ensureDataDir();
        fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
    }

    /**
     * Получить все активные кошельки
     */
    async getActiveWalletsAsync(): Promise<WatchedWallet[]> {
        if (this.db && this.db.isReady()) {
            const rows = await this.db.getWallets('active');
            return rows.map(this.rowToWallet);
        }
        return this.getActiveWallets();
    }

    /**
     * Синхронный метод для обратной совместимости
     */
    getActiveWallets(): WatchedWallet[] {
        const data = this.readData();
        return data.wallets.filter(w => w.status === 'active');
    }

    /**
     * Получить все кошельки
     */
    async getAllWalletsAsync(): Promise<WatchedWallet[]> {
        if (this.db && this.db.isReady()) {
            const rows = await this.db.getWallets();
            return rows.map(this.rowToWallet);
        }
        return this.getAllWallets();
    }

    getAllWallets(): WatchedWallet[] {
        return this.readData().wallets;
    }

    private rowToWallet(row: import('../../database/types').WalletRow): WatchedWallet {
        return {
            address: row.address,
            name: row.name || undefined,
            status: row.status,
            addedAt: row.added_at,
            lastCheckedAt: row.last_checked_at || undefined,
            stats: row.total_trades > 0 ? {
                totalTrades: row.total_trades,
                totalVolume: row.avg_trade_size * row.total_trades,
                roi: row.roi,
                winRate: row.win_rate,
                lastUpdated: row.updated_at
            } : undefined
        };
    }

    /**
     * Добавить кошелек
     */
    async addWalletAsync(address: string, name?: string): Promise<WatchedWallet> {
        if (this.db && this.db.isReady()) {
            const row = await this.db.addWallet({ address, name });
            return this.rowToWallet(row);
        }
        return this.addWallet(address, name);
    }

    addWallet(address: string, name?: string): WatchedWallet {
        const data = this.readData();
        const normalizedAddress = address.toLowerCase();

        // Проверяем дубликат
        const existing = data.wallets.find(
            w => w.address.toLowerCase() === normalizedAddress
        );
        if (existing) {
            throw new Error(`Wallet ${address} already exists`);
        }

        const wallet: WatchedWallet = {
            address: normalizedAddress,
            name,
            status: 'active',
            addedAt: new Date(),
        };

        data.wallets.push(wallet);
        this.writeData(data);

        return wallet;
    }

    /**
     * Удалить кошелек
     */
    async removeWalletAsync(address: string): Promise<boolean> {
        if (this.db && this.db.isReady()) {
            return this.db.removeWallet(address);
        }
        return this.removeWallet(address);
    }

    removeWallet(address: string): boolean {
        const data = this.readData();
        const normalizedAddress = address.toLowerCase();

        const index = data.wallets.findIndex(
            w => w.address.toLowerCase() === normalizedAddress
        );

        if (index === -1) {
            return false;
        }

        data.wallets.splice(index, 1);
        this.writeData(data);
        return true;
    }

    /**
     * Изменить статус кошелька
     */
    async setStatusAsync(address: string, status: 'active' | 'paused'): Promise<boolean> {
        if (this.db && this.db.isReady()) {
            return this.db.updateWalletStatus(address, status);
        }
        return this.setStatus(address, status);
    }

    setStatus(address: string, status: 'active' | 'paused'): boolean {
        const data = this.readData();
        const normalizedAddress = address.toLowerCase();

        const wallet = data.wallets.find(
            w => w.address.toLowerCase() === normalizedAddress
        );

        if (!wallet) {
            return false;
        }

        wallet.status = status;
        this.writeData(data);
        return true;
    }

    /**
     * Обновить lastCheckedAt для списка кошельков
     */
    async updateLastCheckedAsync(addresses: string[]): Promise<void> {
        if (this.db && this.db.isReady()) {
            await this.db.updateWalletLastChecked(addresses);
            return;
        }
        this.updateLastChecked(addresses);
    }

    updateLastChecked(addresses: string[]): void {
        const data = this.readData();
        const now = new Date();

        for (const wallet of data.wallets) {
            if (addresses.some(a => a.toLowerCase() === wallet.address.toLowerCase())) {
                wallet.lastCheckedAt = now;
            }
        }

        this.writeData(data);
    }

    /**
     * Обновить статистику кошелька
     */
    async updateStatsAsync(address: string, stats: WalletStats): Promise<boolean> {
        if (this.db && this.db.isReady()) {
            return this.db.updateWalletStats(address, {
                total_trades: stats.totalTrades,
                winning_trades: Math.round(stats.totalTrades * stats.winRate),
                total_pnl: stats.totalVolume * stats.roi,
                roi: stats.roi,
                avg_trade_size: stats.totalVolume / (stats.totalTrades || 1),
                win_rate: stats.winRate
            });
        }
        return this.updateStats(address, stats);
    }

    updateStats(address: string, stats: WalletStats): boolean {
        const data = this.readData();
        const normalizedAddress = address.toLowerCase();

        const wallet = data.wallets.find(
            w => w.address.toLowerCase() === normalizedAddress
        );

        if (!wallet) {
            return false;
        }

        wallet.stats = stats;
        this.writeData(data);
        return true;
    }

    /**
     * Проверить готовность БД
     */
    isDatabaseReady(): boolean {
        return this.db !== null && this.db.isReady();
    }
}
