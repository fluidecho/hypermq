# HyperMQ

Message-oriented HTTP service inspired by axon and zeromq. [![Build Status](https://api.travis-ci.org/kurunt/hypermq.png)](https://api.travis-ci.org/kurunt/hypermq)  

Unlike [axon](https://www.npmjs.org/package/axon), hypermq uses HTTP for transport rather than plain TCP, this allows hypermq to have:

  - encryption (SSL/TLS).
  - authentication (Basic).
  - firewall friendliness (single port).  

If you do not require any of these three features then [axon](https://www.npmjs.org/package/axon) is recommend.  

This is __not__ a 'web browser' solution, to do that you could add socket.io on top of hypermq.  

## Installation

From your terminal, requires [node.js](http://nodejs.org/).

```
npm install hypermq
```

## Events

  - `closed` when peer closes.
  - `error` (err) when an un-handled socket error occurs.
  - `reconnect attempt` when a reconnection attempt is made.
  - `connected` (any url queries sent as object) when connected to the peer, or a peer connection is accepted.
  - `queued` (msg) when a message is enqueued, can use to save unsent messages.
  - `flushed` (total messages) queued when messages are flushed on connection.
  - `message` (msg) the message received by peer.

## Patterns

  - push / pull
  - pub / sub
  - chit / chat
  
## Examples

See `examples` folder. To print debugging info use the _--preview_ argument when running the app, for example:

```
node examples/pushpull/push.js --preview
```

## Push / Pull Example

`push`s distribute messages round-robin:

```js
var hypermq = require('hypermq');

var options = {
  hostname: '127.0.0.1',
  port: 3443,
  secure: true,
  key: __dirname + '/key.pem',
  cert: __dirname + '/cert.pem',
  apikey: 'za91j2bk72f483ap62x' 
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
  rejectUnauthorized: false,
  apikey: 'za91j2bk72f483ap62x' 
};
var service = hypermq.connect(options);

var myService = new service('myService', 'pull');

myService.on('message', function(msg){
  console.log(msg.toString());
});
```

## Chit / Chat Example

`chit`s is bi-directional, broadcast to all `chat` peers and can receive messages back:

```js
var hypermq = require('hypermq');

var options = {
  hostname: '127.0.0.1',
  port: 3443,
  secure: true,
  key: __dirname + '/key.pem',
  cert: __dirname + '/cert.pem',
  apikey: 'za91j2bk72f483ap62x' 
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

`chat`s is bi-directional, can receive and send messages to `chit`:

```js
var hypermq = require('hypermq');

var options = { 
  hostname: '127.0.0.1', 
  port: 3443, 
  secure: true, 
  rejectUnauthorized: false,
  apikey: 'za91j2bk72f483ap62x' 
};
var service = hypermq.connect(options);

var myService = new service('myService', 'chat');

myService.on('message', function(msg){
  console.log(msg.toString());
});

setInterval(function(){
  myService.send('hello chit');
}, 1000);
```

## Message Protocol

hypermq has two message protocols for you to choose from; [AMP](https://github.com/visionmedia/node-amp) protocol, with [node-amp-message](https://github.com/visionmedia/node-amp-message), the second protocol available is [Line Delimited JSON](http://en.wikipedia.org/wiki/Line_Delimited_JSON).  

hypermq uses AMP by default as it is fastest and most flexible. AMP allows you to apply any message codec, such as: json, msgpack, or to use javascript/node.js objects: buffer (binary), strings. Line Delimited JSON is useful for connecting `peer`s written in different languages.  

Example sending javascript/node.js mixed object with the AMP protocol.

```js
myService.send( {hello: 'world', x: 101, fab: true, image: new Buffer('binary image data')} );
```
Set message protocol options `amp`, `ldjson`:
```js
{
  protocol: 'amp'   // (default), or: 'ldjson' for Line Deineated JSON.
}
```

## Performance

You can benchmark hypermq. With `secure` set to true will be slower as messages are encrypted.  

Benchmark without `batching`:
```
make bench
```
Benchmark with `batching`:
```
make benchbatch
```
### Results

Sending a `200` byte sized `batched` `unsecure` message, on my laptop (dual-core i7), I get around __183,546__ messages per second:

```
  [2208 ops/s] [10001]

      min: 2,208 ops/s
     mean: 2,211 ops/s
   median: 2,230 ops/s
    total: 11,057 ops in 5s
  through: 0.42 mb/s

------------------------------
   events: 917,731
       id: 23,388
     mean: 183,546 ops/s.
------------------------------
```

## License

Choose either: [MIT](http://opensource.org/licenses/MIT) or [Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0).

