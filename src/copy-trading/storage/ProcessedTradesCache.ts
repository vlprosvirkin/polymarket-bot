/**
 * Кэш обработанных сделок (чтобы не обрабатывать повторно)
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProcessedTradesData } from '../types';
import { COPY_TRADING_CONFIG } from '../config';

const DATA_DIR = path.join(process.cwd(), COPY_TRADING_CONFIG.paths.dataDir);
const CACHE_FILE = path.join(DATA_DIR, COPY_TRADING_CONFIG.paths.processedTradesFile);

// Очищаем кэш раз в 24 часа
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class ProcessedTradesCache {
    private cache: Set<string> = new Set();
    private lastCleanup: Date = new Date();

    constructor() {
        this.load();
    }

    private ensureDataDir(): void {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    private load(): void {
        this.ensureDataDir();

        if (!fs.existsSync(CACHE_FILE)) {
            return;
        }

        try {
            const content = fs.readFileSync(CACHE_FILE, 'utf-8');
            const data: ProcessedTradesData = JSON.parse(content);
            this.cache = new Set(data.processedIds);
            this.lastCleanup = new Date(data.lastCleanup);

            // Проверяем нужна ли очистка
            if (Date.now() - this.lastCleanup.getTime() > MAX_AGE_MS) {
                this.cleanup();
            }
        } catch {
            this.cache = new Set();
            this.lastCleanup = new Date();
        }
    }

    private save(): void {
        this.ensureDataDir();

        const data: ProcessedTradesData = {
            processedIds: Array.from(this.cache),
            lastCleanup: this.lastCleanup.toISOString()
        };

        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    }

    /**
     * Проверить, была ли сделка уже обработана
     */
    isProcessed(tradeId: string): boolean {
        return this.cache.has(tradeId);
    }

    /**
     * Отметить сделку как обработанную
     */
    markProcessed(tradeId: string): void {
        this.cache.add(tradeId);
        this.save();
    }

    /**
     * Отметить несколько сделок как обработанные
     */
    markProcessedBatch(tradeIds: string[]): void {
        for (const id of tradeIds) {
            this.cache.add(id);
        }
        this.save();
    }

    /**
     * Очистить кэш
     */
    cleanup(): void {
        console.log('🗑️  Cleaning up processed trades cache...');
        this.cache.clear();
        this.lastCleanup = new Date();
        this.save();
        console.log('✅ Cache cleaned');
    }

    /**
     * Получить количество записей в кэше
     */
    size(): number {
        return this.cache.size;
    }
}
