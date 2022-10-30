const URL = require('url');
const https = require('https');
const Streat = require('../');

const streat = new Streat();
streat.start();

let counter = 0;
test();

function test() {
	counter++;
	if (counter > 100) process.exit();
	console.info("request");
	const opts = URL.parse("https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4");
	https.request(opts, async res => {
		console.info("status", res.statusCode);
		res.pause();
		const tags = await streat.run(res, 100000);
		console.info("finished", tags);
		streat.stop();
	}).end();
}
