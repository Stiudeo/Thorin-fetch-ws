'use strict';
import 'whatwg-fetch';
const socketConnection = require('./ws/connection.js');
const LOADED_FETCHERS = {},
  DEFAULT_EVENT = 'dispatch',
  FETCHER_EVENTS = {};       // a hash of {error:[fns],success:[fns]} listeners for all the fetchers.

function parseConfig(config) {
  if(!config.url) {
    if(window.location.pathname === '/') {
      config.url = window.location.href.substr(0, window.location.href.length - 1);
    } else {
      config.url = window.location.href.split(window.location.pathname)[0];
    }
    config.url += '/ws';
  }
  let tmp = config.url.split('://'),
    full = tmp[0] + '://'+ tmp[1].replace(/\/\//g,'/'),
    pIdx = tmp[1].indexOf('/');
  config.url = full;
  if(!config.event) config.event = DEFAULT_EVENT;
  if(pIdx === -1 && !config.path) {
    config.path = '/ws';
  } else {
    let cp = tmp[1].substr(pIdx);
    cp = cp.split('?')[0];
    config.path = cp;
  }
  let cuIdx = config.url.indexOf(config.path);
  if(cuIdx !== -1) {
    config.url = config.url.substr(0, cuIdx);
  }

  if(typeof config.headers !== 'object' || !config.headers) config.headers = {};
  if(typeof config.authorization === 'string') {
    config.headers['Authorization'] = 'Bearer ' + config.authorization;
  }
  config.extraHeaders = config.headers;
  delete config.headers;
  return config;
}

function registerFetchEvent(name, type, fn) {
  if(typeof fn !== 'function') {
    console.warn('thorin-fetcher: on(event, fn): fn should be a function');
    return this;
  }
  let item = {
    fn: fn
  };
  if(typeof name === 'string') item.name = name;
  if(typeof FETCHER_EVENTS[type] === 'undefined') FETCHER_EVENTS[type] = [];
  FETCHER_EVENTS[type].push(item);
  return this;
}

function handleFetchEvent(name, type, data) {
  if(typeof FETCHER_EVENTS[type] === 'undefined') return;
  if(FETCHER_EVENTS[type].length === 0) return;
  for(let i=0; i < FETCHER_EVENTS[type].length; i++) {
    let item = FETCHER_EVENTS[type][i],
      shouldCall = (typeof item.name === 'string' && item.name === name) || (typeof item.name === 'undefined');
    if(!shouldCall) continue;
    item.fn(data);
  }
}

/**
 * The thorin fetcher create() function will create a named fetcher object and return it.
 * Each fetcher instance can be used separately with different configurations.
 *
 * CONFIGURATION ARGUMENTS:
 *  - url (string) - the full URL of thorin's /dispatch endpoint (defaults to window URL + '/dispatch
 *  - headers (object)  - additional headers to send
 *  - authorization (string) - an additional Authorization: Bearer {token} to attach
 *  - credentials (boolean) - should we send the cookies when calling a different url? defaults to false
 * */
function createFetcher(config, name) {
  parseConfig(config);
  /* This is the fetcher wrapper. */
  const connObj = socketConnection.create(config, name, handleFetchEvent.bind(this, name));
  connObj.on = registerFetchEvent.bind(connObj, name);
  return connObj;
}


/**
 * This is the implicit fetcher creator.
 * Arguments:
 *  - name (string) if specified with no options, it will try returning the given fetcher by name or null.
 *  - name (object) if specified as an object, it will return a fetcher instance withouth caching it.
 *  - opt (object) - used with name, creates and saves a fetcher instance.
 * */
let nidx = 0;
function create(name, opt) {
  // RETURN a fetcher.
  if(typeof name === 'string' && typeof opt === 'undefined') {
    return LOADED_FETCHERS[name] || null;
  }
  nidx++;
  // CREATE anonymous
  if(typeof name === 'object' && name && typeof opt === 'undefined') {
    return createFetcher(name, 'fetcher' + nidx);
  }
  // CREATE named fetcher
  if(typeof name === 'string' && typeof opt === 'object' && opt) {
    if(typeof LOADED_FETCHERS[name] !== 'undefined') {
      console.warn('thorin-fetch: fetcher called ' + name + ' already exists. Returning it in stead.');
      return LOADED_FETCHERS[name];
    }
    let fetcherObj = createFetcher(opt, name);
    LOADED_FETCHERS[name] = fetcherObj;
    return fetcherObj;
  }
  console.error('thorin-fetcher: invalid arguments for fetcher()');
}
module.exports = create;

/* Listen to specific events on all fetchers. */
module.exports.on = registerFetchEvent.bind(module.exports, undefined);