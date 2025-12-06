/**
 * Тест для проверки типизации getMidpoint
 * Проверяет что код работает с объектом {"mid": "0.5"} без использования any
 */

// Типизация для ответа getMidpoint от CLOB API
interface MidpointResponse {
    mid?: string;
    price?: string;
    midpoint?: string;
}

/**
 * Симуляция метода getTokenPrice с правильной типизацией
 */
function parsePrice(midpoint: unknown): number | null {
    try {
        // Определяем тип возвращаемого значения
        let priceStr: string;
        if (typeof midpoint === 'string') {
            // Если вернулась строка напрямую
            priceStr = midpoint;
        } else if (typeof midpoint === 'object' && midpoint !== null) {
            // Если вернулся объект, извлекаем из известных полей
            const response = midpoint as MidpointResponse;
            priceStr = response.mid || response.price || response.midpoint || '';

            if (!priceStr) {
                console.warn(`   ⚠️  Неизвестная структура midpoint: ${JSON.stringify(midpoint)}`);
                return null;
            }
        } else {
            priceStr = String(midpoint);
        }

        const price = parseFloat(priceStr);

        if (isNaN(price)) {
            console.warn(`   ⚠️  Не удалось распарсить цену из: ${priceStr}`);
            return null;
        }

        return price;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️  Ошибка парсинга`);
        console.warn(`   📋 Error: ${errorMessage}`);
        return null;
    }
}

// Тесты
console.warn('🧪 Тестирование типизации getMidpoint\n');

// Test 1: Объект с полем "mid" (реальный формат)
console.warn('Test 1: Объект {"mid": "0.935"}');
const test1 = parsePrice({ mid: "0.935" });
console.warn(`✅ Результат: ${test1}`);
console.warn(`✅ Тип безопасен: нет any типов\n`);

// Test 2: Объект с полем "price"
console.warn('Test 2: Объект {"price": "0.5"}');
const test2 = parsePrice({ price: "0.5" });
console.warn(`✅ Результат: ${test2}\n`);

// Test 3: Строка напрямую
console.warn('Test 3: Строка "0.75"');
const test3 = parsePrice("0.75");
console.warn(`✅ Результат: ${test3}\n`);

// Test 4: Неизвестная структура
console.warn('Test 4: Неизвестная структура {"unknown": "0.5"}');
const test4 = parsePrice({ unknown: "0.5" });
console.warn(`⚠️  Результат: ${test4} (ожидается null)\n`);

// Test 5: Невалидное значение
console.warn('Test 5: Невалидное значение "abc"');
const test5 = parsePrice("abc");
console.warn(`⚠️  Результат: ${test5} (ожидается null)\n`);

// Summary
console.warn('📊 Итоги:');
console.warn(`✅ Test 1 (mid): ${test1 === 0.935 ? 'PASS' : 'FAIL'}`);
console.warn(`✅ Test 2 (price): ${test2 === 0.5 ? 'PASS' : 'FAIL'}`);
console.warn(`✅ Test 3 (string): ${test3 === 0.75 ? 'PASS' : 'FAIL'}`);
console.warn(`✅ Test 4 (unknown): ${test4 === null ? 'PASS' : 'FAIL'}`);
console.warn(`✅ Test 5 (invalid): ${test5 === null ? 'PASS' : 'FAIL'}`);

const allPassed = test1 === 0.935 && test2 === 0.5 && test3 === 0.75 && test4 === null && test5 === null;
console.warn(`\n${allPassed ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ ЕСТЬ ОШИБКИ'}`);

if (allPassed) {
    console.warn('\n🎉 Типизация работает правильно без any!');
    console.warn('💡 Теперь TypeScript будет ловить ошибки на этапе компиляции');
}
