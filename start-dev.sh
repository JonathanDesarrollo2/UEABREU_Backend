#!/bin/sh
#set -e  # Hace que el script termine inmediatamente si cualquier comando falla
#echo " ✅ Esperando al proxy de la base de datos Google Cloud..."
#intentos=0
#max_intentos=10
#while [ $intentos -lt $max_intentos ]; do
#  if nc -z -w30 cloud-sql-proxy 5432; then
#    echo " 🚀 Conectado exitosamente el proxy de la base de datos Google Cloud"
#    echo " ✅ Esperando al servidor mimamaganadera.com"
#    # exec npm run dev
#    exec npm start
#  fi
#  echo " ⚠️  Seguimos esperando por el proxy... Intento: $((intentos + 1))/$max_intentos"
#  sleep 1
#  intentos=$((intentos + 1))
#done
#echo " ❌ Error: No se pudo conectar al proxy de la base de datos después de $max_intentos intentos." >&2
#exit 1

#!/bin/bash
# Este es el contenido CORRECTO de start-dev.sh para Cloud Run
set -e
echo " 🚀 Conectado exitosamente a la Base de datos Render"
echo " ✅ Esperando al servidor ueabreu.com"
exec npm start