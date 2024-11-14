-- 智能钱包表
CREATE TABLE IF NOT EXISTS smart_wallets (
    address VARCHAR(44) PRIMARY KEY,
    score DECIMAL NOT NULL,
    first_seen TIMESTAMP NOT NULL,
    last_active TIMESTAMP NOT NULL,
    metrics JSONB NOT NULL,
    trading_style VARCHAR(20)[] NOT NULL,
    tags VARCHAR(50)[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 交易历史表
CREATE TABLE IF NOT EXISTS transactions (
    signature VARCHAR(88) PRIMARY KEY,
    block_slot BIGINT NOT NULL,
    block_time TIMESTAMP NOT NULL,
    wallet_address VARCHAR(44) NOT NULL,
    token_mint VARCHAR(44) NOT NULL,
    amount DECIMAL NOT NULL,
    price DECIMAL NOT NULL,
    type VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL,
    fee BIGINT NOT NULL,
    program_id VARCHAR(44) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES smart_wallets(address)
);

-- 持仓记录表
CREATE TABLE IF NOT EXISTS holdings (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) NOT NULL,
    token_mint VARCHAR(44) NOT NULL,
    amount DECIMAL NOT NULL,
    value_usd DECIMAL NOT NULL,
    entry_price DECIMAL NOT NULL,
    current_price DECIMAL NOT NULL,
    profit_loss DECIMAL NOT NULL,
    hold_duration INTERVAL NOT NULL,
    last_updated TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES smart_wallets(address),
    UNIQUE (wallet_address, token_mint)
);

-- 风险评估表
CREATE TABLE IF NOT EXISTS risk_assessments (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_address VARCHAR(44) NOT NULL,
    risk_score DECIMAL NOT NULL,
    risk_factors JSONB NOT NULL,
    assessment_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 市场数据表
CREATE TABLE IF NOT EXISTS market_data (
    id SERIAL PRIMARY KEY,
    token_mint VARCHAR(44) NOT NULL,
    price DECIMAL NOT NULL,
    volume_24h DECIMAL NOT NULL,
    market_cap DECIMAL,
    liquidity DECIMAL NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 异常检测记录表
CREATE TABLE IF NOT EXISTS anomalies (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    details JSONB NOT NULL,
    detection_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX idx_transactions_token ON transactions(token_mint);
CREATE INDEX idx_transactions_block_time ON transactions(block_time);
CREATE INDEX idx_holdings_wallet ON holdings(wallet_address);
CREATE INDEX idx_holdings_token ON holdings(token_mint);
CREATE INDEX idx_market_data_token_time ON market_data(token_mint, timestamp);
CREATE INDEX idx_anomalies_type_time ON anomalies(type, detection_time);

-- 创建分区表（按时间分区）
CREATE TABLE market_data_partitioned (
    LIKE market_data INCLUDING ALL
) PARTITION BY RANGE (timestamp);

-- 创建分区
CREATE TABLE market_data_y2024m01 PARTITION OF market_data_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- 创建触发器函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER update_smart_wallets_updated_at
    BEFORE UPDATE ON smart_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at(); 