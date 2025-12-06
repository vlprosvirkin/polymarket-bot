#!/bin/bash

# Скрипт для первоначальной настройки GCP VM
# Запускать на VM: bash <(curl -s https://raw.githubusercontent.com/your-repo/polymarket_bot/main/scripts/setup-gcp-vm.sh)

set -e

echo "🔧 Настройка GCP VM для Polymarket Bot..."

# 1. Обновление системы
echo "📦 Обновление системы..."
sudo apt-get update
sudo apt-get upgrade -y

# 2. Установка Docker
echo "🐳 Установка Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker установлен"
else
    echo "✅ Docker уже установлен"
fi

# 3. Установка Docker Compose (опционально)
if ! command -v docker-compose &> /dev/null; then
    sudo apt-get install -y docker-compose
    echo "✅ Docker Compose установлен"
fi

# 4. Создание директории для приложения
echo "📁 Создание директорий..."
sudo mkdir -p /app
sudo chown $USER:$USER /app

# 5. Создание systemd service (опционально)
echo "⚙️  Создание systemd service..."
sudo tee /etc/systemd/system/polymarket-bot.service > /dev/null <<EOF
[Unit]
Description=Polymarket Bot API Server
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/app
ExecStart=/usr/bin/docker start polymarket-bot
ExecStop=/usr/bin/docker stop polymarket-bot
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo "✅ Systemd service создан"

# 6. Настройка firewall (если нужно)
echo "🔥 Настройка firewall..."
sudo ufw allow 3000/tcp || true
echo "✅ Firewall настроен"

# 7. Создание .env файла (шаблон)
if [ ! -f /app/.env ]; then
    echo "📝 Создание шаблона .env..."
    cat > /app/.env <<EOF
# Polymarket Bot Configuration
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
EOF
    echo "⚠️  Не забудьте заполнить /app/.env файл!"
else
    echo "✅ .env файл уже существует"
fi

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "Следующие шаги:"
echo "1. Заполните /app/.env файл с вашими настройками"
echo "2. Запустите деплой: ./scripts/deploy-gcp.sh"
echo "3. Или используйте GitHub Actions для автодеплоя"

