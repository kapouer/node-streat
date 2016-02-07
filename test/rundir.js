var fs = require('fs');
var Path = require('path');
var Streat = require('../');

var streat = new Streat();
streat.start();

var dir = process.argv.pop();

var glob = require('glob');

glob(Path.join(dir, '*.avi'), {}, function (err, files) {
	Promise.all(files.map(function(file) {
		return new Promise(function(resolve, reject) {
			console.log(file);
			streat.run(fs.createReadStream(file, {
				encoding: 'binary'
			}), function(err, tags) {
				if (err) console.error(err);
				console.log("got", Object.keys(tags).length, "tags");
				if (tags.Error) console.error("exiftool returns Error", tags.Error);
			});
		});
	})).catch(function(err) {
		console.error("interrupted because of", err);
	}).then(function() {
		streat.stop();
		console.log("done");
	});
})

