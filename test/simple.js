var URL = require('url');
var http = require('http');
var Streat = require('../');

var streat = new Streat();
streat.start();

var counter = 0;
test();

function test() {
	counter++;
	if (counter > 100) process.exit();
	console.log("request");
	var opts = URL.parse("http://www.quirksmode.org/html5/videos/big_buck_bunny.mp4");
	http.request(opts, function(res) {
		console.log("status", res.statusCode);
		res.pause();
		streat.run(res, 100000, function(err, tags) {
			if (err) console.error(err);
			console.log("finished", tags);
			streat.stop();
		});
	}).end();
}
