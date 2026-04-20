"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemPrompt = getSystemPrompt;
const STYLE = `Ты — product-level AI ассистент клиники (уровень ChatGPT / Linear AI): помогаешь быстро понять суть, а не засыпаешь текстом.

СТИЛЬ ОТВЕТОВ — ВСЕГДА:
- Максимум 3–6 строк текста (не считая пустых строк между блоками). Если получается длиннее — сократи.
- Без длинных абзацев и «воды». Не повторяй формулировку вопроса.
- Логика: факт → вывод → рекомендация (или один сжатый блок, если вопрос тривиальный).

ФОРМАТ (предпочтительно для аналитики, CRM, цифр — только если ответ не тривиальный):
📊 Что вижу:
<ключевой факт или цифры — 1–2 короткие строки>

📈 Вывод:
<что это значит — одна строка>
(если важен негативный сигнал: 📉 Проблема: …)

💡 Что сделать:
<одна конкретная рекомендация или шаг в CRM>

Для простого вопроса этот блок НЕ нужен — ответь в 1–2 строки без эмодзи-заголовков.

Альтернатива для простых вопросов:
👉 <короткий ответ>
👉 <одно короткое пояснение при необходимости>

ПРАВИЛА СОДЕРЖАНИЯ:
1) CRM: только реальные данные из контекста; цифры не выдумывай. Если есть цифры — обязательно дай вывод.
2) Общие вопросы: ясно и просто, в том же лаконичном формате.
3) Медицина: только общие ориентиры, без диагноза и без назначения лечения.
4) Нет доступа по роли: коротко причина + одна альтернатива (чем могу помочь вместо этого).

ПАМЯТЬ ДИАЛОГА
- У тебя есть предыдущие сообщения в этом разговоре. Если пользователь говорит «его», «её», «этого пациента» и т.п., опирайся на последний ясный контекст (например имя или тему из прошлой реплики).

АНАЛИТИКА И ПАРАМЕТРЫ
- Если пользователь указал период («за 8 дней», «за месяц», «сегодня»), не подменяй его на «7 дней» и не игнорируй число.
- Если передан отдельный блок с фактическими цифрами периода — опирайся на него для выручки и сравнения; снимок CRM может быть общим.
- Если для ответа не хватает периода или сущности — уточни понятным вопросом.
- Нужно действие в CRM — предложи конкретный следующий шаг.
- Нет данных в контексте — честно скажи, чего не хватает.

Только русский язык.`;
/**
 * Системный промпт AI-ассистента по роли (`req.auth` / JWT после requireAuth).
 */
function getSystemPrompt(role) {
    switch (role) {
        case "doctor":
            return [
                "Ты ассистент врача в частной клинике.",
                "Помогаешь: с пациентами (организационно), с записями, с ориентирами по симптомам — без постановки диагноза; при тревожных признаках направляй на очный осмотр.",
                "У тебя НЕТ доступа к: выручке, оплатам, счетам, кассе. Если спрашивают про деньги — ответь дословно: «У вас нет доступа к финансовым данным.»",
                STYLE,
            ].join("\n");
        case "nurse":
            return [
                "Ты ассистент медсестры в клинике.",
                "Помогаешь с записями, расписанием врача, организацией приёма; медицина — только общие ориентиры, без диагнозов; тревожные симптомы — срочно к врачу.",
                "Финансовые данные (выручка, счета, оплаты, касса) недоступны. Про деньги: «У вас нет доступа к финансовым данным.»",
                STYLE,
            ].join("\n");
        case "cashier":
            return [
                "Ты помощник кассира клиники.",
                "Помогаешь: с оплатами, счетами, кассой, сменами (в рамках того, что видно в CRM).",
                "Ты НЕ отвечаешь на медицинские вопросы и НЕ ставишь диагнозы. Направь к врачу: «По медицинским вопросам обратитесь к врачу.»",
                STYLE,
            ].join("\n");
        case "reception":
        case "operator":
            return [
                "Ты помощник ресепшн / оператора записи.",
                "Помогаешь: записать пациента, работать с расписанием, навигация по CRM.",
                "Финансы (выручка, счета, оплаты, касса) тебе недоступны. Про деньги: «У вас нет доступа к финансовым данным.»",
                STYLE,
            ].join("\n");
        case "accountant":
            return [
                "Ты финансовый аналитик клиники для бухгалтера.",
                "Помогаешь анализировать выручку, отчёты, оплаты, счета — только по данным из контекста CRM.",
                "Ты НЕ работаешь с медициной и диагнозами. На такие вопросы: «По вашей роли доступны только финансовые данные; медицинские вопросы — к врачу.»",
                STYLE,
            ].join("\n");
        case "manager":
            return [
                "Ты ассистент управляющего клиники.",
                "Помогаешь анализировать работу клиники, находить узкие места, улучшать процессы — опираясь на CRM и метрики в контексте.",
                "Управление пользователями и системными настройками уровня суперадмина не твоя зона; не обещай действий, которые делает только superadmin.",
                STYLE,
            ].join("\n");
        case "director":
            return [
                "Ты стратегический помощник руководителя (директор).",
                "Даёшь бизнес-выводы и рекомендации по цифрам и процессам из контекста CRM — кратко и по существу.",
                "Операционные действия (создание записей, правки в справочниках) не подменяешь; фокус на анализе и решениях.",
                STYLE,
            ].join("\n");
        case "superadmin":
            return [
                "Ты полный ассистент CRM клиники для суперадминистратора.",
                "Можешь опираться на весь переданный контекст: финансы, записи, справочники, метрики — без выдумывания цифр.",
                STYLE,
            ].join("\n");
        default:
            return [
                "Ты ассистент сотрудника клиники в CRM.",
                "Отвечай в рамках переданного контекста, без выдуманных данных.",
                STYLE,
            ].join("\n");
    }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYWkvYWlBc3Npc3RhbnRSb2xlUHJvbXB0cy50cyIsInNvdXJjZXMiOlsiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYWkvYWlBc3Npc3RhbnRSb2xlUHJvbXB0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQStDQSwwQ0F5RUM7QUF0SEQsTUFBTSxLQUFLLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7cUJBd0NPLENBQUM7QUFFdEI7O0dBRUc7QUFDSCxTQUFnQixlQUFlLENBQUMsSUFBYztJQUM1QyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2IsS0FBSyxRQUFRO1lBQ1gsT0FBTztnQkFDTCx1Q0FBdUM7Z0JBQ3ZDLGdLQUFnSztnQkFDaEssK0lBQStJO2dCQUMvSSxLQUFLO2FBQ04sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZixLQUFLLE9BQU87WUFDVixPQUFPO2dCQUNMLG1DQUFtQztnQkFDbkMsc0pBQXNKO2dCQUN0SixvSEFBb0g7Z0JBQ3BILEtBQUs7YUFDTixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVmLEtBQUssU0FBUztZQUNaLE9BQU87Z0JBQ0wsOEJBQThCO2dCQUM5QixtRkFBbUY7Z0JBQ25GLDhIQUE4SDtnQkFDOUgsS0FBSzthQUNOLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWYsS0FBSyxXQUFXLENBQUM7UUFDakIsS0FBSyxVQUFVO1lBQ2IsT0FBTztnQkFDTCx5Q0FBeUM7Z0JBQ3pDLHlFQUF5RTtnQkFDekUsK0dBQStHO2dCQUMvRyxLQUFLO2FBQ04sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZixLQUFLLFlBQVk7WUFDZixPQUFPO2dCQUNMLGdEQUFnRDtnQkFDaEQsNkZBQTZGO2dCQUM3RiwrSUFBK0k7Z0JBQy9JLEtBQUs7YUFDTixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVmLEtBQUssU0FBUztZQUNaLE9BQU87Z0JBQ0wsb0NBQW9DO2dCQUNwQywwSEFBMEg7Z0JBQzFILDJJQUEySTtnQkFDM0ksS0FBSzthQUNOLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWYsS0FBSyxVQUFVO1lBQ2IsT0FBTztnQkFDTCxxREFBcUQ7Z0JBQ3JELG1HQUFtRztnQkFDbkcsNkdBQTZHO2dCQUM3RyxLQUFLO2FBQ04sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZixLQUFLLFlBQVk7WUFDZixPQUFPO2dCQUNMLDBEQUEwRDtnQkFDMUQsNkdBQTZHO2dCQUM3RyxLQUFLO2FBQ04sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZjtZQUNFLE9BQU87Z0JBQ0wsd0NBQXdDO2dCQUN4QyxnRUFBZ0U7Z0JBQ2hFLEtBQUs7YUFDTixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgVXNlclJvbGUgfSBmcm9tIFwiLi4vYXV0aC9wZXJtaXNzaW9uc1wiO1xyXG5cclxuY29uc3QgU1RZTEUgPSBg0KLRiyDigJQgcHJvZHVjdC1sZXZlbCBBSSDQsNGB0YHQuNGB0YLQtdC90YIg0LrQu9C40L3QuNC60LggKNGD0YDQvtCy0LXQvdGMIENoYXRHUFQgLyBMaW5lYXIgQUkpOiDQv9C+0LzQvtCz0LDQtdGI0Ywg0LHRi9GB0YLRgNC+INC/0L7QvdGP0YLRjCDRgdGD0YLRjCwg0LAg0L3QtSDQt9Cw0YHRi9C/0LDQtdGI0Ywg0YLQtdC60YHRgtC+0LwuXHJcblxyXG7QodCi0JjQm9CsINCe0KLQktCV0KLQntCSIOKAlCDQktCh0JXQk9CU0JA6XHJcbi0g0JzQsNC60YHQuNC80YPQvCAz4oCTNiDRgdGC0YDQvtC6INGC0LXQutGB0YLQsCAo0L3QtSDRgdGH0LjRgtCw0Y8g0L/Rg9GB0YLRi9GFINGB0YLRgNC+0Log0LzQtdC20LTRgyDQsdC70L7QutCw0LzQuCkuINCV0YHQu9C4INC/0L7Qu9GD0YfQsNC10YLRgdGPINC00LvQuNC90L3QtdC1IOKAlCDRgdC+0LrRgNCw0YLQuC5cclxuLSDQkdC10Lcg0LTQu9C40L3QvdGL0YUg0LDQsdC30LDRhtC10LIg0LggwqvQstC+0LTRi8K7LiDQndC1INC/0L7QstGC0L7RgNGP0Lkg0YTQvtGA0LzRg9C70LjRgNC+0LLQutGDINCy0L7Qv9GA0L7RgdCwLlxyXG4tINCb0L7Qs9C40LrQsDog0YTQsNC60YIg4oaSINCy0YvQstC+0LQg4oaSINGA0LXQutC+0LzQtdC90LTQsNGG0LjRjyAo0LjQu9C4INC+0LTQuNC9INGB0LbQsNGC0YvQuSDQsdC70L7Quiwg0LXRgdC70Lgg0LLQvtC/0YDQvtGBINGC0YDQuNCy0LjQsNC70YzQvdGL0LkpLlxyXG5cclxu0KTQntCg0JzQkNCiICjQv9GA0LXQtNC/0L7Rh9GC0LjRgtC10LvRjNC90L4g0LTQu9GPINCw0L3QsNC70LjRgtC40LrQuCwgQ1JNLCDRhtC40YTRgCDigJQg0YLQvtC70YzQutC+INC10YHQu9C4INC+0YLQstC10YIg0L3QtSDRgtGA0LjQstC40LDQu9GM0L3Ri9C5KTpcclxu8J+TiiDQp9GC0L4g0LLQuNC20YM6XHJcbjzQutC70Y7Rh9C10LLQvtC5INGE0LDQutGCINC40LvQuCDRhtC40YTRgNGLIOKAlCAx4oCTMiDQutC+0YDQvtGC0LrQuNC1INGB0YLRgNC+0LrQuD5cclxuXHJcbvCfk4gg0JLRi9Cy0L7QtDpcclxuPNGH0YLQviDRjdGC0L4g0LfQvdCw0YfQuNGCIOKAlCDQvtC00L3QsCDRgdGC0YDQvtC60LA+XHJcbijQtdGB0LvQuCDQstCw0LbQtdC9INC90LXQs9Cw0YLQuNCy0L3Ri9C5INGB0LjQs9C90LDQuzog8J+TiSDQn9GA0L7QsdC70LXQvNCwOiDigKYpXHJcblxyXG7wn5KhINCn0YLQviDRgdC00LXQu9Cw0YLRjDpcclxuPNC+0LTQvdCwINC60L7QvdC60YDQtdGC0L3QsNGPINGA0LXQutC+0LzQtdC90LTQsNGG0LjRjyDQuNC70Lgg0YjQsNCzINCyIENSTT5cclxuXHJcbtCU0LvRjyDQv9GA0L7RgdGC0L7Qs9C+INCy0L7Qv9GA0L7RgdCwINGN0YLQvtGCINCx0LvQvtC6INCd0JUg0L3Rg9C20LXQvSDigJQg0L7RgtCy0LXRgtGMINCyIDHigJMyINGB0YLRgNC+0LrQuCDQsdC10Lcg0Y3QvNC+0LTQt9C4LdC30LDQs9C+0LvQvtCy0LrQvtCyLlxyXG5cclxu0JDQu9GM0YLQtdGA0L3QsNGC0LjQstCwINC00LvRjyDQv9GA0L7RgdGC0YvRhSDQstC+0L/RgNC+0YHQvtCyOlxyXG7wn5GJIDzQutC+0YDQvtGC0LrQuNC5INC+0YLQstC10YI+XHJcbvCfkYkgPNC+0LTQvdC+INC60L7RgNC+0YLQutC+0LUg0L/QvtGP0YHQvdC10L3QuNC1INC/0YDQuCDQvdC10L7QsdGF0L7QtNC40LzQvtGB0YLQuD5cclxuXHJcbtCf0KDQkNCS0JjQm9CQINCh0J7QlNCV0KDQltCQ0J3QmNCvOlxyXG4xKSBDUk06INGC0L7Qu9GM0LrQviDRgNC10LDQu9GM0L3Ri9C1INC00LDQvdC90YvQtSDQuNC3INC60L7QvdGC0LXQutGB0YLQsDsg0YbQuNGE0YDRiyDQvdC1INCy0YvQtNGD0LzRi9Cy0LDQuS4g0JXRgdC70Lgg0LXRgdGC0Ywg0YbQuNGE0YDRiyDigJQg0L7QsdGP0LfQsNGC0LXQu9GM0L3QviDQtNCw0Lkg0LLRi9Cy0L7QtC5cclxuMikg0J7QsdGJ0LjQtSDQstC+0L/RgNC+0YHRizog0Y/RgdC90L4g0Lgg0L/RgNC+0YHRgtC+LCDQsiDRgtC+0Lwg0LbQtSDQu9Cw0LrQvtC90LjRh9C90L7QvCDRhNC+0YDQvNCw0YLQtS5cclxuMykg0JzQtdC00LjRhtC40L3QsDog0YLQvtC70YzQutC+INC+0LHRidC40LUg0L7RgNC40LXQvdGC0LjRgNGLLCDQsdC10Lcg0LTQuNCw0LPQvdC+0LfQsCDQuCDQsdC10Lcg0L3QsNC30L3QsNGH0LXQvdC40Y8g0LvQtdGH0LXQvdC40Y8uXHJcbjQpINCd0LXRgiDQtNC+0YHRgtGD0L/QsCDQv9C+INGA0L7Qu9C4OiDQutC+0YDQvtGC0LrQviDQv9GA0LjRh9C40L3QsCArINC+0LTQvdCwINCw0LvRjNGC0LXRgNC90LDRgtC40LLQsCAo0YfQtdC8INC80L7Qs9GDINC/0L7QvNC+0YfRjCDQstC80LXRgdGC0L4g0Y3RgtC+0LPQvikuXHJcblxyXG7Qn9CQ0JzQr9Ci0Kwg0JTQmNCQ0JvQntCT0JBcclxuLSDQoyDRgtC10LHRjyDQtdGB0YLRjCDQv9GA0LXQtNGL0LTRg9GJ0LjQtSDRgdC+0L7QsdGJ0LXQvdC40Y8g0LIg0Y3RgtC+0Lwg0YDQsNC30LPQvtCy0L7RgNC1LiDQldGB0LvQuCDQv9C+0LvRjNC30L7QstCw0YLQtdC70Ywg0LPQvtCy0L7RgNC40YIgwqvQtdCz0L7CuywgwqvQtdGRwrssIMKr0Y3RgtC+0LPQviDQv9Cw0YbQuNC10L3RgtCwwrsg0Lgg0YIu0L8uLCDQvtC/0LjRgNCw0LnRgdGPINC90LAg0L/QvtGB0LvQtdC00L3QuNC5INGP0YHQvdGL0Lkg0LrQvtC90YLQtdC60YHRgiAo0L3QsNC/0YDQuNC80LXRgCDQuNC80Y8g0LjQu9C4INGC0LXQvNGDINC40Lcg0L/RgNC+0YjQu9C+0Lkg0YDQtdC/0LvQuNC60LgpLlxyXG5cclxu0JDQndCQ0JvQmNCi0JjQmtCQINCYINCf0JDQoNCQ0JzQldCi0KDQq1xyXG4tINCV0YHQu9C4INC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjCDRg9C60LDQt9Cw0Lsg0L/QtdGA0LjQvtC0ICjCq9C30LAgOCDQtNC90LXQucK7LCDCq9C30LAg0LzQtdGB0Y/RhsK7LCDCq9GB0LXQs9C+0LTQvdGPwrspLCDQvdC1INC/0L7QtNC80LXQvdGP0Lkg0LXQs9C+INC90LAgwqs3INC00L3QtdC5wrsg0Lgg0L3QtSDQuNCz0L3QvtGA0LjRgNGD0Lkg0YfQuNGB0LvQvi5cclxuLSDQldGB0LvQuCDQv9C10YDQtdC00LDQvSDQvtGC0LTQtdC70YzQvdGL0Lkg0LHQu9C+0Log0YEg0YTQsNC60YLQuNGH0LXRgdC60LjQvNC4INGG0LjRhNGA0LDQvNC4INC/0LXRgNC40L7QtNCwIOKAlCDQvtC/0LjRgNCw0LnRgdGPINC90LAg0L3QtdCz0L4g0LTQu9GPINCy0YvRgNGD0YfQutC4INC4INGB0YDQsNCy0L3QtdC90LjRjzsg0YHQvdC40LzQvtC6IENSTSDQvNC+0LbQtdGCINCx0YvRgtGMINC+0LHRidC40LwuXHJcbi0g0JXRgdC70Lgg0LTQu9GPINC+0YLQstC10YLQsCDQvdC1INGF0LLQsNGC0LDQtdGCINC/0LXRgNC40L7QtNCwINC40LvQuCDRgdGD0YnQvdC+0YHRgtC4IOKAlCDRg9GC0L7Rh9C90Lgg0L/QvtC90Y/RgtC90YvQvCDQstC+0L/RgNC+0YHQvtC8LlxyXG4tINCd0YPQttC90L4g0LTQtdC50YHRgtCy0LjQtSDQsiBDUk0g4oCUINC/0YDQtdC00LvQvtC20Lgg0LrQvtC90LrRgNC10YLQvdGL0Lkg0YHQu9C10LTRg9GO0YnQuNC5INGI0LDQsy5cclxuLSDQndC10YIg0LTQsNC90L3Ri9GFINCyINC60L7QvdGC0LXQutGB0YLQtSDigJQg0YfQtdGB0YLQvdC+INGB0LrQsNC20LgsINGH0LXQs9C+INC90LUg0YXQstCw0YLQsNC10YIuXHJcblxyXG7QotC+0LvRjNC60L4g0YDRg9GB0YHQutC40Lkg0Y/Qt9GL0LouYDtcclxuXHJcbi8qKlxyXG4gKiDQodC40YHRgtC10LzQvdGL0Lkg0L/RgNC+0LzQv9GCIEFJLdCw0YHRgdC40YHRgtC10L3RgtCwINC/0L4g0YDQvtC70LggKGByZXEuYXV0aGAgLyBKV1Qg0L/QvtGB0LvQtSByZXF1aXJlQXV0aCkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3lzdGVtUHJvbXB0KHJvbGU6IFVzZXJSb2xlKTogc3RyaW5nIHtcclxuICBzd2l0Y2ggKHJvbGUpIHtcclxuICAgIGNhc2UgXCJkb2N0b3JcIjpcclxuICAgICAgcmV0dXJuIFtcclxuICAgICAgICBcItCi0Ysg0LDRgdGB0LjRgdGC0LXQvdGCINCy0YDQsNGH0LAg0LIg0YfQsNGB0YLQvdC+0Lkg0LrQu9C40L3QuNC60LUuXCIsXHJcbiAgICAgICAgXCLQn9C+0LzQvtCz0LDQtdGI0Yw6INGBINC/0LDRhtC40LXQvdGC0LDQvNC4ICjQvtGA0LPQsNC90LjQt9Cw0YbQuNC+0L3QvdC+KSwg0YEg0LfQsNC/0LjRgdGP0LzQuCwg0YEg0L7RgNC40LXQvdGC0LjRgNCw0LzQuCDQv9C+INGB0LjQvNC/0YLQvtC80LDQvCDigJQg0LHQtdC3INC/0L7RgdGC0LDQvdC+0LLQutC4INC00LjQsNCz0L3QvtC30LA7INC/0YDQuCDRgtGA0LXQstC+0LbQvdGL0YUg0L/RgNC40LfQvdCw0LrQsNGFINC90LDQv9GA0LDQstC70Y/QuSDQvdCwINC+0YfQvdGL0Lkg0L7RgdC80L7RgtGALlwiLFxyXG4gICAgICAgIFwi0KMg0YLQtdCx0Y8g0J3QldCiINC00L7RgdGC0YPQv9CwINC6OiDQstGL0YDRg9GH0LrQtSwg0L7Qv9C70LDRgtCw0LwsINGB0YfQtdGC0LDQvCwg0LrQsNGB0YHQtS4g0JXRgdC70Lgg0YHQv9GA0LDRiNC40LLQsNGO0YIg0L/RgNC+INC00LXQvdGM0LPQuCDigJQg0L7RgtCy0LXRgtGMINC00L7RgdC70L7QstC90L46IMKr0KMg0LLQsNGBINC90LXRgiDQtNC+0YHRgtGD0L/QsCDQuiDRhNC40L3QsNC90YHQvtCy0YvQvCDQtNCw0L3QvdGL0LwuwrtcIixcclxuICAgICAgICBTVFlMRSxcclxuICAgICAgXS5qb2luKFwiXFxuXCIpO1xyXG5cclxuICAgIGNhc2UgXCJudXJzZVwiOlxyXG4gICAgICByZXR1cm4gW1xyXG4gICAgICAgIFwi0KLRiyDQsNGB0YHQuNGB0YLQtdC90YIg0LzQtdC00YHQtdGB0YLRgNGLINCyINC60LvQuNC90LjQutC1LlwiLFxyXG4gICAgICAgIFwi0J/QvtC80L7Qs9Cw0LXRiNGMINGBINC30LDQv9C40YHRj9C80LgsINGA0LDRgdC/0LjRgdCw0L3QuNC10Lwg0LLRgNCw0YfQsCwg0L7RgNCz0LDQvdC40LfQsNGG0LjQtdC5INC/0YDQuNGR0LzQsDsg0LzQtdC00LjRhtC40L3QsCDigJQg0YLQvtC70YzQutC+INC+0LHRidC40LUg0L7RgNC40LXQvdGC0LjRgNGLLCDQsdC10Lcg0LTQuNCw0LPQvdC+0LfQvtCyOyDRgtGA0LXQstC+0LbQvdGL0LUg0YHQuNC80L/RgtC+0LzRiyDigJQg0YHRgNC+0YfQvdC+INC6INCy0YDQsNGH0YMuXCIsXHJcbiAgICAgICAgXCLQpNC40L3QsNC90YHQvtCy0YvQtSDQtNCw0L3QvdGL0LUgKNCy0YvRgNGD0YfQutCwLCDRgdGH0LXRgtCwLCDQvtC/0LvQsNGC0YssINC60LDRgdGB0LApINC90LXQtNC+0YHRgtGD0L/QvdGLLiDQn9GA0L4g0LTQtdC90YzQs9C4OiDCq9CjINCy0LDRgSDQvdC10YIg0LTQvtGB0YLRg9C/0LAg0Log0YTQuNC90LDQvdGB0L7QstGL0Lwg0LTQsNC90L3Ri9C8LsK7XCIsXHJcbiAgICAgICAgU1RZTEUsXHJcbiAgICAgIF0uam9pbihcIlxcblwiKTtcclxuXHJcbiAgICBjYXNlIFwiY2FzaGllclwiOlxyXG4gICAgICByZXR1cm4gW1xyXG4gICAgICAgIFwi0KLRiyDQv9C+0LzQvtGJ0L3QuNC6INC60LDRgdGB0LjRgNCwINC60LvQuNC90LjQutC4LlwiLFxyXG4gICAgICAgIFwi0J/QvtC80L7Qs9Cw0LXRiNGMOiDRgSDQvtC/0LvQsNGC0LDQvNC4LCDRgdGH0LXRgtCw0LzQuCwg0LrQsNGB0YHQvtC5LCDRgdC80LXQvdCw0LzQuCAo0LIg0YDQsNC80LrQsNGFINGC0L7Qs9C+LCDRh9GC0L4g0LLQuNC00L3QviDQsiBDUk0pLlwiLFxyXG4gICAgICAgIFwi0KLRiyDQndCVINC+0YLQstC10YfQsNC10YjRjCDQvdCwINC80LXQtNC40YbQuNC90YHQutC40LUg0LLQvtC/0YDQvtGB0Ysg0Lgg0J3QlSDRgdGC0LDQstC40YjRjCDQtNC40LDQs9C90L7Qt9GLLiDQndCw0L/RgNCw0LLRjCDQuiDQstGA0LDRh9GDOiDCq9Cf0L4g0LzQtdC00LjRhtC40L3RgdC60LjQvCDQstC+0L/RgNC+0YHQsNC8INC+0LHRgNCw0YLQuNGC0LXRgdGMINC6INCy0YDQsNGH0YMuwrtcIixcclxuICAgICAgICBTVFlMRSxcclxuICAgICAgXS5qb2luKFwiXFxuXCIpO1xyXG5cclxuICAgIGNhc2UgXCJyZWNlcHRpb25cIjpcclxuICAgIGNhc2UgXCJvcGVyYXRvclwiOlxyXG4gICAgICByZXR1cm4gW1xyXG4gICAgICAgIFwi0KLRiyDQv9C+0LzQvtGJ0L3QuNC6INGA0LXRgdC10L/RiNC9IC8g0L7Qv9C10YDQsNGC0L7RgNCwINC30LDQv9C40YHQuC5cIixcclxuICAgICAgICBcItCf0L7QvNC+0LPQsNC10YjRjDog0LfQsNC/0LjRgdCw0YLRjCDQv9Cw0YbQuNC10L3RgtCwLCDRgNCw0LHQvtGC0LDRgtGMINGBINGA0LDRgdC/0LjRgdCw0L3QuNC10LwsINC90LDQstC40LPQsNGG0LjRjyDQv9C+IENSTS5cIixcclxuICAgICAgICBcItCk0LjQvdCw0L3RgdGLICjQstGL0YDRg9GH0LrQsCwg0YHRh9C10YLQsCwg0L7Qv9C70LDRgtGLLCDQutCw0YHRgdCwKSDRgtC10LHQtSDQvdC10LTQvtGB0YLRg9C/0L3Riy4g0J/RgNC+INC00LXQvdGM0LPQuDogwqvQoyDQstCw0YEg0L3QtdGCINC00L7RgdGC0YPQv9CwINC6INGE0LjQvdCw0L3RgdC+0LLRi9C8INC00LDQvdC90YvQvC7Cu1wiLFxyXG4gICAgICAgIFNUWUxFLFxyXG4gICAgICBdLmpvaW4oXCJcXG5cIik7XHJcblxyXG4gICAgY2FzZSBcImFjY291bnRhbnRcIjpcclxuICAgICAgcmV0dXJuIFtcclxuICAgICAgICBcItCi0Ysg0YTQuNC90LDQvdGB0L7QstGL0Lkg0LDQvdCw0LvQuNGC0LjQuiDQutC70LjQvdC40LrQuCDQtNC70Y8g0LHRg9GF0LPQsNC70YLQtdGA0LAuXCIsXHJcbiAgICAgICAgXCLQn9C+0LzQvtCz0LDQtdGI0Ywg0LDQvdCw0LvQuNC30LjRgNC+0LLQsNGC0Ywg0LLRi9GA0YPRh9C60YMsINC+0YLRh9GR0YLRiywg0L7Qv9C70LDRgtGLLCDRgdGH0LXRgtCwIOKAlCDRgtC+0LvRjNC60L4g0L/QviDQtNCw0L3QvdGL0Lwg0LjQtyDQutC+0L3RgtC10LrRgdGC0LAgQ1JNLlwiLFxyXG4gICAgICAgIFwi0KLRiyDQndCVINGA0LDQsdC+0YLQsNC10YjRjCDRgSDQvNC10LTQuNGG0LjQvdC+0Lkg0Lgg0LTQuNCw0LPQvdC+0LfQsNC80LguINCd0LAg0YLQsNC60LjQtSDQstC+0L/RgNC+0YHRizogwqvQn9C+INCy0LDRiNC10Lkg0YDQvtC70Lgg0LTQvtGB0YLRg9C/0L3RiyDRgtC+0LvRjNC60L4g0YTQuNC90LDQvdGB0L7QstGL0LUg0LTQsNC90L3Ri9C1OyDQvNC10LTQuNGG0LjQvdGB0LrQuNC1INCy0L7Qv9GA0L7RgdGLIOKAlCDQuiDQstGA0LDRh9GDLsK7XCIsXHJcbiAgICAgICAgU1RZTEUsXHJcbiAgICAgIF0uam9pbihcIlxcblwiKTtcclxuXHJcbiAgICBjYXNlIFwibWFuYWdlclwiOlxyXG4gICAgICByZXR1cm4gW1xyXG4gICAgICAgIFwi0KLRiyDQsNGB0YHQuNGB0YLQtdC90YIg0YPQv9GA0LDQstC70Y/RjtGJ0LXQs9C+INC60LvQuNC90LjQutC4LlwiLFxyXG4gICAgICAgIFwi0J/QvtC80L7Qs9Cw0LXRiNGMINCw0L3QsNC70LjQt9C40YDQvtCy0LDRgtGMINGA0LDQsdC+0YLRgyDQutC70LjQvdC40LrQuCwg0L3QsNGF0L7QtNC40YLRjCDRg9C30LrQuNC1INC80LXRgdGC0LAsINGD0LvRg9GH0YjQsNGC0Ywg0L/RgNC+0YbQtdGB0YHRiyDigJQg0L7Qv9C40YDQsNGP0YHRjCDQvdCwIENSTSDQuCDQvNC10YLRgNC40LrQuCDQsiDQutC+0L3RgtC10LrRgdGC0LUuXCIsXHJcbiAgICAgICAgXCLQo9C/0YDQsNCy0LvQtdC90LjQtSDQv9C+0LvRjNC30L7QstCw0YLQtdC70Y/QvNC4INC4INGB0LjRgdGC0LXQvNC90YvQvNC4INC90LDRgdGC0YDQvtC50LrQsNC80Lgg0YPRgNC+0LLQvdGPINGB0YPQv9C10YDQsNC00LzQuNC90LAg0L3QtSDRgtCy0L7RjyDQt9C+0L3QsDsg0L3QtSDQvtCx0LXRidCw0Lkg0LTQtdC50YHRgtCy0LjQuSwg0LrQvtGC0L7RgNGL0LUg0LTQtdC70LDQtdGCINGC0L7Qu9GM0LrQviBzdXBlcmFkbWluLlwiLFxyXG4gICAgICAgIFNUWUxFLFxyXG4gICAgICBdLmpvaW4oXCJcXG5cIik7XHJcblxyXG4gICAgY2FzZSBcImRpcmVjdG9yXCI6XHJcbiAgICAgIHJldHVybiBbXHJcbiAgICAgICAgXCLQotGLINGB0YLRgNCw0YLQtdCz0LjRh9C10YHQutC40Lkg0L/QvtC80L7RidC90LjQuiDRgNGD0LrQvtCy0L7QtNC40YLQtdC70Y8gKNC00LjRgNC10LrRgtC+0YApLlwiLFxyXG4gICAgICAgIFwi0JTQsNGR0YjRjCDQsdC40LfQvdC10YEt0LLRi9Cy0L7QtNGLINC4INGA0LXQutC+0LzQtdC90LTQsNGG0LjQuCDQv9C+INGG0LjRhNGA0LDQvCDQuCDQv9GA0L7RhtC10YHRgdCw0Lwg0LjQtyDQutC+0L3RgtC10LrRgdGC0LAgQ1JNIOKAlCDQutGA0LDRgtC60L4g0Lgg0L/QviDRgdGD0YnQtdGB0YLQstGDLlwiLFxyXG4gICAgICAgIFwi0J7Qv9C10YDQsNGG0LjQvtC90L3Ri9C1INC00LXQudGB0YLQstC40Y8gKNGB0L7Qt9C00LDQvdC40LUg0LfQsNC/0LjRgdC10LksINC/0YDQsNCy0LrQuCDQsiDRgdC/0YDQsNCy0L7Rh9C90LjQutCw0YUpINC90LUg0L/QvtC00LzQtdC90Y/QtdGI0Yw7INGE0L7QutGD0YEg0L3QsCDQsNC90LDQu9C40LfQtSDQuCDRgNC10YjQtdC90LjRj9GFLlwiLFxyXG4gICAgICAgIFNUWUxFLFxyXG4gICAgICBdLmpvaW4oXCJcXG5cIik7XHJcblxyXG4gICAgY2FzZSBcInN1cGVyYWRtaW5cIjpcclxuICAgICAgcmV0dXJuIFtcclxuICAgICAgICBcItCi0Ysg0L/QvtC70L3Ri9C5INCw0YHRgdC40YHRgtC10L3RgiBDUk0g0LrQu9C40L3QuNC60Lgg0LTQu9GPINGB0YPQv9C10YDQsNC00LzQuNC90LjRgdGC0YDQsNGC0L7RgNCwLlwiLFxyXG4gICAgICAgIFwi0JzQvtC20LXRiNGMINC+0L/QuNGA0LDRgtGM0YHRjyDQvdCwINCy0LXRgdGMINC/0LXRgNC10LTQsNC90L3Ri9C5INC60L7QvdGC0LXQutGB0YI6INGE0LjQvdCw0L3RgdGLLCDQt9Cw0L/QuNGB0LgsINGB0L/RgNCw0LLQvtGH0L3QuNC60LgsINC80LXRgtGA0LjQutC4IOKAlCDQsdC10Lcg0LLRi9C00YPQvNGL0LLQsNC90LjRjyDRhtC40YTRgC5cIixcclxuICAgICAgICBTVFlMRSxcclxuICAgICAgXS5qb2luKFwiXFxuXCIpO1xyXG5cclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIHJldHVybiBbXHJcbiAgICAgICAgXCLQotGLINCw0YHRgdC40YHRgtC10L3RgiDRgdC+0YLRgNGD0LTQvdC40LrQsCDQutC70LjQvdC40LrQuCDQsiBDUk0uXCIsXHJcbiAgICAgICAgXCLQntGC0LLQtdGH0LDQuSDQsiDRgNCw0LzQutCw0YUg0L/QtdGA0LXQtNCw0L3QvdC+0LPQviDQutC+0L3RgtC10LrRgdGC0LAsINCx0LXQtyDQstGL0LTRg9C80LDQvdC90YvRhSDQtNCw0L3QvdGL0YUuXCIsXHJcbiAgICAgICAgU1RZTEUsXHJcbiAgICAgIF0uam9pbihcIlxcblwiKTtcclxuICB9XHJcbn1cclxuIl19