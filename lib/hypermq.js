"use strict";
//
// hypermq: Message-oriented HTTP service inspired by axon and zeromq.
//
// Version: 0.0.1
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
var preview = require('preview')('hypermq');
var fs = require('fs');        // for reading https key and cert.
var url = require('url');
var querystring = require('querystring');
// http or https require-d inside functions.


// public api:
exports.bind = bind;
exports.connect = connect;
//exports.newServiceBind = newServiceBind;		// creates a new service.
//exports.newServiceConnect = newServiceConnect;		// creates a new service.


var sockets = [];			// connections made to bind.
var services = [];		// as set be send().

var patterns = [
	'pull',
	'push',
	'pub',
	'sub',
	'chit',
	'chat'
];

// pass settings via 'options' in peer 'bind' and 'connect' functions.
var settings = { 
	hwm: Infinity,						// number of messages.
	server_name: 'hypermq',
	throw_error: true,				// if catch un-ignore(d) error, throw.
	retry: Infinity						// number of times to try reconnecting.
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
  
  if ( options.server ) {
  	settings.server_name = options.server;
  }

  if ( options.hwm ) {
  	settings.hwm = options.hwm;
  }
  
 	if ( options.secure ) {
  	settings.http = require('https');
  } else {
  	settings.http = require('http');
  }    
  
  // can generate own keys using OpenSSL, see: http://nodejs.org/api/tls.html
 	if ( options.secure ) {
    var server = settings.http.createServer({ key: fs.readFileSync(options.key), cert: fs.readFileSync(options.cert) }, onconnect);
  } else {
    var server = settings.http.createServer(onconnect);
  }
  
  server.on('connection', function(){
		preview('server', 'on connection called');
  });  
  
  server.on('data', function(chunk){
		preview('bind', 'chunk', chunk);
  });    
  
  preview('bind: ' + options.hostname + ':' + options.port);
  server.listen(options.port, options.hostname);

  return newServiceBind;
}



function connect(options) {
	var self = this;
	preview('connect called');
	preview('connect options', options);
  
 	if ( options.secure ) {
  	settings.http = require('https');
  } else {
  	settings.http = require('http');
  }  
  
  if ( options.hwm ) {
  	settings.hwm = options.hwm;
  }
  
  settings.hostname = options.hostname;
  settings.port = options.port;
  
  if ( options.rejectUnauthorized != undefined ) {
  	settings.rejectUnauthorized = options.rejectUnauthorized;
  }

  preview('connect: ' + options.hostname + ':' + options.port);

  return newServiceConnect;
}



function newServiceBind(service, pattern) {
  this.service = service;
  this.pattern = pattern;
	var i = checkService(service);
  if ( i === false ) {
		var i = addService({ name: service, pattern: pattern, queue: [], n: 0, self: this });  		// add new service
  }
  this.i = i;
}
util.inherits(newServiceBind, events.EventEmitter);	 


function newServiceConnect(service, pattern) {
  this.service = service;
  this.pattern = pattern;
	var i = checkService(service);
  if ( i === false ) {
		var i = addService({ name: service, pattern: pattern, queue: [], n: 0, self: this });  		// add new service
  }
  this.i = i;
  
	// make http request.

	var options = {};		// set options for http request.
	
  options.path = '/' + service + '/' + pattern + '/';
  options.method = 'POST';
  options.hostname = settings.hostname;
  options.port = settings.port;  
  
  if ( settings.rejectUnauthorized != undefined ) {
  	options.rejectUnauthorized = settings.rejectUnauthorized;
  }  
  
  preview('newServiceConnect', 'connect attempt address: ' + options.hostname + ':' + options.port + options.path);

  // sock is req
  var sock = settings.http.request(options, function(res) {
		
  	preview('connect', 'request, STATUS', res.statusCode);
  	//preview('connect', 'request, HEADERS', res.headers);
  	
  	if ( res.statusCode != 200  && tryed < settings.retry ) {
			//preview('connect', 'status code not 200, try reconnect');
			reconnect(options, self);
  	}

		// TODO: have tryed for each connection.
  	tryed = 0;		// reset.

		// add the bind to sockets.
		//var bind_pattern = '';
		//if ( pattern === 'pull' ) {
		//	bind_pattern = 'pull';
		//}
		
		var socket = { service: service, pattern: pattern, host: options.hostname, res: sock, req: res };
		var i = addSocket(socket);	

		//var parser = new Parser;
		//res.pipe(parser);
		//parser.on('data', onmessage(sock));

		//res.on('data', function(chunk) {
		//	preview('connect', 'chunk', chunk);
		//	preview('connect', 'chunk.toString(): ' + chunk.toString());
		//});

 		var parser = new Parser;

  	parser.on('data', function(chunk){
			//preview('connect', 'chunk', chunk);
			//preview('connect', 'chunk.toString(): ' + chunk.toString());
			
  		//var message = amp.decode(chunk);		// returns array of buffers.
  		//preview('message', 'buffer', message[0]);
			//preview('message', 'toString', message[0].toString());	
			//self.emit('message', message[0]);
			
    	var message = new Message(chunk);
    	//preview('connect', 'message.args', message.args);
    	
    	//self.emit('message', message.args);
    	
    	services[i].self.emit('message', message.args);
    	
    	//self.emit.apply(self, ['message'].concat(msg.args));
			
  	});

  	res.pipe(parser);

	});
	
	sock.on('error', function(e) {
		console.log('problem with request: ' + e.message);
	});	
	
	// must do either .write() OR .end() to get bi-directional com working.
	var message = new Message();
	message.push('_0_');		// _0_ is a code picked up by the bind peer to start coms.
	sock.write(message.toBuffer());
	//sock.end();
  
}
util.inherits(newServiceConnect, events.EventEmitter);	 



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
		if ( pattern === 'push' || pattern === 'pull' ) {
			roundrobin(i, socks, m);
		} else if ( pattern === 'sub' || pattern === 'pub' || pattern === 'chit' || pattern === 'chat' ) {
			broadcast(socks, m);
		}
	} else {
		enqueue(i, pattern, m);
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



function roundrobin(i, socks, m) {
	preview('roundrobin', 'write to sockets');
	
	var len = socks.length;
  var sock = socks[services[i].n++ % len];	

	if ( Buffer.isBuffer(m) ) {
		var mb = m;
	} else {
		var mb = new Buffer(m);
	}
	//sock.res.write( amp.encode([new Buffer(mb)]) );
	
	var message = new Message();
	message.push(m);
	preview('roundrobin', 'paked message', message);
	
	sock.res.write( message.toBuffer() );
}



function broadcast(socks, m) {
	preview('broadcast', 'write to all sockets');

	var message = new Message();
	message.push(m);
	preview('roundrobin', 'paked message', message);
	
	for ( var sock in socks ) {
		socks[sock].res.write( message.toBuffer() );
	}
}




function enqueue(i, pattern, m) {
	preview('enqueue', 'queue: ' + services[i].name + ', queued: ' + services[i].queue.length);
  if (services[i].queue.length >= settings.hwm) return drop(m);	
	services[i].queue.push(m);
}



function drop(m) {
	preview('drop');
	// emit 'drop' m.
}



function onconnect(req, res) {

	preview('onconnect');

  // if client request favicon return.
  if (req.url === '/favicon.ico') {
    res.writeHead(200, {'Content-Type': 'image/x-icon'});
    res.end();
    return;
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
    		service = ps[p];
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
	res.writeHead(200, {'Server': settings.server_name, 'Content-Type': 'application/json; charset=utf-8'});		// must be sent before flushing queues.

  // emit 'connect'

  var socket = { service: service, pattern: pattern, host: client_host, res: res, req: req };
	var i = addSocket(socket);

	req.on('close', function(){
		preview('req on close for socket i: ' + i);
    removeSocket(socket);
		// retry connection, if connect socket.
		// emit 'disconnect'
  });


	var s = checkService(service);
	
	// recieving messages from connection peer.
	var parser = new Parser;
  parser.on('data', function(chunk){
    var message = new Message(chunk);
    //preview('connect', 'message.args', message.args);
    if ( message.args != '_0_' ) {		// _0_ is the start code sent by connect peer.
    	services[s].self.emit('message', message.args);
    }
  });
	req.pipe(parser);	

 	//req.on('data', function (chunk) {
		//preview('onconnect', 'req.on.data, body chunk: ' +  chunk.toString());
	//});	
	

	// flush queues.
	try {		// may not yet be created.
		preview('onconnect', 'checkService: ' + service + ' s: ' + s + ' q.l: ' + services[s].queue.length);
		if ( services[s].queue.length > 0 ) {
		  var prev = services[s].queue;
		  var len = prev.length;
		  services[s].queue = [];
		  preview('flush queued: ' + len + ' messages for service: ' + services[s].name);
		  for (var z = 0; z < len; ++z) {
		    _send('connect', services[s].name, services[s].pattern, s, prev[z]);
		  }
		  // emit 'flush'
		}
	} catch(e) {
	}

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
  sockets.splice(i, 1);		// delete this socket.
  preview('removeSocket sockets.length: ' + sockets.length);
}



var tryed = 0;		// how many connection attemps made.
function connect2(options, _self) {
  tryed++;				// +1 connection attemps made.
  delete reconnectAddress[options.path];
  
	if ( _self === undefined ) {
		// set emitter object to return to peer for on.message events.
		var self = this;
		var Emitter = function() {
			self = this;
		};
		util.inherits(Emitter, events.EventEmitter);	 
	} else {
		var self = _self;
	}
  
 	if ( options.secure ) {
  	var http = require('https');
  } else {
  	var http = require('http');
  }  
  
  options.path = '/' + options.service + '/' + options.pattern + '/';
  options.mathod = 'GET';
  
  preview('connect', 'connect attempt address: ' + options.hostname + ':' + options.port + options.path);
  
  // sock is req
  var sock = http.request(options, function(res) {

  	preview('connect', 'request, STATUS', res.statusCode);
  	//preview('connect', 'request, HEADERS', res.headers);
  	
  	if ( res.statusCode != 200  && tryed < settings.retry ) {
			//preview('connect', 'status code not 200, try reconnect');
			reconnect(options, self);
  	}

		// TODO: have tryed for each connection.
  	tryed = 0;		// reset.

		//var parser = new Parser;
		//res.pipe(parser);
		//parser.on('data', onmessage(sock));

		//res.on('data', function(chunk) {
		//	preview('connect', 'chunk', chunk);
		//	preview('connect', 'chunk.toString(): ' + chunk.toString());
		//});

 		var parser = new Parser;

  	parser.on('data', function(chunk){
			//preview('connect', 'chunk', chunk);
			//preview('connect', 'chunk.toString(): ' + chunk.toString());
			
  		//var message = amp.decode(chunk);		// returns array of buffers.
  		//preview('message', 'buffer', message[0]);
			//preview('message', 'toString', message[0].toString());	
			//self.emit('message', message[0]);
			
    	var message = new Message(chunk);
    	//preview('connect', 'message.args', message.args);
    	
    	self.emit('message', message.args);
    	//self.emit.apply(self, ['message'].concat(msg.args));
			
  	});

  	res.pipe(parser);


	});

	sock.on('error', function(e) {
		preview('connect', 'sock.on.error, connection error!, e.message:' + e.message + ' ignore: ' + ignore[e.code]);
		if ( ignore[e.code] && tryed < settings.retry  ) {
			preview('connect', 'can\'t connect to peer, try again!');
			reconnect(options, self);
		//} else if ( ignore[e.code] ) { 
			// error ignored.
		} else {
			if ( settings.throw_error ) {
				console.trace(e);
				throw e;
			} else {
				console.error(e);
			}
		}
	});
	
	
	sock.on('close', function(e) {
		preview('connect', 'connection closed!');
		if ( tryed < settings.retry ) {
			//preview('connect', 'sock.on.close, can\'t connect to peer, try again!');
			reconnect(options, self);
		}
	});	
	
	
 	
	sock.end();		// must	
	
	if ( _self === undefined ) {	
		preview('connect', 'return new Emitter');
		return new Emitter;
		
		//var here = this;
		//here.send = send;
		//here.Emitter = new Emitter;
		//return here;
	}	
		
}



var reconnectAddress = {};
function reconnect(options, self) {
	if ( reconnectAddress[options.path] === undefined ) {
		reconnectAddress[options.path] = true;
		setTimeout(function() {
			preview('reconnect attempt');
			connect(options, self);
		}, 3000);	
	}
}



function news(service, pattern) {

	var self = this;
	var Emitter = function() {
		self = this;
	};
	
	util.inherits(Emitter, events.EventEmitter);	 

  
  
	setInterval(function(){
		self.emit('message', 'meow');
	}, 2000);
  
  return new Emitter;
}



function ipAddress(request) { 
  return (request.headers['x-forwarded-for'] || '').split(',')[0] 
    || request.connection.remoteAddress 
    || request.socket.remoteAddress;
}

