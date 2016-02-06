Stream to Exiftool
==================

Exposes a `StreamET` class that spawns and keeps ExifTool open,
using the -stay_open option.

Using an instance of this class, one can pass a readable stream,
and expect to get the tags back as soon as ExifTool had enough data.

This is very useful for quick inspection of remote resources.


Usage
-----

```
// init code
var set = new StreamET();
set.start();

// runtime code
set.run(readableStream, maxBytesToRead, function(err, tags) {

});
// multiple times... calls are queued

// destroy code
set.stop()
```


License
-------

See LICENSE file.

