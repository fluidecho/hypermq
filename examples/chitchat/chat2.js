var preview = require('preview')('client');
var hypermq = require('./../../');

var options = { 
  hostname: '127.0.0.1', 
  port: 3443, 
  secure: false, 
  rejectUnauthorized: false,
  apikey: 'za91j2bk72f483ap62x' 
};
var service = hypermq.connect(options);

var myService = new service('myService', 'chat');

myService.on('message', function(msg){
  preview('myService', 'message', msg);
});

var z = 0;
setInterval(function(){
  myService.send({bar: 'lah2', z: z++});
}, 3000);
