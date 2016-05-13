'use strict';
/**
 * This is an example of how the fetcher-ws lib can be used
 */
const streamObj = fetcherWs('stream', {
  url: 'http://localhost:12000/ws'
});

streamOj
  .on('connect', () => {

    streamObj.fetch('action.name', {
      payload: 'data'
    }).then((r) => {
      console.log("Fetch an action.");
    })

    console.log("CONNECTED to server");
    streamObj.on('custom.action', (data) => {
      console.log("Custom action:", data);
    });

    streamObj.join('my.room.name', {
      withSome: 'data'
    }).then((roomObj) => {
      console.log("JOINED ROOM.");

      var handler = roomObj.handle('custom.room.action', function(data) {
        console.log("Incoming custom room action", data);
        handler.remove(); // remove the listener.
      });

      // Leave a room from within the roomObj
      roomObj.leave({
        withSome: 'additional data'
      }).then(() => {
        console.log("LEFT ROOM.");
      });
    });

    // Leave a room from the root conn
    streamObj.leave('my.room.nam2').then(function() {
      console.log("Left from somewhere else.");
    });

    // Emit a custom event to the socket.io server
    streamObj.emit('myEvent', {withMy: 'data'}, function onResponse() {

    });

  })
  .on('disconnect', () => {
    console.log("DISCONNECT")
  })
  .on('reconnect', () => {
    console.log("Reconnected to server.");
  })