"use strict";
//
// hypermq: Message-oriented HTTP service inspired by axon and zeromq.
//
// Version: 0.0.5
// Author: Mark W. B. Ashcroft (mark [at] kurunt [dot] com)
// License: MIT or Apache 2.0.
//
// Copyright (c) 2014 Mark W. B. Ashcroft.
// Copyright (c) 2014 Kurunt.
//


var util = require('util');
var events = require('events');
var amp = require('amp');
var Message = require('amp-message');
var Parser = amp.Stream;
var ldjsonParser = require('./ldjson');
var preview = require('preview')('hypermq');
var fs = require('fs');        // for reading https key and cert.
var url = require('url');
var querystring = require('querystring');
// http or https require-d inside functions.


// public api:
exports.bind = bind;
exports.connect = connect;


var sockets = [];     // connections made to bind.
var services = [];    // as set be send().
var tryed = 0;        // how many connection attemps made.
var CRLF = '\r\n';    // use to delineate messages when using ldjson protocol.

var patterns = [
  'pull',
  'push',
  'pub',
  'sub',
  'chit',
  'chat'
];

// pass settings via 'options' in peer 'bind' and 'connect' functions, DO NOT SET/CHANGE HERE!
var settings = { 
  hwm: Infinity,            // number of messages.
  server_name: 'hypermq',   // http 'server' name.
  throw_error: true,        // if catch socket connection error, throw.
  retry: Infinity,          // number of times to try reconnecting.
  secure: false,            // if true will use https key, cert and apikey as Basic Auth.
  apikey: undefined,        // if secure true will use this as Basic Auth.
  hostname: '127.0.0.1',
  port: 3443,
  protocol: 'amp'           // messages can be sent in either: 'amp' (Abrstract Message Protocol) or 'ldjson' (Line Deineated JSON).
};

// error to check and retry if:
var ignore = {
  ECONNREFUSED: true,
  ECONNRESET: true,
  ETIMEDOUT: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  ENETDOWN: true,
  EPIPE: true,
  ENOENT: true
};



function bind(options) {
  var self = this;
  preview('bind called');
  preview('bind options', options);

  // set options to settings.
  if ( options.server ) {
    settings.server_name = options.server;
  }

  if ( options.hwm ) {
    settings.hwm = options.hwm;
  }

  if ( options.secure ) {
    settings.http = require('https');
    settings.secure = true;
    settings.apikey = options.apikey;
  } else {
    settings.http = require('http');
    settings.secure = false;
  }

  if ( options.throw_error != undefined ) {
    settings.throw_error = options.throw_error;
  }

  if ( options.retry ) {
    settings.retry = options.retry;
  }

  if ( options.protocol ) {
    settings.protocol = options.protocol;
  }  

  settings.hostname = options.hostname;
  settings.port = options.port;

  settings.key = options.key;
  settings.cert = options.cert;


  return newServiceBind;
}



function connect(options) {
  var self = this;
  preview('connect called');
  preview('connect options', options);
  
  // set options to settings.
  if ( options.hwm ) {
    settings.hwm = options.hwm;
  }

  if ( options.secure ) {
    settings.http = require('https');
    settings.secure = true;
    settings.apikey = options.apikey;
  } else {
    settings.http = require('http');
    settings.secure = false;
  }

  if ( options.throw_error != undefined ) {
    settings.throw_error = options.throw_error;
  }

  if ( options.retry ) {
    settings.retry = options.retry;
  }  
  
  if ( options.protocol ) {
    settings.protocol = options.protocol;
  }  
    
  settings.hostname = options.hostname;
  settings.port = options.port;
  
  if ( options.rejectUnauthorized != undefined ) {
    settings.rejectUnauthorized = options.rejectUnauthorized;
  }

  preview('connect: ' + options.hostname + ':' + options.port);

  return newServiceConnect;
}



var bound = false;
function newServiceBind(service, pattern) {
  this.service = service;
  this.pattern = pattern;
  var i = checkService(service);
  if ( i === false ) {
    var i = addService({ name: service, pattern: pattern, queue: [], n: 0, self: this });     // add new service
  }
  this.i = i;
  
  if ( bound ) {
    return;
  }
  
  // can generate own keys using OpenSSL, see: http://nodejs.org/api/tls.html
  bound = true;   // just once.
  if ( settings.secure ) {
    var server = settings.http.createServer({ key: fs.readFileSync(settings.key), cert: fs.readFileSync(settings.cert) }, onconnect);
  } else {
    var server = settings.http.createServer(onconnect);
  }
  
  
  server.on('connection', function(req, res){
    preview('server', 'on connection called');
  });  
  
  preview('binding: ' + settings.hostname + ':' + settings.port);
  server.listen(settings.port, settings.hostname, function() {
    preview('bound');
    //services[i].self.emit('bound', true);   // TODO: hypermq.bind returns eventEmitter so 'bound' event can be sent.
  });
  
  function onconnect(req, res) {

    preview('onconnect');

    // if client request favicon return.
    if (req.url === '/favicon.ico') {
      res.writeHead(200, {'Content-Type': 'image/x-icon'});
      res.end();
      return;
    }
    
    // if secure connection, make sure connection peer is using valid apikey for Basic Auth.
    if ( settings.secure ) {
      var header = req.headers['authorization']||'',        // get the header
        token = header.split(/\s+/).pop()||'',              // and the encoded auth token
        auth = new Buffer(token, 'base64').toString(),      // convert from base64
        parts = auth.split(/:/),                            // split on colon
        username = parts[0],  
        apikey = parts[1]; 
        if ( apikey != settings.apikey ) {
          preview('onRequest', 'request connect peer, not using valid apikey!');
          res.writeHead(401, {'Server': settings.server_name, 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'closed'});
          res.end(JSON.stringify({code: 401, status: 'unauthorized request, invalid apikey'}));
          return;           
        }
    }  
    
    
    var client_host = ipAddress(req);
    preview('onconnect, client_host: ' + client_host);
    
    var reqObj = url.parse(req.url);
    //preview('onconnect', 'reqObj', reqObj);  
    var service, pattern;
    var ps = reqObj.pathname.split('/');
    for ( var p in  ps ) {
      if ( ps[p].trim() != '' || ps[p] === undefined ) {
        preview('onconnect, p: ' + Number(p));
        if ( Number(p) === 1 ) {
          service = querystring.unescape(ps[p]);
        }
        if ( Number(p) === 2 ) {
          pattern = ps[p];
        }     
      }
    }  
    preview('onconnect', 'service: ' + service);
    preview('onconnect', 'pattern: ' + pattern);
    
    if ( service === undefined || pattern === undefined ) {
      res.writeHead(403, {'Server': settings.server_name, 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'closed'});
      res.write( JSON.stringify({"status": "invalid method request"}) + '\n' );
      res.end();
      return; 
    }
    
    var validPattern = false;
    for ( var pt in patterns ) {
      if ( pattern === patterns[pt] ) {
        validPattern = true;
      }
    }
    if ( validPattern === false ) {
      res.writeHead(403, {'Server': settings.server_name, 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'closed'});
      res.write( JSON.stringify({"status": "invalid pattern"}) + '\n' );
      res.end();
      return;     
    }

    // will allow 'connect' to use any 'service' as 'bind' may not yet have created it.
    res.writeHead(200, {'Server': settings.server_name, 'Content-Type': 'application/json; charset=utf-8'});    // must be sent before flushing queues.


    var socket = { service: service, pattern: pattern, host: client_host, res: res, req: req };
    var i = addSocket(socket);

    var s = checkService(service);

    req.on('close', function(){
      preview('req on close for socket i: ' + i);
      removeSocket(socket);
      services[s].self.emit('closed', true);    // emit 'closed'
    });

    var reqObj = url.parse(req.url);
    //preview('onRequest', 'reqObj', reqObj);
    
    var query = querystring.parse(reqObj.query);
    preview('onRequest', 'query', query);

    var protocol = settings.protocol;
    if ( query._protocol != undefined ) {
      protocol = query._protocol;
      delete query._protocol;
    }
  
    preview('onRequest', 'query', query); 
    services[s].self.emit('connected', query);    // emit connected and pass any url query objects.
  
  
    // recieving messages from connection peer.
      // on chunk concate buffer.
      //req.on('data', function (chunk) {
       // preview('onconnect', 'chunk: ' +  chunk.toString());
      //});     
  
  
    if ( protocol === 'ldjson' ) {

      // ldjson.
      var ldjsonparser = new ldjsonParser();
      ldjsonparser.on('error', function(e){
          preview('ldjsonparser', 'error', e);
      });   
      ldjsonparser.on('message', function(message){
          //preview('ldjson', 'message', message);
          if ( message != '_0_' ) {   // _0_ is the start code sent by connect peer.
            services[s].self.emit('message', message);
          }
      });
      req.pipe(ldjsonparser);

    } else {    
  
      var parser = new Parser;
      parser.on('data', function(chunk){
        var message = new Message(chunk);
        //preview('connect', 'message.args', message.args);
        if ( message.args != '_0_' ) {    // _0_ is the start code sent by connect peer.
          services[s].self.emit('message', message.args);
        }
      });
      req.pipe(parser);
    
    }


    // flush queues.
    try {   // may not yet be created.
      preview('onconnect', 'checkService: ' + service + ' s: ' + s + ' q.l: ' + services[s].queue.length);
      if ( services[s].queue.length > 0 ) {
        var prev = services[s].queue;
        var len = prev.length;
        services[s].queue = [];
        preview('flush queued: ' + len + ' messages for service: ' + services[s].name);
        for (var z = 0; z < len; ++z) {
          _send('connect', services[s].name, services[s].pattern, s, prev[z]);
        }
        services[s].self.emit('flushed', prev.length);    // emit 'flushed', number of messages.
      }
    } catch(e) {
    }

    // NOTE: must do either .write() OR .end() to get bi-directional com working. Using a start/initeate code: _0_
    if ( settings.protocol === 'ldjson' ) {
      var message = '_0_' + CRLF;
    } else {
      var message = new Message();
      message.push('_0_');    // _0_ is a code picked up by the bind peer to start coms.
      message = message.toBuffer();
    }
  
    res.write( message );   // must!


  }  
  
  
}
util.inherits(newServiceBind, events.EventEmitter);  


function newServiceConnect(service, pattern, query, self) {

  preview('newServiceConnect', 'service: ' + service + ' pattern: ' + pattern);
  
  tryed++;    // connection attemps.
  
  if ( self === undefined ) {
    var self = this;
  }

  self.service = service;
  self.pattern = pattern;
  var i = checkService(service);
  if ( i === false ) {
    var i = addService({ name: service, pattern: pattern, queue: [], n: 0, self: self });     // add new service
  }
  self.i = i;
  
  // make http request.

  var options = {};   // set options for http request.
  
  var _query = '';
  if ( query != undefined ) {
    _query = '&' + querystring.stringify(query);
  }
  
  options.path = '/' + querystring.escape(service) + '/' + pattern + '/?_protocol=' + settings.protocol + _query;
  options.method = 'PUT';
  options.hostname = settings.hostname;
  options.port = settings.port;  
  
  if ( settings.rejectUnauthorized != undefined ) {
    options.rejectUnauthorized = settings.rejectUnauthorized;
  }
  
  if ( settings.secure ) {
    options.auth = 'connect:' + settings.apikey;    // set Basic Auth from apikey.
  }
  
  
  preview('newServiceConnect', 'connect attempt address: ' + options.hostname + ':' + options.port + options.path);

  // sock is req
  var socket = undefined;
  var sock = settings.http.request(options, function(res) {
    
    preview('connect', 'request, STATUS', res.statusCode);
    //preview('connect', 'request, HEADERS', res.headers);
    
    var sr = checkService(service);
    preview('connect', 'checkService: ' + sr);  
    
    if ( res.statusCode === 401 ) {
      var error = new Error('401, unauthorized request, invalid apikey');
      if ( settings.throw_error ) {
        services[i].self.emit('error', error);
        throw error;
      }
      services[i].self.emit('error', error);
    }

    if ( res.statusCode === 403 ) {
      var error = new Error('403, invalid pattern or request method');
      if ( settings.throw_error ) {
        services[i].self.emit('error', error);
        throw error;
      }
      services[i].self.emit('error', error); 
    }
  
    //if ( res.statusCode != 200  && tryed < settings.retry ) {
    //  preview('connect', 'status code not 200, try reconnect');
    //  reconnect(service, pattern, query, self, services[i]);  // try reconnecting...
    //}

    if ( res.statusCode === 200 ) {
      tryed = 0;    // reset.
      services[i].self.emit('connected', query);    // emit connected and pass any url query objects.

      socket = { service: service, pattern: pattern, host: options.hostname, res: sock, req: res };
      var s = addSocket(socket);  

      // flush queues.
      try {   // may not yet be created.
        preview('connect', 'checkService: ' + service + ' sr: ' + sr + ' q.l: ' + services[sr].queue.length);
        if ( services[sr].queue.length > 0 ) {
          var prev = services[sr].queue;
          var len = prev.length;
          services[sr].queue = [];
          preview('flush queued: ' + len + ' messages for service: ' + services[sr].name);
          for (var z = 0; z < len; ++z) {
            _send('connect', services[sr].name, services[sr].pattern, s, prev[z]);
          }
          services[sr].self.emit('flushed', prev.length);   // emit 'flushed', number of messages.
        }
      } catch(e) {
      }     
    
    }


    if ( settings.protocol === 'ldjson' ) {
      
      // ldjson.
      var ldjsonparser = new ldjsonParser();
      ldjsonparser.on('error', function(e){
          preview('ldjsonparser', 'error', e);
      });       
      ldjsonparser.on('message', function(message){
          //preview('ldjson', 'message', message);
          if ( message != '_0_' ) {   // _0_ is the start code sent by connect peer.
            services[i].self.emit('message', message);
          }
      });
      res.pipe(ldjsonparser);
  
    } else {  
    
      // amp.
      var parser = new Parser;
      parser.on('data', function(chunk){
        //preview('connect', 'chunk', chunk);
        //preview('connect', 'chunk.toString(): ' + chunk.toString());
        var message = new Message(chunk);
        //preview('connect', 'message.args', message.args);
        if ( message.args != '_0_' ) {    // _0_ is the start code sent by connect peer.
          services[i].self.emit('message', message.args);
        }
      });
      res.pipe(parser);
    
    }

  });
  
  sock.on('error', function(e) {

    preview('connect', 'sock.on.error, connection error!, e.message:' + e.message + ' ignore: ' + ignore[e.code]);
    if ( ignore[e.code] && tryed < settings.retry  ) {
      //preview('connect', 'can\'t connect to peer, try reconnecting!');
      //reconnect(service, pattern, query, self, services[i]);  // try reconnecting...
    } else {
      if ( settings.throw_error ) {
        console.trace(e);
        throw e;
      } else {
        preview('error, problem with socket: ' + e.message);
        services[i].self.emit('error', e);
      }
    }   
    
  });

  
  sock.on('close', function(e) {
    preview('connect', 'connection closed!');
    removeSocket(socket);
    services[i].self.emit('closed', true);
    if ( tryed < settings.retry ) {
      preview('connect', 'connection to peer closed, try reconnecting!');
      reconnect(service, pattern, query, self, services[i]);  // try reconnecting...
    }
  }); 
  
  
  // NOTE: must do either .write() OR .end() to get bi-directional com working. Using a start/initeate code: _0_
  if ( settings.protocol === 'ldjson' ) {
    var message = '_0_' + CRLF;
  } else {
    var message = new Message();
    message.push('_0_');    // _0_ is a code picked up by the bind peer to start coms.
    message = message.toBuffer();
  }
  
  sock.write( message );    // must!
  //sock.end();
  
  

  
  
  
}
util.inherits(newServiceConnect, events.EventEmitter);   



//var reconnectAddress = {};
function reconnect(service, pattern, query, self, s) {
  //if ( reconnectAddress[options.path] === undefined ) {
    //reconnectAddress[options.path] = true;
    setTimeout(function() {
      preview('reconnect attempt');
      s.self.emit('reconnect attempt', true);
      newServiceConnect(service, pattern, query, self);
    }, 3000); 
  //}
}



// send prototype.
newServiceBind.prototype.send = function send(m) {
  _send('bind', this.service, this.pattern, this.i, m);
};

newServiceConnect.prototype.send = function send(m) {
  _send('connect', this.service, this.pattern, this.i, m);
};


// _send.
function _send(socktype, service, pattern, i, m) {
  preview(service, '_send, socketType: ' + socktype +  ' pattern: ' + pattern + ' m: ' + m + ' i: ' + i);
  var socks = [];
  for ( var s in sockets ) {
    if ( sockets[s].service === service ) {
      socks.push(sockets[s]);
    } 
  }
  preview('send', 'socks.length: ' + socks.length);
  if ( socks.length > 0 ) {
    if ( pattern === 'push' ) {
      roundrobin(i, socks, m);
    } else if ( pattern === 'pub' || pattern === 'chit' || pattern === 'chat' ) {
      broadcast(socks, m);
    }
  } else {
    if ( pattern === 'push' ) {
      enqueue(i, pattern, m);   // only push, pull sockets queue undeliverable messages.
    }
  }
}



function checkService(service) {
  for ( var i in services ) {
    if ( services[i].name === service ) {
      return Number(i);
    } 
  }
  return false;
}



function pack(args) {
  var msg = new Message(args);
  return msg.toBuffer();
}



// socket.write in roundrobin.
function roundrobin(i, socks, m) {
  preview('roundrobin', 'write to sockets');
  
  var len = socks.length;
  var sock = socks[services[i].n++ % len];  

  if ( settings.protocol === 'ldjson' ) {
    // ldjson.
    var message = JSON.stringify(m) + CRLF;
  } else {
    // amp.
    var message = new Message();
    message.push(m);
    message = message.toBuffer();
  }
  preview('roundrobin', 'paked message', message);
  
  sock.res.write( message );
}



// socket.wite in broadcast.
function broadcast(socks, m) {

  if ( settings.protocol === 'ldjson' ) {
    // ldjson.
    var message = JSON.stringify(m) + CRLF;
  } else {
    // amp.
    var message = new Message();
    message.push(m);
    message = message.toBuffer();
  }
  
  preview('broadcast', 'paked message', message);
  
  for ( var sock in socks ) {
    socks[sock].res.write( message );
  }
  
}



function enqueue(i, pattern, m) {
  preview('enqueue', 'queue: ' + services[i].name + ', queued: ' + services[i].queue.length);
  services[i].self.emit('queued', m);   // message event so can save if want before droping.
  if (services[i].queue.length >= settings.hwm) return drop(m);
  services[i].queue.push(m);
}



function drop(m) {
  preview('drop', m);
  // emit 'drop' m.   // TODO: emit drop event.
}



function addService(service) {
  var i = services.push(service) - 1;
  preview('addService, i: ' + i + ', name: ' + service.name);
  return i;
  //preview('services', services);
}



function addSocket(socket) {
  var i = sockets.push(socket) - 1;
  preview('addSocket: ' + i);
  return i;
  //preview('sockets', sockets);
}



function removeSocket(socket) {
  var i = sockets.indexOf(socket);
  if (!~i) return;

  preview('removeSocket: ' + i);
  sockets.splice(i, 1);   // delete this socket.
  preview('removeSocket sockets.length: ' + sockets.length);
}



function ipAddress(request) { 
  return (request.headers['x-forwarded-for'] || '').split(',')[0] 
    || request.connection.remoteAddress 
    || request.socket.remoteAddress;
}

