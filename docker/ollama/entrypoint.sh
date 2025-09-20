#!/bin/bash

# Script de inicialização do Ollama com download automático de modelos

echo "🚀 Iniciando Ollama..."

# Inicia o servidor Ollama em background
ollama serve &

# Aguarda o servidor ficar online
echo "⏳ Aguardando servidor Ollama..."
while ! curl -f http://localhost:11434/api/tags > /dev/null 2>&1; do
    sleep 2
done

echo "✅ Ollama online!"

# Download dos modelos especificados
echo "📥 Baixando modelo Gemma2..."
ollama pull gemma2:2b

echo "📥 Baixando modelos Llama..."
ollama pull llama3.1:8b

echo "📥 Baixando modelos de embeddings..."
ollama pull nomic-embed-text

echo "📥 Baixando modelo de código..."
ollama pull codellama:7b

echo "✅ Todos os modelos foram baixados!"

# Lista modelos disponíveis
echo "📋 Modelos disponíveis:"
ollama list

# Mantém o container rodando
fg 2>&1
