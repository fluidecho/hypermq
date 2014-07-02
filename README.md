# HyperMQ

Message-oriented HTTP service inspired by axon and zeromq.  

Unlike [axon](https://www.npmjs.org/package/axon), hypermq uses HTTP for transport rather than plain TCP, this allows hypermq to have:

  - encryption (SSL/TLS).
  - authentication (Basic).
  - firewall friendliness (single port).  
  
If you do not require any of these three features then I recommend you use [axon](https://www.npmjs.org/package/axon).  

## Installation

From your terminal, requires [node.js](http://nodejs.org/).

```
npm install hypermq
```

## Events

  - `close` when server or connection is closed.
  - `error` (err) when an un-handled socket error occurs.
  - `reconnect attempt` when a reconnection attempt is made.
  - `connect` when connected to the peer, or a peer connection is accepted.
  - `disconnect` when an accepted peer disconnects.
  - `bind` when the server is bound.
  - `drop` (msg) when a message is dropped due to the HWM.
  - `flush` (msgs) queued when messages are flushed on connection.
  - `message` (msg) the message received by peer.

## Patterns

  - push / pull
  - pub / sub
  - chit / chat
  
## Push / Pull Example

`push`s distribute messages round-robin:

```js
var hypermq = require('hypermq');

var options = {
	hostname: '127.0.0.1',
	port: 3443,
	secure: true,
	key: __dirname + '/key.pem',
	cert: __dirname + '/cert.pem'
};
var service = hypermq.bind(options);

var myService = new service('myService', 'push');
console.log('myService:push server started');

setInterval(function(){
	myService.send('hello');
}, 100);
```
Receiver of `push` messages:

```js
var hypermq = require('hypermq');

var options = { 
	hostname: '127.0.0.1', 
	port: 3443, 
	secure: true, 
	rejectUnauthorized: false 
};
var service = hypermq.connect(options);

var myService = new service('myService', 'pull');

myService.on('message', function(msg){
  console.log(msg.toString());
});
```

## Chit / Chat Example

`chit`s is di-directional, broadcast to all `chat` peers and receive messages back:

```js
var hypermq = require('hypermq');

var options = {
	hostname: '127.0.0.1',
	port: 3443,
	secure: true,
	key: __dirname + '/key.pem',
	cert: __dirname + '/cert.pem'
};
var service = hypermq.bind(options);

var myService = new service('myService', 'chit');
console.log('myService:chit server started');

myService.on('message', function(msg){
  console.log(msg.toString());
});

setInterval(function(){
	myService.send('hello chat');
}, 100);
```

`chat`s is bi-directional, receive and send messages to `chit`:  
(`chat` cannot broadcast messages to other `chat`s)

```js
var hypermq = require('hypermq');

var options = { 
	hostname: '127.0.0.1', 
	port: 3443, 
	secure: true, 
	rejectUnauthorized: false 
};
var service = hypermq.connect(options);

var myService = new service('myService', 'chat');

myService.on('message', function(msg){
  console.log(msg.toString());
});

setInterval(function(){
	myService.send('hello chit');
}, 100);
```

## Message Protocol

hypermq has two message protocols for you to choose from; [AMP](https://github.com/visionmedia/node-amp) protocol, with [node-amp-message](https://github.com/visionmedia/node-amp-message), the second protocol available is [Line Deineated JSON](http://en.wikipedia.org/wiki/Line_Delimited_JSON).  

hypermq uses AMP by default as it is fastest and most flexible. AMP allows you to apply any message codec, such as: json, msgpack, or to use javascript/node.js objects: buffer (binary), strings. Line Deineated JSON is useful for `peer`s written in different languages. Both the `bind` and `connect` peers must use the same protocol.    

Example sending javascript/node.js mixed object with the AMP protocol.

```js
service.send('myservice', 'push', {hello: 'world', x: 101, fab: true, image: new Buffer('binary image data')});
```
Set message protocol options `amp`, `ldjson`:
```js
{
	protocol: 'amp'		// (default), or: 'ldjson' for Line Deineated JSON.
}
```

## Performance

hypermq uses a persistent HTTP connection between the `bind` and `connect` peers, as a result once the connection is made `{secure: false}`, hypermq shows comparable performance to axon.


## License

Choose either: [MIT](http://opensource.org/licenses/MIT) or [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0).

