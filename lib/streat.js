var ChildProcess = require('child_process');
var JStream = require('jstream');
var fs = require('fs');
var tempfile = require('tempfile');
var debug = require('debug')('streat');

module.exports = Streat;

function Streat(opts) {
	this.step = (opts || {}).step || 32768;
	this.running = false;
	this.filepath = tempfile();
	this.service = null;
	this.queue = [];
}

Streat.prototype.run = function(res, limit, cb) {
	if (!cb && typeof limit == "function") {
		cb = limit;
		limit = 0;
	}
	this.queue.push({
		res: res,
		limit: limit,
		cb: cb
	});
	if (this.queue.length == 1) setImmediate(this.next.bind(this));
};

Streat.prototype.start = function() {
	if (this.running) return;

	debug('spawn exiftool');
	this.running = true;

	this.service = ChildProcess.spawn('exiftool', [
		'-stay_open', 'True', '-@', '-'
	]);

	this.service.on('exit', function(code, signal) {
		this.running = false;
		debug('exiftool exits with code', code, 'and signal', signal);
	}.bind(this));

	this.service.stderr.on('data', function(data) {
		if (data && data.length) console.error("error", data.toString());
	});

	this.service.stdout.pipe(new JStream()).on('data', function(tags) {
		debug("exiftool got", tags);
		this.done(null, tags); // err should be collected above
		this.next();
	}.bind(this)).on('error', function(err) {
		debug("exiftool unparseable reply", err);
		this.done(err);
		this.next();
	});
};

Streat.prototype.send = function(cmds) {
	debug("sending command to exiftool");
	this.service.stdin.cork();
	this.service.stdin.write('-q\n' + cmds.join('\n') + '\n-execute\n');
	this.service.stdin.uncork();
};

Streat.prototype.stop = function() {
	this.send(['-stay_open','False']);
	this.service.kill();
	this.running = false;
	this.service = null;
};

Streat.prototype.done = function(err, tags) {
	var runner = this.queue[0];
	if (!runner) return console.error("missing runner");
	if (!tags) {
		if (!err) err = new Error("exiftool returned no tags");
	}
	debug("done with", err, "and step", runner.step);
	if (!err && runner.step) {
		debug("will reprocess", tags.Warning, tags.Error);
		if (tags.Warning || tags.Error) {
			// try again with more data, so just leave the runner in place
			return;
		}
	}
	this.queue.shift();
	runner.cb(err, tags);
};

Streat.prototype.next = function() {
	if (!this.queue.length) {
		debug("empty queue");
		return;
	}
	debug("processing next file");

	var runner = this.queue[0];
	var res = runner.res;

	var limit = runner.limit || 0;
	var length = runner.step || 0;
	var step = this.step;

	if (!runner.started) {
		runner.started = true;
		res.on('data', function(chunk) {
			length += chunk.length;
			if (limit && length >= limit) {
				debug("reached limit", length, ">=", limit);
				delete runner.step;
				res.pause();
				res.unpipe(runner.stream);
			} else if (length >= (runner.step || 0) + step) {
				runner.step = length;
				debug("iteration", runner.step);
				res.pause();
				res.unpipe(runner.stream);
			}
		});
	}

	initStreamRunner(this, runner).then(function() {
		res.pipe(runner.stream);
	});
};

function initStreamRunner(self, runner) {
	return new Promise(function(resolve, reject) {
//		if (runner.fd) return resolve(runner.fd);
		fs.open(self.filepath, 'a', function(err, fd) {
			if (err) return reject(err);
			resolve(fd);
		});
	}).then(function(fd) {
		runner.fd = fd;
		var filestream = fs.createWriteStream(null, {
			autoClose: true,
			fd: fd,
			defaultEncoding: 'binary'
		});
		filestream.on('drain', function() {
			debug("drain filestream");
		});
		filestream.on('unpipe', function() {
			debug("unpipe filestream");
			setTimeout(function() {
				filestream.end();
			}, 200);
		});
		filestream.on('finish', function() {
			debug("finish filestream");
			delete runner.stream;
			self.send(['-b', '-j', '-fast', self.filepath]);
		});
		runner.stream = filestream;
	});
}
