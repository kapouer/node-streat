// node test/rundir.js "path/to/files/*.*"

const fs = require('fs');
const Streat = require('../');

const streat = new Streat();
streat.start();

const pattern = process.argv.pop();

const glob = require('glob');

glob(pattern, {}, (err, files) => {
	Promise.all(files.map(file => {
		console.info(file);
		return new Promise(resolve => {
			streat.run(fs.createReadStream(file, {
				encoding: 'binary'
			}), (err, tags) => {
				if (err) console.error(err);
				console.info("got", Object.keys(tags).length, "tags");
				if (tags.Error) console.error("exiftool returns Error", tags.Error);
				resolve();
			});
		});
	})).catch((err) => {
		console.error("interrupted because of", err);
	}).then(() => {
		streat.stop();
		console.info("done");
	});
});

