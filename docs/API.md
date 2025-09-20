# 📡 DeepSearch API Documentation

## Overview

A API REST do DeepSearch fornece acesso programático a todas as funcionalidades de busca profunda, incluindo pesquisa web, análise com LLM e busca vetorial.

**Base URL**: `http://localhost:3000`

## Authentication

Para endpoints administrativos (`/api/admin/*`), inclua a API key:

```bash
# Via Header
curl -H "X-API-Key: sua-api-key" http://localhost:3000/api/admin/stats

# Via Query Parameter  
curl http://localhost:3000/api/admin/stats?apiKey=sua-api-key
```

## Endpoints

### Health Check

Verifica a saúde de todos os serviços.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-09-20T14:30:00Z",
  "services": {
    "api": { "status": "ok", "message": "API is running" },
    "llm": { "status": "ok", "message": "3 modelos disponíveis" },
    "database": { "status": "ok", "message": "Banco conectado" }
  }
}
```

### Deep Search

Executa uma busca profunda completa.

```http
POST /api/search
```

**Request Body:**
```json
{
  "query": "inteligência artificial machine learning",
  "options": {
    "useAdvancedSearch": true,
    "generateEmbeddings": true,
    "maxSources": 50,
    "saveToDatabase": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-here",
    "query": "inteligência artificial machine learning",
    "searchTerms": {
      "original_query": "inteligência artificial machine learning",
      "search_terms": ["AI", "machine learning", "deep learning", "..."],
      "categories": ["tecnologia", "ciencia"]
    },
    "webResults": {
      "sources": [...],
      "stats": {
        "totalResults": 32,
        "totalWords": 45000,
        "topDomains": [...]
      }
    },
    "analysis": {
      "consolidatedAnalysis": {...},
      "successfulAnalyses": 28
    },
    "report": {
      "title": "Inteligência Artificial Machine Learning",
      "filename": "20240920_1430_ia_machine_learning.md",
      "filepath": "/path/to/report.md"
    }
  }
}
```

### Vector Search

Busca por similaridade semântica usando embeddings.

```http
POST /api/vector-search
```

**Request Body:**
```json
{
  "query": "redes neurais deep learning",
  "limit": 10,
  "threshold": 0.7
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "redes neurais deep learning",
    "results": [
      {
        "id": "uuid",
        "url": "https://example.com/article",
        "title": "Introdução às Redes Neurais",
        "content": "...",
        "similarity": 0.92,
        "domain": "example.com"
      }
    ],
    "totalFound": 10
  }
}
```

### Search History

Lista o histórico de pesquisas.

```http
GET /api/history?limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "query": "blockchain cryptocurrency",
      "timestamp": "2024-09-20T14:30:00Z",
      "status": "completed",
      "sources_count": 25,
      "responses_count": 1,
      "reports_count": 1
    }
  ]
}
```

### Session Details

Obtém detalhes completos de uma sessão de busca.

```http
GET /api/session/{sessionId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "query": "quantum computing",
      "timestamp": "2024-09-20T14:30:00Z",
      "status": "completed",
      "metadata": {...}
    },
    "sources": [...],
    "responses": [...],
    "reports": [...]
  }
}
```

### Available Models

Lista modelos LLM disponíveis.

```http
GET /api/models
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "llama3.1:8b",
      "size": "4.7 GB",
      "modified": "2024-09-20T10:00:00Z"
    },
    {
      "name": "gemma2:2b", 
      "size": "1.6 GB",
      "modified": "2024-09-20T10:05:00Z"
    }
  ]
}
```

## Admin Endpoints

### Statistics

Obtém estatísticas do sistema (requer API key).

```http
GET /api/admin/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "counts": {
      "sessions": 150,
      "sources": 4500,
      "responses": 180,
      "reports": 145,
      "cached_embeddings": 3200
    },
    "topDomains": [
      { "domain": "wikipedia.org", "count": 245 },
      { "domain": "arxiv.org", "count": 189 }
    ],
    "topModels": [
      { "model_name": "llama3.1:8b", "count": 120 },
      { "model_name": "gemma2:2b", "count": 60 }
    ]
  }
}
```

### Data Cleanup

Remove dados antigos (requer API key).

```http
POST /api/admin/cleanup
```

**Request Body:**
```json
{
  "daysOld": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deletedSessions": 25,
    "daysOld": 30
  }
}
```

## Error Responses

Todas as respostas de erro seguem o formato:

```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing/invalid API key)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Rate Limiting

A API implementa rate limiting:

- **Limite**: 100 requests per 15-minute window
- **Headers de resposta**:
  - `X-RateLimit-Limit`: Limite máximo
  - `X-RateLimit-Remaining`: Requests restantes  
  - `X-RateLimit-Reset`: Timestamp do reset

## Examples

### Complete Workflow

```bash
# 1. Check health
curl http://localhost:3000/health

# 2. Start deep search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "sustainable energy renewable",
    "options": {
      "maxSources": 30,
      "useAdvancedSearch": true
    }
  }'

# 3. Get session details (using sessionId from step 2)
curl http://localhost:3000/api/session/uuid-from-step-2

# 4. Search similar content
curl -X POST http://localhost:3000/api/vector-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "solar wind energy storage",
    "limit": 5,
    "threshold": 0.8
  }'

# 5. Check history
curl http://localhost:3000/api/history?limit=10
```

### JavaScript/Node.js Client

```javascript
const axios = require('axios');

class DeepSearchClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async search(query, options = {}) {
    const response = await this.client.post('/api/search', {
      query,
      options
    });
    return response.data;
  }

  async vectorSearch(query, limit = 10, threshold = 0.7) {
    const response = await this.client.post('/api/vector-search', {
      query,
      limit,
      threshold
    });
    return response.data;
  }

  async getHistory(limit = 10) {
    const response = await this.client.get(`/api/history?limit=${limit}`);
    return response.data;
  }

  async getSessionDetails(sessionId) {
    const response = await this.client.get(`/api/session/${sessionId}`);
    return response.data;
  }
}

// Usage
const client = new DeepSearchClient();

async function example() {
  // Perform deep search
  const result = await client.search('climate change solutions', {
    maxSources: 25,
    useAdvancedSearch: true
  });
  
  console.log(`Report generated: ${result.data.report.filename}`);
  
  // Find similar content
  const similar = await client.vectorSearch('carbon capture technology');
  console.log(`Found ${similar.data.totalFound} similar results`);
}

example().catch(console.error);
```

### Python Client

```python
import requests
import json

class DeepSearchClient:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url
        
    def search(self, query, options=None):
        if options is None:
            options = {}
            
        response = requests.post(f"{self.base_url}/api/search", 
                               json={"query": query, "options": options})
        return response.json()
    
    def vector_search(self, query, limit=10, threshold=0.7):
        response = requests.post(f"{self.base_url}/api/vector-search",
                               json={"query": query, "limit": limit, "threshold": threshold})
        return response.json()
    
    def get_history(self, limit=10):
        response = requests.get(f"{self.base_url}/api/history?limit={limit}")
        return response.json()

# Usage
client = DeepSearchClient()

# Perform search
result = client.search("artificial intelligence ethics", {
    "maxSources": 40,
    "useAdvancedSearch": True
})

print(f"Session ID: {result['data']['sessionId']}")
print(f"Sources found: {len(result['data']['webResults']['sources'])}")
```

## WebSocket Support (Future)

Planejado para versões futuras:

```javascript
// Future WebSocket API
const ws = new WebSocket('ws://localhost:3000/ws');

ws.send(JSON.stringify({
  type: 'search',
  query: 'machine learning algorithms',
  options: { stream: true }
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'progress') {
    console.log(`Progress: ${data.stage} - ${data.message}`);
  } else if (data.type === 'result') {
    console.log('Search completed:', data.result);
  }
};
```
