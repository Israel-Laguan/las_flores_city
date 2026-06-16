-- Social Feed Table

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_name VARCHAR(100) NOT NULL,
    author_handle VARCHAR(50) NOT NULL,
    author_avatar_url VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    post_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts (created_at DESC);
