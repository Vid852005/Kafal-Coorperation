// Performance optimization utilities for Kafal Cooperative Society
// Implements caching, query optimization, and efficient data handling

const NodeCache = require('node-cache');
const { executeQuery } = require('../config/database');

// Initialize cache with 10 minute TTL
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

class OptimizationService {
    constructor() {
        this.queryCache = new Map();
        this.rateLimitCache = new Map();
    }

    // Cached database query execution
    async cachedQuery(key, query, params = [], ttl = 300) {
        const cacheKey = `query_${key}_${JSON.stringify(params)}`;
        
        // Check cache first
        const cached = cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Execute query and cache result
        const result = await executeQuery(query, params);
        cache.set(cacheKey, result, ttl);
        
        return result;
    }

    // Optimized member lookup with caching
    async getMemberOptimized(memberId) {
        return await this.cachedQuery(
            `member_${memberId}`,
            'SELECT * FROM members WHERE member_id = ?',
            [memberId],
            600 // 10 minutes cache
        );
    }

    // Optimized dashboard stats with caching
    async getDashboardStatsOptimized() {
        return await this.cachedQuery(
            'dashboard_stats',
            `SELECT 
                (SELECT COUNT(*) FROM members WHERE status = 'Active') as active_members,
                (SELECT COUNT(*) FROM member_requests WHERE status = 'Pending') as pending_requests,
                (SELECT COUNT(*) FROM loans WHERE status IN ('Applied', 'Under Review')) as pending_loans,
                (SELECT COALESCE(SUM(loan_amount), 0) FROM loans WHERE status = 'Active') as active_loan_amount,
                (SELECT COALESCE(SUM(current_balance), 0) FROM deposits WHERE status = 'Active') as total_deposits`,
            [],
            60 // 1 minute cache for dashboard
        );
    }

    // Batch operations for better performance
    async batchUpdateMembers(updates) {
        const queries = updates.map(update => ({
            query: 'UPDATE members SET status = ?, updated_at = NOW() WHERE member_id = ?',
            params: [update.status, update.member_id]
        }));

        return await this.executeBatch(queries);
    }

    // Execute multiple queries in a transaction
    async executeBatch(queries) {
        const { transaction } = require('../config/database');
        
        return await transaction(async (connection) => {
            const results = [];
            for (const { query, params } of queries) {
                const [result] = await connection.execute(query, params);
                results.push(result);
            }
            return results;
        });
    }

    // Pagination helper with optimized counting
    async getPaginatedResults(baseQuery, countQuery, params, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        
        // Execute count and data queries in parallel
        const [dataResults, countResults] = await Promise.all([
            executeQuery(`${baseQuery} LIMIT ? OFFSET ?`, [...params, parseInt(limit), parseInt(offset)]),
            this.cachedQuery(`count_${countQuery}`, countQuery, params, 300)
        ]);

        const total = countResults[0]?.total || 0;

        return {
            data: dataResults,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total_records: total,
                total_pages: Math.ceil(total / limit),
                has_next: page * limit < total,
                has_prev: page > 1
            }
        };
    }

    // Rate limiting helper
    isRateLimited(key, maxRequests = 100, windowMs = 900000) { // 15 minutes
        const now = Date.now();
        const windowStart = now - windowMs;
        
        if (!this.rateLimitCache.has(key)) {
            this.rateLimitCache.set(key, []);
        }
        
        const requests = this.rateLimitCache.get(key);
        
        // Remove old requests outside the window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        
        if (validRequests.length >= maxRequests) {
            return true;
        }
        
        // Add current request
        validRequests.push(now);
        this.rateLimitCache.set(key, validRequests);
        
        return false;
    }

    // Clear cache by pattern
    clearCache(pattern) {
        const keys = cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        cache.del(matchingKeys);
    }

    // Memory usage optimization
    optimizeMemoryUsage() {
        // Clear old rate limit entries
        const now = Date.now();
        const fifteenMinutesAgo = now - 900000;
        
        for (const [key, requests] of this.rateLimitCache.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > fifteenMinutesAgo);
            if (validRequests.length === 0) {
                this.rateLimitCache.delete(key);
            } else {
                this.rateLimitCache.set(key, validRequests);
            }
        }

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    }

    // Database connection pool optimization
    async optimizeConnectionPool() {
        const { pool } = require('../config/database');
        
        // Get pool status
        const poolStatus = {
            totalConnections: pool.pool._allConnections.length,
            freeConnections: pool.pool._freeConnections.length,
            acquiringConnections: pool.pool._acquiringConnections.length
        };

        console.log('Database Pool Status:', poolStatus);
        
        return poolStatus;
    }

    // Query performance monitoring
    async monitorQueryPerformance(query, params, executionTime) {
        if (executionTime > 1000) { // Log slow queries (>1 second)
            console.warn('Slow Query Detected:', {
                query: query.substring(0, 100) + '...',
                params: params.length,
                executionTime: `${executionTime}ms`
            });
        }
    }
}

module.exports = new OptimizationService();
