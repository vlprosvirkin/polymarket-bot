/**
 * Эмиттер сигналов: вывод в консоль и сохранение в файл/БД
 */

import * as fs from 'fs';
import * as path from 'path';
import { CopySignal, SignalsData } from '../types';
import { COPY_TRADING_CONFIG } from '../config';
import { getDatabase, PostgresAdapter } from '../../database';

const DATA_DIR = path.join(process.cwd(), COPY_TRADING_CONFIG.paths.dataDir);
const SIGNALS_FILE = path.join(DATA_DIR, COPY_TRADING_CONFIG.paths.signalsFile);

// Максимум сигналов в истории
const MAX_SIGNALS_HISTORY = 100;

export class SignalEmitter {
    private db: PostgresAdapter | null = null;

    constructor() {
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

    private readSignals(): SignalsData {
        this.ensureDataDir();

        if (!fs.existsSync(SIGNALS_FILE)) {
            return { signals: [] };
        }

        try {
            const content = fs.readFileSync(SIGNALS_FILE, 'utf-8');
            return JSON.parse(content) as SignalsData;
        } catch {
            return { signals: [] };
        }
    }

    private writeSignals(data: SignalsData): void {
        this.ensureDataDir();
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify(data, null, 2));
    }

    /**
     * Отправить сигнал (вывод в консоль + сохранение)
     */
    async emit(signal: CopySignal): Promise<void> {
        // 1. Вывод в консоль
        this.logSignal(signal);

        // 2. Сохранение в БД (если доступна)
        if (this.db && this.db.isReady()) {
            try {
                await this.db.saveSignal({
                    source: 'copy',
                    wallet_address: signal.wallet,
                    wallet_name: signal.walletName,
                    condition_id: signal.trade.conditionId,
                    market_slug: signal.trade.slug,
                    question: signal.trade.question,
                    token_id: signal.trade.tokenId,
                    action: signal.action,
                    side: signal.trade.side,
                    outcome: signal.trade.outcome,
                    confidence: signal.confidence,
                    suggested_price: signal.trade.price,
                    suggested_size: signal.suggestedSize,
                    max_price: signal.maxPrice,
                    reasons: signal.reasons
                });
            } catch (error) {
                console.warn('⚠️  Ошибка сохранения сигнала в БД:', error instanceof Error ? error.message : String(error));
            }
        }

        // 3. Сохранение в файл (fallback)
        this.saveSignal(signal);
    }

    /**
     * Вывод сигнала в консоль
     */
    private logSignal(signal: CopySignal): void {
        const emoji = signal.action === 'FOLLOW' ? '🟢' : '⚪';
        const walletName = signal.walletName || signal.wallet.slice(0, 10) + '...';

        console.log(`\n${emoji} SIGNAL: ${signal.action}`);
        console.log(`   Wallet: ${walletName}`);
        console.log(`   Trade: ${signal.trade.side} ${signal.trade.outcome} @ ${(signal.trade.price * 100).toFixed(2)}%`);
        console.log(`   Market: ${signal.trade.question.slice(0, 60)}...`);
        console.log(`   Size: $${signal.trade.notional.toFixed(2)}`);
        console.log(`   Confidence: ${(signal.confidence * 100).toFixed(0)}%`);

        if (signal.action === 'FOLLOW') {
            console.log(`   📊 Recommended:`);
            console.log(`      Size: $${signal.suggestedSize?.toFixed(2)}`);
            console.log(`      Max Price: ${((signal.maxPrice || 0) * 100).toFixed(2)}%`);
        }

        console.log(`   Reasons:`);
        for (const reason of signal.reasons) {
            console.log(`      - ${reason}`);
        }
    }

    /**
     * Сохранить сигнал в историю
     */
    private saveSignal(signal: CopySignal): void {
        const data = this.readSignals();

        // Добавляем новый сигнал в начало
        data.signals.unshift(signal);

        // Ограничиваем историю
        if (data.signals.length > MAX_SIGNALS_HISTORY) {
            data.signals = data.signals.slice(0, MAX_SIGNALS_HISTORY);
        }

        this.writeSignals(data);
    }

    /**
     * Получить последние сигналы
     */
    getRecentSignals(limit: number = 10): CopySignal[] {
        const data = this.readSignals();
        return data.signals.slice(0, limit);
    }

    /**
     * Получить только FOLLOW сигналы
     */
    getFollowSignals(limit: number = 10): CopySignal[] {
        const data = this.readSignals();
        return data.signals
            .filter(s => s.action === 'FOLLOW')
            .slice(0, limit);
    }
}
