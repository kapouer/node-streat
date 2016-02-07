// node test/rundir.js "/home/dev/Musique/Ampps/*.*"

var fs = require('fs');
var Streat = require('../');

var streat = new Streat();
streat.start();

var pattern = process.argv.pop();

var glob = require('glob');

glob(pattern, {}, function (err, files) {
	Promise.all(files.map(function(file) {
		console.log(file);
		return new Promise(function(resolve, reject) {
			streat.run(fs.createReadStream(file, {
				encoding: 'binary'
			}), function(err, tags) {
				if (err) console.error(err);
				console.log("got", Object.keys(tags).length, "tags");
				if (tags.Error) console.error("exiftool returns Error", tags.Error);
				resolve();
			});
		});
	})).catch(function(err) {
		console.error("interrupted because of", err);
	}).then(function() {
		streat.stop();
		console.log("done");
	});
})

