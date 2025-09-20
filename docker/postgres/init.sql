-- Inicialização do banco de dados PostgreSQL com pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela para armazenar resultados de pesquisas
CREATE TABLE IF NOT EXISTS search_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar fontes web encontradas
CREATE TABLE IF NOT EXISTS web_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES search_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    summary TEXT,
    domain VARCHAR(255),
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embedding VECTOR(1536), -- OpenAI Ada embedding size, ajustar conforme modelo
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar respostas dos LLMs
CREATE TABLE IF NOT EXISTS llm_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES search_sessions(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    token_count INTEGER,
    processing_time_ms INTEGER,
    embedding VECTOR(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar os relatórios finais
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES search_sessions(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    file_path TEXT,
    format VARCHAR(20) DEFAULT 'markdown',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para cache de embeddings
CREATE TABLE IF NOT EXISTS embeddings_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    content_preview TEXT,
    embedding VECTOR(1536),
    model_used VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimização de consultas vetoriais
CREATE INDEX IF NOT EXISTS idx_web_sources_embedding ON web_sources USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_llm_responses_embedding ON llm_responses USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_embeddings_cache_embedding ON embeddings_cache USING ivfflat (embedding vector_cosine_ops);

-- Índices tradicionais
CREATE INDEX IF NOT EXISTS idx_search_sessions_timestamp ON search_sessions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_web_sources_session_id ON web_sources(session_id);
CREATE INDEX IF NOT EXISTS idx_web_sources_domain ON web_sources(domain);
CREATE INDEX IF NOT EXISTS idx_llm_responses_session_id ON llm_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_responses_model ON llm_responses(model_name);
CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_cache_hash ON embeddings_cache(content_hash);

-- Função para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para auto-update de timestamps
CREATE TRIGGER update_search_sessions_updated_at 
    BEFORE UPDATE ON search_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
