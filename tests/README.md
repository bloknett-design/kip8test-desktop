# Тесты КИПиА

Юнит-тесты для расчётных функций PWA «КИПиА».

## Быстрый старт

```bash
# Из корня репозитория
node tests/run-all.js
```

Возвращает код `0` при успехе, `1` при наличии ошибок. Используется в CI.

## Структура

```
tests/
├── README.md              — эта документация
├── test-helpers.js        — тестовый фреймворк (assertEqual, assertApprox, ...)
├── extract-functions.js   — извлечение чистых функций из index.html
├── run-all.js             — главный раннер (точка входа)
├── test-format.js         — parseLocaleNumber, formatNumber, roundNumber, formatBuoyNumber
├── test-signal.js         — getSignalRangeAndUnit, calculateSignalValue
├── test-buoy.js           — calcBuoyVolume, calcBuoyancyMass
├── test-rtd.js            — calcRtdResistance (Pt), calcCuResistance (Cu)
├── test-thermocouple.js   — calcTcVoltage (K, J, T, N, E, R, S, B)
├── test-orifice.js        — convertOpFlowToM3s, convertOpDpToPa
└── test-utils.js          — escHtml, isWorkingUrl, gdriveShareToDirect, getField
```

## Покрытие

Тесты покрывают **19 чистых функций** (без DOM-зависимости):

| Категория | Функция | Кол-во тестов |
|---|---|---|
| Форматирование | `parseLocaleNumber` | 10 |
| Форматирование | `formatNumber` | 9 |
| Форматирование | `roundNumber` | 4 |
| Форматирование | `formatBuoyNumber` | 6 |
| Сигналы | `getSignalRangeAndUnit` | 13 |
| Сигналы | `calculateSignalValue` | 19 |
| Сигналы | `getBuoySignalRangeAndUnit` | 2 |
| Сигналы | `calculateBuoySignalValue` | 3 |
| Буи | `calcBuoyVolume` | 5 |
| Буи | `calcBuoyancyMass` | 9 |
| ТС | `calcCuResistance` | 7 |
| ТС | `calcRtdResistance` | 12 |
| ТП | `calcTcVoltage` | 28 |
| Диафрагмы | `convertOpFlowToM3s` | 6 |
| Диафрагмы | `convertOpDpToPa` | 11 |
| Утилиты | `escHtml` | 10 |
| Утилиты | `isWorkingUrl` | 13 |
| Утилиты | `gdriveShareToDirect` | 9 |
| Утилиты | `getField` | 9 |
| **Итого** | **19 функций** | **~185 тестов** |

## Эталонные значения

### Сигналы 4-20 мА (ГОСТ 26.010-80)
- 0% → 4 мА (живой ноль)
- 25% → 8 мА
- 50% → 12 мА
- 75% → 16 мА
- 100% → 20 мА

### Платиновые ТС Pt100 (IEC 60751 / ГОСТ 6651-2009)
- R(0°C) = 100.00 Ом
- R(100°C) = 138.51 Ом
- R(-50°C) = 80.31 Ом
- R(200°C) = 175.86 Ом
- R(500°C) = 280.93 Ом

### Медные ТС Cu50 (α=0.00428, ГОСТ 6651-2009)
- R(0°C) = 50 Ом
- R(100°C) = 71.4 Ом
- R(-50°C) = 39.3 Ом

### Термопары (ГОСТ Р 8.585-2001)
| Тип | E(0°C) | E(100°C) | E(500°C) | E(1000°C) |
|---|---|---|---|---|
| ТХА (K) | 0.000 | 4.096 | 20.644 | 41.276 |
| ТЖК (J) | 0.000 | 5.269 | 27.393 | — |
| ТМК (T) | 0.000 | 4.279 | — | — |
| ТПП (S) | 0.000 | 0.646 | 4.234 | 9.587 |
| ТПР (B) | ≈0 | — | 1.242 | 4.834 |

## Подход к тестированию

### Извлечение функций без рефакторинга

Функции в `index.html` находятся внутри `<script>` блоков и ссылаются на DOM (`document`, `showToast`, `navigator`). Чтобы тестировать их без изменения архитектуры single-file, используется `tests/extract-functions.js`:

1. Читается `index.html`
2. Извлекаются все `<script>` блоки
3. Выполняются в **песочнице** `vm.createContext()` с моками DOM
4. Из песочницы извлекаются нужные функции
5. Возвращается объект с 19 функциями

Это позволяет:
- ✅ Тестировать функции в их текущем виде (без выноса в отдельные модули)
- ✅ Не ломать архитектуру single-file
- ✅ Запускать тесты в Node.js без браузера

### Тестовый фреймворк

`tests/test-helpers.js` — минимальный фреймворк без внешних зависимостей:
- `test(name, fn)` — регистрация теста
- `describe(group, fn)` — группировка
- `assertEqual(actual, expected, msg)` — строгое равенство
- `assertApprox(actual, expected, eps, msg)` — равенство с погрешностью (для float)
- `assertThrows(fn, msg)` / `assertNotThrows(fn, msg)`
- `assertTrue(v, msg)` / `assertFalse(v, msg)`
- `runAll()` — запуск всех тестов с цветным выводом

### Что НЕ тестируется

Функции с DOM-зависимостью (читают `document.getElementById(...).value`) не покрываются юнит-тестами, потому что:
- Требуют полного DOM-окружения (jsdom или Puppeteer)
- Сложно мокать состояние формы (значения полей)
- Лучше тестировать через E2E (Puppeteer/Playwright)

К ним относятся: `calcScaleSignal`, `calcPressureError`, `calcRtdError`, `calcTcError`, `calcCircuitBreaker`, `calcOrificeDp`, `calcBuoyCalibration` и т.д.

В будущем можно добавить E2E-тесты через Playwright — они запустят реальный браузер, заполнят формы и проверят результаты.

## Интеграция с CI (GitHub Actions)

Добавьте шаг в `.github/workflows/ci.yml`:

```yaml
- name: Run unit tests
  run: node tests/run-all.js
```

Если тесты упадут — сборка прервётся с ошибкой, деплой не состоится.

## Добавление новых тестов

1. Определите, к какой группе относится функция (format / signal / buoy / rtd / ...)
2. Откройте соответствующий файл `tests/test-<group>.js`
3. Добавьте `test('название', () => { ... })` внутри `describe(...)`
4. Запустите `node tests/run-all.js` — тест автоматически подхватится

### Пример добавления теста

```javascript
describe('calculateSignalValue — дополнительные проверки', () => {

    test('4-20 мА: 10% → 5.6 мА', () => {
        const r = fns.calculateSignalValue(10, '4_20');
        // 4 + (20-4) * 0.1 = 4 + 1.6 = 5.6
        assertApprox(r.value, 5.6, 0.0001, '10% должно давать 5.6 мА');
    });
});
```

## Известные баги, выявленные тестами

Все ранее найденные баги в `calcTcVoltage()` для типов T, N, S, B **исправлены** —
коэффициенты полиномов НИСТ заменены на правильные (NIST ITS-90, SRD 60).

Все 14 бывших `xtest` переведены в обычные `test` — они теперь блокируют CI
и защищают от регрессии.

**Корректно работающие типы:** K (ТХА), J (ТЖК), T (ТМК), N (ТНН), E (ТХКн), R (ТПП), S (ТПП), B (ТПР) — для всех типов тесты проходят в зелёной зоне.

## Известные ограничения

1. **Извлечение функций через eval** — небезопасно для ненадёжного кода, но мы выполняем только собственный `index.html`
2. **Моки DOM минимальны** — если функция обращается к нестандартному свойству DOM, тест упадёт (нужно расширить `_createMockElement`)
3. **Точность float** — все сравнения с погрешностью `eps`, обычно `0.0001` для расчётов и `0.05` для термопар (полиномы НИСТ)
