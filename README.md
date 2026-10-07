# Cardizard - Pokemon TCG Card Scanner

<p align="center">
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/AWS_SAM-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS SAM"/>
  <img src="https://img.shields.io/badge/AWS_Textract-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS Textract"/>
</p>

Cardizard is a **Mobile-First progressive web application** designed to scan physical Pokémon TCG cards directly from your smartphone camera, extract card text/IDs with **AWS Textract**, and fetch real-time rarity, card variants, and market prices via the official **Pokémon TCG API**.

---

## Key Features

- 📸 **Mobile Camera Scanner:** Instant photo capture and cropping optimized for handheld devices.
- 🔍 **AI OCR Extraction:** High-precision text detection powered by AWS Textract to identify Pokémon names, set numbers, and series codes.
- 💰 **Market Price & Rarity Lookup:** Connects to Pokémon TCG databases for up-to-date card values, foil variations, and historical trends.
- ⚡ **Serverless Architecture:** Fast, cost-efficient backend powered by AWS Lambda & API Gateway using AWS SAM.

---

## Architecture Overview

`mermaid
flowchart LR
    A[Mobile Web Client\nReact + Vite + Tailwind] -->|Upload Card Image| B[Amazon API Gateway]
    B --> C[AWS Lambda OCR Handler]
    C -->|Extract Text/IDs| D[AWS Textract]
    C -->|Fetch Card Data & Prices| E[Pokemon TCG API]
    C -->|Return Card Details| A
`

---

## Project Structure

`	ext
cardizard/
├── frontend/           # React + Vite + Tailwind CSS mobile-first web app
│   ├── src/            # Components, camera viewfinder, and card details UI
│   └── package.json
└── backend/            # AWS Serverless Application Model (SAM)
    ├── template.yaml   # AWS SAM Infrastructure definition
    └── handlers/       # Lambda functions for OCR processing & API integration
`

---

## Local Development & Deployment

### 1. Frontend Setup
`ash
cd frontend
npm install
npm run dev
`

### 2. Backend Deployment (AWS SAM)
`ash
cd backend
npm install
sam build
sam deploy --guided
`

---

## Author

- **Daniel Ibáñez** - [@danielibabet](https://github.com/danielibabet)