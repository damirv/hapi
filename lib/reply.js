// Load modules

var Hoek = require('hoek');
var Response = require('./response');


// Declare internals

var internals = {};


exports = module.exports = internals.Reply = function () {

    this._methods = {};
};


internals.Reply.prototype.decorate = function (name, method) {

    Hoek.assert(name, 'Missing reply interface decoration name');
    Hoek.assert(typeof name === 'string', 'Reply interface decoration must be a string');
    Hoek.assert(!this._methods[name], 'Reply interface decoration already defined:', name);
    Hoek.assert(['request', 'response', 'close', 'state', 'unstate', 'redirect', 'continue'].indexOf(name) === -1, 'Cannot override built-in reply interface decoration:', name);

    this._methods[name] = method;
};


/*
    var handler = function (request, reply) {

        reply(error, result, ignore);   -> error || result (continue)
        reply(...).takeover();          -> ... (continue)

        reply.continue(ignore);         -> null (continue)
    };

    var ext = function (request, reply) {

        reply(error, result, ignore);   -> error || result (respond)
        reply(...).takeover();          -> ... (respond)

        reply.continue(ignore);         -> (continue)
    };

    var pre = function (request, reply) {

        reply(error);                   -> error (respond)  // failAction override
        reply(null, result, ignore);    -> result (continue)
        reply(...).takeover();          -> ... (respond)

        reply.continue(ignore);         -> null (continue)
    };

    var auth = function (request, reply) {

        reply(error, result, data);     -> error || result (respond) + data
        reply(...).takeover();          -> ... (respond) + data

        reply.continue(data);           -> (continue) + data
    };
*/

internals.Reply.prototype.interface = function (request, next, options) {       // next(err || response, data);

    options = options || {};

    var reply = function (err, response, data) {

        reply._data = data;                 // Held for later
        return reply.response(err !== null && err !== undefined ? err : response);
    };

    reply._replied = false;
    reply._next = Hoek.once(next);
    reply._env = options.env || {};

    reply.request = request;
    reply.response = internals.response;
    reply.close = internals.close;
    reply.state = internals.state;
    reply.unstate = internals.unstate;
    reply.redirect = internals.redirect;
    reply.continue = internals.continue;

    var methods = Object.keys(this._methods);
    for (var i = 0, il = methods.length; i < il; ++i) {
        var method = methods[i];
        reply[method] = this._methods[method];
    }

    return reply;
};


internals.close = function (options) {

    options = options || {};
    this._next({ closed: true, end: options.end !== false });
};


internals.continue = function (data) {

    this._next(null, data);
    this._next = null;
};


internals.state = function (name, value, options) {

    this.request._setState(name, value, options);
};


internals.unstate = function (name) {

    this.request._clearState(name);
};


internals.redirect = function (location) {

    return this.response('').redirect(location);
};


internals.response = function (result) {

    var self = this;

    Hoek.assert(!this._replied, 'reply interface called twice');
    this._replied = true;

    var response = Response.wrap(result, this.request);
    if (response.isBoom) {
        this._next(response, this._data);
        this._next = null;
        return response;
    }

    response.hold = function () {

        this.hold = undefined;
        this.send = function () {

            this.send = undefined;
            this._prepare(self._data, self._next);
            this._next = null;
        };

        return this;
    };

    process.nextTick(function () {

        response.hold = undefined;

        if (!response.send &&
            self._next) {

            response._prepare(self._data, self._next);
            self._next = null;
        }
    });

    return response;
};
