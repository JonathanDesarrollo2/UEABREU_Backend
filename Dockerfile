# Dockerfile optimizado para UEABREU
FROM node:22.15.0-alpine

WORKDIR /usr/src/app

# 1. Copia solo archivos de configuración primero (para cache)
COPY package*.json ./
COPY tsconfig.json ./

# 2. Instala dependencias
RUN npm ci --only=production

# 3. Copia todo el código fuente
COPY . .

# 4. Compila TypeScript (si tu package.json tiene script "build")
RUN npm run build

# 5. Limpia archivos innecesarios
RUN rm -rf src __tests__

# 6. Expone el puerto (Cloud Run usa 8080)
EXPOSE 8080

# 7. Comando de inicio
CMD ["node", "dist/index.js"]