var ChildProcess = require('child_process');
var Throttle = require('throttleit');
var JStream = require('jstream');
var fs = require('fs');
var tempfile = require('tempfile');
var debug = require('debug')('streat');

JStream.MAX_BUFFER_LENGTH = 1024 * 1024;

module.exports = Streat;

function Streat(opts) {
	this.step = (opts || {}).step || 32768;
	this.running = false;
	this.filepath = tempfile();
	this.service = null;
	this.queue = [];
	this.stop = this.stop.bind(this);
}

Streat.prototype.run = function(res, limit, cb) {
	if (!cb && typeof limit == "function") {
		cb = limit;
		limit = 0;
	}
	this.queue.push({
		res: res,
		limit: limit,
		cb: cb,
		begin: 0,
		size: 0
	});
	if (this.queue.length == 1) setImmediate(this.next.bind(this));
};

Streat.prototype.start = function() {
	if (this.running) return;
	debug('spawn exiftool');
	this.running = true;

	process.on('exit', this.stop);

	this.service = ChildProcess.spawn('exiftool', [
		'-stay_open', 'True', '-@', '-'
	]);

	this.service.on('exit', function(code, signal) {
		if (this.running) {
			// abnormal exit
			console.error('exiftool exits with code', code, 'and signal', signal);
			Throttle(this.start.bind(this), 1000);
		}
		this.running = false;
		this.service = null;
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
	}.bind(this));
};

Streat.prototype.send = function(cmds) {
	debug("sending command to exiftool");
	this.service.stdin.cork();
	this.service.stdin.write('-q\n' + cmds.join('\n') + '\n-execute\n');
	this.service.stdin.uncork();
};

Streat.prototype.stop = function() {
	this.running = false;
	if (!this.service) return;
	process.removeListener('exit', this.stop);
	this.service.stdout.unpipe();
	this.service.stderr.unpipe();
	this.service.stdout.removeAllListeners();
	this.service.stderr.removeAllListeners();
	this.service.removeAllListeners();
	try {
		this.service.kill('SIGKILL');
	} catch(ex) {
		console.error(ex);
	}
	this.service = null;
};

Streat.prototype.done = function(err, tags) {
	var runner = this.queue[0];
	if (!runner) return console.error("missing runner");
	if (!tags) {
		if (!err) err = new Error("exiftool returned no tags");
	}
	debug("done with", err, "and size", runner.size);
	if (!err && runner.started) {
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
	var step = this.step;
	runner.begin = runner.size;

	initStreamRunner(this, runner);
	runner.stream.on('error', function(err) {
		destroyStreamRunner(runner);
		this.done(err);
	});
	res.pipe(runner.stream);

	if (runner.started) return;
	runner.started = true;
	res.on('data', function(chunk) {
		runner.size += chunk.length;
		if (limit && runner.size >= limit) {
			debug("reached limit", runner.size, ">=", limit);
			destroyStreamRunner(runner);
		} else if (runner.size >= runner.begin + step) {
			debug("iteration", runner.size);
			res.pause();
			res.unpipe(runner.stream);
		}
	});
	res.on('end', function() {
		runner.started = false;
	});
};

function initStreamRunner(self, runner) {
	var filestream = fs.createWriteStream(self.filepath, {
		autoClose: true,
		flags: runner.started ? 'a' : 'w',
		defaultEncoding: 'binary'
	});
	filestream.on('unpipe', function() {
		debug("unpipe filestream");
		setImmediate(function() {
			// cannot be called right now for some reason
			filestream.end();
		});
	});
	filestream.on('finish', function() {
		debug("finish filestream", runner.size, runner.begin);
		delete runner.stream;
		self.send(['-b', '-j', '-fast', self.filepath]);
	});
	runner.stream = filestream;
}

function destroyStreamRunner(runner) {
	runner.started = false;
	if (runner.res) {
		runner.res.pause();
		if (runner.stream) {
			runner.res.unpipe(runner.stream);
			delete runner.stream;
		}
		delete runner.res;
	}
}
