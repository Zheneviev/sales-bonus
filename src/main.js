/**
 * Расчёт выручки от продажи одного товара с учётом скидки
 * @param purchase — запись из items чека (sku, discount, quantity, sale_price)
 * @param _product — карточка товара из каталога (не используется, но оставлена для гибкости)
 * @returns {number} — выручка с учётом скидки
 */
function calculateSimpleRevenue(purchase, _product) {
   const { discount, sale_price, quantity } = purchase;

   // Переводим скидку из процентов в коэффициент:
   // скидка 7.68% → 1 - 0.0768 = 0.9232
   // Это доля суммы, которую покупатель реально платит
   const discountCoefficient = 1 - (discount / 100);

   // Выручка = цена × количество × коэффициент после скидки
   return sale_price * quantity * discountCoefficient;
}

/**
 * Расчёт бонуса продавца на основе его позиции в рейтинге
 * @param index — позиция в отсортированном массиве (0 = лучший)
 * @param total — общее число продавцов
 * @param seller — объект со статистикой продавца (берём profit)
 * @returns {number} — бонус в рублях
 */
function calculateBonusByProfit(index, total, seller) {
    const { profit } = seller;

    // index 0 — первое место, прибыль максимальная → 15%
    if (index === 0) {
        return profit * 0.15;
    }

    // index 1 и 2 — второе и третье место → 10%
    else if (index === 1 || index === 2) {
        return profit * 0.10;
    }

    // Последнее место (total - 1) → 0%
    else if (index === total - 1) {
        return 0;
    }

    // Все остальные → 5%
    else {
        return profit * 0.05;
    }
}

/**
 * Главная функция: анализ продаж, рейтинг продавцов, расчёт бонусов
 * @param data — объект с коллекциями sellers, products, purchase_records, customers
 * @param options — { calculateRevenue, calculateBonus }
 * @returns массив отчётов по каждому продавцу
 */
function analyzeSalesData(data, options) {

    // ──────────────────────────────────────────────
    // ШАГ 1. Проверка входных данных
    // Если data нет, или коллекции не массивы, или пустые — выбрасываем ошибку
    // ──────────────────────────────────────────────
    if (!data
        || !Array.isArray(data.sellers) || data.sellers.length === 0
        || !Array.isArray(data.products) || data.products.length === 0
        || !Array.isArray(data.purchase_records) || data.purchase_records.length === 0
    ) {
        throw new Error('Некорректные входные данные');
    }

    // ──────────────────────────────────────────────
    // ШАГ 2. Проверка наличия опций
    // Достаём функции из options и проверяем, что они переданы
    // ──────────────────────────────────────────────
    const { calculateRevenue, calculateBonus } = options;

    if (!calculateRevenue || !calculateBonus) {
        throw new Error('Не переданы функции для расчёта');
    }

    // ──────────────────────────────────────────────
    // ШАГ 3. Подготовка промежуточных данных
    // Для каждого продавца создаём объект-аккумулятор
    // ──────────────────────────────────────────────
    const sellerStats = data.sellers.map(seller => ({
        id: seller.id,
        name: `${seller.first_name} ${seller.last_name}`,
        revenue: 0,          // накопленная выручка
        profit: 0,           // накопленная прибыль
        sales_count: 0,      // количество чеков (продаж)
        products_sold: {}    // { sku: количество } — сколько штук каждого товара продал
    }));

    // ──────────────────────────────────────────────
    // ШАГ 4. Индексация для быстрого доступа
    // sellerIndex: id продавца → его объект статистики
    // productIndex: sku товара → карточка товара из каталога
    // ──────────────────────────────────────────────
    const sellerIndex = Object.fromEntries(
        sellerStats.map(seller => [seller.id, seller])
    );

    const productIndex = Object.fromEntries(
        data.products.map(product => [product.sku, product])
    );

    // ──────────────────────────────────────────────
    // ШАГ 5. Расчёт выручки и прибыли для каждого продавца
    // Двойной цикл: чеки → товары в чеке
    // ──────────────────────────────────────────────
    data.purchase_records.forEach(record => {

        // Достаём продавца из индекса по seller_id из чека
        const seller = sellerIndex[record.seller_id];

        // Увеличиваем счётчик продаж (число чеков)
        seller.sales_count += 1;

        // Добавляем выручку чека (total_amount — уже со скидкой)
        seller.revenue += record.total_amount;

        // Перебираем товары в чеке
        record.items.forEach(item => {

            // Достаём карточку товара по артикулу
            const product = productIndex[item.sku];

            // Себестоимость = закупочная цена × количество
            const cost = product.purchase_price * item.quantity;

            // Выручка с учётом скидки — через переданную функцию
            const revenue = calculateRevenue(item, product);

            // Прибыль = выручка минус себестоимость
            const profit = revenue - cost;

            // Добавляем прибыль к накопленной
            seller.profit += profit;

            // Учитываем проданное количество товара
            if (!seller.products_sold[item.sku]) {
                seller.products_sold[item.sku] = 0;
            }
            seller.products_sold[item.sku] += item.quantity;
        });
    });

    // ──────────────────────────────────────────────
    // ШАГ 6. Сортировка продавцов по прибыли (по убыванию)
    // Самый прибыльный — на первом месте (index 0)
    // ──────────────────────────────────────────────
    sellerStats.sort((a, b) => b.profit - a.profit);

    // ──────────────────────────────────────────────
    // ШАГ 7. Назначение премий и формирование топ-10 товаров
    // ──────────────────────────────────────────────
    sellerStats.forEach((seller, index) => {

        // Считаем бонус через переданную функцию
        const total = sellerStats.length;
        seller.bonus = calculateBonus(index, total, seller);

        // Превращаем products_sold { sku: qty } → массив [{ sku, quantity }]
        // Сортируем по убыванию количества, берём топ-10
        seller.top_products = Object.entries(seller.products_sold)
            .map(([sku, quantity]) => ({ sku, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
    });

    // ──────────────────────────────────────────────
    // ШАГ 8. Формирование итогового отчёта
    // Округляем числа до двух знаков после точки
    // ──────────────────────────────────────────────
    return sellerStats.map(seller => ({
        seller_id: seller.id,
        name: seller.name,
        revenue: +seller.revenue.toFixed(2),
        profit: +seller.profit.toFixed(2),
        sales_count: seller.sales_count,
        top_products: seller.top_products,
        bonus: +seller.bonus.toFixed(2)
    }));
}