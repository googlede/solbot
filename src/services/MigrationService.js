const { Pool } = require('pg');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class MigrationService {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        this.migrationsDir = path.join(__dirname, '../database/migrations');
        this.migrationsTable = 'schema_migrations';
    }

    // 初始化迁移表
    async initMigrationsTable() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
                    id SERIAL PRIMARY KEY,
                    version VARCHAR(255) NOT NULL UNIQUE,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            logger.info('Migrations table initialized');
        } catch (error) {
            logger.error('Error initializing migrations table:', error);
            throw error;
        }
    }

    // 运行迁移
    async migrate() {
        try {
            await this.initMigrationsTable();

            // 获取已应用的迁移
            const { rows: appliedMigrations } = await this.pool.query(
                `SELECT version FROM ${this.migrationsTable} ORDER BY version ASC`
            );
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));

            // 获取所有迁移文件
            const files = await fs.readdir(this.migrationsDir);
            const pendingMigrations = files
                .filter(f => f.endsWith('.sql'))
                .filter(f => !appliedVersions.has(f))
                .sort();

            // 执行待处理的迁移
            for (const migration of pendingMigrations) {
                await this.runMigration(migration);
            }

            logger.info(`Applied ${pendingMigrations.length} migrations`);
        } catch (error) {
            logger.error('Migration failed:', error);
            throw error;
        }
    }

    // 执行单个迁移
    async runMigration(migrationFile) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // 读取并执行迁移文件
            const sql = await fs.readFile(
                path.join(this.migrationsDir, migrationFile),
                'utf8'
            );
            await client.query(sql);

            // 记录迁移
            await client.query(
                `INSERT INTO ${this.migrationsTable} (version) VALUES ($1)`,
                [migrationFile]
            );

            await client.query('COMMIT');
            logger.info(`Migration applied: ${migrationFile}`);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Migration failed: ${migrationFile}`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    // 回滚迁移
    async rollback(steps = 1) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // 获取最近的迁移
            const { rows: migrations } = await client.query(
                `SELECT version FROM ${this.migrationsTable} 
                 ORDER BY version DESC 
                 LIMIT $1`,
                [steps]
            );

            for (const migration of migrations) {
                const rollbackFile = migration.version.replace('.sql', '.down.sql');
                const rollbackPath = path.join(this.migrationsDir, rollbackFile);

                // 执行回滚脚本
                const sql = await fs.readFile(rollbackPath, 'utf8');
                await client.query(sql);

                // 删除迁移记录
                await client.query(
                    `DELETE FROM ${this.migrationsTable} WHERE version = $1`,
                    [migration.version]
                );

                logger.info(`Rolled back migration: ${migration.version}`);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Rollback failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // 检查数据一致性
    async checkDataConsistency() {
        try {
            const checks = [
                this._checkForeignKeyConstraints(),
                this._checkUniqueConstraints(),
                this._checkNullConstraints(),
                this._checkDataTypes(),
                this._checkIndexes()
            ];

            const results = await Promise.all(checks);
            const issues = results.flat().filter(Boolean);

            if (issues.length > 0) {
                logger.warn('Data consistency issues found:', issues);
                return {
                    consistent: false,
                    issues
                };
            }

            return {
                consistent: true,
                issues: []
            };
        } catch (error) {
            logger.error('Error checking data consistency:', error);
            throw error;
        }
    }

    // 检查外键约束
    async _checkForeignKeyConstraints() {
        const issues = [];
        const { rows } = await this.pool.query(`
            SELECT 
                tc.table_name, 
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
        `);

        for (const constraint of rows) {
            const { rows: violations } = await this.pool.query(`
                SELECT ${constraint.column_name}
                FROM ${constraint.table_name} t1
                WHERE NOT EXISTS (
                    SELECT 1 
                    FROM ${constraint.foreign_table_name} t2
                    WHERE t2.${constraint.foreign_column_name} = t1.${constraint.column_name}
                )
            `);

            if (violations.length > 0) {
                issues.push({
                    type: 'foreign_key_violation',
                    table: constraint.table_name,
                    column: constraint.column_name,
                    count: violations.length
                });
            }
        }

        return issues;
    }

    // 检查唯一约束
    async _checkUniqueConstraints() {
        const issues = [];
        const { rows } = await this.pool.query(`
            SELECT 
                tc.table_name, 
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'UNIQUE'
        `);

        for (const constraint of rows) {
            const { rows: duplicates } = await this.pool.query(`
                SELECT ${constraint.column_name}, COUNT(*)
                FROM ${constraint.table_name}
                GROUP BY ${constraint.column_name}
                HAVING COUNT(*) > 1
            `);

            if (duplicates.length > 0) {
                issues.push({
                    type: 'unique_constraint_violation',
                    table: constraint.table_name,
                    column: constraint.column_name,
                    count: duplicates.length
                });
            }
        }

        return issues;
    }

    // 检查非空约束
    async _checkNullConstraints() {
        const { rows } = await this.pool.query(`
            SELECT 
                table_name, 
                column_name
            FROM information_schema.columns
            WHERE is_nullable = 'NO'
                AND column_default IS NULL
        `);

        const issues = [];
        for (const column of rows) {
            const { rows: nulls } = await this.pool.query(`
                SELECT COUNT(*)
                FROM ${column.table_name}
                WHERE ${column.column_name} IS NULL
            `);

            if (nulls[0].count > 0) {
                issues.push({
                    type: 'null_constraint_violation',
                    table: column.table_name,
                    column: column.column_name,
                    count: nulls[0].count
                });
            }
        }

        return issues;
    }

    // 检查数据类型
    async _checkDataTypes() {
        // 实现数据类型检查逻辑
        return [];
    }

    // 检查索引
    async _checkIndexes() {
        const { rows } = await this.pool.query(`
            SELECT 
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
        `);

        // 分析索引使用情况
        const issues = [];
        for (const index of rows) {
            const { rows: usage } = await this.pool.query(`
                SELECT 
                    idx_scan,
                    idx_tup_read,
                    idx_tup_fetch
                FROM pg_stat_user_indexes
                WHERE indexrelname = $1
            `, [index.indexname]);

            if (usage[0].idx_scan === 0) {
                issues.push({
                    type: 'unused_index',
                    table: index.tablename,
                    index: index.indexname
                });
            }
        }

        return issues;
    }
}

module.exports = new MigrationService(); 