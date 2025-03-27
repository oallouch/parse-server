/**
 * This is a lazy version of ParseGraphQLServer that is used to avoid libraries compulation
 * at startup time.
 * The fact that we don't use a factory, but a constructor, to create the ParseGraphQLServer
 * makes using a Proxy impossible.
 */
class LazyParseGraphQLServer {
  constructor(parseServer, config) {
    const { ParseGraphQLServer } = require('./ParseGraphQLServer');
    this.parseGraphQLServer = new ParseGraphQLServer(parseServer, config);
    this.parseServer = this.parseGraphQLServer.parseServer;
    this.config = this.parseGraphQLServer.config;
    this.log = this.parseGraphQLServer.log;
    this.parseGraphQLSchema = this.parseGraphQLServer.parseGraphQLSchema;
  }

  applyGraphQL(app) {
    return this.parseGraphQLServer.applyGraphQL(app);
  }

  applyPlayground(app) {
    return this.parseGraphQLServer.applyPlayground(app);
  }

  createSubscriptions(server) {
    return this.parseGraphQLServer.createSubscriptions(server);
  }

  setGraphQLConfig(config) {
    return this.parseGraphQLServer.setGraphQLConfig(config);
  }
}
export { LazyParseGraphQLServer as ParseGraphQLServer };
