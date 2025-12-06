# Полная инструкция по работе с GCP

Полная инструкция по настройке и деплою приложения на Google Cloud Platform.

## 🏗️ Архитектура

- **VM**: `typescript-server` в зоне `us-central1-a`
- **IP**: `146.148.47.76`
- **Порт**: `3000`
- **Контейнер**: Docker с автоперезапуском
- **Project ID**: `gen-lang-client-0547163593`

---

## 📋 Часть 1: Настройка GCP VM

### 1.1. Подключение к instance

#### Вариант A: Через браузерную консоль GCP

1. Перейдите в [GCP Console](https://console.cloud.google.com)
2. **Compute Engine** → **VM instances**
3. Нажмите на instance `typescript-server`
4. Нажмите **SSH** (откроется браузерная консоль)

#### Вариант B: Через SSH с локальной машины

```bash
# Создать SSH ключ (если еще нет)
ssh-keygen -t rsa -b 4096 -C "gcp-deploy" -f ~/.ssh/gcp_key

# Добавить публичный ключ на instance
# В браузерной консоли выполните:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat ~/.ssh/google_compute_engine.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Скачать приватный ключ на локальную машину
# (скопируйте содержимое ~/.ssh/google_compute_engine из браузерной консоли)
# Сохраните как ~/.ssh/gcp_key на локальной машине
chmod 600 ~/.ssh/gcp_key

# Подключиться
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76
```

### 1.2. Настройка VM

На instance выполните:

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Создание директории для приложения
sudo mkdir -p /app
sudo chown $USER:$USER /app

# Создание .env файла
nano /app/.env
```

Заполните `.env` файл:

```env
# Обязательные
PK=your_private_key_here
FUNDER_ADDRESS=your_funder_address_here
CHAIN_ID=137
SIGNATURE_TYPE=0
CLOB_API_URL=https://clob.polymarket.com
API_PORT=3000

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# AI Services (опционально)
OPENAI_API_KEY=
GEMINI_API_KEY=
SERP_API_KEY=
TAVILY_API_KEY=
```

Или используйте скрипт настройки:

```bash
bash scripts/setup-gcp-vm.sh
```

### 1.3. Настройка GitHub Deploy Key (для клонирования репозитория)

На instance:

```bash
# Создать SSH ключ для GitHub
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "github-deploy-key" -f ~/.ssh/github_deploy_key -N ""

# Показать публичный ключ (СКОПИРУЙТЕ ЕГО)
cat ~/.ssh/github_deploy_key.pub

# Настроить SSH config
cat >> ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_deploy_key
    StrictHostKeyChecking no
EOF
chmod 600 ~/.ssh/config

# Добавить GitHub в known_hosts
ssh-keyscan github.com >> ~/.ssh/known_hosts

# Проверить подключение
ssh -T git@github.com
```

В GitHub:

1. Перейдите в репозиторий → **Settings** → **Deploy keys**
2. Нажмите **Add deploy key**
3. Вставьте публичный ключ из шага выше
4. Нажмите **Add key**

---

## 📋 Часть 2: Настройка автодеплоя через GitHub Actions

### 2.1. Создание Service Account в GCP

⚠️ **Важно**: Service Account нужно создавать с **локальной машины**, а не с instance!

#### Вариант A: Через gcloud CLI

На локальной машине:

```bash
# Установить gcloud (если еще не установлен)
# macOS: brew install --cask google-cloud-sdk

# Аутентифицироваться
gcloud auth login

# Установить проект
gcloud config set project gen-lang-client-0547163593

# Создать Service Account
gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions Deploy"

# Выдать права
export PROJECT_ID="gen-lang-client-0547163593"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/compute.instanceAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Создать JSON ключ
gcloud iam service-accounts keys create key.json \
    --iam-account=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

# Показать ключ (СКОПИРУЙТЕ ВЕСЬ JSON)
cat key.json
```

#### Вариант B: Через веб-консоль GCP

1. Перейдите в [GCP Console](https://console.cloud.google.com)
2. **IAM & Admin** → **Service Accounts** → **Create Service Account**
3. Заполните:
   - **Name**: `github-actions`
   - **Grant access**: выберите роли:
     - Compute Instance Admin (v1)
     - Storage Admin
4. **Keys** → **Add Key** → **Create new key** → **JSON**
5. Скачанный файл - это ключ для GitHub

### 2.2. Настройка GitHub Secrets

Перейдите в GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Добавьте 4 secrets:

#### 1. GCP_PROJECT_ID
- **Value**: `gen-lang-client-0547163593`

#### 2. GCP_SA_KEY
- **Value**: Весь JSON из `key.json` (который вы создали в шаге 2.1)

Скопируйте **весь** JSON, включая фигурные скобки:
```json
{
  "type": "service_account",
  "project_id": "...",
  ...
}
```

#### 3. GCP_SSH_USER
- **Value**: `vlprosvirkin`

#### 4. GCP_SSH_PRIVATE_KEY
- **Value**: Приватный SSH ключ

```bash
# На локальной машине
cat ~/.ssh/gcp_key
```

Скопируйте **весь** ключ, включая:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

### 2.3. Проверка workflow

Убедитесь, что файл `.github/workflows/deploy-gcp.yml` существует и содержит правильные значения.

### 2.4. Тестирование деплоя

1. Перейдите в **Actions** в вашем репозитории
2. Выберите workflow **Deploy to GCP**
3. Нажмите **Run workflow**
4. Выберите ветку (master/main)
5. Нажмите **Run workflow**

После успешного деплоя автодеплой будет запускаться при каждом push в `master`/`main`.

---

## 🚀 Часть 3: Ручной деплой

Если нужно задеплоить вручную:

```bash
# Сделать скрипт исполняемым
chmod +x scripts/deploy-gcp.sh

# Запустить деплой
./scripts/deploy-gcp.sh
```

Скрипт автоматически:
1. Соберет TypeScript
2. Соберет Docker образ
3. Скопирует на VM
4. Остановит старый контейнер
5. Запустит новый контейнер

---

## 📊 Часть 4: Мониторинг и управление

### Просмотр логов

```bash
# Через SSH
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker logs -f polymarket-bot"

# Или подключиться и выполнить
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76
docker logs -f polymarket-bot
```

### Проверка статуса

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker ps"
```

### Health check

```bash
curl http://146.148.47.76:3000/health
```

### Остановка контейнера

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker stop polymarket-bot"
```

### Запуск контейнера

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker start polymarket-bot"
```

### Перезапуск контейнера

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker restart polymarket-bot"
```

---

## 🔒 Часть 5: Безопасность

### Firewall правила

Убедитесь, что порты открыты:

```bash
# Разрешить SSH (порт 22)
gcloud compute firewall-rules create allow-ssh \
    --allow tcp:22 \
    --source-ranges 0.0.0.0/0 \
    --description "Allow SSH"

# Разрешить API (порт 3000)
gcloud compute firewall-rules create allow-api-port \
    --allow tcp:3000 \
    --source-ranges 0.0.0.0/0 \
    --description "Allow API port"
```

Или ограничьте доступ только для вашего IP:

```bash
# Узнать ваш IP
curl ifconfig.me

# Создать правило с ограничением
gcloud compute firewall-rules create allow-api-port-restricted \
    --allow tcp:3000 \
    --source-ranges YOUR_IP/32 \
    --description "Allow API port from specific IP"
```

### Обновление .env

После изменения `.env` файла на VM:

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker restart polymarket-bot"
```

---

## 🐛 Часть 6: Troubleshooting

### Контейнер не запускается

```bash
# Проверить логи
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker logs polymarket-bot"

# Проверить .env файл
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "cat /app/.env"
```

### Порт занят

```bash
# Проверить что использует порт
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "sudo lsof -i :3000"

# Остановить старый контейнер
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker stop polymarket-bot && docker rm polymarket-bot"
```

### Проблемы с Docker

```bash
# Перезапустить Docker
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "sudo systemctl restart docker"

# Проверить статус
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "sudo systemctl status docker"
```

### GitHub Actions деплой не работает

1. Проверьте логи в GitHub Actions
2. Убедитесь, что все 4 secrets добавлены
3. Проверьте, что Service Account имеет правильные права
4. Проверьте, что SSH ключ правильный

### Ошибка "Permission denied (publickey)"

```bash
# Проверить что ключ добавлен в authorized_keys на instance
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "cat ~/.ssh/authorized_keys"

# Проверить права
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "ls -la ~/.ssh/"
```

### Ошибка "insufficient authentication scopes"

Эта ошибка возникает при выполнении команд на instance. Решение:
- Выполняйте команды с локальной машины
- Или используйте веб-консоль GCP

---

## 🔄 Часть 7: Откат версии

Если нужно откатиться к предыдущей версии:

```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "
  docker stop polymarket-bot
  docker rm polymarket-bot
  docker run -d --name polymarket-bot --restart unless-stopped -p 3000:3000 --env-file /app/.env polymarket-bot:PREVIOUS_SHA
"
```

---

## 📝 Чеклист настройки

- [ ] VM создана и запущена
- [ ] Docker установлен на VM
- [ ] Директория `/app` создана
- [ ] Файл `/app/.env` заполнен
- [ ] SSH ключ для подключения создан
- [ ] GitHub Deploy Key настроен на instance
- [ ] Service Account создан в GCP
- [ ] Service Account имеет права (Compute Instance Admin, Storage Admin)
- [ ] JSON ключ Service Account создан
- [ ] Все 4 GitHub Secrets добавлены
- [ ] Firewall правила настроены
- [ ] Тестовый деплой выполнен успешно

---

## 🎯 Быстрые команды

### Подключение к instance
```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76
```

### Просмотр логов
```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker logs -f polymarket-bot"
```

### Перезапуск приложения
```bash
ssh -i ~/.ssh/gcp_key vlprosvirkin@146.148.47.76 "docker restart polymarket-bot"
```

### Проверка health
```bash
curl http://146.148.47.76:3000/health
```

### Ручной деплой
```bash
./scripts/deploy-gcp.sh
```

---

## 📚 Дополнительные ресурсы

- [GCP Compute Engine документация](https://cloud.google.com/compute/docs)
- [GitHub Actions документация](https://docs.github.com/en/actions)
- [Docker документация](https://docs.docker.com)
