# Используем базовый образ Node.js
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем все зависимости (включая dev для сборки TypeScript)
RUN npm install

# Копируем остальной код приложения
COPY . .

# Собираем TypeScript проект
RUN npm run build

# Удаляем dev-зависимости после сборки (опционально, для уменьшения размера образа)
RUN npm prune --production

# Открываем порт, на котором слушает приложение
# По умолчанию 3000, но можно изменить через переменную окружения API_PORT
EXPOSE 3000

# Запускаем приложение
# Для API сервера используем dist/start-api.js
# Для других режимов можно изменить CMD или использовать docker-compose
CMD ["node", "dist/start-api.js"]

