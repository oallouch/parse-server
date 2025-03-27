class LazyRedisCacheAdapter {
  constructor(redisCtx, ttl) {
    const RedisCacheAdapter = require('./RedisCacheAdapter');
    this.redisCacheAdapter = new RedisCacheAdapter(redisCtx, ttl);
    this.ttl = this.redisCacheAdapter.ttl;
    this.client = this.redisCacheAdapter.client;
    this.queue = this.redisCacheAdapter.queue;
  }

  async connect() {
    return this.redisCacheAdapter.connect();
  }

  async handleShutdown() {
    return this.redisCacheAdapter.handleShutdown();
  }

  async get(key) {
    return this.redisCacheAdapter.get(key);
  }

  async put(key, value, ttl) {
    return this.redisCacheAdapter.put(key, value, ttl);
  }

  async del(key) {
    return this.redisCacheAdapter.del(key);
  }

  async clear() {
    return this.redisCacheAdapter.clear();
  }

  getAllKeys() {
    return this.redisCacheAdapter.getAllKeys();
  }
}

export default LazyRedisCacheAdapter;
