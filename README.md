# Cardizard - Pokémon TCG Scanner

Cardizard es una aplicación web Mobile-First para escanear cartas de Pokémon TCG usando la cámara de tu móvil, detectando el texto con AWS Textract y obteniendo su rareza y precio de mercado desde la API de Pokémon TCG.

## Arquitectura

El proyecto consta de dos partes:
1. **Frontend**: React + Vite + Tailwind CSS.
2. **Backend**: AWS Serverless Application Model (SAM) + Node.js (Lambdas).

## Despliegue del Backend (AWS SAM)

1. Instala [AWS CLI](https://aws.amazon.com/cli/) y [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).
2. Configura tus credenciales con `aws configure` usando la cuenta de `danielibabet`.
3. Navega al directorio backend:
   ```bash
   cd backend
   ```
4. Instala las dependencias de Node.js:
   ```bash
   npm install
   ```
5. Construye el proyecto SAM:
   ```bash
   sam build
   ```
6. Despliega en AWS:
   ```bash
   sam deploy --guided
   ```
   * Sigue las instrucciones. 
   * Nombre del stack: `cardizard`
   * Confirmar la creación de roles IAM y permisos.
   * SAM generará un API Gateway Endpoint URL (ej. `https://XYZ.execute-api.us-east-1.amazonaws.com/Prod/`).
   
## Ejecución del Frontend local

1. Navega al directorio frontend:
   ```bash
   cd frontend
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la raíz de `frontend/` y añade la URL del API Gateway generada por AWS SAM:
   ```env
   VITE_API_URL=https://XYZ.execute-api.us-east-1.amazonaws.com/Prod
   ```
4. Inicia el servidor de desarrollo en la red local para acceder desde tu móvil (requiere HTTPS configurado o usar Localhost Port Forwarding):
   ```bash
   npm run dev -- --host
   ```

*Nota: Para que el navegador móvil permita el acceso a la cámara (`getUserMedia`), la web debe servirse mediante HTTPS o estar en `localhost`.*

## Etiquetas (Tags)
Todos los recursos desplegados en AWS tienen la etiqueta `project: cardizard` para fácil rastreo de costes.
