var express = require('express');
var app = express();

app.use('/', express.static('./'));
var server = app.listen(process.env.PORT || 1337, function(){

   var host = server.address().address;
   var port = server.address().port;

   console.log('Vevo Lean Back app listening at http://' + host + ':' + port);
 }
);
