import loadAdapter from '../AdapterLoader';
import Parse from 'parse/node';
import AuthAdapter from './AuthAdapter';
import mfa from './mfa';

const anonymous = {
  validateAuthData: () => {
    return Promise.resolve();
  },
  validateAppId: () => {
    return Promise.resolve();
  },
};


const providers = new Set([
  "apple", "gcenter", "gpgames", "facebook", "instagram", "linkedin", "meetup", "google", "github", "twitter",
  "spotify", "digits", "janrainengage", "janraincapture", "line", "vkontakte", "qq", "wechat", "weibo",
  "phantauth", "microsoft", "keycloak", "ldap", "oauth2"
]);

const loadedProviders = new Map();

const getProvider = function (providerName) {
  if (providerName === 'anonymous') {
    return anonymous;
  }
  if (providerName === 'mfa') {
    return mfa;
  }
  if (!providers.has(providerName)) {
    return undefined;
  }
  if (!loadedProviders.has(providerName)) {
    const provider = require(`./${providerName}`);
    loadedProviders.set(providerName, provider);
  }
  return loadedProviders.get(providerName);
}

// Indexed auth policies
const authAdapterPolicies = {
  default: true,
  solo: true,
  additional: true,
};

function authDataValidator(provider, adapter, appIds, options) {
  return async function (authData, req, user, requestObject) {
    if (appIds && typeof adapter.validateAppId === 'function') {
      await Promise.resolve(adapter.validateAppId(appIds, authData, options, requestObject));
    }
    if (
      adapter.policy &&
      !authAdapterPolicies[adapter.policy] &&
      typeof adapter.policy !== 'function'
    ) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        'AuthAdapter policy is not configured correctly. The value must be either "solo", "additional", "default" or undefined (will be handled as "default")'
      );
    }
    if (typeof adapter.validateAuthData === 'function') {
      return adapter.validateAuthData(authData, options, requestObject);
    }
    if (
      typeof adapter.validateSetUp !== 'function' ||
      typeof adapter.validateLogin !== 'function' ||
      typeof adapter.validateUpdate !== 'function'
    ) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        'Adapter is not configured. Implement either validateAuthData or all of the following: validateSetUp, validateLogin and validateUpdate'
      );
    }
    // When masterKey is detected, we should trigger a logged in user
    const isLoggedIn =
      (req.auth.user && user && req.auth.user.id === user.id) || (user && req.auth.isMaster);
    let hasAuthDataConfigured = false;

    if (user && user.get('authData') && user.get('authData')[provider]) {
      hasAuthDataConfigured = true;
    }

    if (isLoggedIn) {
      // User is updating their authData
      if (hasAuthDataConfigured) {
        return {
          method: 'validateUpdate',
          validator: () => adapter.validateUpdate(authData, options, requestObject),
        };
      }
      // Set up if the user does not have the provider configured
      return {
        method: 'validateSetUp',
        validator: () => adapter.validateSetUp(authData, options, requestObject),
      };
    }

    // Not logged in and authData is configured on the user
    if (hasAuthDataConfigured) {
      return {
        method: 'validateLogin',
        validator: () => adapter.validateLogin(authData, options, requestObject),
      };
    }

    // User not logged in and the provider is not set up, for example when a new user
    // signs up or an existing user uses a new auth provider
    return {
      method: 'validateSetUp',
      validator: () => adapter.validateSetUp(authData, options, requestObject),
    };
  };
}

function loadAuthAdapter(providerName, authOptions) {
  // providers are auth providers implemented by default
  let defaultAdapter = getProvider(providerName);
  // authOptions can contain complete custom auth adapters or
  // a default auth adapter like Facebook
  const providerOptions = authOptions[providerName];
  if (
    providerOptions &&
    Object.prototype.hasOwnProperty.call(providerOptions, 'oauth2') &&
    providerOptions['oauth2'] === true
  ) {
    defaultAdapter = getProvider("oauth2");
  }

  // Default provider not found and a custom auth provider was not provided
  if (!defaultAdapter && !providerOptions) {
    return;
  }

  const adapter =
    defaultAdapter instanceof AuthAdapter ? defaultAdapter : Object.assign({}, defaultAdapter);
  const keys = [
    'validateAuthData',
    'validateAppId',
    'validateSetUp',
    'validateLogin',
    'validateUpdate',
    'challenge',
    'validateOptions',
    'policy',
    'afterFind',
  ];
  const defaultAuthAdapter = new AuthAdapter();
  keys.forEach(key => {
    const existing = adapter?.[key];
    if (
      existing &&
      typeof existing === 'function' &&
      existing.toString() === defaultAuthAdapter[key].toString()
    ) {
      adapter[key] = null;
    }
  });
  const appIds = providerOptions ? providerOptions.appIds : undefined;

  // Try the configuration methods
  if (providerOptions) {
    const optionalAdapter = loadAdapter(providerOptions, undefined, providerOptions);
    if (optionalAdapter) {
      keys.forEach(key => {
        if (optionalAdapter[key]) {
          adapter[key] = optionalAdapter[key];
        }
      });
    }
  }
  if (adapter.validateOptions) {
    adapter.validateOptions(providerOptions);
  }

  return { adapter, appIds, providerOptions };
}

module.exports = function (authOptions = {}, enableAnonymousUsers = true) {
  let _enableAnonymousUsers = enableAnonymousUsers;
  const setEnableAnonymousUsers = function (enable) {
    _enableAnonymousUsers = enable;
  };
  // To handle the test cases on configuration
  const getValidatorForProvider = function (provider) {
    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return { validator: undefined };
    }
    const authAdapter = loadAuthAdapter(provider, authOptions);
    if (!authAdapter) { return; }
    const { adapter, appIds, providerOptions } = authAdapter;
    return { validator: authDataValidator(provider, adapter, appIds, providerOptions), adapter };
  };

  const runAfterFind = async (req, authData) => {
    if (!authData) {
      return;
    }
    const adapters = Object.keys(authData);
    await Promise.all(
      adapters.map(async provider => {
        const authAdapter = getValidatorForProvider(provider);
        if (!authAdapter) {
          return;
        }
        const { adapter, providerOptions } = authAdapter;
        const afterFind = adapter.afterFind;
        if (afterFind && typeof afterFind === 'function') {
          const requestObject = {
            ip: req.config.ip,
            user: req.auth.user,
            master: req.auth.isMaster,
          };
          const result = afterFind.call(
            adapter,
            requestObject,
            authData[provider],
            providerOptions
          );
          if (result) {
            authData[provider] = result;
          }
        }
      })
    );
  };

  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers,
    runAfterFind,
  });
};

module.exports.loadAuthAdapter = loadAuthAdapter;
