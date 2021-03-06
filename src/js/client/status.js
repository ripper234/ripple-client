var webutil = require('../util/web'),
    rewriter = require('../util/jsonrewriter'),
    Amount = ripple.Amount;

/**
 * Manages the notifications appearing in the top right status box.
 */
var StatusManager = function ()
{
  this.el = null;
  this.queue = [];

  // If true, the next tick is already scheduled, so we do not need to trigger
  // one manually if a new element is added.
  this.tickUpcoming = false;

  this.tickInterval = 4000;
};

StatusManager.prototype.init = function ()
{
  var self = this;
  var app = this.app;

  var $scope = this.$scope = app.$scope.$new();

  // Activate #status panel
  $scope.$apply(function () {
    $scope.toggle_secondary = function () {
      $scope.show_secondary = !$scope.show_secondary;
    };

    $scope.$watch('balances', function () {
      $scope.orderedBalances = [];
      $.each($scope.balances,function(index,balance){
        $scope.orderedBalances.push(balance);
      });
      $scope.orderedBalances.sort(function(a,b){
        return parseFloat(b.total.to_text()) - parseFloat(a.total.to_text());
      });

      $scope.balance_count = Object.keys($scope.balances).length;


    }, true);

    // Low balance indicator
    app.$scope.$watch('balance', function(){
      var reserve = Amount.from_human($scope.reserve * 2);
      var balance = app.$scope.balance;

      if (parseFloat(balance) == balance) {
        balance = Amount.from_json(app.$scope.balance);
      }

      $scope.lowBalance = balance.ratio_human(reserve).to_human() <= 1;

      if(!$scope.$$phase) {
        $scope.$digest();
      }
    }, true);

    $scope.logout = function () {
      // logout() assumes that we are outside of an Angular $apply(), so we need
      // to make sure that's actually the case otherwise we may get a
      // "Error: $apply already in progress"
      // XXX: Find out if there is a recommended/better way of doing this.
      setImmediate(function () {
        app.id.logout();
      });
    };

    var template = require('../../jade/client/status.jade')();
    self.el = app.$compile(template)($scope);
    self.el.appendTo('header');
  });

  app.net.on('connected', function (e) {
    setConnectionStatus(true);
    $scope.$digest();
  });

  app.net.on('disconnected', function (e) {
    setConnectionStatus(false);
    $scope.$digest();
  });

  function setConnectionStatus(connected) {
    $scope.connected = !!connected;
    if (connected) {
      self.notifyEl.find('.type-offline').remove();
    } else {
      self.notifyEl.append('<div class="notification active type-offline">OFFLINE</div>');
    }
  }

  // A notification might have been queued already before the app was fully
  // initialized. If so, we display it now.
  if (this.queue.length) this._tick();

  self.notifyEl = $('<div>').attr('id', 'notification').insertAfter(this.el);
  $(window).scroll(function () {
    self.notifyEl.css('top', Math.max(55, $(window).scrollTop()-47)+'px');
  });

  // Default to disconnected
  setConnectionStatus(false);

  this.setupNetworkNotices();
};

StatusManager.prototype.setApp = function (app)
{
  this.app = app;
};

StatusManager.prototype.create = function (message)
{
  return new StatusMessage(this, message);
};

/**
 * Add the status object to the queue.
 *
 * You should not need to call this yourself, use Status::queue().
 */
StatusManager.prototype.enqueue = function (smObj)
{
  this.queue.push(smObj);
  if (this.el && !this.tickUpcoming) {
    setImmediate(this._tick.bind(this));
  }
};

/**
 * Proceed to next notification.
 *
 * Used internally, you should never have to call this yourself.
 */
StatusManager.prototype._tick = function ()
{
  var self = this;

  if (this.prevEl) {
    var prevEl = this.prevEl;
    // Hide notification box
    prevEl.removeClass('active');
    setTimeout(function () {
      prevEl.remove();
    }, 1000);
    this.prevEl = null;
  }

  this.tickUpcoming = false;
  if (this.queue.length) {
    // Ensure secondary currencies pulldown is closed
    this.$scope.$apply(function() {
      self.$scope.show_secondary = false;
    });

    // Show next status message
    var next = this.queue.shift();

    var el = $(next.message);
    el.addClass('notification');
    el.appendTo(this.notifyEl);
    setImmediate(function () {
      el.addClass('active');
    });

    this.prevEl = el;

    this.tickUpcoming = true;
    setTimeout(this._tick.bind(this), this.tickInterval);
  }
};

StatusManager.tplAccount = require('../../jade/notification/account.jade');

/**
 * Listens to and graphically displays some network-related notifications.
 */
StatusManager.prototype.setupNetworkNotices = function ()
{
  var app = this.app;
  var remote = this.app.net.remote;

  remote.on('account', function (msg) {
    if (msg.engine_result !== 'tesSUCCESS') return;

    var tx = rewriter.processTxn(msg.transaction, msg.meta, app.id.account);
    if (tx) {
      var $scope = app.$scope.$new();
      $scope.tx = tx;

      var html = StatusManager.tplAccount($scope);

      if (html.length) {
        app.sm.create(app.$compile(html)($scope)).queue();
      }

      $scope.$digest();
    }
  });
};

var StatusMessage = function (sm, message)
{
  this.sm = sm;
  this.message = message || "";
};

StatusMessage.prototype.setMessage = function (message)
{
  this.message = message;
};

StatusMessage.prototype.queue = function ()
{
  // Send myself to the StatusManager
  this.sm.enqueue(this);
};

exports.StatusManager = StatusManager;
exports.StatusMessage = StatusMessage;
