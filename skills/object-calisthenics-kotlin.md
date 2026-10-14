---
name: object-calisthenics-kotlin
description: Применяй Object Calisthenics при написании, рефакторинге или ревью Kotlin-кода в проекте. Используй skill для Kotlin-задач, где нужны небольшие объекты, строгая инкапсуляция и учебные ограничения Object Calisthenics; не применяй к другим языкам.
---

# Object Calisthenics для Kotlin

Используй девять правил Object Calisthenics как ограничения для тренировки объектного дизайна. Сохраняй наблюдаемое поведение и публичные контракты. Не превращай правила в самоцель: для DTO, JPA-сущностей, сериализации и требований фреймворка допустимы обоснованные исключения.

Перед изменением кода определи версию Kotlin, систему сборки, стиль проекта и релевантные тесты. Пиши идиоматичный Kotlin, а не Java-код с Kotlin-синтаксисом.

## 1. Один уровень отступа в функции

Не вкладывай `if`, `when`, `for`, `while` и `try` друг в друга. Используй guard clauses, небольшие функции и операции коллекций.

```kotlin
// Плохо
fun customerTier(customer: Customer): CustomerTier {
    if (customer.isActive()) {
        for (order in customer.orders()) {
            if (order.isPremium()) {
                return CustomerTier.PREMIUM
            }
        }
    }
    return CustomerTier.STANDARD
}

// Хорошо
fun customerTier(customer: Customer): CustomerTier {
    if (!customer.isActive()) return CustomerTier.STANDARD
    if (customer.hasPremiumOrder()) return CustomerTier.PREMIUM
    return CustomerTier.STANDARD
}
```

Не заменяй понятную вложенность каскадом `let`, `run`, `also` или `apply`: scope-функции тоже создают скрытые уровни контекста.

## 2. Не используй `else`

Предпочитай ранний возврат, полиморфизм или исчерпывающий `when` по `enum`/sealed-иерархии.

```kotlin
// Плохо
fun discountFor(customer: Customer): Discount =
    if (customer.isPremium()) {
        Discount.percent(20)
    } else {
        Discount.percent(10)
    }

// Хорошо
fun discountFor(customer: Customer): Discount {
    if (customer.isPremium()) return Discount.percent(20)
    return Discount.percent(10)
}
```

Не добавляй фиктивную ветку `else` в `when`, если компилятор может проверить исчерпывающий набор вариантов:

```kotlin
sealed interface PaymentResult
data object Paid : PaymentResult
data object Rejected : PaymentResult

fun messageFor(result: PaymentResult): String = when (result) {
    Paid -> "Оплачено"
    Rejected -> "Отклонено"
}
```

## 3. Оборачивай значимые примитивы и строки

Используй доменные типы вместо `String`, `Int` и `Long`, если значение имеет собственные инварианты или его легко перепутать с другим. Для однотипных значений предпочитай `@JvmInline value class`; для нескольких связанных значений — обычный класс.

```kotlin
// Плохо
fun registerUser(name: String, age: Int, email: String): User = TODO()

// Хорошо
@JvmInline
value class UserName(val value: String) {
    init {
        require(value.length >= 3) { "Имя должно содержать минимум 3 символа" }
    }
}

@JvmInline
value class Age(val value: Int) {
    init {
        require(value in 0..150) { "Недопустимый возраст" }
    }
}

@JvmInline
value class Email(val value: String) {
    init {
        require('@' in value) { "Недопустимый email" }
    }
}

fun registerUser(name: UserName, age: Age, email: Email): User = TODO()
```

Не оборачивай каждый технический примитив бездумно. На границах приложения сначала преобразуй входные данные в доменные типы, а при сериализации — обратно.

## 4. Создавай коллекции первого класса

Не передавай изменяемые коллекции доменных объектов наружу. Инкапсулируй коллекцию и размести рядом операции, выражающие предметный смысл.

```kotlin
// Плохо
class Order(val items: MutableList<OrderItem>)

// Хорошо
class OrderItems private constructor(
    private val items: List<OrderItem>,
) {
    fun add(item: OrderItem): OrderItems = OrderItems(items + item)

    fun total(): Money = items.fold(Money.ZERO) { total, item ->
        total + item.price()
    }

    fun isEmpty(): Boolean = items.isEmpty()

    companion object {
        fun empty(): OrderItems = OrderItems(emptyList())
    }
}

class Order(private val items: OrderItems) {
    fun add(item: OrderItem): Order = Order(items.add(item))
    fun total(): Money = items.total()
}
```

По умолчанию используй неизменяемые `List`, `Set` и `Map`. Не наследуйся от стандартных коллекций, если достаточно композиции.

## 5. Одна точка в выражении

Следуй закону Деметры: объект должен общаться с непосредственными соседями, а не обходить чужой граф объектов.

```kotlin
// Плохо
val postalCode = order.customer.address.postalCode

// Хорошо
val postalCode = order.shippingPostalCode()

class Order(private val customer: Customer) {
    fun shippingPostalCode(): PostalCode = customer.shippingPostalCode()
}
```

Не считай нарушениями квалифицированные имена пакетов, вызовы стандартной библиотеки и fluent API, которые работают с одним объектом. Не скрывай нарушение в extension-функции: перенос цепочки в другое место не уменьшает связанность.

## 6. Не сокращай имена

Имена должны выражать предметный смысл. Не используй `calc`, `avg`, `tmp`, `mgr`, `svc`, если полное имя читается яснее. Общепринятые сокращения проекта (`ID`, `URL`, `API`) допустимы.

```kotlin
// Плохо
fun calcAvgTemp(data: List<Double>): Double = data.average()

// Хорошо
fun calculateAverageTemperature(temperatures: List<Double>): Double =
    temperatures.average()
```

Соблюдай Kotlin conventions: классы и интерфейсы — `UpperCamelCase`, функции и свойства — `lowerCamelCase`, константы — `UPPER_SNAKE_CASE`.

## 7. Сохраняй сущности маленькими

Делай функции, классы и файлы сфокусированными. Ориентиры упражнения:

- функция — до 10 строк;
- класс — до 50 строк;
- пакет — до 10 файлов;
- функция — не более двух-трёх параметров.

Это сигналы для обсуждения, а не повод дробить связную логику или вводить бессодержательные обёртки. Expression body подходит для короткой функции; длинное выражение лучше разбить по смыслу.

## 8. Не используй больше двух полей в классе

Если классу нужно больше двух полей, найди связанные понятия и выдели их через композицию.

```kotlin
// Плохо
class Person(
    private val firstName: String,
    private val lastName: String,
    private val email: String,
    private val phone: String,
)

// Хорошо
data class Name(
    val firstName: String,
    val lastName: String,
)

data class ContactInformation(
    val email: Email,
    val phone: PhoneNumber,
)

class Person(
    private val name: Name,
    private val contactInformation: ContactInformation,
)
```

Не считай `companion object`, константы и вычисляемые свойства состоянием экземпляра. Для DTO и объектов, форма которых задана внешним контрактом, зафиксируй исключение вместо искусственной декомпозиции.

## 9. Не открывай состояние через геттеры и сеттеры

В Kotlin обращение к свойству компилируется в accessor. Не выставляй публичный изменяемый `var` и не создавай свойства только ради чтения/записи внутреннего состояния. Предоставляй доменные команды и осмысленные запросы.

```kotlin
// Плохо
class BankAccount {
    var balance: Money = Money.ZERO
}

// Хорошо
class BankAccount(private var balance: Money) {
    fun deposit(amount: Money) {
        require(amount.isPositive()) { "Сумма пополнения должна быть положительной" }
        balance += amount
    }

    fun withdraw(amount: Money) {
        require(canWithdraw(amount)) { "Недостаточно средств" }
        balance -= amount
    }

    fun canWithdraw(amount: Money): Boolean = balance >= amount
}
```

Публичный `val` допустим у immutable value object, DTO и результата запроса. Цель правила — сохранить инкапсуляцию поведения, а не запретить Kotlin properties.

## Рабочий процесс

### Написание нового кода

1. Определи доменные понятия, инварианты и внешние контракты.
2. Выбери минимальный дизайн, соблюдающий применимые правила.
3. Используй неизменяемость по умолчанию: `val`, read-only коллекции, функции без побочных эффектов.
4. Применяй `value class`, sealed-типы и композицию там, где они выражают модель.
5. Не используй `!!`; обработай nullable-состояние явно или не допускай его в доменной модели.
6. Добавь или обнови тесты в принятом в проекте стиле.

### Рефакторинг и ревью

1. Сначала зафиксируй поведение тестами или найди существующее покрытие.
2. Перечисли нарушения с привязкой к конкретному правилу.
3. Приоритизируй проблемы, которые сильнее всего ухудшают связанность, инкапсуляцию и читаемость.
4. Рефактори небольшими шагами, не меняя поведение и публичные API без необходимости.
5. После изменений запусти релевантные тесты и статические проверки (`ktlint`, `detekt`), если они настроены.
6. В результате кратко укажи применённые правила, осознанные исключения и выполненные проверки.

## Границы применения

- Не применяй skill к Java, TypeScript или другим языкам.
- Применяй правила к Kotlin-коду автоматически, но учитывай явно заданные пользователем ограничения и стиль существующего проекта.
- Не ломай API, формат сериализации, ORM-маппинг или требования фреймворка ради формального соблюдения правил.
- Если правило конфликтует с понятностью или контрактом, сохрани контракт и явно объясни исключение.
