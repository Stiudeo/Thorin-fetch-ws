'use strict';
if (typeof window.io === 'undefined') {
  console.error('thorin-fetch-ws: socket.io is not loaded on window.io. Please include the client script.');
}
const sio = window.io,
  DEFAULT_ACTION_EVENT = 'action',
  ROOM_JOIN_EVENT = 'room.join',
  ROOM_LEAVE_EVENT = 'room.leave',
  ROOM_CLEAR_EVENT = 'room.clear';
/*
 * Create a new websocket connection.
 * */
export function create(config, name, sendEvent) {
  let PENDING_DISPATCH = [],
    JOINED_ROOMS = [],  // array of {name, data, roomObj}
    DISPATCH_EVENT = config.event,
    SOCKET_HANDLERS = {},
    wasConnected = false;
  const EVENT_HANDLERS = {};
  delete config.event;
  const conn = {
    connected: false
  };

  /*
  * Dispatch a FETCH event to the server.
  * */
  conn.fetch = function FetchEvent(action, payload) {
    if(typeof action !== 'string' || !action) {
      console.error('thorin-fetcher-ws: usage fetch("actionName", {payload})');
      return this;
    }
    if(typeof payload === 'undefined' || payload == null) payload = {};
    if(typeof payload !== 'object' && !payload) {
      console.error('thorin-fetcher-ws: payload must be an object.');
      return this;
    }
    const fetchData = {
      type: action,
      payload: (typeof payload === 'object' ? payload : {})
    };
    return new Promise((resolve, reject) => {
      sendSocketEvent(DISPATCH_EVENT, fetchData, handlePromise(resolve, reject));
    });
  }

  /*
  * Registers a custom event listener.
  * */
  conn.handle = function HandleEvent(eventName, fn, roomName) {
    let wasRegistered = false,
      onEventFn;
    if(typeof roomName === 'string' && roomName) {
      eventName = roomName + ':' + eventName;
    } else if(typeof SOCKET_HANDLERS[eventName] === 'undefined') {
      onEventFn = registerSocketEvent(eventName);
      wasRegistered = true;
    }
    if(typeof EVENT_HANDLERS[eventName] === 'undefined') EVENT_HANDLERS[eventName] = [];
    EVENT_HANDLERS[eventName].push(fn);
    return {
      remove: function removeListener() {
        if(typeof EVENT_HANDLERS[eventName] === 'undefined') return false;
        for(let i=0; i < EVENT_HANDLERS[eventName].length; i++) {
          if(EVENT_HANDLERS[eventName][i] == fn) {
            EVENT_HANDLERS[eventName].splice(i, 1);
            if(EVENT_HANDLERS[eventName].length === 0) {
              delete EVENT_HANDLERS[eventName];
              socketObj.removeListener(eventName, onEventFn);
            }
            return true;
          }
        }
        return false;
      }
    }
    return conn;
  }

  /*
  * Join a room and return a channelObj if succeeded.
  * */
  conn.join = function JoinRoom(room, data) {
    if(typeof room !== 'string' || !room) {
      console.error('thorin-fetcher-ws: usage join("roomName", {payload})');
      return this;
    }
    const originalRoom = room;
    return new Promise((resolve, reject) => {
      const payload = (typeof data === 'object' && data ? data : {});
      sendSocketEvent(ROOM_JOIN_EVENT, room, payload, handlePromise((res) => {
        room = res.room;
        let hasRoom = false;
        for(let i=0; i < JOINED_ROOMS.length; i++) {
          let item = JOINED_ROOMS[i];
          if(item.id === room) {
            hasRoom = true;
            break;
          }
        }
        if(!hasRoom) {
          JOINED_ROOMS.push({
            id: room,
            name: originalRoom,
            data
          });
        }
        let roomObj = {
          name: room,
          result: res.result || {}
        };
        createRoom(roomObj, room);
        resolve(roomObj);
      }, reject, true));
    });
  }

  /*
  * Leave a room and destroy the channelObj if succeeded.
  * */
  conn.leave = function LeaveRoom(room, data) {
    if(typeof room !== 'string' || !room) {
      console.error('thorin-fetcher-ws: usage join("roomName", {payload})');
      return this;
    }
    return new Promise((resolve, reject) => {
      const payload = (typeof data === 'object' && data ? data : {});
      sendSocketEvent(ROOM_LEAVE_EVENT, room, payload, handlePromise((res) => {
        let hasRoom = false;
        for(let i=0; i < JOINED_ROOMS.length; i++) {
          let item = JOINED_ROOMS[i];
          if(item.name === room) {
            JOINED_ROOMS.splice(i, 1);
            break;
          }
        }
        // free up any handlers that handle this room.
        Object.keys(EVENT_HANDLERS).forEach((eventName) => {
          if(eventName.indexOf(room +':') === 0) {
            delete EVENT_HANDLERS[eventName];
          }
        });
        resolve(res);
      }, reject));
    });
  }

  /*
  * Dispatch a custom event with an optional callback.
  * */
  conn.emit = function EmitEvent(event, _data, _fn) {
    if(typeof event !== 'string' || !event) {
      console.error('thorin-fetcher-ws: usage fetch("actionName", {payload})');
      return this;
    }
    sendSocketEvent(event, _data, _fn);
    return conn;
  }

  function registerSocketEvent(eventName) {
    function onEvent() {
      if(typeof EVENT_HANDLERS[eventName] === 'undefined' || EVENT_HANDLERS[eventName].length === 0) return;
      for(let i=0; i < EVENT_HANDLERS[eventName].length; i++) {
        let fn = EVENT_HANDLERS[eventName][i];
        fn.apply(conn, arguments);
      }
    }
    socketObj.on(eventName, onEvent);
    return onEvent;
  }

  /* Wrapper for the room creation. */
  function createRoom(roomObj, name) {
    roomObj.leave = conn.leave.bind(conn, name);
    roomObj.handle = function HandleRoomEvent(event, fn) {
      return conn.handle.call(conn, event, fn, name);
    }
  }

  function sendSocketEvent() {
    if(!conn.connected) {
      PENDING_DISPATCH.push(arguments);
      return this;
    }
    socketObj.emit.apply(socketObj, arguments);
  }

  function handlePromise(resolve, reject, _fullResult) {
    return function onEvent(err, res) {
      if(err) {
        err = parseError(err);
        sendEvent('error', err);
        return reject(err);
      }
      if(_fullResult === true) {
        sendEvent('success', res.result);
        return resolve(res);
      }
      delete res.type;
      if(typeof res.meta === 'undefined') {
        sendEvent('success', res.result);
        return resolve(res.result);
      }
      sendEvent('success', res);
      resolve(res);
    }
  }

  let url = config.url;
  delete config.url;
  const socketObj = sio(url, config);

  function flushActions() {
    if(PENDING_DISPATCH.length === 0) return;
    let tmp = PENDING_DISPATCH;
    PENDING_DISPATCH = [];
    for(let i=0; i < tmp.length; i++) {
      let args = tmp[i];
      sendSocketEvent.apply(this, args);
    }
  }

  function flushRejoin() {
    if(JOINED_ROOMS.length === 0) return;
    let tmp = JOINED_ROOMS;
    JOINED_ROOMS = [];
    for(let i=0; i < tmp.length; i++) {
      let item = tmp[i];
      conn.join(item.name, item.data).catch((err) => {
        err = parseError(err);
        sendEvent('error', err);
        console.log("HER", err);
      });
    }
  }

  function parseError(e) {
    let err;
    if(typeof e === 'object' && e) {
      if(e instanceof Error) {
        err = e;
      } else {
        err = new Error(e.message || 'Failed to complete fetch request.');
      }
    } else {
      e = {};
      err = new Error(e.message || 'Failed to complete fetch request');
    }
    Object.keys(e).forEach((key) => {
      err[key] = e[key];
    });
    if(!err.code) err.code = 'SERVER_ERROR';
    if(!err.status) err.status = 500;
    return err;
  }

  socketObj
    .on('connect', () => {
      conn.connected = true;
      if (wasConnected) return;
      wasConnected = true;
      sendEvent('connect');
      flushActions();
      flushRejoin();
    })
    .on('disconnect', () => {
      conn.connected = false;
      sendEvent('disconnect');
    })
    .on('error', (e) => {
      sendEvent('error', new Error(e));
    })
    .on('reconnect', () => {
      conn.connected = true;
      sendEvent('reconnect');
      // When reconnecting, we re-join our rooms.
      flushRejoin();
      flushActions();
    });

  /* Handle the default incoming event */
  socketObj.on(DEFAULT_ACTION_EVENT, (data, room) => {
    let eventName = data.type,
      roomEventName = null;
    if(typeof room === 'string') {
      roomEventName = room + ':' + eventName;
    }
    if(typeof EVENT_HANDLERS[eventName] !== 'undefined') {
      let i=0;
      while(typeof EVENT_HANDLERS[eventName] !== 'undefined' && i < EVENT_HANDLERS[eventName].length) {
        EVENT_HANDLERS[eventName][i](data.payload, room);
        i++;
      }
    }
    if(roomEventName != null && typeof EVENT_HANDLERS[roomEventName] !== 'undefined') {
      let i = 0;
      while(typeof EVENT_HANDLERS[roomEventName] !== 'undefined' && i < EVENT_HANDLERS[roomEventName].length) {
        EVENT_HANDLERS[roomEventName][i](data.payload);
        i++;
      }
    }
  });

  return conn;
}