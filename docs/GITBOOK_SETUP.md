# Настройка GitBook

Инструкция по публикации документации в GitBook.

## Подготовка

Документация уже подготовлена в папке `docs/` со следующей структурой:

- `SUMMARY.md` — оглавление (обязательный файл для GitBook)
- `README.md` — главная страница
- Все остальные markdown файлы — разделы документации

## Вариант 1: GitBook.com (Рекомендуется)

### Шаг 1: Создание пространства

1. Зайдите на [gitbook.com](https://www.gitbook.com)
2. Войдите или зарегистрируйтесь
3. Нажмите "Create new space"
4. Выберите "Import from GitHub" или "Create blank space"

### Шаг 2: Подключение GitHub (если выбрали импорт)

1. Подключите ваш GitHub аккаунт
2. Выберите репозиторий `polymarket-bot`
3. Укажите путь к документации: `docs/`
4. GitBook автоматически найдет `SUMMARY.md`

### Шаг 3: Настройка

1. В настройках пространства укажите:
   - **Root path**: `docs/`
   - **Summary file**: `SUMMARY.md`
   - **Homepage**: `README.md`

2. GitBook автоматически создаст структуру на основе `SUMMARY.md`

### Шаг 4: Публикация

1. Нажмите "Publish"
2. Выберите домен (можно использовать бесплатный `your-space.gitbook.io`)
3. Документация будет доступна по адресу: `https://your-space.gitbook.io/polymarket-bot`

## Вариант 2: GitBook CLI (Локально)

### Установка GitBook CLI

```bash
npm install -g gitbook-cli
```

### Инициализация

```bash
cd docs
gitbook init
```

### Запуск локально

```bash
gitbook serve
```

Документация будет доступна на `http://localhost:4000`

### Сборка статического сайта

```bash
gitbook build
```

Собранные файлы будут в папке `_book/`

## Вариант 3: GitHub Pages + GitBook

### Использование GitHub Actions

Создайте `.github/workflows/gitbook.yml`:

```yaml
name: Deploy GitBook

on:
  push:
    branches:
      - main
    paths:
      - 'docs/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install GitBook
        run: npm install -g gitbook-cli
      
      - name: Build GitBook
        run: |
          cd docs
          gitbook install
          gitbook build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/_book
```

## Структура файлов

Убедитесь, что структура соответствует:

```
docs/
├── SUMMARY.md              # Оглавление (обязательно)
├── README.md               # Главная страница
├── getting-started.md
├── strategies.md
├── endgame-strategy.md
├── ai-usage.md
├── api.md
├── market-filter.md
├── telegram-integration.md
├── COPY_TRADING_TZ.md
├── services.md
├── database.md
├── architecture-bot-vs-strategy.md
├── development.md
├── testing-guide.md
├── type-optimization.md
├── gcp-deployment.md
├── troubleshooting.md
└── resources.md
```

## Настройка SUMMARY.md

`SUMMARY.md` уже создан и содержит полную структуру документации. GitBook использует его для создания навигации.

Формат:
```markdown
# Содержание

* [Введение](README.md)
* [Быстрый старт](getting-started.md)
  * [Установка](getting-started.md#установка)
  * [Настройка](getting-started.md#настройка-окружения)
```

## Кастомизация

### Тема

В GitBook.com можно выбрать тему в настройках:
- Light
- Dark
- Custom

### Дополнительные файлы

Можно добавить:

- `book.json` — конфигурация GitBook
- `GLOSSARY.md` — глоссарий терминов
- `LANGS.md` — поддержка языков

### Пример book.json

```json
{
  "title": "Polymarket Trading Bot Documentation",
  "description": "Полная документация торгового бота для Polymarket",
  "author": "Your Name",
  "language": "ru",
  "gitbook": ">=3.2.0",
  "plugins": [
    "theme-default",
    "search",
    "livereload"
  ],
  "pluginsConfig": {
    "theme-default": {
      "showLevel": true
    }
  }
}
```

## Обновление документации

### При использовании GitHub интеграции

1. Внесите изменения в файлы в `docs/`
2. Закоммитьте и запушьте в репозиторий
3. GitBook автоматически обновит документацию

### При ручной загрузке

1. Внесите изменения локально
2. Загрузите обновленные файлы в GitBook
3. Или используйте GitBook CLI для синхронизации

## Полезные ссылки

- [GitBook Documentation](https://docs.gitbook.com)
- [GitBook CLI](https://github.com/GitbookIO/gitbook-cli)
- [GitBook Themes](https://github.com/GitbookIO/theme-default)

## Troubleshooting

### SUMMARY.md не распознается

Убедитесь, что:
- Файл называется именно `SUMMARY.md` (заглавными буквами)
- Файл находится в корне папки `docs/`
- Формат соответствует требованиям GitBook

### Ссылки не работают

Проверьте:
- Все файлы существуют по указанным путям
- Используются относительные пути
- Якоря (#) указаны правильно

### Изображения не отображаются

1. Поместите изображения в папку `docs/assets/`
2. Используйте относительные пути: `![Alt](assets/image.png)`
3. Или используйте абсолютные URL для внешних изображений

## Рекомендации

1. **Используйте GitBook.com** — самый простой вариант
2. **Подключите GitHub** — автоматическая синхронизация
3. **Используйте SUMMARY.md** — уже подготовлен
4. **Тестируйте локально** — перед публикацией проверьте через GitBook CLI
5. **Обновляйте регулярно** — синхронизируйте с изменениями в коде

