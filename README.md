Streat
======

Stream to ExifTool

Exposes a `Street` class that spawns and keeps ExifTool open,
using the -stay_open option. Respawns it on failure.

It is much faster than spawning exiftool on each request.

It features an option to limit the amount of data read from the readable
stream passed as argument.

It also features the ability to try parsing a readable stream by chunks,
and return the tags as soon as ExifTool had enough data.

This is very useful for quick inspection of remote resources,
and acts as exiftool "-fast" option - but for all formats, and with more cpu load.


Usage
-----

```
var streat = require('streat');

// init code
var streat = new Street({
	step: 32768 // the default step for trying decoding by chunks
});

// start exiftool
streat.start();

// runtime code
streat.run(readableStream, maxBytesToRead, function(err, tags) {

});
// multiple times... calls are queued

// close exiftool
streat.stop()
```

It is also possible to spawn several instances of exiftool,
and maintain them using a pool.


License
-------

See LICENSE file.


See also
--------

[ExifTool by Phil Harvey - Read, Write and Edit Meta Information!](http://owl.phy.queensu.ca/~phil/exiftool/)

