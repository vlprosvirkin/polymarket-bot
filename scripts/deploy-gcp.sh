#!/bin/bash

# Скрипт для ручного деплоя на GCP VM
# Использование: ./scripts/deploy-gcp.sh

set -e

# Конфигурация
GCP_ZONE="us-central1-a"
GCP_VM_NAME="typescript-server"
GCP_VM_IP="146.148.47.76"
DOCKER_IMAGE_NAME="polymarket-bot"
SSH_USER="${GCP_SSH_USER:-$(whoami)}"

echo "🚀 Начало деплоя на GCP..."

# 1. Сборка проекта
echo "📦 Сборка TypeScript..."
npm run build

# 2. Сборка Docker образа
echo "🐳 Сборка Docker образа..."
docker build -t ${DOCKER_IMAGE_NAME}:latest .

# 3. Сохранение образа в tar
echo "💾 Сохранение образа..."
docker save ${DOCKER_IMAGE_NAME}:latest | gzip > /tmp/image.tar.gz

# 4. Копирование на VM
echo "📤 Копирование образа на VM..."
gcloud compute scp --zone=${GCP_ZONE} /tmp/image.tar.gz ${GCP_VM_NAME}:/tmp/

# 5. Деплой на VM
echo "🚀 Деплой на VM..."
gcloud compute ssh --zone=${GCP_ZONE} ${GCP_VM_NAME} --command="
  cd /tmp
  
  # Load Docker image
  docker load < image.tar.gz
  
  # Stop and remove old container
  docker stop ${DOCKER_IMAGE_NAME} || true
  docker rm ${DOCKER_IMAGE_NAME} || true
  
  # Remove old image
  docker rmi ${DOCKER_IMAGE_NAME}:latest || true
  
  # Run new container
  docker run -d \
    --name ${DOCKER_IMAGE_NAME} \
    --restart unless-stopped \
    -p 3000:3000 \
    --env-file /app/.env \
    ${DOCKER_IMAGE_NAME}:latest
  
  # Cleanup
  rm -f image.tar.gz
  
  # Show running containers
  docker ps
"

# 6. Health check
echo "🏥 Проверка здоровья..."
sleep 5
curl -f http://${GCP_VM_IP}:3000/health || echo "⚠️  Health check failed"

echo "✅ Деплой завершен!"

