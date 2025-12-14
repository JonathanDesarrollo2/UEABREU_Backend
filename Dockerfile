FROM node:22.15.0-alpine
WORKDIR /usr/src/app
# 1. Copia primero solo los archivos necesarios para npm install
COPY package.json package-lock.json* tsconfig.json ./
# 2. Instala dependencias (incluyendo devDependencies para el build)
RUN npm install && npm cache clean --force
# 3. Copia TODO el contenido (incluyendo start-dev.sh)
COPY . .
# 4. Compila la aplicación
RUN npm run build
# 5. Limpieza (elimina devDependencies y archivos innecesarios)
RUN npm prune --production && \
    rm -rf src __tests__
# 6. Permisos para el script (AHORA SÍ EXISTE)
RUN chmod +x start-dev.sh
EXPOSE 3000
CMD ["./start-dev.sh"]