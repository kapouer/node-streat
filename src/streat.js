import { spawn } from 'child_process';
import exitHook from 'exit-hook';
import Throttle from 'throttleit';
import { Deferred } from 'class-deferred';
import JStream from 'jstream';
import { createWriteStream } from 'fs';
import tempfile from 'tempfile';
import Debug from 'debug';

const debug = Debug('streat');


JStream.MAX_BUFFER_LENGTH = 1024 * 1024;

export default class Streat {
	constructor(opts) {
		this.step = (opts || {}).step || 32768;
		this.running = false;
		this.filepath = tempfile();
		this.service = null;
		this.queue = [];
	}
	run(res, params) {
		const defer = new Deferred();
		if (params == null || typeof params != "object") {
			params = { limit: params };
		}
		this.queue.push({
			res: res,
			limit: params.limit || 0,
			step: params.step || this.step,
			defer,
			begin: 0,
			size: 0
		});
		if (this.queue.length == 1) setImmediate(() => this.next());
		return defer;
	}

	start() {
		if (this.running) return;
		debug('spawn exiftool');
		this.running = true;

		this.removeExitHook = exitHook(() => this.stop());

		this.service = spawn('exiftool', [
			'-stay_open', 'True', '-@', '-'
		]);

		this.service.on('exit', (code, signal) => {
			if (this.running) {
				// abnormal exit
				console.error('exiftool exits with code', code, 'and signal', signal);
				Throttle(this.start.bind(this), 1000);
			}
			this.running = false;
			this.service = null;
		});

		this.service.stderr.on('data', data => {
			if (data && data.length) console.error("error", data.toString());
		});

		this.service.stdout.pipe(new JStream()).on('data', tags => {
			debug("exiftool got", tags);
			this.done(null, tags); // err should be collected above
			this.next();
		}).on('error', (err) => {
			debug("exiftool unparseable reply", err);
			this.done(err);
			this.next();
		});
	}

	send(cmds) {
		debug("sending command to exiftool");
		this.service.stdin.cork();
		this.service.stdin.write('-q\n' + cmds.join('\n') + '\n-execute\n');
		this.service.stdin.uncork();
	}

	stop() {
		this.running = false;
		if (this.removeExitHook) {
			this.removeExitHook();
			this.removeExitHook = null;
		}
		if (!this.service) return;
		this.service.stdout.unpipe();
		this.service.stderr.unpipe();
		this.service.stdout.removeAllListeners();
		this.service.stderr.removeAllListeners();
		this.service.removeAllListeners();
		try {
			this.service.kill('SIGTERM');
		} catch (ex) {
			console.error(ex);
		}
		this.service = null;
	}

	done(err, tags) {
		const runner = this.queue[0];
		if (!runner) return console.error("missing runner");
		if (!tags) {
			if (!err) err = new Error("exiftool returned no tags");
		}
		debug("done with", err, "and size", runner.size);
		if (!err && runner.started) {
			if (tags.Warning) {
				debug("ignoring warning", tags.Warning);
			}
			if (tags.Error) { // ignore tags.Warning
				// try again with more data, so just leave the runner in place
				debug("will reprocess", tags.Error);
				return;
			}
		}
		this.queue.shift();
		if (err) runner.defer.reject(err);
		else runner.defer.resolve(tags);
	}

	next() {
		if (!this.queue.length) {
			debug("empty queue");
			return;
		}
		debug("processing next file");

		const runner = this.queue[0];
		const res = runner.res;

		const limit = runner.limit;
		const step = runner.step;
		runner.begin = runner.size;

		initStreamRunner(this, runner);
		runner.stream.on('error', function (err) {
			destroyStreamRunner(runner);
			this.done(err);
		});
		res.pipe(runner.stream);

		if (runner.started) {
			return;
		}
		runner.started = true;
		res.on('data', (chunk) => {
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
		res.on('end', () => {
			runner.started = false;
		});
		res.on('aborted', () => {
			destroyStreamRunner(runner);
		});
	}
}

function initStreamRunner(self, runner) {
	const filestream = createWriteStream(self.filepath, {
		autoClose: true,
		flags: runner.started ? 'a' : 'w',
		defaultEncoding: 'binary'
	});
	filestream.on('unpipe', () => {
		debug("unpipe filestream");
		setImmediate(() => {
			// cannot be called right now for some reason
			filestream.end();
		});
	});
	filestream.on('finish', () => {
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
