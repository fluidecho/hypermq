
var hypermq = require('..')
  , program = require('commander');

program
  .option('-T, --type <name>', 'socket type [pub]', 'pub')
  .option('-t, --per-tick <n>', 'messages per tick [1000]', parseInt)
  .option('-s, --size <n>', 'message size in bytes [1024]', parseInt)
  .option('-d, --duration <n>', 'duration of test [5000]', parseInt)
  .parse(process.argv)



var options = {
	hostname: '127.0.0.1',
	port: 3443,
	secure: false,
	key: __dirname + '/keys/test-key.pem',
	cert: __dirname + '/keys/test-cert.pem',
	apikey: 'za91j2bk72f483ap62x',
	protocol: 'amp'	
};
var service = hypermq.bind(options);

var myService = new service('myService', 'pub');
console.log('pub bound');

myService.on('closed', function(msg){
	process.exit();
});

var perTick = program.perTick || 1000;
var buf = new Buffer(Array(program.size || 1024).join('a'));
console.log('sending %d per tick', perTick);
console.log('sending %d byte messages', buf.length);

function more() {
  for (var i = 0; i < perTick; ++i) myService.send(buf);
  setImmediate(more);
}

more();


