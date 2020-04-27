var fs        = require('fs');
var http      = require('http');
var path      = require('path');
var WebSocket = require('ws');
var express   = require('express');
var pty       = require('node-pty');
var hbs       = require('hbs');
var dotenv    = require('dotenv');
var Tokens    = require('csrf');
var url       = require('url');
var uuidv4    = require('uuid/v4');
var os        = require('os');
var termSchemes   = require('term-schemes');
var port      = 3000;

// Read in environment variables
dotenv.config({path: '.env.local'});
if (process.env.NODE_ENV === 'production') {
  dotenv.config({path: '/etc/ood/config/apps/shell/env'});
}

// Keep app backwards compatible
if (fs.existsSync('.env')) {
  console.warn('[DEPRECATION] The file \'.env\' is being deprecated. Please move this file to \'/etc/ood/config/apps/shell/env\'.');
  dotenv.config({path: '.env'});
}

//Start Terminal Color Scheme Implementation
//declared constants for directory paths
const xdg_config_dir = (process.env["XDG_CONFIG_HOME"] || path.join(os.homedir(), ".config"));
const ood_app_config_root = (process.env["OOD_APP_CONFIG_ROOT"] || '/etc/ood/config/ondemand/apps/shell');
const userDir = path.join(xdg_config_dir, "ondemand", "apps", "shell", "themes");
const systemDir = path.join(ood_app_config_root, "themes");

//declared global variables for color schemes
var schemeObjects;

checkDirSync(userDir);
checkDirSync(systemDir);

if (process.env["SYSTEM_SCHEMES"] === true) {
    var user = getSchemeObjects(userDir);
    var system = getSchemeObjects(systemDir);

   schemeObjects = {...getSchemeObjects(userDir), ...getSchemeObjects(systemDir)};

} else {
   schemeObjects = {...getSchemeObjects(userDir)};
}

// helper functions
function checkDirSync(dir) {  
  try {
    fs.statSync(dir);
  } catch(e) {
    if (dir === systemDir) {
      process.env["SYSTEM_SCHEMES"] = false;
    } else if (dir === userDir) {
      fs.mkdirSync(dir);
    }
  }
}

function getSchemeObjects(dir) {
  var schemes = {};

  fs.readdirSync(dir).forEach(function(file) {
    fileInfo = path.parse(file);
    schemes[fileInfo.name] = {name: fileInfo.name, file: fileInfo.base, ext: fileInfo.ext, dir: dir}
  });
  return schemes;
}

function getSchemeFilesArray() {

    return Object.keys(schemeObjects).map(i => schemeObjects[i])
}


function getSchemeFileObject(base) {
    var userDir = path.join(xdg_config_dir, "apps", "shell", "themes");
    fs.readdirSync(userDir).forEach(file => {
        if (file === base) {
            return path.parse(file);
        }

    })
}

function rgbToHexMath (num) { 
  var hex = Number(num).toString(16);
  if (hex.length < 2) {
       hex = "0" + hex;
  }
  return hex;
};

function hexConverter (array) {
    var red = array[0];
    var green = array[1];
    var blue = array[2];

    return `#${rgbToHexMath(red)}${rgbToHexMath(green)}${rgbToHexMath(blue)}`.toUpperCase();
}

function findHost(uuid) {
    sessions = terminals.instances;
    var host = sessions[uuid].host;

    return host;
}

function parseFile(fileObject) {
    
    const ext = fileObject.ext;
    const file = fileObject.dir + "/" + fileObject.file;
    const raw = String(fs.readFileSync(file));
      
    switch(ext) {
        case ".itermcolors":
            return termSchemes.iterm2(raw);
        break;

        case ".colorscheme":
            return termSchemes.konsole(raw);
        break;

        case ".colors":
            return termSchemes.remmina(raw);
        break;

        case ".terminal":
            return termSchemes.terminal(raw);      
        break;

        case ".config":
            return termSchemes.terminator(raw);
        break;

        case ".config_0":
            return termSchemes.tilda(raw);
        break;

        case ".theme":
            return termSchemes.xfce(raw);
        break;

        case ".txt":
            return termSchemes.termite(raw);
        break;

        case ".xrdb" || ".Xresources":
            return termSchemes.xresources(raw);
        break;

        default:
            schemeError = {error: "unknown file type."}
            return schemeError;
        break; 

    }
}

function convertSchemeObject(obj) {
    newSchemeObj = {};
    colorArray = [];
    for (var key of Object.keys(obj)) {
       if(isNaN(key) === false) {
           
           colorArray.push(hexConverter(obj[key]));
       
        } else if (isNaN(key)) {
            newSchemeObj[key] = hexConverter(obj[key]);
        }

    }

    newSchemeObj["colorPaletteOverrides"] = colorArray;

    return newSchemeObj;
}

const tokens = new Tokens({});
const secret = tokens.secretSync();

// Create all your routes
var router = express.Router();
router.get('/', function (req, res) {
  res.redirect(req.baseUrl + '/ssh');
});

router.get('/ssh/*', function (req, res) {

  var id = uuidv4();

  res.redirect(req.baseUrl + `/session/${id}/${req.params[0]}`);

});

//For laumch page to start a new session with color scheme and host.
router.get('/new-session', function(req, res, next) {
    var id = uuidv4();


    res.redirect(url.format({
        pathname: req.baseUrl + "/custom-term",
        query: {
            "host": req.query.host + ".osc.edu",
            "scheme": req.query.scheme,
            "session": id
        }
    }));

});

router.get('/custom-term', function(req, res, next) {
    res.locals.uuid = req.query.session;
    var fileObject, schemeObject, schemeColorConvert;
    var defaultObj = {
        'use-default-window-copy': true,
        'ctrl-v-paste': true,
        'ctrl-c-copy': true,
        'cursor-blink': true,
        };

    res.locals.schemeObject;
    if (req.query.scheme === "default") {
       if ('default' in schemeObjects) {
        fileObject = schemeObjects[req.query.scheme];
        schemeObject = parseFile(fileObject);
        schemeColorConvert = convertSchemeObject(schemeObject);
        res.locals.schemeObject = schemeColorConvert;
       } else {

        res.locals.schemeObject = defaultObj;
       }
    } else {
     
     fileObject = schemeObjects[req.query.scheme];
     schemeObject = parseFile(fileObject);
     schemeColorConvert = convertSchemeObject(schemeObject);
     res.locals.schemeObject = schemeColorConvert;        
    }

    next();

}, function(req, res, next) {
    res.locals.host = req.query.host || findHost(req.query.session);
    console.log(res.locals.schemeObject);
    var cookieValue = JSON.stringify(res.locals.schemeObject);

    res.cookie(res.locals.uuid, cookieValue, {expires: new Date(Date.now() + 8 * 3600000) });

    next();   

}, function(req, res, next) {

    res.redirect(req.baseUrl + `/session/${req.query.session}/${res.locals.host}`)
})

router.get('/session/:id/*', function (req, res) {

  res.render('index',
    {
      baseURI: req.baseUrl,
      csrfToken: tokens.create(secret),
      session: req.params.id
    });

});

router.get('/launch', function (req, res) {

  res.render('launch', {baseURI: req.baseUrl, sessions: terminals.sessionsInfo(), fileOptions: getSchemeFilesArray() || []});

})

router.use(express.static(path.join(__dirname, 'public')));

// Setup app
var app = express();

// Setup template engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Mount the routes at the base URI
app.use(process.env.PASSENGER_BASE_URI || '/', router);

var terminals = {

  instances: {

  },

  sessionsInfo: function () {

    return Object.entries(this.instances)
          .sort()
          .map(function(array){ return {id: array[0], host: array[1].host }; });
  },

  create: function (host, dir, uuid) {
    var cmd = 'ssh';
    var args = dir ? [host, '-t', 'cd \'' + dir.replace(/\'/g, "'\\''") + '\' ; exec ${SHELL} -l'] : [host];

    this.instances[uuid] = {term: pty.spawn(cmd, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30
    }), host: host}

    return uuid;
  },

  exists: function (uuid) {
    if (uuid in this.instances) {
      return true;
    } else {
      return false;
    }
  },

  get: function (uuid) {
    return this.instances[uuid].term;
  },

  attach: function (uuid, ws) {
    var term = this.get(uuid);
    term.resume();

    term.on('data', function (data) {
      ws.send(data, function (error) {
        if (error) console.log('Send error: ' + error.message);
      });
    });

    term.on('error', function (error) {
      ws.close();
    });

    term.on('close', function () {
      ws.close();
    });

    ws.on('message', function (msg) {
      msg = JSON.parse(msg);
      if (msg.input)  term.write(msg.input);
      if (msg.resize) term.resize(parseInt(msg.resize.cols), parseInt(msg.resize.rows));
    });

    ws.on('close', function () {
      term.end();
      console.log('Closed terminal: ' + term.pid);
    });

  }
}

// Setup websocket server
var server = new http.createServer(app);
var wss = new WebSocket.Server({ noServer: true });

wss.on('connection', function connection (ws, req) {
  var match;
  var host = process.env.DEFAULT_SSHHOST || 'localhost';
  var cmd = process.env.OOD_SSH_WRAPPER || 'ssh';
  var dir;
  var uuid;
  var host_path_rx = `/session/([a-f0-9\-]+)/([^\\/\\?]+)([^\\?]+)?(\\?.*)?$`;

  console.log('Connection established');

  // Determine host and dir from request URL
  if (match = req.url.match(process.env.PASSENGER_BASE_URI + host_path_rx)) {
    uuid = match[1];
    if (match[2] !== 'default') host = match[2];
    if (match[3]) dir = decodeURIComponent(match[3]);
  }

  if (terminals.exists(uuid) === false) {
    terminals.create(host, dir, uuid);
  }

  terminals.attach(uuid, ws);

  process.env.LANG = 'en_US.UTF-8'; // this patch (from b996d36) lost when removing wetty (2c8a022)

});

function custom_server_origin(default_value = null){
  var custom_origin = null;

  if(process.env.OOD_SHELL_ORIGIN_CHECK) {
    // if ENV is set, do not use default!
    if(process.env.OOD_SHELL_ORIGIN_CHECK.startsWith('http')){
      custom_origin = process.env.OOD_SHELL_ORIGIN_CHECK;
    }
  }
  else {
    custom_origin = default_value;
  }

  return custom_origin;
}

function default_server_origin(headers){
  var origin = null;

  if (headers['x-forwarded-proto'] && headers['x-forwarded-host']){
    origin = headers['x-forwarded-proto'] + "://" + headers['x-forwarded-host']
  }

  return origin;
}

server.on('upgrade', function upgrade(request, socket, head) {
  var requestToken = new URLSearchParams(url.parse(request.url).search).get('csrf'),
      client_origin = request.headers['origin'],
      server_origin = custom_server_origin(default_server_origin(request.headers));

  if (client_origin &&
      client_origin.startsWith('http') &&
      server_origin && client_origin !== server_origin
  ) {
    socket.write([
      'HTTP/1.1 401 Unauthorized',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Encoding: UTF-8',
      'Connection: close',
      'X-OOD-Failure-Reason: invalid origin',
    ].join('\r\n') + '\r\n\r\n');

    socket.destroy();
  }
  else if (!tokens.verify(secret, requestToken)) {
    socket.write([
      'HTTP/1.1 401 Unauthorized',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Encoding: UTF-8',
      'Connection: close',
      'X-OOD-Failure-Reason: bad csrf token',
    ].join('\r\n') + '\r\n\r\n');

    socket.destroy();

  }else{
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  }
});

server.listen(port, function () {
  console.log('Listening on ' + port);
});
