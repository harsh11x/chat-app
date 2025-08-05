const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('❌ Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('❌ Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          console.error('❌ Redis max retry attempts reached');
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      },
    };

    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    redisClient = redis.createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('🔄 Redis Client Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Client Ready');
    });

    redisClient.on('end', () => {
      console.log('📴 Redis Client Disconnected');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis Client Reconnecting...');
    });

    await redisClient.connect();

    // Test the connection
    await redisClient.ping();
    console.log('✅ Redis Connected Successfully');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      if (redisClient) {
        await redisClient.quit();
        console.log('📴 Redis connection closed through app termination');
      }
    });

  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    // Don't exit process for Redis failure, app can work without it
    console.log('⚠️ Continuing without Redis cache...');
  }
};

// Redis utility functions
const redisUtils = {
  // Set key-value with expiration
  setex: async (key, seconds, value) => {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(key, seconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis setex error:', error);
      return false;
    }
  },

  // Get value by key
  get: async (key) => {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  },

  // Delete key
  del: async (key) => {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  },

  // Check if key exists
  exists: async (key) => {
    if (!redisClient) return false;
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  },

  // Set key-value without expiration
  set: async (key, value) => {
    if (!redisClient) return false;
    try {
      await redisClient.set(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  },

  // Increment counter
  incr: async (key) => {
    if (!redisClient) return 0;
    try {
      return await redisClient.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      return 0;
    }
  },

  // Set expiration for existing key
  expire: async (key, seconds) => {
    if (!redisClient) return false;
    try {
      await redisClient.expire(key, seconds);
      return true;
    } catch (error) {
      console.error('Redis expire error:', error);
      return false;
    }
  },

  // Get all keys matching pattern
  keys: async (pattern) => {
    if (!redisClient) return [];
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      console.error('Redis keys error:', error);
      return [];
    }
  },

  // Hash operations
  hset: async (key, field, value) => {
    if (!redisClient) return false;
    try {
      await redisClient.hSet(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis hset error:', error);
      return false;
    }
  },

  hget: async (key, field) => {
    if (!redisClient) return null;
    try {
      const value = await redisClient.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis hget error:', error);
      return null;
    }
  },

  hgetall: async (key) => {
    if (!redisClient) return {};
    try {
      const hash = await redisClient.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      console.error('Redis hgetall error:', error);
      return {};
    }
  },

  hdel: async (key, field) => {
    if (!redisClient) return false;
    try {
      await redisClient.hDel(key, field);
      return true;
    } catch (error) {
      console.error('Redis hdel error:', error);
      return false;
    }
  },

  // List operations
  lpush: async (key, value) => {
    if (!redisClient) return false;
    try {
      await redisClient.lPush(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis lpush error:', error);
      return false;
    }
  },

  rpush: async (key, value) => {
    if (!redisClient) return false;
    try {
      await redisClient.rPush(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis rpush error:', error);
      return false;
    }
  },

  lrange: async (key, start, stop) => {
    if (!redisClient) return [];
    try {
      const values = await redisClient.lRange(key, start, stop);
      return values.map(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Redis lrange error:', error);
      return [];
    }
  },

  // Set operations
  sadd: async (key, member) => {
    if (!redisClient) return false;
    try {
      await redisClient.sAdd(key, JSON.stringify(member));
      return true;
    } catch (error) {
      console.error('Redis sadd error:', error);
      return false;
    }
  },

  srem: async (key, member) => {
    if (!redisClient) return false;
    try {
      await redisClient.sRem(key, JSON.stringify(member));
      return true;
    } catch (error) {
      console.error('Redis srem error:', error);
      return false;
    }
  },

  smembers: async (key) => {
    if (!redisClient) return [];
    try {
      const members = await redisClient.sMembers(key);
      return members.map(member => {
        try {
          return JSON.parse(member);
        } catch {
          return member;
        }
      });
    } catch (error) {
      console.error('Redis smembers error:', error);
      return [];
    }
  },

  // Check Redis connection status
  isConnected: () => {
    return redisClient && redisClient.isReady;
  },

  // Get Redis client instance
  getClient: () => redisClient,
};

module.exports = { connectRedis, redisUtils };