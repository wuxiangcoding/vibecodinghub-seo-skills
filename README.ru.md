# Vibe Coding Hub SEO Skills

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md)

Сайт: [vibecodinghub.org](https://vibecodinghub.org)

Ориентированные на конфиденциальность навыки только для чтения, предназначенные для анализа собственных данных поисковой эффективности в Google, Bing и Yandex.

Репозиторий объединяет переиспользуемые Agent Skills и локальные CLI на Node.js без сторонних зависимостей. Учётные данные и исходные данные сайтов остаются на устройстве пользователя; репозиторий не содержит общих OAuth-клиентов, API-ключей, токенов, идентификаторов сайтов или снимков данных.

## Включённые Skills

| Skill | Какие данные читает | Основной результат |
| --- | --- | --- |
| [Google Search Console](skills/google-search-console/SKILL.md) | Ресурсы, сводные показатели, даты, запросы, страницы и пары запрос/страница | Версионируемые JSON-снимки со сводными итогами и данными Top rows |
| [Bing Webmaster Tools](skills/bing-webmaster-tools/SKILL.md) | Подтверждённые сайты, трафик, запросы, страницы, состояние сканирования, ошибки и Sitemap | Версионируемые JSON-снимки с локальными периодами и покрытием API |
| [Yandex Webmaster](skills/yandex-webmaster/SKILL.md) | Хосты, сводная история, популярные запросы, типы устройств и состояния доступности | Версионируемые JSON-снимки с достоверными итогами по истории и популярными запросами |

В отличие от наборов SEO-промптов, эти Skills получают воспроизводимые данные из официальных API для вебмастеров, нормализуют их локально и сохраняют ограничения каждого источника.

## Требования

- Node.js 22 или новее. CI проверяет Node.js 22 и 24.
- Учётная запись с доступом к анализируемым ресурсам или хостам.
- Собственные учётные данные пользователя для каждого сервиса. Инструкции приведены в разделе [Быстрый старт](#быстрый-старт).

## Установка

Во время подготовки `v0.1.0` репозиторий остаётся приватным. До публикации для установки через Marketplace требуется доступ к репозиторию на GitHub.

### Codex Plugin

```bash
codex plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills --ref main
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
```

После установки создайте новую задачу Codex и вызовите Skill, например `$google-search-console`.

### Claude Code Plugin

Выполните в Claude Code:

```text
/plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills
/plugin install vibecodinghub-seo-skills@wuxiangcoding
```

Claude Code добавляет пространство имён к Plugin Skills. Для прямого вызова используйте, например, `/vibecodinghub-seo-skills:google-search-console`.

### Универсальный Skills CLI

Показать доступные Skills:

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills --list
```

Установить один Skill глобально для Codex или Claude Code:

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills \
  --skill google-search-console \
  --agent codex \
  --global
```

Замените `codex` на `claude-code` или выберите другое имя Skill.

### Ручная установка одного Skill

После клонирования репозитория скопируйте только нужный Skill:

```bash
mkdir -p "$HOME/.agents/skills"
cp -R skills/google-search-console "$HOME/.agents/skills/"
```

Codex использует `~/.agents/skills`, Claude Code — `~/.claude/skills`. Для установки на уровне проекта используйте `.agents/skills` или `.claude/skills` в целевом репозитории.

## Быстрый старт

Команды ниже выполняются из корня этого репозитория. После установки Agent определяет путь к скриптам относительно файла `SKILL.md` соответствующего Skill.

### Google Search Console

```bash
node skills/google-search-console/scripts/gsc.mjs doctor
node skills/google-search-console/scripts/gsc.mjs sites
node skills/google-search-console/scripts/gsc.mjs snapshot --site sc-domain:example.com --days 28
```

Перед авторизацией создайте собственный Desktop OAuth-клиент. См. [настройку Google OAuth](skills/google-search-console/references/oauth-setup.md).

### Bing Webmaster Tools

```bash
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs doctor
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs sites
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs snapshot --site https://example.com/ --days 28
```

Перед авторизацией создайте собственный API-ключ. См. [настройку API-ключа Bing](skills/bing-webmaster-tools/references/api-key-setup.md).

### Yandex Webmaster

```bash
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs doctor
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs hosts
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs snapshot --host https:example.com:443 --days 28
```

Перед авторизацией создайте собственное OAuth-приложение. См. [настройку Yandex OAuth](skills/yandex-webmaster/references/oauth-setup.md).

## Модель выходных данных

Каждый успешно созданный снимок содержит источник, время получения, точный идентификатор ресурса, запрошенный период, состояние доступности, полноту наборов и нормализованные строки.

- **Сводные итоги** берутся из достоверной сводки или временного ряда соответствующей платформы.
- **Top rows** — это ранжированные данные по запросам или страницам, а не полный набор. Их нельзя суммировать как итог по всему ресурсу.
- **Покрытие API** описывает даты, фактически возвращённые сервисом. Локальный период анализа не расширяет покрытие источника.
- **Структурированные пустые состояния** означают, что данные недоступны или ещё не загружены, а не нулевую эффективность.

Точная схема и ограничения платформы для каждого Skill описаны в каталоге `references/`.

## Конфиденциальность и безопасность

- Учётные данные, токены, псевдонимы, идентификаторы сайтов, запросы, URL, метрики, экспорты и снимки должны храниться вне любых Git-репозиториев.
- В macOS и Linux локальные файлы с учётными данными доступны только владельцу (`0600`).
- Исходные строки по умолчанию сохраняются вне репозитория и выводятся только при явном согласии пользователя, если команда поддерживает такой режим.
- Все операции API выполняются только для чтения. Skill для Bing намеренно не предоставляет команды отправки URL или Sitemap.
- CI использует только имитации ответов и не требует реальных учётных данных.

Для конфиденциального сообщения об уязвимости см. [SECURITY.md](SECURITY.md).

## Обновление и удаление

Для Codex:

```bash
codex plugin marketplace upgrade wuxiangcoding
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
codex plugin remove vibecodinghub-seo-skills@wuxiangcoding
```

Для Claude Code используйте `/plugin marketplace update wuxiangcoding`, `/plugin update vibecodinghub-seo-skills@wuxiangcoding` или `/plugin uninstall vibecodinghub-seo-skills@wuxiangcoding`.

Удаление Plugin не удаляет учётные данные или снимки из каталогов конфигурации и данных, которыми управляет пользователь.

## Разработка

```bash
npm run check
npm test
```

Требования к изменениям и проверкам приведены в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

Проект распространяется по лицензии [Apache License 2.0](LICENSE).
